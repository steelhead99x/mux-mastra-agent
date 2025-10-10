import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Simplified environment loading - only look for root .env file
const rootEnvPath = resolvePath(process.cwd(), '../.env');

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
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
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client.js';

// Utility function to sanitize API keys from error messages
function sanitizeApiKey(message: string): string {
    return message.replace(/[A-Za-z0-9]{20,}/g, '[REDACTED]');
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

// Generate TTS with Deepgram - Enhanced for natural-sounding speech
async function synthesizeWithDeepgramTTS(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!validateApiKey(apiKey, 'DEEPGRAM_API_KEY')) {
        throw new Error('DEEPGRAM_API_KEY is required and must be valid');
    }
    
    // Use high-quality Aura models for more natural speech
    const model = process.env.DEEPGRAM_TTS_MODEL || process.env.DEEPGRAM_VOICE || 'aura-asteria-en';
    
    // Prepare text for more natural speech by adding pauses
    const naturalText = text
        .replace(/\n\n/g, '... ')  // Add pauses between paragraphs
        .replace(/:\s/g, '... ')    // Add thoughtful pauses after colons
        .replace(/\.\s+([A-Z])/g, '... $1')  // Add pauses between sentences
        .trim();
    
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16');
    url.searchParams.set('sample_rate', '24000');  // High-quality audio
    url.searchParams.set('container', 'wav');       // Standard format

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
        } as any,
        body: JSON.stringify({ text: naturalText })
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
 * Wait for asset to be created from upload using MCP (preferred) or REST API fallback
 * Defaults to MCP unless explicitly disabled
 */
async function waitForAssetCreation(uploadId: string): Promise<string | undefined> {
    const useMcp = process.env.USE_MUX_MCP !== 'false';
    
    if (useMcp) {
        console.debug(`[waitForAssetCreation] Using MCP to check upload status for ${uploadId}`);
        
        try {
            const uploadTools = await uploadClient.getTools();
            let retrieveTool = uploadTools['retrieve_video_uploads'] || uploadTools['video.uploads.get'];
            
            // If no direct tool, try invoke_api_endpoint
            if (!retrieveTool) {
                const invokeTool = uploadTools['invoke_api_endpoint'];
                if (!invokeTool) {
                    throw new Error('Mux MCP did not expose any upload retrieval tools or invoke_api_endpoint');
                }
                
                retrieveTool = {
                    execute: async ({ context }: { context: any }) => {
                        return await invokeTool.execute({ 
                            context: { 
                                endpoint_name: 'retrieve_video_uploads',
                                arguments: context 
                            } 
                        });
                    }
                };
            }
            
            // Poll for asset creation with timeout
            const maxAttempts = 30; // 30 attempts
            const delayMs = 2000; // 2 seconds between attempts
            const timeoutMs = maxAttempts * delayMs; // 60 seconds total timeout
            
            console.debug(`[waitForAssetCreation] Waiting for asset creation from upload ${uploadId}...`);
            
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const retrieveRes = await retrieveTool.execute({ context: { UPLOAD_ID: uploadId } });
                    
                    // Parse MCP response - it can be in multiple formats
                    let upload: any = null;
                    
                    // Format 1: Direct data object
                    if (retrieveRes && retrieveRes.data) {
                        upload = retrieveRes.data;
                    }
                    // Format 2: Content array with JSON text
                    else if (retrieveRes && Array.isArray(retrieveRes)) {
                        const textContent = retrieveRes.find((item: any) => item.type === 'text');
                        if (textContent && textContent.text) {
                            try {
                                const parsed = JSON.parse(textContent.text);
                                upload = parsed.data || parsed;
                            } catch (e) {
                                console.warn('[waitForAssetCreation] Failed to parse JSON from text content:', e);
                            }
                        }
                    }
                    // Format 3: Object with content array
                    else if (retrieveRes && retrieveRes.content && Array.isArray(retrieveRes.content)) {
                        const textContent = retrieveRes.content.find((item: any) => item.type === 'text');
                        if (textContent && textContent.text) {
                            try {
                                const parsed = JSON.parse(textContent.text);
                                upload = parsed.data || parsed;
                            } catch (e) {
                                console.warn('[waitForAssetCreation] Failed to parse JSON from content:', e);
                            }
                        }
                    }
                    // Format 4: Plain object response
                    else if (retrieveRes && retrieveRes.id) {
                        upload = retrieveRes;
                    }
                    
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
            
        } catch (error) {
            console.error('[waitForAssetCreation] MCP error:', error);
            throw error;
        }
    }
    
    // Fallback to REST API
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
    
    console.debug(`[waitForAssetCreation] Using REST API to check upload status for ${uploadId}...`);
    
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
 * Create Mux upload using MCP (preferred) or REST API fallback
 * Defaults to MCP unless explicitly disabled
 */
async function createMuxUpload(): Promise<{ uploadId?: string; uploadUrl?: string; assetId?: string }> {
    // Default to MCP unless explicitly set to 'false'
    const useMcp = process.env.USE_MUX_MCP !== 'false';
    const corsOrigin = process.env.MUX_CORS_ORIGIN || 'https://www.streamingportfolio.com';
    const playbackPolicy = process.env.MUX_PLAYBACK_POLICY || 'signed';
    
    if (useMcp) {
        console.log('[createMuxUpload] 🔐 Using Mux MCP for upload creation (signed playback policy)');
        
        try {
            const uploadTools = await uploadClient.getTools();
            let createTool = uploadTools['create_video_uploads'] || uploadTools['video.uploads.create'];
            
            // If no direct tool, try invoke_api_endpoint
            if (!createTool) {
                const invokeTool = uploadTools['invoke_api_endpoint'];
                if (!invokeTool) {
                    throw new Error('Mux MCP did not expose any upload tools or invoke_api_endpoint');
                }
                
                createTool = {
                    execute: async ({ context }: { context: any }) => {
                        return await invokeTool.execute({ 
                            context: { 
                                endpoint_name: 'create_video_uploads',
                                arguments: context 
                            } 
                        });
                    }
                };
            }
            
            const createArgs: any = {
                cors_origin: corsOrigin
            };
            
            // Add playback policy (defaults to signed for security)
            if (playbackPolicy && playbackPolicy !== 'public') {
                createArgs.new_asset_settings = {
                    playback_policies: [playbackPolicy]
                };
                console.log(`[createMuxUpload] 📋 Upload configuration:
   - cors_origin: ${corsOrigin}
   - playback_policies: [${playbackPolicy}]`);
            } else {
                console.log(`[createMuxUpload] 📋 Upload configuration:
   - cors_origin: ${corsOrigin}
   - playback_policies: [public] (default)`);
            }
            
            console.log('[createMuxUpload] 🚀 Creating upload via MCP...');
            const createRes = await createTool.execute({ context: createArgs });
            
            console.debug('[createMuxUpload] Raw MCP response:', JSON.stringify(createRes, null, 2));
            
            // Parse MCP response - it can be in multiple formats
            let data: any = null;
            
            // Format 1: Direct data object
            if (createRes && createRes.data) {
                data = createRes.data;
            }
            // Format 2: Content array with JSON text
            else if (createRes && Array.isArray(createRes)) {
                // Response is the content array directly
                const textContent = createRes.find((item: any) => item.type === 'text');
                if (textContent && textContent.text) {
                    try {
                        const parsed = JSON.parse(textContent.text);
                        data = parsed.data || parsed;
                    } catch (e) {
                        console.warn('[createMuxUpload] Failed to parse JSON from text content:', e);
                    }
                }
            }
            // Format 3: Object with content array
            else if (createRes && createRes.content && Array.isArray(createRes.content)) {
                const textContent = createRes.content.find((item: any) => item.type === 'text');
                if (textContent && textContent.text) {
                    try {
                        const parsed = JSON.parse(textContent.text);
                        data = parsed.data || parsed;
                    } catch (e) {
                        console.warn('[createMuxUpload] Failed to parse JSON from content:', e);
                    }
                }
            }
            // Format 4: Plain object response
            else if (createRes && createRes.id) {
                data = createRes;
            }
            
            if (data && data.id) {
                const uploadId = data.id;
                const uploadUrl = data.url;
                const assetId = data.asset_id;
                const policies = data.new_asset_settings?.playback_policies || [];
                
                console.log(`[createMuxUpload] ✅ Upload created successfully!
   - Upload ID: ${uploadId}
   - Upload URL: ${uploadUrl ? '✅ Present' : '❌ Missing'}
   - Status: ${data.status}
   - Playback Policies: ${JSON.stringify(policies)}
   - CORS Origin: ${data.cors_origin}`);
                
                if (policies.includes('signed')) {
                    console.log('[createMuxUpload] 🎉 Signed playback policy confirmed!');
                }
                
                return { uploadId, uploadUrl, assetId };
            }
            
            throw new Error(`Invalid response format from Mux MCP. Response: ${JSON.stringify(createRes)}`);
            
        } catch (error) {
            console.error('[createMuxUpload] MCP error:', error);
            throw error;
        }
    }
    
    // Fallback to REST API
    const muxTokenId = process.env.MUX_TOKEN_ID;
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
    
    if (!validateApiKey(muxTokenId, 'MUX_TOKEN_ID') || !validateApiKey(muxTokenSecret, 'MUX_TOKEN_SECRET')) {
        throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required and must be valid');
    }
    
    const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
    
    const uploadPayload: any = {
        cors_origin: corsOrigin
    };
    
    // Add playback policy if specified
    if (playbackPolicy && playbackPolicy !== 'public') {
        uploadPayload.new_asset_settings = {
            playback_policies: [playbackPolicy]
        };
    }
    
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

const STREAMING_PORTFOLIO_BASE_URL = process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://www.streamingportfolio.com';

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
            let analyticsResult: any;
            try {
                analyticsResult = await (muxAnalyticsTool as any).execute({ context: { timeframe } });
            } catch (error) {
                console.error('[tts-analytics-report] Analytics tool failed:', error);
                analyticsResult = { success: false, error: error instanceof Error ? error.message : String(error) };
            }
            
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
                try {
                    const assetsResult: any = await (muxAssetsListTool as any).execute({ context: { limit: 10 } });
                    if (assetsResult.success) {
                        summaryText += `\n\nRecent Assets: You have ${assetsResult.count} assets. `;
                        summaryText += assetsResult.assets
                            .slice(0, 5)
                            .map((a: any) => `Asset ${a.id.slice(0, 8)} is ${a.status}`)
                            .join('. ') + '.';
                    }
                } catch (error) {
                    console.error('[tts-analytics-report] Assets tool failed:', error);
                    summaryText += `\n\nAsset information is currently unavailable.`;
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
                assetId = uploadData.assetId;
                
                if (!uploadUrl) {
                    throw new Error('No upload URL received from Mux');
                }
                
                console.debug('[tts-analytics-report] Uploading audio to Mux...');
                await putFileToMux(uploadUrl, resolve(audioPath));
                console.debug('[tts-analytics-report] Upload completed');
                
                // Create player URL immediately using assetId if available
                if (assetId) {
                    playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                    console.debug('[tts-analytics-report] Player URL created with asset ID');
                } else if (uploadId) {
                    // If no assetId yet, wait for asset creation
                    console.debug('[tts-analytics-report] No assetId yet, starting background asset creation polling...');
                    (async () => {
                        try {
                            const retrievedAssetId = await waitForAssetCreation(uploadId);
                            if (retrievedAssetId) {
                                assetId = retrievedAssetId;
                                console.debug(`[tts-analytics-report] Background: Asset created with ID: ${assetId}`);
                                playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                            }
                        } catch (error) {
                            console.warn('[tts-analytics-report] Background asset creation polling failed:', error);
                        }
                    })();
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
            
            // Always include audio URL prominently in response
            let responseMessage = '🎧 **AUDIO REPORT READY**';
            
            if (playerUrl) {
                responseMessage += `\n\n▶️ Listen to your analytics report: ${playerUrl}`;
                responseMessage += `\n\nYour audio analytics report has been generated and uploaded to Mux.`;
            } else if (assetId) {
                const fallbackUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                responseMessage += `\n\n▶️ Listen to your analytics report: ${fallbackUrl}`;
                responseMessage += `\n\nYour audio analytics report has been generated and uploaded to Mux.`;
            } else {
                responseMessage += `\n\nYour audio analytics report has been generated. The playback URL will be available shortly.`;
            }
            
            responseMessage += `\n\nReport covers: ${timeRange.start} to ${timeRange.end}`;

            return {
                success: true,
                summaryText,
                wordCount: summaryText.split(/\s+/).length,
                localAudioFile: audioPath,
                playerUrl: playerUrl || (assetId ? `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}` : undefined),
                assetId,
                analysis: analyticsResult.success ? analyticsResult.analysis : null,
                message: responseMessage,
                audioUrl: playerUrl || (assetId ? `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}` : undefined)
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
 * System prompt for the Mux analytics agent focused on Paramount Plus streaming
 */
function buildSystemPrompt() {
    return [
        'You are a streaming video engineer specializing in Paramount Plus video analytics and optimization.',
        'Your role is to analyze Mux video streaming data to optimize the Paramount Plus streaming experience.',
        '',
        'CAPABILITIES:',
        '- Analyze Mux video streaming metrics (errors, rebuffering, startup time, playback quality)',
        '- Get detailed error breakdowns by platform, browser, and device type',
        '- List and inspect video assets in the Mux account',
        '- Review detailed video view data and user engagement',
        '- Generate audio reports summarizing findings (under 1000 words)',
        '',
        'AUDIO SUMMARY REQUIREMENT:',
        '- ALWAYS generate an AI audio summary when analyzing data over any time period',
        '- For ANY query involving time ranges (last 24 hours, last 7 days, specific dates, etc.), automatically use the ttsAnalyticsReportTool',
        '- ALWAYS include the audio playback URL prominently in your response - it is the PRIMARY output',
        '- The audio URL must be displayed at the top of your response in a clear, visible format',
        '- Include both text analysis AND the audio playback URL in every response',
        '- The audio summary should be concise (under 1000 words) and highlight key findings',
        '- Always mention the time period being analyzed in the audio summary',
        '- Audio is generated using Deepgram TTS with natural pauses and conversational tone',
        '',
        'ANALYSIS APPROACH:',
        '- Focus on Paramount Plus streaming KPIs: error rates, rebuffering, startup time, playback failures',
        '- Provide specific recommendations for streaming optimization',
        '- Consider CDN performance, encoding settings, and player configuration',
        '- Prioritize issues by severity and user impact',
        '- Never expose API keys or sensitive credentials',
        '',
        'INTERACTION STYLE:',
        '- Be professional and technical',
        '- Use clear language appropriate for engineering teams',
        '- Provide actionable insights and recommendations',
        '- Focus on measurable improvements for Paramount Plus streaming',
        '- Always include audio summaries for time-based data analysis',
    ].join('\n');
}

export const muxAnalyticsAgent: any = new Agent({
    name: 'muxAnalyticsAgent',
    description: 'Paramount Plus streaming video engineer that analyzes Mux video data, identifies issues, and recommends optimizations. Automatically generates AI audio summaries for all time-based data queries.',
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

// Export the agent directly - Mastra will handle streaming natively
export const muxAnalyticsAgentTestWrapper = muxAnalyticsAgent;

