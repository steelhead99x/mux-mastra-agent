## Single Alpine-based multi-stage build (frontend + backend)
FROM node:24-alpine AS base

# Install minimal base tools used across stages
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    libc6-compat

# Install production dependencies only (workspaces)
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/
COPY scripts/ ./scripts/
COPY .npmrc ./

# Install production deps for all workspaces, skip optional/native builds
RUN npm ci --workspaces --omit=dev --no-optional --ignore-scripts && \
    npm install @modelcontextprotocol/sdk@^1.19.1 --workspace=backend --ignore-scripts && \
    ./scripts/cleanup-native-modules.sh

# Builder deps with native build toolchain for canvas/chart rendering
FROM node:24-alpine AS builder-deps
WORKDIR /app

# Native build deps for canvas and friends
RUN apk add --no-cache \
    bash \
    python3 \
    make \
    g++ \
    pkgconfig \
    build-base \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    pixman-dev \
    freetype-dev

# Ensure python binary for node-gyp
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/
COPY scripts/ ./scripts/
COPY .npmrc ./

# Skip dev env post-build hooks by forcing production during build
ENV NODE_ENV=production

# Install all deps (incl dev) - scripts needed for proper dependency linking
# Using npm install instead of npm ci for better workspace dependency hoisting
RUN npm install --workspaces --include=dev && \
    npm install @modelcontextprotocol/sdk@^1.19.1 --workspace=backend

# Build shared package
FROM builder-deps AS build-shared
WORKDIR /app
COPY shared ./shared
RUN npm --workspace shared run build

# Build backend (depends on shared sources for TS paths)
FROM builder-deps AS build-backend
WORKDIR /app
COPY backend ./backend
COPY shared ./shared
RUN npm --workspace backend run build

# Build frontend (depends on shared sources for TS paths)
FROM builder-deps AS build-frontend
WORKDIR /app
COPY frontend ./frontend
COPY shared ./shared
RUN npm --workspace frontend run build

# Final runtime image
FROM node:24-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup -S nodejs -g 1001 && \
    adduser -S weatheruser -u 1001 -G nodejs -h /app -s /bin/sh

# Runtime libs for canvas/ffmpeg and nginx
RUN apk add --no-cache \
    ffmpeg \
    cairo \
    pango \
    jpeg \
    giflib \
    pixman \
    freetype \
    nginx \
    openssl

# Copy built artifacts
COPY --from=build-backend --chown=weatheruser:nodejs /app/backend/dist ./backend/dist
COPY --from=build-frontend --chown=weatheruser:nodejs /app/frontend/dist ./frontend/dist
COPY --from=build-shared --chown=weatheruser:nodejs /app/shared/dist ./shared/dist
COPY --from=build-backend --chown=weatheruser:nodejs /app/backend/files ./backend/files

# Also provide frontend assets under backend path
COPY --from=build-frontend --chown=weatheruser:nodejs /app/frontend/dist ./backend/frontend/dist

# Fix the dist structure - move nested files if present
RUN mkdir -p /app/backend/dist && \
    if [ -d /app/backend/dist/backend/src ]; then \
      cp -r /app/backend/dist/backend/src/* /app/backend/dist/ && \
      rm -rf /app/backend/dist/backend; \
    fi

# Create charts directory with proper permissions
RUN mkdir -p /app/backend/files/charts && chown -R weatheruser:nodejs /app/backend/files

# Configure npm dirs
RUN mkdir -p /app/.npm /app/.npm-global && chown -R weatheruser:nodejs /app/.npm /app/.npm-global

# Hoisted node_modules from deps stage
COPY --from=deps --chown=weatheruser:nodejs /app/node_modules ./node_modules

# Copy package files and startup script
COPY --chown=weatheruser:nodejs package*.json ./
COPY --chown=weatheruser:nodejs backend/package*.json ./backend/
COPY --chown=weatheruser:nodejs backend/start.sh ./backend/start.sh
RUN chmod +x /app/backend/start.sh

# Support build arg to choose nginx config (default to nginx.conf for production)
ARG NGINX_CONFIG=nginx.conf

# Copy nginx configuration and scripts
COPY --chown=root:root ${NGINX_CONFIG} /etc/nginx/nginx.conf
COPY --chown=root:root scripts/generate-ssl-cert.sh /app/scripts/generate-ssl-cert.sh
COPY --chown=root:root scripts/start-with-nginx.sh /app/scripts/start-with-nginx.sh
RUN chmod +x /app/scripts/generate-ssl-cert.sh && \
    chmod +x /app/scripts/start-with-nginx.sh && \
    mkdir -p /etc/nginx/ssl /var/log/nginx /var/cache/nginx && \
    chown -R weatheruser:nodejs /app/backend || true

# Note: Container will run as root to allow nginx to start
# The startup script will run backend as weatheruser, nginx as root
# USER directive removed - container runs as root for nginx

EXPOSE 80 3003

# Environment
ENV NODE_ENV=production \
    PORT=3001 \
    NPM_CONFIG_CACHE=/app/.npm \
    NPM_CONFIG_PREFIX=/app/.npm-global \
    HOME=/app \
    SKIP_SASS_BINARY_DOWNLOAD_FOR_CI=true \
    SKIP_NODE_SASS_TESTS=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app/backend

# Quick verification
RUN echo "NODE_ENV is set to: $NODE_ENV"

# Use the nginx startup script which runs both services
CMD ["/app/scripts/start-with-nginx.sh"]