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

// Generate TTS with Deepgram
async function synthesizeWithDeepgramTTS(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPGRAM_API_KEY not set in environment');
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
        throw new Error(`Deepgram TTS failed (${res.status}): ${errText}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}

/**
 * Create Mux upload
 */
async function createMuxUpload(): Promise<{ uploadId?: string; uploadUrl?: string; assetId?: string }> {
    const muxTokenId = process.env.MUX_TOKEN_ID;
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
    
    if (!muxTokenId || !muxTokenSecret) {
        throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required');
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
        throw new Error(`Mux API error ${createRes.status}: ${errorText}`);
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
                if (res.status >= 500 || res.status === 429) {
                    throw new Error(`Mux PUT transient error: ${res.status} ${res.statusText} ${t}`);
                }
                throw new Error(`Mux PUT failed: ${res.status} ${res.statusText} ${t}`);
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
            
            if (!analyticsResult.success) {
                return {
                    success: false,
                    error: analyticsResult.error,
                    message: 'Failed to fetch analytics data'
                };
            }
            
            const { metrics, analysis, timeRange } = analyticsResult;
            
            // Format as text summary (under 1000 words)
            let summaryText = formatAnalyticsSummary(metrics, analysis, timeRange);
            
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
                assetId = uploadData.assetId;
                
                if (!uploadUrl) {
                    throw new Error('No upload URL received from Mux');
                }
                
                console.debug('[tts-analytics-report] Uploading audio to Mux...');
                await putFileToMux(uploadUrl, resolve(audioPath));
                console.debug('[tts-analytics-report] Upload completed');
                
                if (assetId) {
                    playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
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
            
            return {
                success: true,
                summaryText,
                wordCount: summaryText.split(/\s+/).length,
                localAudioFile: audioPath,
                playerUrl,
                assetId,
                analysis,
                message: 'Analytics audio report generated successfully'
            };
            
        } catch (error) {
            console.error('[tts-analytics-report] Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
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
            return { text: `Error generating audio report: ${error instanceof Error ? error.message : String(error)}` };
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
        return { text: `Error fetching analytics: ${error instanceof Error ? error.message : String(error)}` };
    }
}

export const muxAnalyticsAgentTestWrapper: any = muxAnalyticsAgent as any;
(muxAnalyticsAgentTestWrapper as any).text = textShim;

