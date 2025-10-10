# Error Summarization Test Guide

## Quick Test

Try these prompts in order to diagnose the issue:

### 1. Test Different Timeframes
```
summarize my errors over the last 24 hours
summarize my errors over the last 30 days
summarize my errors from this month
```

### 2. Test Without Audio (text only)
```
show me my error data for the last 7 days
what errors occurred in the last week
```

### 3. Check If Data Exists
```
list my video assets
show me analytics for the last 24 hours
```

## Common Error Messages & Fixes

### "Unable to retrieve error data from Mux API"
**Cause:** Your Mux account doesn't have error data for the requested timeframe.

**Fix:** 
- Try a different timeframe
- Check if your Mux account actually has video views/errors
- Verify MUX_TOKEN_ID and MUX_TOKEN_SECRET are correct in `.env`

### "DEEPGRAM_API_KEY is required"
**Cause:** Audio generation requires Deepgram API key

**Fix:**
```bash
# Add to .env file
DEEPGRAM_API_KEY=your_key_here
```

### Request Times Out
**Cause:** The full flow (fetch data + generate audio + upload) takes 30-60 seconds

**Fix:**
- Wait patiently (the first audio report can take up to 90 seconds)
- Check backend logs for progress
- Try a simpler query first: "show me my error data"

## Environment Variables Required

Make sure your `.env` file has:
```bash
# Mux (required for error data)
MUX_TOKEN_ID=your_token_id
MUX_TOKEN_SECRET=your_token_secret

# Anthropic (required for AI agent)
ANTHROPIC_API_KEY=your_anthropic_key

# Deepgram (required for audio generation)
DEEPGRAM_API_KEY=your_deepgram_key
```

## Start Backend Server

```bash
cd backend
npm run dev
```

Then test in the frontend at http://localhost:5173

## Debug Logs

Watch backend logs:
```bash
tail -f backend/backend-output.log
```

Look for:
- `[mux-errors]` - error data fetching
- `[tts-analytics-report]` - audio generation
- `[createMuxUpload]` - upload process

