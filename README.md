# Mux Mastra Agent

AI-powered video streaming analytics agent with Mastra backend and React frontend.

## 🚀 Quick Start

1. **Setup Environment**
   ```bash
   cp env.example .env
   # Edit .env with your API keys
   ```

2. **Install Dependencies**
   ```bash
   npm run install:all
   ```

3. **Choose Your Development Mode**

## 🎮 Development Modes

### Option 1: Mastra Playground (Recommended for Agent Development)
**Best for:** Testing agents, debugging, prototyping
```bash
npm run dev:playground
```
- **URL:** `http://localhost:3001`
- **Features:** Built-in playground UI, agent testing, debugging tools

### Option 2: Full-Stack Development (Recommended for Frontend Development)
**Best for:** Testing React frontend, full application testing
```bash
npm run dev
```
- **Frontend:** `http://localhost:3000`
- **Backend:** `http://localhost:3001`
- **Features:** React app + API endpoints

### Option 3: Custom Backend Only
**Best for:** API testing, backend development
```bash
npm run dev:backend:custom
```
- **Backend:** `http://localhost:3001`
- **Features:** Express server with API endpoints

## 🔧 Port Configuration

Configure ports in your `.env` file:

```bash
# Backend port (Mastra playground + Express server)
BACKEND_PORT=3001

# Frontend port (React dev server)
FRONTEND_PORT=3000

# Mastra playground port (when using mastra dev)
MASTRA_PLAYGROUND_PORT=3001
```

**Default Ports:**
- **Frontend:** `3000`
- **Backend:** `3001`
- **Playground:** `3001`

## 📋 Available Scripts

| Command | Description | Mode |
|---------|-------------|------|
| `npm run dev` | Full-stack (frontend + backend) | Custom Express |
| `npm run dev:playground` | Mastra playground only | Playground |
| `npm run dev:backend` | Backend only (playground) | Playground |
| `npm run dev:backend:custom` | Backend only (custom) | Custom Express |
| `npm run dev:frontend` | Frontend only | - |
| `npm run build` | Build for production | - |
| `npm run start:prod` | Start production server | - |

## 🌐 URLs

### Playground Mode
- **Playground UI:** `http://localhost:3001`
- **Health Check:** `http://localhost:3001/health`

### Full-Stack Mode
- **Frontend:** `http://localhost:3000`
- **Backend API:** `http://localhost:3001`
- **Health Check:** `http://localhost:3001/health`

## 🔑 Required Environment Variables

```bash
# AI Model
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Mux Video API
MUX_TOKEN_ID=your_mux_token_id_here
MUX_TOKEN_SECRET=your_mux_token_secret_here

# Optional: Mastra API
MASTRA_API_KEY=your_mastra_api_key_here
```

## 🛠️ Contributing

### Project Structure
```
├── backend/          # Mastra backend (agents, tools, MCP)
├── frontend/         # React frontend
├── shared/           # Shared types and utilities
└── .env              # Environment configuration
```

### Development Workflow

1. **For Agent Development:**
   ```bash
   npm run dev:playground
   # Test agents in Mastra playground
   ```

2. **For Frontend Development:**
   ```bash
   npm run dev
   # Develop React components
   ```

3. **For Backend API Development:**
   ```bash
   npm run dev:backend:custom
   # Test API endpoints
   ```

### Code Organization

- **Agents:** `backend/src/agents/`
- **Tools:** `backend/src/tools/`
- **MCP Clients:** `backend/src/mcp/`
- **Frontend Components:** `frontend/src/components/`
- **API Endpoints:** `backend/src/index.ts`

### Testing

```bash
# Run all tests
npm run test

# Run backend tests
npm run test:backend

# Run frontend tests
npm run test:frontend
```

## 🚀 Production

```bash
npm run start:prod
```

Production automatically:
- Builds frontend and backend
- Serves frontend as static files
- Runs optimized backend server
- Uses production environment variables

## 📚 Documentation

- **Development Modes:** See `DEVELOPMENT_MODES.md`
- **Environment Variables:** See `env.example`
- **API Endpoints:** See `backend/src/index.ts`

## 🆘 Troubleshooting

### Port Conflicts
If ports are in use, update `.env`:
```bash
BACKEND_PORT=3002
FRONTEND_PORT=3001
```

### Environment Issues
```bash
# Check environment loading
curl http://localhost:3001/health

# Check MCP connection
curl http://localhost:3001/debug/mcp
```

### Common Issues
- **"Failed to fetch"**: Check CORS configuration in `.env`
- **"Agent not found"**: Verify agent is registered in `backend/src/index.ts`
- **Port conflicts**: Update port configuration in `.env`