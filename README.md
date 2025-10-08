# Mux Analytics Agent - Mastra AI Agent

An AI-powered video streaming analytics agent built with Mastra. Analyzes Mux video data, identifies performance issues, and provides engineering recommendations from the perspective of a streaming video expert. Features text-to-speech audio reports (under 1000 words) and a React frontend.

## 🏗️ Project Structure

This project follows a monorepo structure with clear separation of concerns:

```
mux-analytics-agent/
├── backend/                 # Mastra backend server
│   ├── src/
│   │   ├── agents/         # Mux Analytics agent implementation
│   │   ├── tools/          # Mux analytics and utility tools
│   │   ├── mcp/           # MCP server implementations (Mux integration)
│   │   └── scripts/       # Test and utility scripts
│   ├── files/             # Static files (images, audio reports)
│   └── package.json
├── frontend/               # React frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Client libraries
│   │   └── utils/         # Frontend utilities
│   └── package.json
├── scripts/               # Build and deployment scripts
├── docs/                 # Documentation
└── package.json          # Root package.json (monorepo config)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 24+ 
- npm or yarn
- Mux API credentials (Token ID and Token Secret)
- Deepgram API key (for text-to-speech)
- Anthropic API key (for Claude AI model)

### Installation

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd weather-agent-monorepo
   ./scripts/setup.sh
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your API keys
   ```

3. **Start development:**
   ```bash
   npm run dev
   ```

This will start both the backend server (port 3001) and frontend (port 3000).

## 📦 Available Scripts

### Root Level (Monorepo)
- `npm run dev` - Start both backend and frontend in development mode
- `npm run build` - Build all packages
- `npm run start:prod` - Start production server
- `npm run clean` - Clean all build artifacts
- `npm run typecheck` - Type check all packages
- `npm run test` - Run all tests

### Backend
- `npm run dev:backend` - Start backend development server
- `npm run build:backend` - Build backend
- `npm run test:agent` - Test weather agent
- `npm run test:claude` - Test Claude integration
- `npm run test:stt` - Test speech-to-text
- `npm run test:tts` - Test text-to-speech

### Frontend
- `npm run dev:frontend` - Start frontend development server
- `npm run build:frontend` - Build frontend
- `npm run test:frontend` - Run frontend tests

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `env.example`:

```bash
# Backend Configuration
NODE_ENV=development
PORT=3001

# AI Model Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

# Mux Configuration
MUX_TOKEN_ID=your_mux_token_id_here
MUX_TOKEN_SECRET=your_mux_token_secret_here

# Deepgram TTS Configuration
DEEPGRAM_API_KEY=your_deepgram_api_key_here
DEEPGRAM_TTS_MODEL=aura-asteria-en

# Frontend Configuration
VITE_MASTRA_API_HOST=http://localhost:3001
VITE_WEATHER_AGENT_ID=video professional streaming media at paramount plus  # Legacy support
```

### API Keys Required

1. **Mux API** - For video analytics, processing, and streaming
   - Get your credentials at [Mux Dashboard](https://dashboard.mux.com)
   - Provides video metrics, asset management, and data insights
2. **Anthropic API** - For Claude AI model
   - Sign up at [Anthropic Console](https://console.anthropic.com)
   - Powers the intelligent analytics agent
3. **Deepgram API** - For text-to-speech audio reports
   - Get API key at [Deepgram Console](https://console.deepgram.com)
   - Converts analytics summaries to audio

## 🏛️ Architecture

### Backend (Mastra Server)
- **Agents**: Mux Analytics agent with video engineering expertise
- **Tools**: Mux Data API integration for analytics, assets, and video views
- **MCP Servers**: Mux video upload and asset management via MCP
- **TTS Integration**: Deepgram text-to-speech for audio reports
- **Streaming**: Real-time response streaming

### Frontend (React App)
- **Components**: Modular React components for chat and video display
- **Hooks**: Custom hooks for state management
- **Client**: Mastra client for backend communication
- **UI**: Modern, responsive interface with Tailwind CSS
- **Mux Player**: Integrated video playback with analytics

### Key Features
- **Analytics Analysis**: Fetches and interprets Mux video metrics
- **Performance Scoring**: Calculates health scores based on key indicators
- **Issue Detection**: Identifies streaming problems (errors, rebuffering, slow startup)
- **Engineering Recommendations**: Provides actionable fixes from video expert perspective
- **Audio Reports**: Generates TTS summaries under 1000 words

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm run test:agent      # Test weather agent
npm run test:claude     # Test Claude integration
npm run test:stt        # Test speech-to-text
npm run test:tts        # Test text-to-speech
```

### Frontend Tests
```bash
cd frontend
npm run test           # Run all frontend tests
npm run test:watch     # Run tests in watch mode
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build Docker image
docker build -t weather-agent .

# Run container
docker run -p 3001:3001 --env-file .env weather-agent
```

### Manual Deployment
```bash
# Build all packages
npm run build

# Start production server
npm run start:prod
```

## 📚 Features

### Mux Analytics Agent
- **Video Metrics Analysis**: Analyzes error rates, rebuffering, startup times, and playback quality
- **Performance Scoring**: Calculates health scores (0-100) based on streaming KPIs
- **Issue Detection**: Identifies critical streaming problems automatically
- **Engineering Recommendations**: Provides specific, actionable fixes from video expert perspective
- **Audio Reports**: Generates TTS summaries under 1000 words

### Analytics Tools
- **Overall Metrics**: Fetch aggregate performance data for any time range
- **Asset Management**: List and inspect all video assets
- **Video Views**: Detailed view-level data with metadata
- **Custom Filters**: Filter by OS, country, device, and more

### Mux Integration
- **Data API**: Direct integration with Mux Data for real-time metrics
- **Video API**: Asset management and upload capabilities
- **MCP Support**: Model Context Protocol for Mux tools
- **Streaming**: Video streaming with analytics tracking

### Frontend Features
- **Modern UI**: Clean, responsive interface with Tailwind CSS
- **Real-time Chat**: Live conversation with the analytics agent
- **Theme Support**: Light/dark theme toggle
- **Video Player**: Integrated Mux player for report playback
- **Error Handling**: Comprehensive error boundaries
- **TypeScript**: Full type safety

## 💡 Usage Examples

### Analyzing Your Mux Data

1. **Get Overall Analytics**:
   ```
   "Analyze my video streaming performance for the last 24 hours"
   ```
   The agent will fetch metrics, calculate health scores, and identify issues.

2. **Generate Audio Report**:
   ```
   "Create an audio report of my streaming analytics"
   ```
   The agent generates a TTS summary (under 1000 words) and uploads it to Mux.

3. **Check Specific Assets**:
   ```
   "List my video assets"
   "Show me details about asset abc123"
   ```

4. **Custom Time Ranges**:
   ```
   "Analyze performance from last week"
   "Show metrics for the past 7 days"
   ```

5. **Get Recommendations**:
   ```
   "What can I do to improve streaming quality?"
   "Why are users experiencing rebuffering?"
   ```

### Example Agent Response

```
Mux Video Streaming Analytics Report

Time Range: Jan 1, 2025 to Jan 2, 2025

Overall Health Score: 85 out of 100
Performance is good, with some areas for optimization.

Key Performance Indicators:
- Total Views: 10,234
- Total Watch Time: 142h 17m
- Average Startup Time: 2.34 seconds
- Rebuffering Rate: 3.21%
- Error Rate: 1.15%

Issues Identified:
1. Moderate rebuffering: 3.21% rebuffering detected

Engineering Recommendations:
1. Review CDN performance and consider expanding edge locations.
2. Consider optimizing player initialization for faster startup.
```

## 🔍 Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure ports 3000 and 3001 are available
2. **API Keys**: Verify all required API keys are set in `.env`
3. **Dependencies**: Run `npm run install:all` to install all dependencies
4. **Build Issues**: Run `npm run clean` then `npm run build`

### Debug Mode
```bash
# Backend debug
npm run debug:agent

# Frontend debug
cd frontend && npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation in the `docs/` folder
- Review the troubleshooting section above