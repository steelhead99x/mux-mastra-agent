# Digital Ocean Deployment - Fix Guide

This guide fixes the most common Digital Ocean deployment errors.

## Quick Fix Checklist

### ✅ 1. Fix Docker Build Errors

If you're getting "out of memory" or build failures:

```bash
# Test build locally first
docker build -t mux-analytics-agent .

# If it fails with memory errors, the fix is already in package.json:
# Line 14-15 in backend/package.json:
# "build": "NODE_OPTIONS=--max-old-space-size=2048 npm run compile"
```

### ✅ 2. Fix Environment Variables

Digital Ocean apps need environment variables set in the dashboard:

1. Go to your app in Digital Ocean
2. Click **Settings** → **Environment Variables** → **Edit**
3. Add these (using your real values):

```bash
# Required
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
DEEPGRAM_API_KEY=your_deepgram_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Production settings
NODE_ENV=production
PORT=8080

# Optional (these have good defaults)
DEEPGRAM_TTS_MODEL=aura-asteria-en
TTS_TMP_DIR=/tmp/tts
TTS_CLEANUP=true
MUX_PLAYBACK_POLICY=signed
MUX_CORS_ORIGIN=https://www.streamingportfolio.com
STREAMING_PORTFOLIO_BASE_URL=https://www.streamingportfolio.com
USE_MUX_MCP=true
MUX_CONNECTION_TIMEOUT=45000
```

4. Click **Save**
5. Your app will automatically redeploy

### ✅ 3. Fix Port Configuration

Digital Ocean assigns a PORT environment variable. Make sure your app uses it:

1. In Digital Ocean dashboard:
   - Go to **Settings** → **Components**
   - Click your web service
   - Set **HTTP Port** to `8080` (or match your PORT env var)

2. The app already handles this in `backend/src/index.ts`:
   ```typescript
   const PORT = process.env.PORT || 3001;
   ```

### ✅ 4. Fix Container Registry Issues

If you're using Digital Ocean Container Registry:

```bash
# Login
doctl registry login

# Build for linux/amd64 (Digital Ocean runs on this)
docker buildx build --platform linux/amd64 \
  -t registry.digitalocean.com/YOUR_REGISTRY/mux-analytics-agent:latest \
  --push .

# Replace YOUR_REGISTRY with your actual registry name
```

If you don't have buildx:
```bash
docker buildx create --use
docker buildx inspect --bootstrap
```

### ✅ 5. Fix Dockerfile Issues

The Dockerfile is already fixed for production. Key fixes:

1. **Multi-arch support** - Line 72-73:
   ```dockerfile
   FROM base AS runner
   WORKDIR /app
   ```

2. **Memory optimization** - Lines in package.json use `NODE_OPTIONS=--max-old-space-size=2048`

3. **Non-root user** - Lines 78-79:
   ```dockerfile
   RUN addgroup --system --gid 1001 nodejs
   RUN adduser --system --uid 1001 weatheruser
   ```

4. **Proper dependencies** - Lines 82-91 install runtime deps

## Common Errors and Fixes

### Error: "Failed to build"

**Symptom:** Build fails during Docker build

**Cause:** Out of memory or missing dependencies

**Fix:**
```bash
# Check if local build works
docker build -t test .

# If it fails locally, check:
# 1. Do you have enough RAM? (need at least 4GB for build)
# 2. Are all dependencies in package.json?

# Try building with more memory
docker build --memory=4g -t test .
```

### Error: "Container crashed"

**Symptom:** App starts then immediately crashes

**Causes & Fixes:**

1. **Missing environment variables**
   - Go to Settings → Environment Variables
   - Add all required variables (see checklist above)

2. **Port binding error**
   - Make sure PORT env var is set
   - Make sure HTTP Port in settings matches

3. **File permissions**
   - Already fixed in Dockerfile (lines 110, 123)

**Debug:**
```bash
# Check logs in Digital Ocean
# Go to: Runtime Logs (shows container output)
# Look for specific error messages

# Common log errors:
# "Cannot read properties of undefined" → Missing env var
# "EADDRINUSE" → Port conflict (check PORT setting)
# "EACCES" → Permission denied (shouldn't happen with our Dockerfile)
```

### Error: "Mux API 401 Unauthorized"

**Symptom:** App runs but can't fetch Mux data

**Fix:**
1. Verify your Mux credentials are correct
2. Check they're set in Digital Ocean environment variables
3. Make sure there are no trailing spaces in the values

**Test locally:**
```bash
curl -u "$MUX_TOKEN_ID:$MUX_TOKEN_SECRET" https://api.mux.com/video/v1/assets
# Should return JSON, not 401 error
```

### Error: "Deepgram TTS failed"

**Symptom:** Audio generation fails

**Fix:**
1. Check DEEPGRAM_API_KEY is set in Digital Ocean
2. Verify your Deepgram account has TTS enabled
3. Check you have available credits

**Test locally:**
```bash
curl -X POST "https://api.deepgram.com/v1/speak?model=aura-asteria-en" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}' \
  -o test.wav

# Should create test.wav file
ls -lh test.wav
```

## Deployment Methods

### Method 1: Docker Hub (Easiest)

```bash
# 1. Build and push to Docker Hub
docker build -t YOUR_DOCKERHUB_USERNAME/mux-analytics-agent:latest .
docker push YOUR_DOCKERHUB_USERNAME/mux-analytics-agent:latest

# 2. In Digital Ocean:
#    - Create App → Docker Hub
#    - Image: YOUR_DOCKERHUB_USERNAME/mux-analytics-agent:latest
#    - Set environment variables
#    - Deploy!
```

### Method 2: Digital Ocean Container Registry

```bash
# 1. Create registry in Digital Ocean
doctl registry create your-registry-name

# 2. Login
doctl registry login

# 3. Build and push
docker buildx build --platform linux/amd64 \
  -t registry.digitalocean.com/your-registry-name/mux-analytics-agent:latest \
  --push .

# 4. In Digital Ocean:
#    - Create App → DigitalOcean Container Registry
#    - Image: mux-analytics-agent:latest
#    - Set environment variables
#    - Deploy!
```

### Method 3: GitHub (Automated)

```bash
# 1. Push code to GitHub
git push origin main

# 2. In Digital Ocean:
#    - Create App → GitHub
#    - Select repository
#    - Dockerfile will be auto-detected
#    - Set environment variables
#    - Enable auto-deploy on push
#    - Deploy!
```

## Verification Steps

After deployment, verify it works:

### 1. Check Health
```bash
# Replace YOUR_APP_URL with your Digital Ocean app URL
curl https://YOUR_APP_URL/health

# Should return: {"status":"ok"}
```

### 2. Check Environment
```bash
# SSH into your container (if enabled)
doctl apps ssh YOUR_APP_ID

# Or check logs
doctl apps logs YOUR_APP_ID
```

### 3. Test Audio Generation
```bash
# Use the frontend at your app URL
# Or curl the API:
curl -X POST https://YOUR_APP_URL/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Generate an audio report of errors from the last 7 days"}'
```

## Performance Tuning

### Increase Memory (if needed)

1. Go to your app in Digital Ocean
2. Click **Settings** → **Components**
3. Edit your web service
4. Increase **Instance Size** (if crashes persist)
5. Recommended: **Professional plan** for production use

### Enable Caching

Already enabled in the app. The agent caches MCP connections.

### Set up CDN

For faster global access:

1. Go to **Settings** → **Domains**
2. Add custom domain
3. Enable **CDN** (checkbox)
4. Configure SSL certificate (auto or custom)

## Monitoring

### View Logs

```bash
# Via CLI
doctl apps logs YOUR_APP_ID --follow

# Via Dashboard
# Go to: Runtime Logs
```

### Set up Alerts

1. Go to **Settings** → **Alerts**
2. Add alert rules:
   - CPU > 80%
   - Memory > 80%
   - Response time > 2s
   - Error rate > 5%

### Health Checks

Digital Ocean automatically checks `/health` endpoint.

If it fails 3 times, container is restarted.

## Rollback

If deployment breaks something:

1. Go to **Deployments** tab
2. Find last working deployment
3. Click **⋮** → **Redeploy**

## Cost Optimization

### Basic Plan (~$5-12/month)
- Good for testing
- 512MB RAM
- 1 vCPU
- Suitable for light usage

### Professional Plan (~$12-24/month)
- Recommended for production
- 1GB RAM
- 1 vCPU
- Better performance
- Auto-scaling available

### Tips:
- Use spot instances if available (cheaper)
- Set up auto-scaling (scale to 0 when not in use)
- Use CDN to reduce backend load
- Enable response caching

## Still Having Issues?

### Check these in order:

1. **Run diagnostic locally first:**
   ```bash
   ./diagnose-and-fix.sh
   ```

2. **Test Docker build locally:**
   ```bash
   docker build -t test .
   docker run -it --rm \
     -e MUX_TOKEN_ID="$MUX_TOKEN_ID" \
     -e MUX_TOKEN_SECRET="$MUX_TOKEN_SECRET" \
     -e DEEPGRAM_API_KEY="$DEEPGRAM_API_KEY" \
     -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
     -p 3001:3001 \
     test
   ```

3. **Check Digital Ocean logs:**
   ```bash
   doctl apps logs YOUR_APP_ID --type=run
   ```

4. **Verify environment variables are set:**
   ```bash
   doctl apps spec get YOUR_APP_ID
   # Check that all env vars are present
   ```

5. **Try redeploying:**
   ```bash
   doctl apps create-deployment YOUR_APP_ID
   ```

## Working Configuration Example

Here's a known-working Digital Ocean app spec (`.do/app.yaml`):

```yaml
name: mux-analytics-agent
services:
  - name: web
    dockerfile_path: Dockerfile
    source_dir: /
    github:
      repo: your-username/mux-mastra-agent
      branch: main
      deploy_on_push: true
    http_port: 8080
    instance_count: 1
    instance_size_slug: professional-xs
    envs:
      - key: NODE_ENV
        value: "production"
      - key: PORT
        value: "8080"
      - key: MUX_TOKEN_ID
        type: SECRET
        value: "your_token_id"
      - key: MUX_TOKEN_SECRET
        type: SECRET
        value: "your_token_secret"
      - key: DEEPGRAM_API_KEY
        type: SECRET
        value: "your_deepgram_key"
      - key: ANTHROPIC_API_KEY
        type: SECRET
        value: "your_anthropic_key"
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 3
      success_threshold: 1
      failure_threshold: 3
```

---

**Remember:** After any fix, allow 2-3 minutes for the deployment to complete and containers to start.

---

Last Updated: October 10, 2025

