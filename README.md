# Mux Mastra Agent

AI-powered video streaming analytics and media management agents built with [Mastra](https://mastra.ai), featuring intelligent insights for Mux video content.

## ✨ Features

- **🤖 Dual AI Agents**
  - **Mux Analytics Agent**: Get AI-powered insights from your Mux video metrics, views, and errors
  - **Media Vault Agent**: Upload and manage video content with weather-aware features
- **🔌 MCP Integration**: Native Mux API integration via Model Context Protocol
- **🔒 Secure by Default**: Signed playback URLs for protected video content
- **🎙️ Audio Reports**: Generate spoken summaries of video analytics with TTS
- **📊 Visual Analytics**: Chart generation for video metrics and trends
- **⚡ Modern Stack**: React frontend + Mastra backend with streaming support

## 🚀 Quick Start

### Prerequisites

- **Node.js 24+** (required)
- Mux account with API credentials
- Anthropic API key (for Claude AI)

### Setup

1. **Clone and Install**
   ```bash
   git clone <your-repo>
   cd mux-mastra-agent
   npm run install:all
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and add your credentials:
   ```bash
   # Required
   ANTHROPIC_API_KEY=your_key_here
   MUX_TOKEN_ID=your_token_id_here
   MUX_TOKEN_SECRET=your_token_secret_here
   
   # Optional (for TTS features)
   DEEPGRAM_API_KEY=your_key_here
   ```

3. **Start Development**
   ```bash
   # Full-stack mode (frontend + backend)
   npm run dev
   
   # OR Mastra Playground (agent testing)
   npm run dev:playground
   ```

### Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Mastra Playground**: http://localhost:3001 (when using `dev:playground`)

## 🎮 Development Modes

| Command | Description | Best For |
|---------|-------------|----------|
| `npm run dev` | Full-stack with React frontend | Frontend development, full app testing |
| `npm run dev:playground` | Mastra playground only | Agent development, debugging, testing |
| `npm run dev:backend:custom` | Backend API only | Backend/API development |
| `npm run dev:frontend` | Frontend only | UI development (requires backend running) |

## 🤖 Agents

### Mux Analytics Agent (`mux-analytics`)

Get AI-powered insights from your Mux video data.

**Capabilities:**
- Query video analytics and metrics
- Analyze viewer behavior and errors
- Generate audio reports of analytics
- Create visual charts of video performance
- List and inspect video assets

**Example queries:**
- "Show me my recent video analytics"
- "What errors occurred in the last 24 hours?"
- "Generate an audio report of my video performance"

### Media Vault Agent (`media-vault`)

Upload and manage video content with intelligent features.

**Capabilities:**
- Upload videos to Mux
- Create video assets from URLs
- Weather-aware video recommendations
- Chart generation for weather data
- Automatic signed playback URLs

**Example queries:**
- "Upload this video file"
- "What's the weather forecast for tomorrow?"
- "Create a video asset from this URL"

## 📁 Project Structure

```
mux-mastra-agent/
├── backend/                # Mastra backend server
│   ├── src/
│   │   ├── agents/        # AI agents (mux-analytics, media-vault)
│   │   ├── mcp/           # MCP client integrations
│   │   ├── tools/         # Agent tools and capabilities
│   │   └── index.ts       # Express server + Mastra setup
│   └── package.json
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   └── contexts/      # React contexts (Mux analytics)
│   └── package.json
├── shared/                # Shared types and utilities
└── .env                   # Environment configuration
```

## 🔧 Configuration

### Mux Configuration

By default, the agent uses:
- **MCP integration** for all Mux operations (recommended)
- **Signed playback URLs** for secure video access

To customize:

```bash
# Use REST API instead of MCP (not recommended)
USE_MUX_MCP=false

# Use public playback URLs (less secure)
MUX_PLAYBACK_POLICY=public

# For signed URLs, add signing keys
MUX_SIGNING_KEY_ID=your_signing_key_id
MUX_SIGNING_KEY_SECRET=your_base64_private_key
```

### Port Configuration

```bash
BACKEND_PORT=3001
FRONTEND_PORT=3000
```

### CORS Configuration

```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Backend tests only
npm run test:backend

# Frontend tests only
npm run test:frontend

# Watch mode
npm run test:watch
```

## 🏗️ Building for Production

```bash
# Build both frontend and backend
npm run build

# Start production server
npm run start:prod
```

The production server:
- Serves frontend as static files
- Runs optimized backend on port 3001
- Uses production environment variables

## 📚 API Endpoints

### Core Endpoints

- `GET /health` - Health check with MCP status
- `POST /api/agents/:agentId/chat` - Chat with agent (streaming)
- `GET /api/agents/:agentId/tts-audio/:filename` - Get TTS audio file

### Debug Endpoints (Development Only)

- `GET /debug/mcp` - MCP connection status
- `GET /debug/agents` - List registered agents
- `GET /debug/tools` - List available tools

## 🔒 Security Features

- **API Key Validation**: Automatic validation and sanitization
- **Signed Playback URLs**: Default secure video access
- **CORS Protection**: Configurable origin restrictions
- **Environment Separation**: Development vs production configs

## 🆘 Troubleshooting

### Common Issues

**"Agent not found"**
- Verify agent ID: `mux-analytics` or `media-vault`
- Check backend logs for agent registration

**"MCP connection failed"**
- Ensure Mux credentials are set in `.env`
- Check MCP status at `/debug/mcp`
- Verify `@mux/mcp` package is installed

**Port conflicts**
- Update `BACKEND_PORT` and `FRONTEND_PORT` in `.env`
- Kill existing processes: `lsof -ti:3001 | xargs kill`

**CORS errors**
- Add your origin to `CORS_ORIGINS` in `.env`
- Restart backend after changes

### Debug Tools

```bash
# Check health
curl http://localhost:3001/health

# Check MCP status
curl http://localhost:3001/debug/mcp

# List agents
curl http://localhost:3001/debug/agents
```

## 📖 Documentation

- **[AGENT_MCP_CONFIGURATION.md](AGENT_MCP_CONFIGURATION.md)** - Agent configuration guide
- **[CHANGES_SUMMARY.md](CHANGES_SUMMARY.md)** - Recent changes and fixes
- **[DEVELOPMENT_MODES.md](DEVELOPMENT_MODES.md)** - Detailed development mode guide
- **[env.example](env.example)** - Complete environment variable reference

## 🛠️ Tech Stack

- **AI Framework**: [Mastra](https://mastra.ai)
- **AI Models**: Claude (Anthropic)
- **Video Platform**: [Mux](https://mux.com)
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Express, Node.js 24+
- **TTS**: Deepgram Aura
- **Charts**: Chart.js with Canvas
- **MCP**: @mux/mcp, @mastra/mcp

## 📝 License

This project is private and proprietary.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Run type checking: `npm run typecheck`
5. Submit a pull request

---

Built with ❤️ using [Mastra](https://mastra.ai) and [Mux](https://mux.com)
