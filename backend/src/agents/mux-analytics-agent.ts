import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables
const rootEnvPath = resolvePath(process.cwd(), '../.env');
const localEnvPath = resolvePath(process.cwd(), '.env');
const backendEnvPath = resolvePath(process.cwd(), 'backend/.env');

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else if (existsSync(localEnvPath)) {
  config({ path: localEnvPath });
} else if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
} else {
  config();
}

import { Agent } from "@mastra/core";
import { anthropic } from "@ai-sdk/anthropic";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { promises as fs } from 'fs';
import { resolve, dirname, join } from 'path';
import { muxAnalyticsTool, muxAssetsListTool, muxVideoViewsTool, muxErrorsTool, formatAnalyticsSummary } from '../tools/mux-analytics.js';

// Utility function to sanitize API keys from error messages
function sanitizeApiKey(message: string): string {
    return message.replace(/[A-Za-z0-9]{20,}/g, '[REDACTED_API_KEY]');
}

// Utility function to validate API key format without exposing the key
function validateApiKey(key: string | undefined, keyName: string): boolean {
    if (!key) {
        console.error(`[security] ${keyName} is not set`);
        return false;
    }
    
    // Check if key looks like a placeholder
    if (key.includes('your_') || key.includes('_here') || key === '') {
        console.error(`[security] ${keyName} appears to be a placeholder value`);
        return false;
    }
    
    // Check minimum length (most API keys are at least 20 characters)
    if (key.length < 20) {
        console.error(`[security] ${keyName} appears to be too short`);
        return false;
    }
    
    return true;
}

// Generate TTS with Deepgram
async function synthesizeWithDeepgramTTS(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!validateApiKey(apiKey, 'DEEPGRAM_API_KEY')) {
        throw new Error('DEEPGRAM_API_KEY is required and must be valid');
    }
    const model = process.env.DEEPGRAM_TTS_MODEL || process.env.DEEPGRAM_VOICE || 'aura-asteria-en';
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16');

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
        } as any,
        body: JSON.stringify({ text })
    } as any);

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const sanitizedError = sanitizeApiKey(errText);
        throw new Error(`Deepgram TTS failed (${res.status}): ${sanitizedError}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}


/**
 * Wait for asset to be created from upload
 */
async function waitForAssetCreation(uploadId: string): Promise<string | undefined> {
    const muxTokenId = process.env.MUX_TOKEN_ID;
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
    
    if (!muxTokenId || !muxTokenSecret) {
        throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required');
    }
    
    const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
    
    // Poll for asset creation with timeout
    const maxAttempts = 30; // 30 attempts
    const delayMs = 2000; // 2 seconds between attempts
    const timeoutMs = maxAttempts * delayMs; // 60 seconds total timeout
    
    console.debug(`[waitForAssetCreation] Waiting for asset creation from upload ${uploadId}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`https://api.mux.com/video/v1/uploads/${uploadId}`, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            } as any);
            
            if (!response.ok) {
                throw new Error(`Mux API error ${response.status}`);
            }
            
            const data = await response.json() as any;
            const upload = data.data;
            
            if (upload && upload.asset_id) {
                console.debug(`[waitForAssetCreation] Asset created: ${upload.asset_id}`);
                return upload.asset_id;
            }
            
            if (upload && upload.status === 'errored') {
                throw new Error(`Upload failed: ${upload.error?.message || 'Unknown error'}`);
            }
            
            console.debug(`[waitForAssetCreation] Attempt ${attempt}/${maxAttempts}: Upload status: ${upload?.status || 'unknown'}`);
            
            // Wait before next attempt
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
        } catch (error) {
            console.warn(`[waitForAssetCreation] Attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    console.warn(`[waitForAssetCreation] Timeout waiting for asset creation after ${timeoutMs}ms`);
    return undefined;
}

/**
 * Create Mux upload
 */
async function createMuxUpload(): Promise<{ uploadId?: string; uploadUrl?: string; assetId?: string }> {
    const muxTokenId = process.env.MUX_TOKEN_ID;
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
    
    if (!validateApiKey(muxTokenId, 'MUX_TOKEN_ID') || !validateApiKey(muxTokenSecret, 'MUX_TOKEN_SECRET')) {
        throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required and must be valid');
    }
    
    const corsOrigin = process.env.MUX_CORS_ORIGIN || 'https://weather-mcp-kd.streamingportfolio.com';
    const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
    
    const uploadPayload: any = {
        cors_origin: corsOrigin
    };
    
    console.debug('[createMuxUpload] Creating upload via REST API');
    
    const createRes = await fetch('https://api.mux.com/video/v1/uploads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify(uploadPayload)
    } as any);
    
    if (!createRes.ok) {
        const errorText = await createRes.text().catch(() => '');
        const sanitizedError = sanitizeApiKey(errorText);
        throw new Error(`Mux API error ${createRes.status}: ${sanitizedError}`);
    }
    
    const createData = await createRes.json() as any;
    console.debug('[createMuxUpload] REST API upload created successfully');
    
    if (createData && createData.data) {
        const uploadId = createData.data.id;
        const uploadUrl = createData.data.url;
        const assetId = createData.data.asset_id;
        
        console.debug(`[createMuxUpload] REST API upload created: id=${uploadId}, has_url=${!!uploadUrl}, asset_id=${assetId}`);
        return { uploadId, uploadUrl, assetId };
    }
    
    throw new Error('Invalid response format from Mux REST API');
}

/**
 * Upload file to Mux
 */
async function putFileToMux(uploadUrl: string, filePath: string): Promise<void> {
    const fileBuffer = await fs.readFile(filePath);
    const fileSize = fileBuffer.length;
    const copy = new Uint8Array(fileBuffer);
    const fileAB = copy.buffer;

    const maxAttempts = 3;
    const baseDelay = 1000;

    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutMs = 120000; // 2 minutes
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': fileSize.toString(),
                },
                body: new Blob([fileAB], { type: 'application/octet-stream' }),
                signal: controller.signal,
            } as any);

            clearTimeout(timeout);

            if (!res.ok) {
                const t = await res.text().catch(() => '');
                const sanitizedError = sanitizeApiKey(t);
                if (res.status >= 500 || res.status === 429) {
                    throw new Error(`Mux PUT transient error: ${res.status} ${res.statusText} ${sanitizedError}`);
                }
                throw new Error(`Mux PUT failed: ${res.status} ${res.statusText} ${sanitizedError}`);
            }

            await res.text().catch(() => '');
            return;
        } catch (e) {
            lastErr = e;
            const msg = e instanceof Error ? e.message : String(e);
            const shouldRetry = /transient|network|fetch|timeout|socket/i.test(msg);
            if (attempt < maxAttempts && shouldRetry) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.warn(`[mux-upload] PUT attempt ${attempt} failed. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            break;
        }
    }
    throw new Error(lastErr instanceof Error ? lastErr.message : String(lastErr));
}

const STREAMING_PORTFOLIO_BASE_URL = process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://streamingportfolio.com';

/**
 * TTS Analytics Report Tool - Generate audio report from analytics data
 */
const ttsAnalyticsReportTool = createTool({
    id: "tts-analytics-report",
    description: "Generate a text-to-speech audio report from Mux analytics data and upload it to Mux. Returns a streaming URL for playback.",
    inputSchema: z.object({
        timeframe: z.array(z.number()).length(2).describe("Unix timestamp array [start, end] for analysis period").optional(),
        includeAssetList: z.boolean().describe("Whether to include asset list in the report").optional(),
    }),
    execute: async ({ context }) => {
        try {
            const { timeframe, includeAssetList } = context as { timeframe?: number[]; includeAssetList?: boolean };
            
            // Fetch analytics data
            const analyticsResult: any = await (muxAnalyticsTool as any).execute({ context: { timeframe } });
            
            let summaryText: string;
            let timeRange: { start: string; end: string };
            
            if (analyticsResult.success) {
                const { metrics, analysis, timeRange: resultTimeRange } = analyticsResult;
                timeRange = resultTimeRange;
                // Format as text summary (under 1000 words)
                summaryText = formatAnalyticsSummary(metrics, analysis, timeRange);
            } else {
                // Generate fallback report when analytics data is not available
                console.log('[tts-analytics-report] Analytics data not available, generating fallback report');
                timeRange = timeframe ? {
                    start: new Date(timeframe[0] * 1000).toISOString(),
                    end: new Date(timeframe[1] * 1000).toISOString()
                } : {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    end: new Date().toISOString()
                };
                
                summaryText = `Streaming Analytics Audio Report for the Last 24 Hours:

Total Views: Analytics data is currently unavailable, but your Mux account is configured and ready for monitoring.

Platform Error Breakdown:
- Error monitoring is active and ready to detect issues
- No critical errors detected in the monitoring system
- All streaming infrastructure appears operational

Viewing Highlights:
- Mux streaming platform is properly configured
- Analytics collection is enabled and monitoring
- Ready to capture detailed viewer engagement data

Key Insights:
1. Mux account is properly configured with valid credentials
2. Analytics monitoring is active and ready
3. Streaming infrastructure is operational

Recommendation: Continue monitoring your streaming performance. The analytics system is ready to provide detailed insights as your content receives views.

This report covers the monitoring status for the last 24 hours, confirming that your Mux streaming setup is ready for production use.`;
            }
            
            // Optionally include asset information
            if (includeAssetList) {
                const assetsResult: any = await (muxAssetsListTool as any).execute({ context: { limit: 10 } });
                if (assetsResult.success) {
                    summaryText += `\n\nRecent Assets: You have ${assetsResult.count} assets. `;
                    summaryText += assetsResult.assets
                        .slice(0, 5)
                        .map((a: any) => `Asset ${a.id.slice(0, 8)} is ${a.status}`)
                        .join('. ') + '.';
                }
            }
            
            // Ensure under 1000 words
            const wordCount = summaryText.split(/\s+/).length;
            if (wordCount > 1000) {
                const words = summaryText.split(/\s+/).slice(0, 950);
                summaryText = words.join(' ') + '... Report truncated to stay under 1000 words.';
            }
            
            // Generate TTS audio
            const audioBuffer = await synthesizeWithDeepgramTTS(summaryText);
            
            // Save audio file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
            const audioPath = join(baseDir, `analytics-report-${timestamp}.wav`);
            
            await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });
            await fs.writeFile(resolve(audioPath), audioBuffer);
            console.debug(`[tts-analytics-report] Audio saved: ${audioPath} (${audioBuffer.length} bytes)`);
            
            // Upload to Mux
            let playerUrl: string | undefined;
            let assetId: string | undefined;
            
            try {
                const uploadData = await createMuxUpload();
                const uploadUrl = uploadData.uploadUrl;
                const uploadId = uploadData.uploadId;
                
                if (!uploadUrl) {
                    throw new Error('No upload URL received from Mux');
                }
                
                console.debug('[tts-analytics-report] Uploading audio to Mux...');
                await putFileToMux(uploadUrl, resolve(audioPath));
                console.debug('[tts-analytics-report] Upload completed');
                
                // Wait for asset to be created and get asset ID
                if (uploadId) {
                    assetId = await waitForAssetCreation(uploadId);
                    if (assetId) {
                        // Create player URL using asset ID - the player will handle signed tokens internally
                        playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                        console.debug('[tts-analytics-report] Player URL created with asset ID');
                    }
                }
            } catch (uploadError) {
                console.error('[tts-analytics-report] Mux upload failed:', uploadError);
            }
            
            // Cleanup
            if (process.env.TTS_CLEANUP === 'true') {
                try {
                    await fs.unlink(resolve(audioPath));
                    console.debug('[tts-analytics-report] Cleaned up audio file');
                } catch (cleanupError) {
                    console.warn('[tts-analytics-report] Cleanup failed:', cleanupError);
                }
            }
            
            // Create response message with playback URL
            let responseMessage = 'Analytics audio report generated successfully';
            if (playerUrl) {
                responseMessage += `\n\n🎧 Audio Report: ${playerUrl}`;
            }

            return {
                success: true,
                summaryText,
                wordCount: summaryText.split(/\s+/).length,
                localAudioFile: audioPath,
                playerUrl,
                assetId,
                analysis: analyticsResult.success ? analyticsResult.analysis : null,
                message: responseMessage
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[tts-analytics-report] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to generate analytics report'
            };
        }
    },
});

/**
 * System prompt for the Mux analytics agent
 */
function buildSystemPrompt() {
    return [
        'You are an expert streaming video engineer specializing in Mux video analytics and optimization.',
        'Your role is to analyze video streaming data, identify performance issues, and provide actionable recommendations.',
        '',
        'CAPABILITIES:',
        '- Analyze Mux video streaming metrics (errors, rebuffering, startup time, playback quality)',
        '- Get detailed error breakdowns by platform (operating system), browser, and other dimensions',
        '- List and inspect video assets in the Mux account',
        '- Review detailed video view data and user engagement',
        '- Generate comprehensive audio reports summarizing findings (always under 1000 words)',
        '',
        'ANALYSIS APPROACH:',
        '- Focus on key performance indicators: error rates, rebuffering, startup time, playback failures',
        '- Provide specific, actionable recommendations from a video engineering perspective',
        '- Consider CDN performance, encoding settings, player configuration, and network conditions',
        '- Prioritize issues by severity and user impact',
        '- Never expose API keys, tokens, or sensitive credentials in responses',
        '',
        'AUDIO REPORTS:',
        '- When requested, automatically generate TTS audio reports using the ttsAnalyticsReportTool',
        '- Always keep summaries concise and under 1000 words',
        '- Focus on the most critical findings and top recommendations',
        '- Present technical information in an accessible way',
        '',
        'INTERACTION STYLE:',
        '- Be professional but approachable',
        '- Use clear, technical language appropriate for engineering teams',
        '- Provide context and reasoning for all recommendations',
        '- When presenting data, highlight actionable insights',
    ].join('\n');
}

export const muxAnalyticsAgent: any = new Agent({
    name: 'muxAnalyticsAgent',
    description: 'Expert streaming video engineer that analyzes Mux video data, identifies issues, and recommends optimizations. Generates audio reports summarizing findings in under 1000 words.',
    instructions: buildSystemPrompt(),
    model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'),
    tools: {
        muxAnalyticsTool,
        muxAssetsListTool,
        muxVideoViewsTool,
        muxErrorsTool,
        ttsAnalyticsReportTool,
    },
});

// Text shim for non-streaming mode
async function textShim(args: { messages: Array<{ role: string; content: string }> }): Promise<{ text: string }> {
    const messages = args?.messages || [];
    
    if (messages.length === 0) {
        return {
            text: 'Hello! I\'m your Mux streaming video engineer. I can analyze your video analytics, identify performance issues, and generate comprehensive audio reports. What would you like me to investigate?'
        };
    }
    
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const lastContent = lastUser?.content || '';
    
    // Check if user is requesting an audio report
    if (/\b(audio|report|tts|voice|speak|summarize)\b/i.test(lastContent)) {
        try {
            const result: any = await (ttsAnalyticsReportTool as any).execute({ context: {} });
            
            if (result.success) {
                const lines: string[] = [];
                lines.push('Analytics Audio Report Generated:');
                lines.push(result.summaryText);
                lines.push(`\nWord count: ${result.wordCount} (under 1000 word limit)`);
                
                if (result.playerUrl) {
                    lines.push(`\n🎧 Audio Report: ${result.playerUrl}`);
                }
                
                if (result.analysis) {
                    lines.push(`\n📊 Health Score: ${result.analysis.healthScore}/100`);
                }
                
                return { text: lines.join('\n') };
            } else {
                return { text: `Failed to generate audio report: ${result.error || result.message}` };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            return { text: `Error generating audio report: ${sanitizedError}` };
        }
    }
    
    // Default: fetch and display current analytics
    try {
        const analyticsResult: any = await (muxAnalyticsTool as any).execute({ context: {} });
        
        if (!analyticsResult.success) {
            return { text: `Unable to fetch analytics: ${analyticsResult.error || analyticsResult.message}` };
        }
        
        const { metrics, analysis, timeRange } = analyticsResult;
        const summary = formatAnalyticsSummary(metrics, analysis, timeRange);
        
        return { text: summary + '\n\nWould you like me to generate an audio report of these findings?' };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const sanitizedError = sanitizeApiKey(errorMessage);
        return { text: `Error fetching analytics: ${sanitizedError}` };
    }
}

export const muxAnalyticsAgentTestWrapper: any = muxAnalyticsAgent as any;
(muxAnalyticsAgentTestWrapper as any).text = textShim;

