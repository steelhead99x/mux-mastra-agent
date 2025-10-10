# Audio Reports Guide - Mux Analytics Agent

This guide explains how to use the Mux Analytics Agent to generate audio reports for different timeframes, focusing on errors, overall analytics, or both.

## Overview

The Mux Analytics Agent can automatically generate natural-sounding audio reports from your Mux streaming data. It fetches real data from Mux via MCP (Model Context Protocol), analyzes it, generates a conversational text summary, converts it to speech using Deepgram TTS, uploads the audio to Mux, and provides you with a playback URL.

## Features

✅ **Multiple Timeframes**
- Last 7 days
- Last 30 days  
- Last 90 days
- Any custom relative timeframe (e.g., "last 24 hours", "last 2 weeks")

✅ **Three Focus Areas**
- **Errors Only**: Detailed error analysis with platform breakdown
- **Overall Analytics**: Performance metrics, views, rebuffering, startup times
- **Comprehensive**: Both errors and analytics in a single report

✅ **Real Mux MCP Data**
- Fetches actual data from your Mux account via MCP
- No mock or fake data
- Real error counts, platform breakdowns, and performance metrics

✅ **Natural Audio**
- Generated using Deepgram TTS (Aura models)
- Conversational tone optimized for listening
- Under 1000 words for conciseness

✅ **Automated Workflow**
- Generates TTS audio
- Uploads to Mux
- Returns playback URL
- Ready for immediate streaming

## How to Use

### 1. Via Natural Language (Recommended)

Simply ask the agent in natural language. The agent will automatically determine the timeframe and focus area from your query:

#### Error Reports

```
"Generate an audio report of my errors from the last 7 days"
"Show me errors from the past 30 days"
"Analyze my streaming errors from the last 90 days"
"What errors occurred last week?"
```

#### Overall Analytics Reports

```
"Generate an audio report of my overall analytics for the last 7 days"
"Give me a performance summary for the last 30 days"
"What were my streaming metrics over the last 90 days?"
"How did my videos perform last month?"
```

#### Comprehensive Reports (Both Errors and Analytics)

```
"Generate a comprehensive audio report for the last 7 days"
"Give me a complete analysis including errors and analytics for the last 30 days"
"Create a full report covering all metrics from the last 90 days"
"I need a complete overview of my streaming data for the past week"
```

### 2. Programmatic Usage

You can also use the agent programmatically:

```typescript
import { muxAnalyticsAgent } from './agents/mux-analytics-agent.js';

// Generate an error report for last 7 days
const response = await muxAnalyticsAgent.generate(
  "Generate an audio report of my errors from the last 7 days"
);

console.log(response);
// The response will include the audio playback URL
```

### 3. Direct Tool Usage

For advanced use cases, you can call the tool directly:

```typescript
import { ttsAnalyticsReportTool } from './agents/mux-analytics-agent.js';

// Errors report for last 30 days
const result = await ttsAnalyticsReportTool.execute({
  context: {
    timeframe: "last 30 days",
    focusArea: "errors"
  }
});

// Overall analytics for last 90 days
const result2 = await ttsAnalyticsReportTool.execute({
  context: {
    timeframe: "last 90 days",
    focusArea: "general"
  }
});

// Comprehensive report for last 7 days
const result3 = await ttsAnalyticsReportTool.execute({
  context: {
    timeframe: "last 7 days",
    focusArea: "both"
  }
});
```

## Focus Areas Explained

### `errors` - Error Analysis Only

When you ask about errors specifically, the agent will:
- Fetch error data from Mux MCP
- Calculate total error counts
- Break down errors by platform (macOS, iOS, Android, etc.)
- Identify top error types and messages
- Provide recommendations for reducing errors

**Example Output:**
```
Error Analysis Report for Paramount Plus Streaming:

Time Period: October 3, 2025 to October 10, 2025

Total Errors Detected: 42

Error Summary:
Your streaming platform encountered 42 errors during this period.

Error Breakdown by Platform:
1. iOS: 18 errors (2.3% error rate)
2. Android: 15 errors (1.8% error rate)
3. Web: 9 errors (0.9% error rate)

Top Error Types:
1. Network Error: 20 occurrences - Failed to load video segment
2. DRM Error: 12 occurrences - License acquisition failed
3. Playback Error: 10 occurrences - Video decode error

Recommendations:
1. Investigate the most common error types to identify root causes
2. Focus on platforms with the highest error rates
3. Review player configuration and encoding settings
```

### `general` - Overall Analytics Only

When you ask about analytics, performance, or metrics, the agent will:
- Fetch overall metrics from Mux MCP
- Calculate health score
- Report on views, rebuffering, startup time, error rates
- Identify performance issues
- Provide optimization recommendations

**Example Output:**
```
Hello! Here's your Mux Video Streaming Analytics Report.

This report covers the time period from October 3, 2025 to October 10, 2025.

Let's start with your overall health score... which is 87 out of 100.
Streaming performance is good with minor areas for optimization.

Now, let me walk you through the key performance indicators.

First, you had a total of 1,247 views during this period.
Your viewers watched for a combined 156 hours and 32 minutes.
Videos took an average of 2.3 seconds to start playing.
Rebuffering was minimal at just 1.4 percent... that's excellent!
Error rate was acceptable at 1.9 percent.

I found 2 issues that need your attention.
Issue number 1... Moderate startup time: 2.3s average
Issue number 2... Error rate could be improved from 1.9%

Recommendation 1... Consider optimizing player initialization
Recommendation 2... Monitor error patterns and review encoding profiles

Overall... your performance is good, with just some areas for optimization.
```

### `both` - Comprehensive Report

When you ask for a comprehensive, complete, or full report, the agent will:
- Fetch both error data and analytics data from Mux MCP
- Start with error analysis if errors exist
- Include performance metrics
- Provide holistic recommendations
- Give a complete picture of streaming health

**Example Output:**
```
Hello! Here's your Mux Video Streaming Analytics Report.

Time Period: October 3, 2025 to October 10, 2025

Overall Performance Summary:
Your streaming infrastructure had 1,247 views during this period, 
with 42 error events detected. Let me break down the details.

Error Analysis:
Total Error Events: 42

Detailed Error Breakdown:
1. Network Error: 20 occurrences - Failed to load video segment
2. DRM Error: 12 occurrences - License acquisition failed
3. Playback Error: 10 occurrences - Video decode error

Platform Error Distribution:
1. iOS: 18 errors
2. Android: 15 errors
3. Web: 9 errors

Key Performance Metrics:
Total Views: 1,247
Error Rate: 1.92%
Rebuffer Rate: 1.43%
Avg Startup Time: 2.31 seconds

Recommendations:
1. Investigate network error patterns on iOS
2. Review DRM license server configuration
3. Consider optimizing player initialization

Health Score: 87/100

That concludes your comprehensive analytics report. Thank you for listening!
```

## Timeframe Parsing

The agent supports natural language timeframe expressions:

| Expression | Meaning |
|------------|---------|
| "last 7 days" | Past 7 days from now |
| "last 30 days" | Past 30 days from now |
| "last 90 days" | Past 90 days from now |
| "last 24 hours" | Past 24 hours from now |
| "last week" | Past 7 days |
| "last month" | Past 30 days (approximate) |
| "last 2 weeks" | Past 14 days |

You can also use Unix timestamp arrays if needed:
```typescript
timeframe: [1696291200, 1696896000] // [start, end] in Unix seconds
```

## Data Sources

All data comes from **real Mux MCP endpoints**:

### Error Data
- Source: `data.errors` MCP resource
- Endpoint: `list_data_errors`
- Includes: Error counts, types, messages, platform breakdown
- Fallback: None (returns error if data unavailable)

### Analytics Data
- Source: `data.metrics` MCP resource
- Endpoint: `get_overall_values_data_metrics`
- Includes: Views, rebuffering, startup time, error rates
- Fallback: None (returns error if data unavailable)

### Platform Breakdown
- Source: `data.metrics` MCP resource
- Endpoint: `list_breakdown_values_data_metrics`
- Grouped by: `operating_system`
- Includes: Error counts per platform, negative impact scores

## Audio Generation

### TTS Provider
- **Service**: Deepgram TTS API
- **Model**: `aura-asteria-en` (configurable via `DEEPGRAM_TTS_MODEL` env var)
- **Quality**: High-quality, natural-sounding voice
- **Encoding**: Linear16 PCM WAV, 24kHz sample rate

### Audio Processing
1. Fetch data from Mux MCP
2. Generate conversational text summary (under 1000 words)
3. Convert text to speech using Deepgram
4. Save audio file locally (temporary)
5. Upload to Mux via signed upload URL
6. Wait for asset creation
7. Return player URL for streaming
8. Clean up local file (if `TTS_CLEANUP=true`)

### Playback
Audio is delivered via Mux with:
- **Playback Policy**: Signed (secure)
- **CORS Origin**: Configured via `MUX_CORS_ORIGIN`
- **Player URL**: `https://www.streamingportfolio.com/player?assetId=<ASSET_ID>`

## Requirements

### Environment Variables

Required:
```bash
# Mux API Credentials
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret

# Deepgram TTS
DEEPGRAM_API_KEY=your_deepgram_api_key

# Anthropic (for agent)
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Optional:
```bash
# TTS Configuration
DEEPGRAM_TTS_MODEL=aura-asteria-en  # Voice model
TTS_TMP_DIR=/tmp/tts                 # Temp directory for audio files
TTS_CLEANUP=true                     # Auto-cleanup after upload

# Mux Configuration
MUX_PLAYBACK_POLICY=signed           # Playback policy
MUX_CORS_ORIGIN=https://www.streamingportfolio.com
STREAMING_PORTFOLIO_BASE_URL=https://www.streamingportfolio.com

# MCP Configuration
USE_MUX_MCP=true                     # Use MCP (vs REST API)
MUX_CONNECTION_TIMEOUT=45000         # MCP connection timeout (ms)
```

## Testing

### Run the Demo Script

```bash
cd backend
tsx src/scripts/demo-audio-reports.ts errors_7_days
```

Available demo types:
- `errors_7_days` - Error report for last 7 days
- `errors_30_days` - Error report for last 30 days
- `errors_90_days` - Error report for last 90 days
- `analytics_7_days` - Analytics report for last 7 days
- `analytics_30_days` - Analytics report for last 30 days
- `analytics_90_days` - Analytics report for last 90 days
- `comprehensive_7_days` - Full report for last 7 days
- `comprehensive_30_days` - Full report for last 30 days
- `comprehensive_90_days` - Full report for last 90 days

### Run the Test Suite

```bash
cd backend
tsx src/test/test-audio-reports-timeframes.ts
```

This will test all 9 scenarios (3 timeframes × 3 focus areas).

## Troubleshooting

### "Unable to retrieve analytics data"
- Check that your Mux account has data for the requested timeframe
- Verify `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are correct
- Ensure you have views/errors in the specified time period

### "DEEPGRAM_API_KEY is required"
- Set the `DEEPGRAM_API_KEY` environment variable
- Verify the API key is valid and has TTS permissions
- Check your Deepgram account has sufficient credits

### "MCP connection timeout"
- Increase `MUX_CONNECTION_TIMEOUT` (default: 45000ms)
- Check your network connection
- Verify `@mux/mcp` package is installed

### No audio URL in response
- The agent may still be processing the upload
- Check backend logs for upload status
- Verify `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` have upload permissions

### Invalid or fake asset IDs
- The agent never creates fake asset IDs
- Asset IDs come from Mux and are 40+ character strings
- If you see short IDs, the upload may have failed

## Example Scenarios

### Scenario 1: Weekly Error Review
**Goal**: Review errors from the past week

**Query**: 
```
"Give me an audio summary of errors from the last 7 days"
```

**Result**:
- Fetches error data via MCP for past 7 days
- Analyzes error types and platform distribution
- Generates audio report (2-3 minutes)
- Uploads to Mux
- Returns playback URL

### Scenario 2: Monthly Performance Report
**Goal**: Monthly review of streaming performance

**Query**:
```
"Create an audio report of my streaming performance for the last 30 days"
```

**Result**:
- Fetches analytics data via MCP for past 30 days
- Calculates health score and performance metrics
- Identifies issues and recommendations
- Generates audio report (3-4 minutes)
- Uploads to Mux
- Returns playback URL

### Scenario 3: Quarterly Business Review
**Goal**: Comprehensive quarterly analysis

**Query**:
```
"Generate a comprehensive audio report covering all metrics and errors from the last 90 days"
```

**Result**:
- Fetches both error and analytics data for past 90 days
- Comprehensive analysis of errors, performance, and trends
- Detailed recommendations for improvement
- Generates audio report (4-5 minutes)
- Uploads to Mux
- Returns playback URL

## Best Practices

1. **Use Natural Language**: The agent is optimized for conversational queries
2. **Be Specific**: Mention "errors" if you want error focus, "analytics" for performance
3. **Include Timeframe**: Always specify the time period you want to analyze
4. **Review Regularly**: Set up weekly/monthly audio report reviews
5. **Check Prerequisites**: Ensure all environment variables are configured
6. **Monitor Logs**: Backend logs show detailed MCP interactions and upload status

## Architecture

```
User Query
    ↓
Mux Analytics Agent
    ↓
Parse Timeframe ("last 7 days" → Unix timestamps)
    ↓
Determine Focus Area (errors/general/both)
    ↓
Fetch Data from Mux MCP
    ├── data.errors endpoint (if focusArea includes 'errors')
    └── data.metrics endpoint (if focusArea includes 'general')
    ↓
Analyze & Summarize Data
    ├── Calculate metrics, error counts
    ├── Identify issues and recommendations
    └── Generate conversational text (< 1000 words)
    ↓
Generate TTS Audio (Deepgram)
    ↓
Upload to Mux
    ├── Create upload URL (signed)
    ├── PUT audio file
    └── Wait for asset creation
    ↓
Return Response
    ├── Player URL
    ├── Asset ID
    └── Summary text
```

## Related Documentation

- [Mux MCP Documentation](./docs/mcp-integration.md)
- [TTS Improvements](./TTS_IMPROVEMENTS.md)
- [Mux Analytics Verification](./MCP_ANALYTICS_VERIFICATION_REPORT.md)

## Support

For issues or questions:
1. Check backend logs: `tail -f backend/backend-output.log`
2. Verify environment variables are set correctly
3. Test MCP connection: `tsx src/scripts/test-mcp-integration.sh`
4. Review agent behavior: Use verbose logging

---

**Last Updated**: October 10, 2025
**Version**: 1.0.0

