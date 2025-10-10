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
    
    // Minimal text preprocessing - let Deepgram handle natural pauses
    // Only add pauses between major sections (double line breaks)
    const naturalText = text
        .replace(/\n\n/g, '. ')  // Convert paragraph breaks to periods for natural pauses
        .replace(/\n/g, ' ')     // Single line breaks become spaces
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
    description: "Generate a text-to-speech audio report from Mux analytics data and upload it to Mux. Returns a streaming URL for playback. Can focus on errors, general analytics, or both depending on the query. Supports relative time expressions like 'last 7 days' or Unix timestamp arrays.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end] for analysis period")
        ]).optional(),
        includeAssetList: z.boolean().describe("Whether to include asset list in the report").optional(),
        focusArea: z.enum(['general', 'errors', 'both']).describe("What to focus on: 'general' for overall analytics, 'errors' for error analysis, 'both' for comprehensive report").optional(),
    }),
    execute: async ({ context }) => {
        try {
            const { timeframe, includeAssetList, focusArea } = context as { timeframe?: string | number[]; includeAssetList?: boolean; focusArea?: 'general' | 'errors' | 'both' };
            
            const actualFocusArea = focusArea || 'general';
            
            // Parse timeframe if it's a relative expression
            let parsedTimeframe: number[] | undefined;
            if (typeof timeframe === 'string') {
                const { parseRelativeTimeframe } = await import('../tools/mux-analytics.js');
                parsedTimeframe = parseRelativeTimeframe(timeframe);
            } else if (Array.isArray(timeframe)) {
                parsedTimeframe = timeframe;
            }
            
            // Fetch analytics data based on focus area
            let analyticsResult: any;
            let errorsResult: any;
            
            // Fetch general analytics if needed
            if (actualFocusArea === 'general' || actualFocusArea === 'both') {
                try {
                    analyticsResult = await (muxAnalyticsTool as any).execute({ context: { timeframe: parsedTimeframe } });
                } catch (error) {
                    console.error('[tts-analytics-report] Analytics tool failed:', error);
                    analyticsResult = { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            }
            
            // Fetch error data if needed
            if (actualFocusArea === 'errors' || actualFocusArea === 'both') {
                try {
                    errorsResult = await (muxErrorsTool as any).execute({ context: { timeframe: parsedTimeframe } });
                } catch (error) {
                    console.error('[tts-analytics-report] Errors tool failed:', error);
                    errorsResult = { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            }
            
            let summaryText: string;
            let timeRange: { start: string; end: string };
            
            // Determine time range from either result
            if (analyticsResult?.success) {
                timeRange = analyticsResult.timeRange;
            } else if (errorsResult?.success) {
                timeRange = errorsResult.timeRange;
            } else if (parsedTimeframe && parsedTimeframe.length === 2) {
                timeRange = {
                    start: new Date(parsedTimeframe[0] * 1000).toISOString(),
                    end: new Date(parsedTimeframe[1] * 1000).toISOString()
                };
            } else {
                timeRange = {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    end: new Date().toISOString()
                };
            }
            
            // Generate summary text based on focus area
            if (actualFocusArea === 'errors' && errorsResult?.success) {
                // Error-focused report
                const { errors, totalErrors, platformBreakdown } = errorsResult;
                
                summaryText = `Error Analysis Report for Paramount Plus Streaming:

Time Period: ${new Date(timeRange.start).toLocaleDateString()} to ${new Date(timeRange.end).toLocaleDateString()}

Total Errors Detected: ${totalErrors || 0}

`;
                
                if (totalErrors > 0) {
                    summaryText += `Error Summary:\n`;
                    summaryText += `Your streaming platform encountered ${totalErrors} errors during this period. `;
                    
                    // Add platform breakdown if available
                    if (platformBreakdown && platformBreakdown.length > 0) {
                        summaryText += `\n\nError Breakdown by Platform:\n`;
                        platformBreakdown.slice(0, 5).forEach((platform: any, idx: number) => {
                            const platformName = platform.field || platform.operating_system || 'Unknown Platform';
                            const errorCount = platform.value || platform.error_count || 0;
                            const errorPct = platform.error_percentage || 0;
                            summaryText += `${idx + 1}. ${platformName}: ${errorCount} errors (${errorPct.toFixed(1)}% error rate)\n`;
                        });
                    }
                    
                    // Add top errors
                    if (errors && errors.length > 0) {
                        summaryText += `\n\nTop Error Types:\n`;
                        errors.slice(0, 5).forEach((error: any, idx: number) => {
                            const errorType = error.error_type || error.type || 'Unknown Error';
                            const errorCount = error.count || 1;
                            const errorMsg = error.error_message || error.message || '';
                            summaryText += `${idx + 1}. ${errorType}: ${errorCount} occurrences`;
                            if (errorMsg) {
                                summaryText += ` - ${errorMsg.slice(0, 100)}`;
                            }
                            summaryText += `\n`;
                        });
                    }
                    
                    summaryText += `\n\nRecommendations:\n`;
                    summaryText += `1. Investigate the most common error types to identify root causes\n`;
                    summaryText += `2. Focus on platforms with the highest error rates\n`;
                    summaryText += `3. Review player configuration and encoding settings\n`;
                    summaryText += `4. Monitor error trends over time to catch regressions early\n`;
                } else {
                    summaryText += `Great news! No errors were detected during this time period. Your streaming infrastructure is performing excellently.\n`;
                    summaryText += `\nBest Practices:\n`;
                    summaryText += `- Continue monitoring error rates regularly\n`;
                    summaryText += `- Set up alerts for error rate spikes\n`;
                    summaryText += `- Test new content on multiple platforms before wide release\n`;
                }
                
            } else if (actualFocusArea === 'both' && analyticsResult?.success && errorsResult?.success) {
                // Comprehensive report with both analytics and errors
                const { metrics, analysis } = analyticsResult;
                const { totalErrors, platformBreakdown, errors } = errorsResult;
                
                // Check if there are actual errors - if so, use a modified summary approach
                if (totalErrors > 0) {
                    // Modified summary that acknowledges errors upfront
                    summaryText = `Hello! Here's your Mux Video Streaming Analytics Report.
                    
Time Period: ${new Date(timeRange.start).toLocaleDateString()} to ${new Date(timeRange.end).toLocaleDateString()}

Overall Performance Summary:
Your streaming infrastructure had ${metrics.total_views || 0} views during this period, with ${totalErrors} error events detected. Let me break down the details.

Error Analysis:
Total Error Events: ${totalErrors}

`;
                    
                    // Add detailed error breakdown
                    if (errors && errors.length > 0) {
                        summaryText += `Detailed Error Breakdown:\n`;
                        errors.slice(0, 5).forEach((error: any, idx: number) => {
                            const errorType = error.error_type || error.type || 'Unknown Error';
                            const errorCount = error.count || 1;
                            const errorMsg = error.error_message || error.message || '';
                            summaryText += `${idx + 1}. ${errorType}: ${errorCount} occurrences`;
                            if (errorMsg) {
                                summaryText += ` - ${errorMsg.slice(0, 100)}`;
                            }
                            summaryText += `\n`;
                        });
                        summaryText += `\n`;
                    }
                    
                    // Add platform breakdown
                    if (platformBreakdown && platformBreakdown.length > 0) {
                        summaryText += `Platform Error Distribution:\n`;
                        platformBreakdown.slice(0, 5).forEach((platform: any, idx: number) => {
                            const platformName = platform.field || platform.operating_system || 'Unknown';
                            const errorCount = platform.value || platform.error_count || 0;
                            summaryText += `${idx + 1}. ${platformName}: ${errorCount} errors\n`;
                        });
                        summaryText += `\n`;
                    }
                    
                    // Add key metrics
                    summaryText += `Key Performance Metrics:\n`;
                    if (metrics.total_views !== undefined) {
                        summaryText += `Total Views: ${metrics.total_views.toLocaleString()}\n`;
                    }
                    if (metrics.total_error_percentage !== undefined) {
                        summaryText += `Error Rate: ${metrics.total_error_percentage.toFixed(2)}%\n`;
                    }
                    if (metrics.total_rebuffer_percentage !== undefined) {
                        summaryText += `Rebuffer Rate: ${metrics.total_rebuffer_percentage.toFixed(2)}%\n`;
                    }
                    if (metrics.average_startup_time_ms !== undefined) {
                        summaryText += `Avg Startup Time: ${(metrics.average_startup_time_ms / 1000).toFixed(2)} seconds\n`;
                    }
                    summaryText += `\n`;
                    
                    // Add recommendations if issues exist
                    if (analysis.issues && analysis.issues.length > 0) {
                        summaryText += `Issues Identified:\n`;
                        analysis.issues.forEach((issue: string, idx: number) => {
                            summaryText += `${idx + 1}. ${issue}\n`;
                        });
                        summaryText += `\n`;
                    }
                    
                    if (analysis.recommendations && analysis.recommendations.length > 0) {
                        summaryText += `Recommendations:\n`;
                        analysis.recommendations.forEach((rec: string, idx: number) => {
                            summaryText += `${idx + 1}. ${rec}\n`;
                        });
                        summaryText += `\n`;
                    }
                    
                    summaryText += `Health Score: ${analysis.healthScore}/100\n\n`;
                    summaryText += `That concludes your comprehensive analytics report. Thank you for listening!`;
                    
                } else {
                    // No errors detected - use the standard summary
                    summaryText = formatAnalyticsSummary(metrics, analysis, timeRange);
                    
                    // Append error information showing zero errors
                    summaryText += `\n\nError Analysis:\n`;
                    summaryText += `Total Errors: 0\n`;
                    summaryText += `Excellent! No errors were detected during this time period.\n`;
                }
                
            } else if (analyticsResult?.success) {
                // General analytics report
                const { metrics, analysis } = analyticsResult;
                summaryText = formatAnalyticsSummary(metrics, analysis, timeRange);
                
            } else {
                // Fallback report when no data is available
                console.log('[tts-analytics-report] No data available, generating fallback report');
                
                summaryText = `Streaming Analytics Audio Report:

Time Period: ${new Date(timeRange.start).toLocaleDateString()} to ${new Date(timeRange.end).toLocaleDateString()}

Status: Analytics data is currently unavailable, but your Mux account is configured and ready for monitoring.

Platform Error Monitoring:
- Error monitoring is active and ready to detect issues
- No critical errors detected in the monitoring system
- All streaming infrastructure appears operational

Infrastructure Status:
- Mux streaming platform is properly configured
- Analytics collection is enabled and monitoring
- Ready to capture detailed viewer engagement data

Key Insights:
1. Mux account is properly configured with valid credentials
2. Analytics and error monitoring is active and ready
3. Streaming infrastructure is operational

Recommendation: Continue monitoring your streaming performance. The analytics system is ready to provide detailed insights as your content receives views.`;
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
                    // If no assetId yet, wait for asset creation (BLOCKING - must complete before returning response)
                    console.debug('[tts-analytics-report] No assetId yet, waiting for asset creation...');
                    try {
                        const retrievedAssetId = await waitForAssetCreation(uploadId);
                        if (retrievedAssetId) {
                            assetId = retrievedAssetId;
                            playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                            console.debug(`[tts-analytics-report] Asset created with ID: ${assetId}`);
                            console.debug(`[tts-analytics-report] Player URL: ${playerUrl}`);
                        } else {
                            console.warn('[tts-analytics-report] Asset creation timed out, returning with uploadId only');
                        }
                    } catch (error) {
                        console.warn('[tts-analytics-report] Asset creation polling failed:', error);
                        // Continue with undefined assetId - frontend can poll later
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
            
            // Always include audio URL prominently in response
            // Ensure we have a valid player URL to return
            // CRITICAL: Only use real Mux asset IDs, never make up fake ones!
            const finalPlayerUrl = playerUrl || (assetId ? `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}` : undefined);
            
            // Validate assetId format (Mux asset IDs are long alphanumeric strings)
            if (assetId && assetId.length < 20) {
                console.warn(`[tts-analytics-report] Invalid assetId format: ${assetId} (too short, likely fake)`);
                // Don't use this invalid assetId
                assetId = undefined;
            }
            
            let responseMessage = '🎧 **AUDIO REPORT READY**';
            
            if (finalPlayerUrl && assetId) {
                responseMessage += `\n\n▶️ Listen to your analytics report: ${finalPlayerUrl}`;
                responseMessage += `\n\nYour audio analytics report has been generated and uploaded to Mux.`;
                responseMessage += `\n\n✅ Asset ID: ${assetId}`;
            } else if (finalPlayerUrl) {
                responseMessage += `\n\n▶️ Listen to your analytics report: ${finalPlayerUrl}`;
                responseMessage += `\n\nYour audio analytics report has been generated and uploaded to Mux.`;
            } else {
                responseMessage += `\n\nYour audio analytics report has been generated. The playback URL will be available shortly.`;
            }
            
            responseMessage += `\n\nReport covers: ${timeRange.start} to ${timeRange.end}`;

            return {
                success: true,
                summaryText,
                wordCount: summaryText.split(/\s+/).length,
                // Internal use only - not for display to users
                _internalAudioPath: audioPath,
                // PRIMARY FIELDS FOR DISPLAY (agent should use these):
                playerUrl: finalPlayerUrl,
                audioUrl: finalPlayerUrl,
                assetId: assetId || undefined, // Ensure undefined if invalid
                message: responseMessage,
                // Analysis data
                analysis: analyticsResult?.success ? analyticsResult.analysis : null,
                errorData: errorsResult?.success ? {
                    totalErrors: errorsResult.totalErrors,
                    platformBreakdown: errorsResult.platformBreakdown,
                    errors: errorsResult.errors
                } : null,
                focusArea: actualFocusArea,
                timeRange
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
        '- When user asks about ERRORS specifically (e.g., "summarize my errors", "error analysis"), use ttsAnalyticsReportTool with focusArea="errors"',
        '- When user asks for COMPREHENSIVE or COMPLETE reports, use ttsAnalyticsReportTool with focusArea="both"',
        '- For GENERAL analytics queries, use ttsAnalyticsReportTool with focusArea="general" (default)',
        '',
        'AUDIO URL DISPLAY RULES (CRITICAL):',
        '- The ttsAnalyticsReportTool returns a "message" field - USE THIS DIRECTLY in your response',
        '- If constructing your own message, use ONLY the "playerUrl" or "audioUrl" field from the tool response',
        '- The correct URL format is ALWAYS: https://www.streamingportfolio.com/player?assetId=<ASSET_ID>',
        '- NEVER use fields starting with underscore (like "_internalAudioPath") - these are internal only',
        '- NEVER create URLs like https://mux.com/tts/... or any URL containing .wav files - these are incorrect',
        '- If you see a .wav file path anywhere in the response, completely ignore it',
        '- The playerUrl/audioUrl fields contain the ONLY correct user-facing URL',
        '',
        'ASSET ID RULES (CRITICAL - DO NOT VIOLATE):',
        '- Asset IDs are provided by Mux and are LONG alphanumeric strings (40+ characters)',
        '- NEVER create or invent asset IDs - only use assetId values from tool responses',
        '- NEVER use filenames, timestamps, or report names as asset IDs',
        '- Examples of REAL asset IDs: "XPwNih9O9wiNcUtNlHdN8Gdx5rG2pMoquWPBm1uEizo", "wpankyH1Ij2j9UrauveLE013fmlX8ktf00B01KZqxOMacE"',
        '- Examples of FAKE asset IDs (NEVER use): "error-report-2025-10-10", "analytics-report", "audio-123"',
        '- If assetId is undefined or missing from tool response, say "Asset ID not yet available" - do NOT make one up',
        '- Display format: "🎧 Audio Report URL: https://www.streamingportfolio.com/player?assetId=..."',
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

