# Environment Configuration Simplified

## Overview
The project now uses a **single `.env` file** in the root directory for all environment variables. This simplifies configuration management and eliminates the need to maintain multiple environment files.

## Quick Setup

1. **Copy the environment template:**
   ```bash
   cp env.example .env
   ```

2. **Configure your API keys in `.env`:**
   - `ANTHROPIC_API_KEY` - Required for AI agent functionality
   - `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` - Required for Mux analytics
   - `DEEPGRAM_API_KEY` - Optional, for TTS features

3. **Start the services:**
   ```bash
   # Backend (Terminal 1)
   cd backend && npm run dev
   
   # Frontend (Terminal 2)  
   cd frontend && npm run dev
   ```

## Environment Variables

### Backend Variables
- `NODE_ENV` - Environment (development/production)
- `PORT` - Backend server port (default: 3001)
- `HOST` - Backend server host (default: 0.0.0.0)
- `CORS_ORIGINS` - Allowed CORS origins
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude models
- `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` - Mux API credentials
- `DEEPGRAM_API_KEY` - Deepgram API key for TTS
- `USE_MUX_MCP` - Use MCP for Mux operations (default: false)

### Frontend Variables (VITE_ prefix)
- `VITE_MASTRA_API_HOST` - Backend API URL
- `VITE_MUX_ANALYTICS_AGENT_ID` - Mux analytics agent ID
- `VITE_WEATHER_AGENT_ID` - Weather agent ID
- `VITE_MUX_ASSET_ID` - Default Mux asset ID
- `VITE_MUX_KEY_SERVER_URL` - Mux key server URL

## How It Works

1. **Backend**: Loads environment variables from `../.env` (root directory)
2. **Frontend**: Vite automatically loads `VITE_*` variables from the root `.env` file
3. **Single Source**: All configuration is managed in one place

## Migration from Multiple .env Files

If you previously had separate `.env` files:
- ✅ **Root `.env`** - Keep this as your single source
- ❌ **backend/.env** - Removed (no longer needed)
- ❌ **frontend/.env** - Removed (no longer needed)

## Troubleshooting

### Server Not Starting
- Ensure `.env` file exists in root directory
- Check that required API keys are configured
- Verify no syntax errors in `.env` file

### Frontend Not Loading Environment Variables
- Ensure variables are prefixed with `VITE_`
- Restart the frontend development server
- Check that `.env` is in the root directory

### 500 Errors
- Check server logs for specific error messages
- Verify API keys are valid and not placeholder values
- Ensure all required environment variables are set
