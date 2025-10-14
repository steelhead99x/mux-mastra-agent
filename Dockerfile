# Multi-stage build for production
FROM node:24-slim AS base

# Install system dependencies needed for native modules (canvas, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    build-essential \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/
COPY scripts/ ./scripts/
COPY .npmrc ./

# Install production dependencies for all workspaces using a single lockfile
# Force update MCP SDK to prevent version conflicts
# Skip optional dependencies that might cause issues
RUN npm ci --workspaces --omit=dev --no-optional --ignore-scripts && \
    npm install @modelcontextprotocol/sdk@^1.19.1 --workspace=backend --ignore-scripts && \
    ./scripts/cleanup-native-modules.sh

# Build the application
FROM base AS builder-deps
WORKDIR /app

# Ensure Python is available for node-gyp
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/
COPY scripts/ ./scripts/
COPY .npmrc ./

# Install all dependencies for all workspaces (including dev)
# Force update MCP SDK to prevent version conflicts during build
RUN npm ci --workspaces --include=dev --no-optional --ignore-scripts && \
    npm install @modelcontextprotocol/sdk@^1.19.1 --workspace=backend --ignore-scripts

# Build shared package
FROM builder-deps AS build-shared
WORKDIR /app
COPY shared ./shared
RUN npm --workspace shared run build && \
    chown -R weatheruser:nodejs /app/shared/dist

# Build backend (depends on shared sources for TS paths)
FROM builder-deps AS build-backend
WORKDIR /app
COPY backend ./backend
COPY shared ./shared
RUN npm --workspace backend run build && \
    chown -R weatheruser:nodejs /app/backend/dist && \
    chown -R weatheruser:nodejs /app/backend/.mastra

# Build frontend (depends on shared sources for TS paths)
FROM builder-deps AS build-frontend
WORKDIR /app
COPY frontend ./frontend
COPY shared ./shared
RUN npm --workspace frontend run build && \
    chown -R weatheruser:nodejs /app/frontend/dist

# (Optional) Mastra CLI build is skipped in CI to avoid failures; runtime can use dist

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user with proper home directory
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --home /app --shell /bin/sh weatheruser

# Install runtime dependencies (ffmpeg + canvas runtime libs)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    libpixman-1-0 \
    libpangocairo-1.0-0 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=build-backend --chown=weatheruser:nodejs /app/backend/dist ./backend/dist
COPY --from=build-frontend --chown=weatheruser:nodejs /app/frontend/dist ./frontend/dist
COPY --from=build-shared --chown=weatheruser:nodejs /app/shared/dist ./shared/dist
COPY --from=build-backend --chown=weatheruser:nodejs /app/backend/files ./backend/files

# Copy frontend dist to backend directory for easier access
COPY --from=build-frontend --chown=weatheruser:nodejs /app/frontend/dist ./backend/frontend/dist

# Fix the dist structure - move the nested files to the correct location
RUN mkdir -p /app/backend/dist && \
    if [ -d /app/backend/dist/backend/src ]; then \
        cp -r /app/backend/dist/backend/src/* /app/backend/dist/ && \
        rm -rf /app/backend/dist/backend; \
    fi

# Create charts directory with proper permissions
RUN mkdir -p /app/backend/files/charts && chown -R weatheruser:nodejs /app/backend/files

# Configure npm to use proper directories
RUN mkdir -p /app/.npm && chown -R weatheruser:nodejs /app/.npm
RUN mkdir -p /app/.npm-global && chown -R weatheruser:nodejs /app/.npm-global

# (No Mastra CLI output copied)

# Copy production dependencies (hoisted workspaces install)
COPY --from=deps --chown=weatheruser:nodejs /app/node_modules ./node_modules

# Copy package files
COPY --chown=weatheruser:nodejs package*.json ./
COPY --chown=weatheruser:nodejs backend/package*.json ./backend/

# Copy startup script
COPY --chown=weatheruser:nodejs backend/start.sh ./backend/start.sh
RUN chmod +x /app/backend/start.sh

USER weatheruser

# Ensure the working directory has proper permissions
RUN chown -R weatheruser:nodejs /app/backend || true

EXPOSE 3001

# Ensure production environment
ENV NODE_ENV=production
ENV PORT=3001

# Configure npm to use proper directories
ENV NPM_CONFIG_CACHE=/app/.npm
ENV NPM_CONFIG_PREFIX=/app/.npm-global
ENV HOME=/app

# Skip problematic native modules
ENV SKIP_SASS_BINARY_DOWNLOAD_FOR_CI=true
ENV SKIP_NODE_SASS_TESTS=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV npm_config_build_from_source=false
ENV npm_config_cache_min=86400
ENV npm_config_prefer_offline=true

WORKDIR /app/backend

# Verify the environment is set correctly
RUN echo "NODE_ENV is set to: $NODE_ENV"

# Use the startup script for better error handling
CMD ["./start.sh"]