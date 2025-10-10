# Mux Mastra Agent - Development Modes

This project supports two development modes for different use cases:

## 🎮 Mastra Playground Mode (Default Development)

**Use this mode when you want to:**
- Use Mastra's built-in playground UI for testing agents
- Quickly prototype and test agent functionality
- Debug agent behavior with Mastra's debugging tools

**How to run:**
```bash
# Default development mode (playground)
npm run dev:playground
# or
cd backend && npm run dev
```

**What you get:**
- Mastra's built-in playground UI at `http://localhost:3001`
- Interactive agent testing interface
- Built-in debugging and monitoring tools
- Hot reloading for agent changes

## 🚀 Custom Express Server Mode

**Use this mode when you want to:**
- Test the full-stack application with React frontend
- Test API endpoints directly
- Develop custom middleware and routes
- Test production-like behavior

**How to run:**
```bash
# Custom Express server mode
npm run dev:backend:custom
# or
cd backend && npm run dev:custom

# Full-stack development (backend + frontend)
npm run dev
```

**What you get:**
- Custom Express server at `http://localhost:3001`
- React frontend at `http://localhost:3000`
- Full API endpoints for testing
- Static file serving
- Production-like environment

## 🔧 Configuration

Control the mode using environment variables in your `.env` file:

```bash
# Enable playground mode (default in development)
MASTRA_PLAYGROUND=true

# Force custom Express server mode
MASTRA_CUSTOM=true
```

## 📋 Available Scripts

| Script | Description | Mode |
|--------|-------------|------|
| `npm run dev` | Full-stack development | Custom Express |
| `npm run dev:playground` | Mastra playground only | Playground |
| `npm run dev:backend` | Backend only (playground) | Playground |
| `npm run dev:backend:custom` | Backend only (custom) | Custom Express |
| `npm run dev:frontend` | Frontend only | - |

## 🌐 URLs

### Playground Mode
- **Playground UI**: `http://localhost:3001`
- **Health Check**: `http://localhost:3001/health`

### Custom Express Mode
- **Backend API**: `http://localhost:3001`
- **Frontend**: `http://localhost:3000`
- **Health Check**: `http://localhost:3001/health`
- **API Endpoints**: `http://localhost:3001/api/agents/*`

## 🔄 Switching Between Modes

1. **To switch to playground mode:**
   ```bash
   # Stop current server
   # Set in .env: MASTRA_PLAYGROUND=true
   # Run: npm run dev:playground
   ```

2. **To switch to custom mode:**
   ```bash
   # Stop current server
   # Set in .env: MASTRA_CUSTOM=true
   # Run: npm run dev:backend:custom
   ```

## 🚀 Production

In production, the system automatically uses the custom Express server mode with:
- Built frontend served as static files
- Optimized API endpoints
- Production-ready error handling
- Proper CORS configuration

```bash
npm run start:prod
```

