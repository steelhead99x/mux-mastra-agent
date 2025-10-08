# Mux Analytics Agent - Transformation Summary

## Overview

This document summarizes the complete transformation of the codebase from a weather agent to a Mux video streaming analytics agent with AI-powered insights and text-to-speech capabilities.

## What Changed

### 1. Core Agent (Backend)

**New Agent: `mux-analytics-agent.ts`**
- Replaced weather-focused agent with streaming video engineer agent
- Uses Anthropic Claude (Sonnet) for intelligent analysis
- Analyzes Mux video streaming data from an engineering perspective
- Provides actionable recommendations for streaming optimization

**Key Capabilities:**
- Analyzes error rates, rebuffering, startup times, playback quality
- Calculates health scores (0-100) based on streaming KPIs
- Identifies critical issues automatically
- Provides specific, actionable engineering recommendations

### 2. Analytics Tools (Backend)

**New File: `tools/mux-analytics.ts`**

Created three comprehensive tools:

1. **muxAnalyticsTool**
   - Fetches overall Mux video metrics
   - Analyzes performance data
   - Calculates health scores
   - Identifies issues and generates recommendations

2. **muxAssetsListTool**
   - Lists all video assets in the Mux account
   - Provides asset metadata (status, duration, resolution)

3. **muxVideoViewsTool**
   - Fetches detailed view-level data
   - Supports custom time ranges and filters

**Analytics Functions:**
- `analyzeMetrics()` - Intelligent analysis of streaming data
- `formatAnalyticsSummary()` - Formats data into concise summaries (under 1000 words)

### 3. Text-to-Speech Integration

**Audio Report Generation:**
- Integrated Deepgram TTS for converting analytics to audio
- `ttsAnalyticsReportTool` - Generates audio reports from analytics data
- Automatically summarizes findings in under 1000 words
- Uploads audio to Mux for playback via the player

**Word Count Enforcement:**
- Built-in truncation ensures summaries stay under 1000 words
- Prioritizes most critical information
- Natural speech formatting for better TTS pronunciation

### 4. Frontend Updates

**Updated Components:**
- Changed branding from "WeatherAgent for Farmers" to "Mux Analytics Agent"
- Updated icon from ☀️ to 📊
- Modified descriptions to reflect video analytics purpose
- Updated page title in `index.html`

**Layout:**
- Retained chat interface for conversing with the analytics agent
- Video player section for viewing audio reports
- Theme toggle and modern UI preserved

### 5. Documentation

**README.md:**
- Complete rewrite of project description
- Updated architecture section
- New API keys section (Mux, Anthropic, Deepgram)
- Added usage examples
- Updated features list
- New example agent responses

**Package.json Files:**
- Root: Updated name to `mux-analytics-agent`
- Backend: Updated description to reflect analytics agent
- Frontend: Updated description to reflect analytics UI

### 6. Backend Configuration

**Updated Files:**
- `backend/src/index.ts` - Changed agent references and service name
- `backend/src/mastra/index.ts` - Exported new agent and tools
- Health check endpoints updated to reflect new service name

**Agent Endpoints:**
- `/api/agents` - Now returns Mux Analytics Agent
- Support for both `mux-analytics` and `weather` IDs (legacy compatibility)
- All streaming endpoints updated to use new agent

## Key Features Implemented

### 1. Analytics Analysis
- Fetches real-time Mux video metrics
- Analyzes key performance indicators:
  - Error rates (target: <1%)
  - Rebuffering percentages (target: <2%)
  - Startup time (target: <2s)
  - Playback failures
  - Video quality metrics

### 2. Performance Scoring
- Calculates health scores from 0-100
- Deducts points for each issue category:
  - Critical issues: -30 points
  - High severity: -20-25 points
  - Moderate: -10-15 points
  - Low: -5-10 points

### 3. Issue Detection
- Automatically identifies streaming problems
- Categorizes by severity (critical, high, moderate, low)
- Provides context-specific analysis

### 4. Engineering Recommendations
- CDN optimization suggestions
- Player configuration improvements
- Encoding profile adjustments
- Network delivery enhancements
- Adaptive bitrate ladder optimization

### 5. Audio Reports
- Generates natural-sounding TTS summaries
- Enforces 1000-word limit
- Uploads to Mux as audio assets
- Returns playback URLs
- Includes health scores and key metrics

## Technical Stack

### Backend
- **Framework**: Mastra (AI agent framework)
- **AI Model**: Anthropic Claude Sonnet
- **TTS**: Deepgram Aura
- **Video Platform**: Mux (Data API + Video API)
- **Runtime**: Node.js 24+
- **Language**: TypeScript

### Frontend
- **Framework**: React 18.3
- **UI**: Tailwind CSS
- **Build Tool**: Vite
- **Player**: Mux Player React
- **Client**: Mastra Client JS

### APIs Used
1. **Mux Data API** - Video analytics and metrics
2. **Mux Video API** - Asset management and uploads
3. **Anthropic API** - Claude AI for analysis
4. **Deepgram API** - Text-to-speech

## Environment Variables

Required configuration:
```bash
# AI Model
ANTHROPIC_API_KEY=your_key
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

# Mux Platform
MUX_TOKEN_ID=your_token_id
MUX_TOKEN_SECRET=your_token_secret

# Text-to-Speech
DEEPGRAM_API_KEY=your_key
DEEPGRAM_TTS_MODEL=aura-asteria-en
```

## Agent Behavior

### System Prompt
The agent operates as an expert streaming video engineer with:
- Deep knowledge of video streaming protocols
- Experience with CDN optimization
- Understanding of encoding and player configuration
- Ability to interpret complex analytics data
- Focus on actionable, specific recommendations

### Interaction Style
- Professional but approachable
- Technical language appropriate for engineering teams
- Provides context and reasoning
- Highlights actionable insights
- Prioritizes issues by severity

## Usage Flow

1. **User Query**: "Analyze my streaming performance"
2. **Agent Action**: Fetches Mux analytics data
3. **Analysis**: Calculates health score, identifies issues
4. **Response**: Returns formatted summary with recommendations
5. **Audio Report** (optional): Generates TTS and uploads to Mux

## Word Count Management

The system enforces the 1000-word limit through:
1. Focused summarization - prioritizes critical information
2. Structured format - avoids redundancy
3. Truncation logic - safely cuts at word boundaries
4. Word counter - validates before returning

Typical report structure:
- Header & time range: ~50 words
- Health score & summary: ~100 words
- Key metrics: ~150 words
- Issues: ~250 words
- Recommendations: ~350 words
- Conclusion: ~100 words

Total: ~1000 words

## Migration Notes

### Backwards Compatibility
- Legacy `weather` agent ID still works
- API routes support both old and new agent IDs
- Frontend can connect using existing configuration

### Breaking Changes
- None for API consumers
- Old weather-specific functionality removed
- Environment variables changed (see docs)

## Testing

To verify the transformation:

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Test analytics:**
   ```bash
   curl -X POST http://localhost:3001/api/agents/mux-analytics/invoke \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"Analyze my video streaming performance"}]}'
   ```

3. **Test audio report:**
   ```bash
   curl -X POST http://localhost:3001/api/agents/mux-analytics/invoke \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"Generate an audio report of my analytics"}]}'
   ```

## Summary

The transformation successfully converts the weather agent into a comprehensive Mux video streaming analytics agent that:

✅ **Analyzes** Mux video data from a streaming engineer's perspective  
✅ **Identifies** performance issues and bottlenecks  
✅ **Recommends** specific, actionable fixes  
✅ **Generates** text-to-speech audio reports under 1000 words  
✅ **Provides** health scores and detailed metrics  
✅ **Maintains** professional, technical communication style  

The agent is production-ready and can be deployed to analyze real Mux video streaming data.




