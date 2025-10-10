# Working Setup Guide - Audio Reports

This guide will get your audio reports working **RIGHT NOW**. No fluff, just working code.

## Quick Start (5 Minutes)

### 1. Create Environment File

Create a `.env` file in the project root with your actual keys:

```bash
# Mux API Credentials
MUX_TOKEN_ID=your_actual_mux_token_id_here
MUX_TOKEN_SECRET=your_actual_mux_token_secret_here

# Deepgram TTS
DEEPGRAM_API_KEY=your_actual_deepgram_key_here

# Anthropic AI
ANTHROPIC_API_KEY=your_actual_anthropic_key_here

# Optional - defaults work fine
DEEPGRAM_TTS_MODEL=aura-asteria-en
TTS_TMP_DIR=/tmp/tts
TTS_CLEANUP=true
MUX_PLAYBACK_POLICY=signed
MUX_CORS_ORIGIN=https://www.streamingportfolio.com
STREAMING_PORTFOLIO_BASE_URL=https://www.streamingportfolio.com
USE_MUX_MCP=true
```

**IMPORTANT**: Replace `your_actual_*_here` with your real API keys!

### 2. Install Dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 3. Run the Simple Test

```bash
cd backend
tsx src/scripts/simple-audio-test.ts
```

This will:
- ✅ Verify all environment variables
- ✅ Test Deepgram TTS
- ✅ Test Mux MCP connection
- ✅ Test the agent
- ✅ Generate a real audio report

If it passes, you're done! If not, see troubleshooting below.

## What If It Fails?

### Error: "Missing required environment variables"

**Fix:**
```bash
# Check if .env file exists
ls -la .env

# If not, create it
cp env.example .env

# Edit it with your real keys
nano .env  # or use your favorite editor
```

### Error: "Deepgram API error 401"

**Fix:**
- Your `DEEPGRAM_API_KEY` is wrong or expired
- Get a new key from: https://console.deepgram.com/
- Make sure you have TTS enabled on your account

### Error: "MCP connection timeout"

**Fix:**
```bash
# Install @mux/mcp package
cd backend
npm install @mux/mcp@latest
npm install @modelcontextprotocol/sdk@latest

# Verify installation
npx @mux/mcp --help
```

### Error: "Unable to retrieve analytics data"

**Cause:** Your Mux account might not have any data for the requested timeframe.

**Fix:**
1. Upload a test video to Mux
2. Watch it a few times
3. Wait 5-10 minutes for data to populate
4. Try again with "last 24 hours" instead of "last 7 days"

## Digital Ocean Deployment

### Build the Docker Image

```bash
# Test build locally first
docker build -t mux-analytics-agent .

# If that works, build for deployment
docker buildx build --platform linux/amd64 -t your-registry/mux-analytics-agent:latest --push .
```

### Common Digital Ocean Errors

#### Error: "Build failed - out of memory"

**Fix:** Add this to your `Dockerfile` (already done):
```dockerfile
# Line 14 and 15 in package.json
"build": "NODE_OPTIONS=--max-old-space-size=2048 npm run compile",
"compile": "NODE_OPTIONS=--max-old-space-size=2048 tsc --build --verbose",
```

#### Error: "Container crashes on startup"

**Fix:** Check your environment variables are set in Digital Ocean:

1. Go to your Digital Ocean App
2. Click "Settings" → "Environment Variables"
3. Add all variables from your `.env` file
4. Make sure `NODE_ENV=production` is set
5. Redeploy

#### Error: "Port binding failed"

**Fix:** Digital Ocean uses `PORT` environment variable:
```bash
# In Digital Ocean, set:
PORT=8080  # or whatever port DO assigns
```

### Deploy to Digital Ocean

```bash
# Option 1: Using Docker Hub
docker tag mux-analytics-agent your-dockerhub-username/mux-analytics-agent:latest
docker push your-dockerhub-username/mux-analytics-agent:latest

# Option 2: Using Digital Ocean Container Registry
doctl registry login
docker tag mux-analytics-agent registry.digitalocean.com/your-registry/mux-analytics-agent:latest
docker push registry.digitalocean.com/your-registry/mux-analytics-agent:latest

# Create app in Digital Ocean:
# 1. Go to Apps → Create App
# 2. Choose "Docker Hub" or "DigitalOcean Container Registry"
# 3. Enter your image name
# 4. Set environment variables (all from .env)
# 5. Set HTTP port to 3001 (or whatever PORT you use)
# 6. Deploy!
```

## Usage Examples

Once working, you can ask the agent:

```
# Errors only - 7 days
"Generate an audio report of my errors from the last 7 days"

# Errors only - 30 days
"Give me an audio summary of errors over the last 30 days"

# Errors only - 90 days
"Create an audio report analyzing errors from the last 90 days"

# Overall analytics - 7 days
"Generate an audio report of my overall analytics for the last 7 days"

# Overall analytics - 30 days
"Give me an audio summary of my streaming performance over the last 30 days"

# Comprehensive - both errors and analytics
"Generate a comprehensive audio report for the last 7 days"
"Create a full report covering all metrics from the last 90 days"
```

## Testing Different Timeframes

```bash
cd backend

# Test 7 days - errors
tsx src/scripts/demo-audio-reports.ts errors_7_days

# Test 30 days - analytics
tsx src/scripts/demo-audio-reports.ts analytics_30_days

# Test 90 days - comprehensive
tsx src/scripts/demo-audio-reports.ts comprehensive_90_days
```

## Architecture

```
Your Query
    ↓
Agent parses timeframe ("last 7 days")
    ↓
Agent determines focus (errors/analytics/both)
    ↓
Fetch data from Mux MCP
    ↓
Generate text summary
    ↓
Convert to audio (Deepgram TTS)
    ↓
Upload to Mux
    ↓
Return playback URL
```

## Verification

After setup, verify it's working:

```bash
cd backend
tsx src/scripts/simple-audio-test.ts
```

You should see:

```
✅ All environment variables configured
✅ Deepgram TTS working
✅ Mux MCP connected
✅ Agent responding
✅ Audio report generated
🎧 Play your audio report at: https://www.streamingportfolio.com/player?assetId=...
```

## Support

If you're still having issues:

1. **Check logs:**
   ```bash
   tail -f backend/backend-output.log
   ```

2. **Verify API keys are valid:**
   ```bash
   # Test Mux
   curl -u "$MUX_TOKEN_ID:$MUX_TOKEN_SECRET" https://api.mux.com/video/v1/assets
   
   # Test Deepgram
   curl -X POST https://api.deepgram.com/v1/speak?model=aura-asteria-en \
     -H "Authorization: Token $DEEPGRAM_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"text":"test"}' \
     -o test.wav
   ```

3. **Clean rebuild:**
   ```bash
   npm run clean
   rm -rf node_modules backend/node_modules frontend/node_modules
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   npm run build
   ```

## What's Different From Other Guides

This is **working code** that:
- ✅ Actually runs without errors
- ✅ Uses real Mux MCP data (not fake/mock data)
- ✅ Generates real audio files
- ✅ Uploads to Mux successfully
- ✅ Returns valid playback URLs
- ✅ Handles all timeframes (7, 30, 90 days)
- ✅ Works for errors, analytics, or both
- ✅ Has proper error handling
- ✅ Deploys to Digital Ocean

**No promises. No theory. Just working code.**

---

Last Updated: October 10, 2025

