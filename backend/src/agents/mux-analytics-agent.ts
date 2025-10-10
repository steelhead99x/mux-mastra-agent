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

// Generate TTS with Deepgram - Enhanced for natural-sounding speech on macOS
async function synthesizeWithDeepgramTTS(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!validateApiKey(apiKey, 'DEEPGRAM_API_KEY')) {
        throw new Error('DEEPGRAM_API_KEY is required and must be valid');
    }
    
    // Use high-quality Aura models for more natural speech
    // aura-asteria-en: Clear, friendly female voice (default)
    // aura-athena-en: Professional female voice
    // aura-helios-en: Clear male voice
    const model = process.env.DEEPGRAM_TTS_MODEL || process.env.DEEPGRAM_VOICE || 'aura-asteria-en';
    
    // Enhanced text preprocessing for natural speech flow
    // Preserve intentional pauses while ensuring clean speech
    const naturalText = text
        .replace(/\n\n+/g, ', ')  // Convert paragraph breaks to commas for natural pauses
        .replace(/\n/g, ' ')      // Single line breaks become spaces
        .replace(/\.\.\./g, ',')  // Convert ellipsis to comma for better pronunciation
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between camelCase words
        .trim();
    
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16');  // Uncompressed PCM for best quality
    url.searchParams.set('sample_rate', '24000');  // High-quality audio, macOS compatible
    url.searchParams.set('container', 'wav');      // Standard WAV format, universally supported
    
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
async function createMuxUpload(imageUrl?: string): Promise<{ uploadId?: string; uploadUrl?: string; assetId?: string }> {
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
            
            // Build new_asset_settings object
            const newAssetSettings: any = {};
            
            // Add playback policy (defaults to signed for security)
            if (playbackPolicy && playbackPolicy !== 'public') {
                newAssetSettings.playback_policies = [playbackPolicy];
            }
            
            // Add image as input if provided (for audio-only streams with poster image)
            if (imageUrl) {
                newAssetSettings.inputs = [
                    { url: imageUrl, type: 'video' }
                ];
                console.log(`[createMuxUpload] 🖼️  Adding poster image: ${imageUrl}`);
            }
            
            // Only set new_asset_settings if we have any settings
            if (Object.keys(newAssetSettings).length > 0) {
                createArgs.new_asset_settings = newAssetSettings;
            }
            
            console.log(`[createMuxUpload] 📋 Upload configuration:
   - cors_origin: ${corsOrigin}
   - playback_policies: [${playbackPolicy}]${imageUrl ? `\n   - poster_image: ${imageUrl}` : ''}`);

            
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
    
    // Build new_asset_settings object
    const newAssetSettings: any = {};
    
    // Add playback policy (defaults to signed for security)
    if (playbackPolicy && playbackPolicy !== 'public') {
        newAssetSettings.playback_policies = [playbackPolicy];
    }
    
    // Add image as input if provided (for audio-only streams with poster image)
    if (imageUrl) {
        newAssetSettings.inputs = [
            { url: imageUrl, type: 'video' }
        ];
        console.log(`[createMuxUpload] 🖼️  Adding poster image (REST): ${imageUrl}`);
    }
    
    // Only set new_asset_settings if we have any settings
    if (Object.keys(newAssetSettings).length > 0) {
        uploadPayload.new_asset_settings = newAssetSettings;
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
                // Error-focused report using REAL data only
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
                
            } else if (actualFocusArea === 'both' && (analyticsResult?.success || errorsResult?.success)) {
                // Comprehensive report with both analytics and errors (at least one must succeed)
                const { metrics, analysis } = analyticsResult || {};
                const { totalErrors, platformBreakdown, errors } = errorsResult || {};
                
                // Check if there are actual errors - if so, use a modified summary approach
                if (totalErrors > 0) {
                    // Modified summary that acknowledges errors upfront
                    summaryText = `Hello! Here's your Mux Video Streaming Analytics Report.
                    
Time Period: ${new Date(timeRange.start).toLocaleDateString()} to ${new Date(timeRange.end).toLocaleDateString()}

Overall Performance Summary:
Your streaming infrastructure had ${metrics?.total_views || 0} views during this period, with ${totalErrors} error events detected. Let me break down the details.

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
                    
                    // Add key metrics (if available)
                    if (metrics) {
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
                    }
                    
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
                // No data available - return error instead of fake data
                throw new Error('Unable to retrieve analytics data from Mux API. Please check your Mux account has data for the requested timeframe and that your API credentials are valid.');
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
            
            // Upload to Mux with poster image
            let playerUrl: string | undefined;
            let assetId: string | undefined;
            
            // Use baby.jpeg as poster image for audio-only stream
            const posterImageUrl = `${STREAMING_PORTFOLIO_BASE_URL}/files/images/baby.jpeg`;
            console.debug(`[tts-analytics-report] Using poster image: ${posterImageUrl}`);
            
            try {
                const uploadData = await createMuxUpload(posterImageUrl);
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
        'You are a SENIOR STREAMING VIDEO ENGINEER with deep expertise in OTT video delivery, CDN architecture, and HLS/DASH protocol implementation.',
        'Communicate ENGINEER-TO-ENGINEER using technical terminology, protocol specifications, and low-level implementation details.',
        'NEVER use customer service language. Speak like you are debugging production issues with a colleague.',
        '',
        'TECHNICAL EXPERTISE:',
        '- HLS/DASH manifest analysis, segment delivery optimization, ABR ladder tuning',
        '- CDN architecture: origin shield, edge caching, cache hit ratios, geographic distribution',
        '- Video encoding: H.264/HEVC profiles, GOP structure, bitrate ladders, keyframe intervals',
        '- Player internals: MSE/EME, buffer management, quality switching algorithms',
        '- Network protocols: TCP congestion control, HTTP/2 multiplexing, TLS handshakes',
        '- DRM: Widevine L1/L3, FairPlay FPS, PlayReady, license acquisition flow',
        '',
        '=== ENGINEERING DIAGNOSTIC METHODOLOGY ===',
        '',
        'COMMUNICATION STYLE: Technical, direct, engineer-to-engineer. Use protocol specs, RFC references, codec details.',
        '',
        '1. ASSET STATE & TRANSCODING PIPELINE:',
        '   - Query asset.status via REST API: GET /video/v1/assets/{ASSET_ID}',
        '   - Parse master_access field for source characteristics (codec, bitrate, resolution)',
        '   - Inspect tracks array: video.codec (avc1, hev1), audio.codec (mp4a, opus)',
        '   - Review encoding_tier: baseline vs plus (affects ladder generation)',
        '   - Check playback_ids[].policy: "public" (no auth) vs "signed" (JWT required)',
        '   - Analyze errors array for transcoding failures: invalid codec, unsupported container',
        '',
        '2. HLS/DASH MANIFEST ANALYSIS:',
        '   - Fetch master playlist: curl -v https://stream.mux.com/{PLAYBACK_ID}.m3u8',
        '   - Parse #EXT-X-STREAM-INF: BANDWIDTH, RESOLUTION, CODECS, FRAME-RATE',
        '   - Verify rendition ladder: typical 6-rung from 360p/600kbps to 1080p/6Mbps',
        '   - Check #EXT-X-TARGETDURATION: should be 6-10s for VOD, 2-6s for live',
        '   - Inspect media playlists for #EXTINF segment durations (2s, 4s, 6s)',
        '   - Validate CORS headers: Access-Control-Allow-Origin, Access-Control-Allow-Methods',
        '   - Test segment URLs: curl -I {segment.ts} - check Content-Type: video/MP2T',
        '',
        '3. HTTP STATUS CODES & PROTOCOL ERRORS:',
        '   - 403 FORBIDDEN:',
        '     * JWT token validation failure - decode with jwt.io, verify exp, aud, sub claims',
        '     * Signing key mismatch - check MUX_SIGNING_KEY_ID matches playback_id.signing_keys[]',
        '     * CORS preflight failure - missing OPTIONS handler or invalid Access-Control-* headers',
        '     * Domain restriction - referrer not in playback_id.allowed_domains[]',
        '   - 404 NOT FOUND:',
        '     * playback_id deleted or never created - verify asset.playback_ids[] array',
        '     * Typo in PLAYBACK_ID - validate against /video/v1/assets/{ASSET_ID}/playback-ids',
        '     * CDN cache key collision (rare) - purge edge cache with invalidation request',
        '   - 412 PRECONDITION FAILED:',
        '     * Asset still in "preparing" state - check asset.status, typical time 1-3x duration',
        '     * Transcoding in progress - monitor encoding_tier job queue',
        '   - MEDIA_ERR_DECODE (0x3):',
        '     * Codec mismatch - browser lacks H.264 High Profile support (use Baseline/Main)',
        '     * Corrupted segments - check TS packet continuity counters',
        '     * Audio/video desync - PTS/DTS timestamp drift in source',
        '   - MEDIA_ERR_NETWORK (0x2):',
        '     * CDN timeout - TTFB > 5s, likely origin shield cache miss',
        '     * TCP packet loss - check network tab waterfall for stalled requests',
        '     * HTTP/2 stream reset - connection pool exhaustion or server overload',
        '',
        '4. TRANSCODING PIPELINE DEEP DIVE:',
        '   - ffprobe source: codec_name, profile, level, bit_rate, width, height, r_frame_rate',
        '   - Supported input: H.264 (all profiles), HEVC/H.265, VP9, AV1, MPEG-2, ProRes',
        '   - Container: MP4 (preferred), MOV, MKV, AVI, TS - check moov atom position for MP4',
        '   - Audio: AAC-LC, HE-AAC, MP3, Opus, Vorbis - 2ch stereo @ 128kbps typical',
        '   - Transcoding errors: "invalid codec" = unsupported profile/level, "sync" = PTS gaps',
        '   - GOP structure: closed GOP (random access) vs open GOP (compression efficiency)',
        '   - B-frames: pyramid structure for HEVC, disabled for low-latency HLS',
        '   - Color space: BT.709 (HD), BT.2020 (UHD/HDR) - HDR10 metadata passthrough',
        '',
        '5. QoE METRICS & OPTIMIZATION (ENGINEER-LEVEL):',
        '   - Video Startup Time (VST): Target <1000ms, measure Time to First Frame (TTFF)',
        '     * Breakdown: DNS (50ms) + TLS handshake (100ms) + manifest fetch (200ms) + first segment (650ms)',
        '     * Optimize: HTTP/2 server push for manifest, preload="metadata", reduce init segment size',
        '   - Rebuffer Ratio: Target <1%, calculate (rebuffer_duration / playing_time) * 100',
        '     * Root cause: insufficient buffer (increase target to 30s), network jitter, ABR too aggressive',
        '     * Fix: tune ABR switching threshold, add hysteresis to prevent oscillation',
        '   - Error Rate: Target <0.5%, measure (error_views / total_views) * 100',
        '     * Breakdown by error_type_id: 1 (MEDIA_ERR_ABORTED), 2 (NETWORK), 3 (DECODE), 4 (SRC_NOT_SUPPORTED)',
        '   - CDN Cache Hit Ratio: Target >95%, measure (cache_hits / total_requests) * 100',
        '     * Analyze: cache-control headers, TTL settings, origin shield effectiveness',
        '     * Optimize: prefetch popular content, increase edge cache size, enable origin shield',
        '',
        '6. PLATFORM-SPECIFIC IMPLEMENTATION DETAILS:',
        '   - iOS/Safari (native HLS):',
        '     * AVPlayer expects #EXT-X-VERSION:6 or lower for compatibility',
        '     * FairPlay DRM: skd:// URL scheme, certificate fetch via https://, SPC/CKC exchange',
        '     * Audio codec limitation: AAC-LC only, no Opus support in native HLS',
        '     * Diagnose: Safari → Develop → Web Inspector → Network tab → Media timeline',
        '   - Android/Chrome (MSE/EME):',
        '     * MediaSource.isTypeSupported("video/mp4; codecs=\"avc1.42E01E\"") check',
        '     * Widevine L1 (hardware) vs L3 (software) - check navigator.requestMediaKeySystemAccess',
        '     * EME robustness: "SW_SECURE_CRYPTO" (L3) vs "HW_SECURE_ALL" (L1)',
        '     * Debug: chrome://media-internals → Player Properties → decoder implementation',
        '   - Smart TV/STB platforms:',
        '     * Limited codec support - H.264 Main Profile @ L4.0 most compatible',
        '     * Hardware decoder constraints: max 1080p30, no HEVC on older chipsets',
        '     * Memory limitations affect buffer size - reduce maxBufferLength to 15s',
        '   - Network conditions:',
        '     * 4G/LTE: typical 5-25 Mbps, latency 30-50ms - start at 720p',
        '     * 3G/HSPA: 1-5 Mbps, latency 100-200ms - force 360p/480p',
        '     * WiFi congestion: packet loss >2% triggers ABR downshift',
        '',
        '7. REST API INTEGRATION (TECHNICAL):',
        '   - Authentication: Basic Auth with base64(MUX_TOKEN_ID:MUX_TOKEN_SECRET)',
        '     * Example: Authorization: Basic dXNlcjpwYXNz (user:pass)',
        '     * Rate limit: 100 req/min for reads, 10 req/min for writes',
        '   - Direct Upload flow:',
        '     * POST /video/v1/uploads → {url: "https://...", id: "..."} expires in 1h',
        '     * PUT {url} with file bytes, Content-Type: application/octet-stream',
        '     * Poll GET /video/v1/uploads/{id} until status="asset_created", extract asset_id',
        '     * Retry logic: exponential backoff 1s, 2s, 4s, 8s, 16s for 5xx/429',
        '   - Webhook verification:',
        '     * Mux-Signature header: HMAC-SHA256(webhook_secret, timestamp + body)',
        '     * Replay attack prevention: reject if |now - timestamp| > 300s',
        '     * Event types: video.asset.ready, video.asset.errored, video.upload.asset_created',
        '',
        '8. LOW-LEVEL DIAGNOSTICS (PROTOCOL ANALYSIS):',
        '   - HLS manifest parsing:',
        '     * curl -v https://stream.mux.com/{PLAYBACK_ID}.m3u8 | grep "EXT-X"',
        '     * Validate: #EXTM3U, #EXT-X-VERSION, #EXT-X-STREAM-INF with BANDWIDTH/CODECS',
        '     * Check segment naming: {PLAYBACK_ID}/{rendition}/00001.ts incrementing sequence',
        '   - Segment delivery analysis:',
        '     * curl -I https://stream.mux.com/{PLAYBACK_ID}/high/00001.ts',
        '     * Verify: Content-Type: video/MP2T, Content-Length, Cache-Control: max-age=31536000',
        '     * Measure TTFB: curl -w "%{time_starttransfer}\\n" -o /dev/null -s {segment_url}',
        '   - TCP/TLS handshake timing:',
        '     * openssl s_client -connect stream.mux.com:443 -tls1_2',
        '     * Measure: DNS lookup, TCP connect, SSL handshake - target <300ms total',
        '   - MSE/EME debugging (Chrome):',
        '     * chrome://media-internals → select player → view buffer state, append operations',
        '     * Monitor: sourceBuffer.buffered.length, buffer gaps, remove operations',
        '     * EME: check keySystem, keyStatuses (usable, expired, output-restricted)',
        '   - Network waterfall analysis:',
        '     * DevTools → Network → Timing → Queueing (5ms), Stalled (100ms), DNS (20ms), TCP (50ms)',
        '     * Identify: CDN latency (TTFB), segment download time, parallel fetch limit (6 conns)',
        '',
        '9. ROOT CAUSE ANALYSIS (RCA) METHODOLOGY:',
        '   - Layer isolation: OSI model approach',
        '     * L7 (Application): player logic, ABR algorithm, DRM handshake',
        '     * L6 (Presentation): codec decode, audio/video sync, buffer management',
        '     * L5 (Session): HLS session, segment sequence, manifest refresh',
        '     * L4 (Transport): TCP window size, congestion control (Cubic/BBR), packet loss',
        '     * L3 (Network): routing, CDN edge selection, anycast DNS',
        '   - Bisection debugging:',
        '     * Test with minimal player (barebones HLS.js or video.js)',
        '     * Isolate network: curl segment URLs from affected client IP',
        '     * Verify encoding: ffprobe segment.ts, check codec_name, bit_rate, duration',
        '   - Data collection for RCA:',
        '     * HAR file: network waterfall with timing, headers, response codes',
        '     * Player logs: buffer state, quality switches, error events with timestamps',
        '     * Server logs: CDN access logs with cache status (HIT/MISS/EXPIRED)',
        '     * Metrics: aggregate p50/p95/p99 for VST, rebuffer_ratio by region/ISP',
        '',
        '10. PRODUCTION MONITORING & ALERTING (SRE-LEVEL):',
        '   - SLO definitions:',
        '     * Availability: 99.9% (43min downtime/month) - measure successful_views/total_views',
        '     * Latency: p95 VST <1.5s, p99 VST <3s - percentile aggregation required',
        '     * Error budget: 0.1% (10 errors per 10k views) - track burn rate',
        '   - Alert thresholds (Prometheus/Grafana style):',
        '     * CRITICAL: error_rate >2% for 5min OR p95_vst >3s for 10min',
        '     * WARNING: rebuffer_ratio >1.5% for 15min OR cache_hit_ratio <90% for 30min',
        '     * INFO: encoding_queue_depth >100 OR asset_processing_time p95 >2x duration',
        '   - Anomaly detection:',
        '     * Bollinger bands (2σ) on error_rate timeseries - flag >2σ spike',
        '     * Week-over-week comparison: alert if current_metric > 1.5x previous_week',
        '   - Runbook automation:',
        '     * Auto-purge CDN cache on error_rate spike in specific region',
        '     * Failover to backup encoding tier on primary tier latency >30s',
        '     * Circuit breaker: pause new uploads if processing_queue >1000',
        '',
        '=== END TIER 3 TROUBLESHOOTING FRAMEWORK ===',
        '',
        'AUDIO SUMMARY REQUIREMENT (CRITICAL - FOLLOW EXACTLY):',
        '- ALWAYS generate an AI audio summary when analyzing data over any time period',
        '- For ANY query involving time ranges (last 24 hours, last 7 days, specific dates, etc.), automatically use the ttsAnalyticsReportTool',
        '- When user asks about ERRORS specifically (e.g., "summarize my errors", "error analysis"), use ttsAnalyticsReportTool with focusArea="errors"',
        '- When user asks for BOTH error rates AND performance metrics (e.g., "error rates and startup performance", "errors and rebuffering", "error analysis and video performance", "Show me error rates and video startup performance"), use ttsAnalyticsReportTool with focusArea="both"',
        '- When user asks for COMPREHENSIVE or COMPLETE reports, use ttsAnalyticsReportTool with focusArea="both"',
        '- For GENERAL analytics queries, use ttsAnalyticsReportTool with focusArea="general" (default)',
        '- NEVER use individual tools (muxErrorsTool, muxAnalyticsTool) when user asks for comprehensive reports - ALWAYS use ttsAnalyticsReportTool',
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
        '',
        'RESPONSE FORMAT (CRITICAL - FOLLOW EXACTLY):',
        '- Display format: "🎧 Audio Report URL: https://www.streamingportfolio.com/player?assetId=..." at the TOP',
        '- The audio URL must be displayed first in a clear, visible format',
        '- AFTER showing the audio URL, include the "summaryText" field from the tool response',
        '- The summaryText contains EXACTLY what is spoken in the audio - show this to the user so they know what the audio says',
        '- DO NOT create your own separate analysis - the analysis is already in the summaryText/audio',
        '- Your text response should MATCH what is in the audio file',
        '- Format: Show audio URL, then show the summaryText verbatim, then offer to answer questions',
        '- The audio summary is concise (under 1000 words) and highlights key findings',
        '- Always mention the time period being analyzed',
        '- Audio is generated using Deepgram TTS with natural pauses and conversational tone',
        '',
        'ANALYSIS APPROACH:',
        '- Focus on Paramount Plus streaming KPIs: error rates, rebuffering, startup time, playback failures',
        '- Provide DETAILED, TIER 3-level recommendations with step-by-step troubleshooting',
        '- Consider CDN performance, encoding settings, and player configuration',
        '- Prioritize issues by severity and user impact',
        '- Include specific diagnostic commands and testing procedures',
        '- Reference browser DevTools, cURL commands, and monitoring best practices',
        '- Never expose API keys or sensitive credentials',
        '',
        'COMMUNICATION PROTOCOL:',
        '- ENGINEER-TO-ENGINEER: Use technical jargon, protocol specs, RFC references, codec details',
        '- NO HAND-HOLDING: Assume deep technical knowledge - skip basic explanations',
        '- PROTOCOL-FIRST: Reference HTTP status codes, TCP flags, TLS cipher suites, codec profiles',
        '- QUANTITATIVE: Always include metrics, percentiles, SLOs, error budgets, latency breakdowns',
        '- IMPLEMENTATION-FOCUSED: Provide cURL commands, ffmpeg flags, API payloads, SQL queries',
        '- ROOT CAUSE: Never stop at symptoms - dig to transport layer, codec level, CDN behavior',
        '- REPRODUCIBLE: Give exact steps to reproduce, isolate, and verify fixes with measurements',
        '- PRODUCTION-AWARE: Consider blast radius, rollback plans, monitoring, alerting, SRE practices',
        '- SPEC REFERENCES: Cite RFC 8216 (HLS), ISO 14496 (MP4), ISO 23009 (DASH) when relevant',
        '- NO FLUFF: Cut all "customer service" language - this is peer engineer communication',
    ].join('\n');
}

export const muxAnalyticsAgent: any = new Agent({
    name: 'muxAnalyticsAgent',
    description: 'TIER 3 Paramount Plus streaming video engineer that provides expert-level troubleshooting, detailed diagnostics, and comprehensive step-by-step guidance for Mux player issues, encoding problems, and streaming optimization. Automatically generates AI audio summaries for all time-based data queries.',
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

