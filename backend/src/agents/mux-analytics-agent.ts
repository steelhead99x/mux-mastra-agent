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
// Basic memory imports for conversation context
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { muxAnalyticsTool, muxAssetsListTool, muxVideoViewsTool, muxErrorsTool, formatAnalyticsSummary, muxStreamingPerformanceTool, muxCDNMetricsTool, muxEngagementMetricsTool, muxChartGenerationTool } from '../tools/mux-analytics.js';
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client.js';
import { CartesiaClient } from '@cartesia/cartesia-js';
import { getPreSelectedVoice } from '../utils/cartesia-voices.js';

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

// Helper function to convert number to ordinal word
function numberToOrdinal(n: number): string {
    const ordinals: Record<number, string> = {
        1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
        6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
        11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
        16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth',
        21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third', 24: 'twenty-fourth', 25: 'twenty-fifth',
        26: 'twenty-sixth', 27: 'twenty-seventh', 28: 'twenty-eighth', 29: 'twenty-ninth', 30: 'thirtieth',
        31: 'thirty-first'
    };
    return ordinals[n] || `${n}th`;
}

// Helper function to convert year to natural speech
function yearToNaturalSpeech(year: number): string {
    // For years 2000-2099, split as "twenty oh-one", "twenty twenty-five", etc.
    if (year >= 2000 && year <= 2099) {
        const lastTwo = year % 100;
        if (lastTwo === 0) return 'two thousand';
        if (lastTwo < 10) return `two thousand ${numberToOrdinal(lastTwo).replace('-', ' ')}`;
        // For 2010-2099: "twenty ten", "twenty twenty-five"
        const tens = Math.floor(lastTwo / 10);
        const ones = lastTwo % 10;
        const tensWord = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][tens];
        if (ones === 0) return `${tensWord}`;
        return `${tensWord} ${numberToOrdinal(ones).replace('-', ' ')}`;
    }
    // For other years, use full number
    return year.toString();
}

// Helper function to format dates naturally for speech
function formatDateForSpeech(date: Date): string {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[date.getMonth()];
    const day = numberToOrdinal(date.getDate());
    const year = yearToNaturalSpeech(date.getFullYear());
    return `${month} ${day} ${year}`;  // e.g., "October thirteenth twenty twenty-five"
}

// Helper function to format time range for display
function formatTimeRange(timeRange: { start: string; end: string }): string {
    const startDate = new Date(timeRange.start);
    const endDate = new Date(timeRange.end);
    const startStr = startDate.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const endStr = endDate.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    return `${startStr} - ${endStr}`;
}

// Generate TTS with Cartesia - Enhanced for clarity and natural pacing
// OPTIMIZED: Fast, efficient text preprocessing with comprehensive special character removal
async function synthesizeWithCartesiaTTS(text: string): Promise<Buffer> {
    const startTime = Date.now();
    
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!validateApiKey(apiKey, 'CARTESIA_API_KEY')) {
        throw new Error('CARTESIA_API_KEY is required and must be valid');
    }
    
    // Initialize Cartesia client
    const client = new CartesiaClient({ apiKey });
    
    // Enhanced text preprocessing for natural speech flow
    // This removes all special characters, markdown, emojis, and formats metrics naturally
    console.log(`[TTS-Preprocessing] Starting text preprocessing (length: ${text.length} chars)`);
    const preprocessStart = Date.now();
    
    const naturalText = text
        // Remove emojis and special unicode characters first
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')    // Remove emoticons
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')    // Remove symbols & pictographs
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')    // Remove transport & map symbols
        .replace(/[\u{2600}-\u{26FF}]/gu, '')      // Remove misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')      // Remove dingbats
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')    // Remove supplemental symbols
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')    // Remove extended symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')    // Remove symbols and pictographs extended
        // Remove markdown formatting and special characters
        .replace(/\*\*\*/g, '')                     // Remove triple asterisks
        .replace(/\*\*/g, '')                       // Remove bold markers
        .replace(/\*/g, '')                         // Remove asterisks
        .replace(/__/g, '')                         // Remove double underscores
        .replace(/_/g, ' ')                         // Replace underscores with spaces
        .replace(/~~(.+?)~~/g, '$1')               // Remove strikethrough
        .replace(/`{3}[\s\S]*?`{3}/g, '')          // Remove code blocks
        .replace(/`(.+?)`/g, '$1')                 // Remove inline code markers
        .replace(/#{1,6}\s/g, '')                  // Remove markdown headers
        .replace(/^[>\-\+\*]\s/gm, '')             // Remove list markers
        .replace(/^\d+\.\s+/gm, '')                // Remove numbered list markers (1. 2. 3.)
        // Remove URLs and links
        .replace(/https?:\/\/[^\s]+/g, '')         // Remove URLs
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')  // Convert markdown links to text only
        // Remove special characters that sound unnatural
        .replace(/[\[\]{}()]/g, '')                // Remove brackets and parentheses
        .replace(/[<>]/g, '')                      // Remove angle brackets
        .replace(/[@#$%^&+=|\\\/]/g, '')           // Remove special symbols
        .replace(/["']/g, '')                      // Remove quotes
        .replace(/[;:]/g, ',')                     // Replace semicolons and colons with commas for natural pauses
        // Handle dates more naturally - convert to conversational speech (do this BEFORE metrics to avoid conflicts)
        // Format: YYYY-MM-DD (ISO format)
        .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_match, year, month, day) => {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = monthNames[parseInt(month) - 1] || month;
            const dayNum = parseInt(day);
            return `${monthName} ${dayNum} ${year}`;
        })
        // Format: MM/DD/YYYY (US format)
        .replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, (_match, month, day, year) => {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = monthNames[parseInt(month) - 1] || month;
            const dayNum = parseInt(day);
            return `${monthName} ${dayNum} ${year}`;
        })
        // Format: Month DD, YYYY (e.g., "October 13, 2025") → natural speech
        .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/gi,                         
            (_match, month, day, year) => {
                const dayNum = parseInt(day)
                return `${month} ${numberToOrdinal(dayNum)} ${yearToNaturalSpeech(parseInt(year))}`
            })
        // Format: Abbreviated months (e.g., "Oct 13, 2025") → natural speech
        .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})/gi,                                                           
            (_match, monthAbbr, day, year) => {
                const monthMap: Record<string, string> = {
                    'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',                                                                        
                    'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',                                                                                
                    'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'                                                                 
                };
                const fullMonth = monthMap[monthAbbr.substring(0, 3)] || monthAbbr;                                                                            
                const dayNum = parseInt(day);
                return `${fullMonth} ${numberToOrdinal(dayNum)} ${yearToNaturalSpeech(parseInt(year))}`;
            })
        // Format: YYYY-MM-DD → natural speech
        .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, m, d) => {
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
            const monthName = monthNames[parseInt(m) - 1] || m
            const dayNum = parseInt(d)
            return `${monthName} ${numberToOrdinal(dayNum)} ${yearToNaturalSpeech(parseInt(y))}`
        })
        // Format: MM/DD/YYYY → natural speech
        .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_m, m, d, y) => {
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
            const monthName = monthNames[parseInt(m) - 1] || m
            const dayNum = parseInt(d)
            return `${monthName} ${numberToOrdinal(dayNum)} ${yearToNaturalSpeech(parseInt(y))}`
        })
        // Handle numbers and metrics more naturally
        .replace(/(\d+(?:\.\d+)?)[ ]?%/g, '$1 percent')  // "5%" or "2.5%" or "5 %" → spoken as percent
        .replace(/(\d+)ms\b/g, '$1 milliseconds')  // "100ms" → "100 milliseconds"
        .replace(/(\d+)s\b/g, '$1 seconds')        // "5s" → "5 seconds"
        .replace(/(\d+)MB\b/gi, '$1 megabytes')    // "10MB" → "10 megabytes"
        .replace(/(\d+)GB\b/gi, '$1 gigabytes')    // "5GB" → "5 gigabytes"
        .replace(/(\d+)kbps\b/gi, '$1 kilobits per second')  // "500kbps" → "500 kilobits per second"
        .replace(/(\d+)Mbps\b/gi, '$1 megabits per second')  // "5Mbps" → "5 megabits per second"
        .replace(/(\d+)p\b/g, '$1 P')              // "1080p" → "1080 P" (video resolution)
        .replace(/(\d+)fps\b/gi, '$1 frames per second')  // "60fps" → "60 frames per second"
        // Handle IDs and identifiers - MUST come before other replacements
        .replace(/\bplayback-id\b/gi, 'playback I D')      // "playback-id" → "playback I D"
        .replace(/\bplayback_id\b/gi, 'playback I D')      // "playback_id" → "playback I D"
        .replace(/\bplayback id\b/gi, 'playback I D')      // "playback id" → "playback I D"
        .replace(/\basset-id\b/gi, 'asset I D')            // "asset-id" → "asset I D"
        .replace(/\basset_id\b/gi, 'asset I D')            // "asset_id" → "asset I D"
        .replace(/\basset id\b/gi, 'asset I D')            // "asset id" → "asset I D"
        .replace(/\bupload-id\b/gi, 'upload I D')          // "upload-id" → "upload I D"
        .replace(/\bupload_id\b/gi, 'upload I D')          // "upload_id" → "upload I D"
        .replace(/\bupload id\b/gi, 'upload I D')          // "upload id" → "upload I D"
        .replace(/\bvideo-id\b/gi, 'video I D')            // "video-id" → "video I D"
        .replace(/\bvideo_id\b/gi, 'video I D')            // "video_id" → "video I D"
        .replace(/\bvideo id\b/gi, 'video I D')            // "video id" → "video I D"
        .replace(/\b(the |an |a )?id\s*:/gi, 'I D,')       // "id:", "the id:", etc. → "I D,"
        .replace(/\b(the |an |a )?id\b(?!\w)/gi, 'I D')    // standalone "id" → "I D" (but not in words like "video")
        // Handle video-specific acronyms and technical terms more naturally
        .replace(/\bI\.D\./gi, 'I D')               // "I.D." → "I D"
        .replace(/\bURL\b/gi, 'U R L')              // "URL" → "U R L" (spelled out)
        .replace(/\bURLs\b/gi, 'U R Ls')            // "URLs" → "U R Ls"
        .replace(/\bAPI\b/g, 'A P I')               // "API" → "A P I"
        .replace(/\bCDN\b/g, 'content delivery network')  // "CDN" → natural phrase
        .replace(/\bHTTP\b/g, 'H T T P')            // "HTTP" → "H T T P"
        .replace(/\bHTTPS\b/g, 'H T T P S')         // "HTTPS" → "H T T P S"
        .replace(/\bHLS\b/g, 'H L S streaming')     // "HLS" → "H L S streaming" (more context)
        .replace(/\bDASH\b/g, 'DASH streaming')     // "DASH" → "DASH streaming" (pronounceable)
        .replace(/\bMPEG-DASH\b/gi, 'MPEG DASH')    // "MPEG-DASH" → "MPEG DASH"
        .replace(/\bVOD\b/g, 'video on demand')     // "VOD" → natural phrase
        .replace(/\bLive\s+streaming\b/gi, 'live streaming')  // Keep natural
        .replace(/\bTCP\b/g, 'T C P')               // "TCP" → "T C P"
        .replace(/\bDNS\b/g, 'D N S')               // "DNS" → "D N S"
        .replace(/\bTLS\b/g, 'T L S')               // "TLS" → "T L S"
        .replace(/\bSSL\b/g, 'S S L')               // "SSL" → "S S L"
        .replace(/\bTTL\b/g, 'T T L')               // "TTL" → "T T L"
        .replace(/\bQoE\b/g, 'quality of experience')  // "QoE" → "quality of experience"
        .replace(/\bQoS\b/g, 'quality of service')     // "QoS" → "quality of service"
        .replace(/\bVST\b/g, 'video startup time')     // "VST" → "video startup time"
        .replace(/\bABR\b/g, 'adaptive bitrate')       // "ABR" → "adaptive bitrate"
        .replace(/\bRTMP\b/g, 'R T M P')            // "RTMP" → "R T M P"
        .replace(/\bWebRTC\b/g, 'Web R T C')        // "WebRTC" → "Web R T C"
        .replace(/\bMSE\b/g, 'Media Source Extensions')  // "MSE" → natural phrase
        .replace(/\bEME\b/g, 'Encrypted Media Extensions')  // "EME" → natural phrase
        .replace(/\bDRM\b/g, 'digital rights management')  // "DRM" → natural phrase
        .replace(/\bUI\b/g, 'user interface')       // "UI" → "user interface"
        .replace(/\bUX\b/g, 'user experience')      // "UX" → "user experience"
        .replace(/\bMP4\b/g, 'M P 4')               // "MP4" → "M P 4"
        .replace(/\bH\.264\b/g, 'H 264')            // "H.264" → "H 264"
        .replace(/\bH\.265\b/g, 'H 265')            // "H.265" → "H 265"
        .replace(/\bHEVC\b/g, 'H E V C')            // "HEVC" → "H E V C"
        .replace(/\bVP9\b/g, 'V P 9')               // "VP9" → "V P 9"
        .replace(/\bAAC\b/g, 'A A C')               // "AAC" → "A A C"
        .replace(/\bMP3\b/g, 'M P 3')               // "MP3" → "M P 3"
        // General text cleanup
        .replace(/\n\n+/g, ', ')                    // Paragraph breaks become commas for natural pauses
        .replace(/\n/g, ' ')                        // Single line breaks become spaces
        .replace(/\.\.\./g, ',')                    // Convert ellipsis to comma for better pronunciation
        .replace(/\.{2,}/g, '.')                    // Multiple periods to single period
        .replace(/,{2,}/g, ',')                     // Multiple commas to single comma
        .replace(/\s+/g, ' ')                       // Normalize whitespace
        .replace(/([a-z])([A-Z])/g, '$1 $2')        // Add space between camelCase words
        .replace(/\s+([,.])/g, '$1')               // Remove spaces before punctuation
        .replace(/([,.])\s*/g, '$1 ')              // Ensure single space after punctuation
        .trim();
    
    const preprocessTime = Date.now() - preprocessStart;
    console.log(`[TTS-Preprocessing] Completed in ${preprocessTime}ms (output: ${naturalText.length} chars)`);
    console.log(`[TTS-Preprocessing] Sample output: "${naturalText.substring(0, 150)}..."`);

    
    try {
        // 3-tier voice selection: env var → cached voice → async selection
        console.log(`[TTS-VoiceSelection] Starting voice selection...`);
        const voiceSelectionStart = Date.now();
        
        const configuredVoiceId = process.env.CARTESIA_VOICE_ID;
        let voiceId: string;
        
        if (configuredVoiceId) {
            // Tier 1: Use configured voice ID from env
            voiceId = configuredVoiceId;
            console.log(`[TTS-VoiceSelection] ✓ Using configured voice ID: ${voiceId} (${Date.now() - voiceSelectionStart}ms)`);
        } else {
            // Tier 2/3: Get pre-selected voice (fast if cached, async if first time)
            // apiKey is guaranteed to be defined because we validated it above
            const voice = await getPreSelectedVoice(apiKey!);
            voiceId = voice.id;
            console.log(`[TTS-VoiceSelection] ✓ Using voice: ${voice.name} (${voiceId}) (${Date.now() - voiceSelectionStart}ms)`);
        }
        
        console.log(`[TTS-API] Calling Cartesia API (text length: ${naturalText.length} chars, ~${Math.ceil(naturalText.split(/\s+/).length / 150)} min audio)...`);
        const ttsStartTime = Date.now();
        
        // Generate TTS audio using Cartesia SDK with WAV output
        const audioData = await client.tts.bytes({
            modelId: 'sonic-2',
            transcript: naturalText,
            voice: { mode: 'id', id: voiceId },
            language: 'en',
            outputFormat: {
                container: 'wav',
                encoding: 'pcm_s16le',
                sampleRate: 24000
            }
        });
        
        const ttsTime = Date.now() - ttsStartTime;
        const audioSize = Buffer.from(audioData).length;
        console.log(`[TTS-API] ✓ Cartesia API completed in ${ttsTime}ms (generated ${(audioSize / 1024 / 1024).toFixed(2)} MB)`);
        
        const totalTime = Date.now() - startTime;
        console.log(`[TTS-Total] ⚡ Complete TTS generation in ${totalTime}ms (preprocessing: ${Date.now() - startTime - ttsTime}ms, API: ${ttsTime}ms)`);
        
        return Buffer.from(audioData);
    } catch (error) {
        const sanitizedError = sanitizeApiKey(error instanceof Error ? error.message : String(error));
        console.error(`[TTS-Error] Cartesia TTS failed:`, sanitizedError);
        throw new Error(`Cartesia TTS failed: ${sanitizedError}`);
    }
}



// Condense any generated summary to a target word count for ~2-3 minute speech
// Increased limits to allow for comprehensive error analysis and recommendations
/**
 * Condense a full summary to a brief audio-friendly version using LLM
 * Target: 75-90 words for ~30-second audio
 */
async function condenseForAudio(fullSummary: string): Promise<string> {
    const words = fullSummary.trim().split(/\s+/);
    
    // If already short enough, return as-is
    if (words.length <= 90) {
        console.log(`[condenseForAudio] Summary already brief (${words.length} words), skipping condensation`);
        return fullSummary.trim();
    }
    
    console.log(`[condenseForAudio] Condensing from ${words.length} words to 75-90 words for audio...`);
    const condenseStart = Date.now();
    
    try {
        const { generateText } = await import('ai');
        const { anthropic } = await import('@ai-sdk/anthropic');
        
        const result = await generateText({
            model: anthropic('claude-3-5-sonnet-20241022'),
            prompt: `You are a streaming video analytics expert. Condense the following detailed analytics report into a natural, conversational 30-second audio summary (75-90 words MAXIMUM).

RULES:
- Focus on the MOST IMPORTANT metrics only (top 3-4 key points)
- Use natural conversational language, NO numbered lists
- Say "The highest count", "The most common", NOT "1. ", "2. "
- Include specific numbers and metrics
- End with ONE actionable recommendation if present
- Speak dates naturally: "October thirteenth twenty twenty-five"
- Must be 75-90 words total

FULL DETAILED REPORT:
${fullSummary}

CONDENSED 30-SECOND AUDIO SUMMARY (75-90 words):`,
            temperature: 0.3,
        });
        
        const condensed = result.text.trim();
        const condensedWords = condensed.split(/\s+/).length;
        console.log(`[condenseForAudio] ✓ Condensed in ${Date.now() - condenseStart}ms (${words.length} → ${condensedWords} words)`);
        
        return condensed;
    } catch (error) {
        console.error('[condenseForAudio] ✗ LLM condensation failed, falling back to truncation:', error);
        // Fallback: simple truncation
        const truncated = words.slice(0, 90).join(' ');
        const lastPeriod = truncated.lastIndexOf('. ');
        if (lastPeriod > 0) {
            return truncated.slice(0, lastPeriod + 1).trim();
        }
        return truncated + '...';
    }
}

// REMOVED: waitForAssetCreation function
// This function was blocking agent streaming responses with 5+ second delays
// Frontend now handles asset creation polling instead for near real-time responses

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

// ===== Async audio job storage (in-memory) =====
type AudioJobStatus = 'queued' | 'processing' | 'uploaded' | 'error';
interface AudioJobMeta {
    status: AudioJobStatus;
    createdAt: number;
    updatedAt: number;
    error?: string;
    playerUrl?: string;
    assetId?: string;
    uploadId?: string;
}

const audioJobs: Map<string, AudioJobMeta> = new Map();
const generateJobId = () => 'job_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

async function pollMuxAssetForUpload(uploadId: string): Promise<{ assetId?: string } | null> {
    try {
        const url = `${process.env.MUX_BASE_URL || 'https://api.mux.com'}/video/v1/uploads/${uploadId}`;
        const tokenId = process.env.MUX_TOKEN_ID;
        const tokenSecret = process.env.MUX_TOKEN_SECRET;
        if (!tokenId || !tokenSecret) return null;
        const auth = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');
        const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } } as any);
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        const assetId = data?.data?.asset_id as string | undefined;
        return { assetId };
    } catch {
        return null;
    }
}

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
        focusArea: z.enum(['general', 'errors', 'both', 'streaming', 'cdn', 'engagement']).describe("What to focus on: 'general' for overall analytics, 'errors' for error analysis, 'both' for comprehensive, 'streaming' for performance metrics, 'cdn' for geographic/delivery, 'engagement' for viewer metrics").optional(),
        asyncMode: z.boolean().describe("When true, run TTS generation + Mux upload in background, return jobId immediately").optional(),
    }),
    execute: async ({ context }) => {
        const toolExecutionStart = Date.now();
        console.log('[TOOL-START] ═══════════════════════════════════════════════════════');
        console.log('[TOOL-START] TTS Analytics Report Tool Execution Beginning');
        console.log('[TOOL-START] ═══════════════════════════════════════════════════════');
        
        try {
            const { timeframe, includeAssetList, focusArea, asyncMode } = context as { timeframe?: string | number[]; includeAssetList?: boolean; focusArea?: 'general' | 'errors' | 'both' | 'streaming' | 'cdn' | 'engagement'; asyncMode?: boolean };
            
            const actualFocusArea = focusArea || 'general';
            console.log(`[TOOL-Config] Focus Area: ${actualFocusArea}, Include Assets: ${includeAssetList}, Timeframe: ${JSON.stringify(timeframe)}`);
            
            // Parse timeframe if it's a relative expression
            console.log('[TOOL-Timeframe] Parsing timeframe...');
            const timeframeStart = Date.now();
            let parsedTimeframe: number[] | undefined;
            if (typeof timeframe === 'string') {
                const { parseRelativeTimeframe } = await import('../tools/mux-analytics.js');
                parsedTimeframe = parseRelativeTimeframe(timeframe);
                console.log(`[TOOL-Timeframe] ✓ Parsed "${timeframe}" to [${parsedTimeframe}] (${Date.now() - timeframeStart}ms)`);
            } else if (Array.isArray(timeframe)) {
                parsedTimeframe = timeframe;
                console.log(`[TOOL-Timeframe] ✓ Using provided timeframe array (${Date.now() - timeframeStart}ms)`);
            } else {
                console.log(`[TOOL-Timeframe] ✓ No timeframe specified, using tool defaults (${Date.now() - timeframeStart}ms)`);
            }
            
            // Determine async behavior
            const asyncEnabled = typeof asyncMode === 'boolean' ? asyncMode : (process.env.ASYNC_TTS === 'true');
            
            // Fetch analytics data based on focus area
            let analyticsResult: any;
            let errorsResult: any;
            let streamingResult: any;
            let cdnResult: any;
            let engagementResult: any;
            
            // Fetch category-specific data based on focus area
            if (actualFocusArea === 'general' || actualFocusArea === 'both') {
                console.log('[TOOL-DataFetch] Fetching all analytics data from Mux API...');
                const dataFetchStart = Date.now();
                try {
                    // Fetch all category-specific metrics
                    console.log('[TOOL-DataFetch] → Calling 4 parallel Mux Data API endpoints...');
                    [analyticsResult, streamingResult, cdnResult, engagementResult] = await Promise.all([
                        (muxAnalyticsTool as any).execute({ context: { timeframe: parsedTimeframe } }).catch((e: any) => {
                            console.warn('[tts-analytics-report] Analytics failed:', e);
                            return { success: false, error: e instanceof Error ? e.message : String(e) };
                        }),
                        (muxStreamingPerformanceTool as any).execute({ context: { timeframe: parsedTimeframe } }).catch((e: any) => {
                            console.warn('[tts-analytics-report] Streaming performance failed:', e);
                            return { success: false, error: e instanceof Error ? e.message : String(e) };
                        }),
                        (muxCDNMetricsTool as any).execute({ context: { timeframe: parsedTimeframe } }).catch((e: any) => {
                            console.warn('[tts-analytics-report] CDN metrics failed:', e);
                            return { success: false, error: e instanceof Error ? e.message : String(e) };
                        }),
                        (muxEngagementMetricsTool as any).execute({ context: { timeframe: parsedTimeframe } }).catch((e: any) => {
                            console.warn('[tts-analytics-report] Engagement metrics failed:', e);
                            return { success: false, error: e instanceof Error ? e.message : String(e) };
                        })
                    ]);
                    const dataFetchTime = Date.now() - dataFetchStart;
                    console.log(`[TOOL-DataFetch] ✓ Mux Data API calls completed in ${dataFetchTime}ms`);
                    console.log(`[TOOL-DataFetch]   - Analytics: ${analyticsResult?.success ? '✓' : '✗'}`);
                    console.log(`[TOOL-DataFetch]   - Streaming: ${streamingResult?.success ? '✓' : '✗'}`);
                    console.log(`[TOOL-DataFetch]   - CDN: ${cdnResult?.success ? '✓' : '✗'}`);
                    console.log(`[TOOL-DataFetch]   - Engagement: ${engagementResult?.success ? '✓' : '✗'}`);
                } catch (error) {
                    console.error('[TOOL-DataFetch] ✗ Category fetch failed:', error);
                }
            } else if (actualFocusArea === 'streaming') {
                // Fetch only streaming performance data
                console.log('[TOOL-DataFetch] Fetching streaming performance data from Mux API...');
                const dataFetchStart = Date.now();
                try {
                    streamingResult = await (muxStreamingPerformanceTool as any).execute({ context: { timeframe: parsedTimeframe } });
                    console.log(`[TOOL-DataFetch] ✓ Streaming performance data fetched in ${Date.now() - dataFetchStart}ms`);
                } catch (error) {
                    console.error('[TOOL-DataFetch] ✗ Streaming performance fetch failed:', error);
                    streamingResult = { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            } else if (actualFocusArea === 'cdn') {
                // Fetch only CDN and geographic data
                console.log('[TOOL-DataFetch] Fetching CDN and geographic data from Mux API...');
                const dataFetchStart = Date.now();
                try {
                    cdnResult = await (muxCDNMetricsTool as any).execute({ context: { timeframe: parsedTimeframe } });
                    console.log(`[TOOL-DataFetch] ✓ CDN data fetched in ${Date.now() - dataFetchStart}ms`);
                } catch (error) {
                    console.error('[TOOL-DataFetch] ✗ CDN fetch failed:', error);
                    cdnResult = { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            } else if (actualFocusArea === 'engagement') {
                // Fetch only engagement metrics
                console.log('[TOOL-DataFetch] Fetching engagement metrics from Mux API...');
                const dataFetchStart = Date.now();
                try {
                    engagementResult = await (muxEngagementMetricsTool as any).execute({ context: { timeframe: parsedTimeframe } });
                    console.log(`[TOOL-DataFetch] ✓ Engagement data fetched in ${Date.now() - dataFetchStart}ms`);
                } catch (error) {
                    console.error('[TOOL-DataFetch] ✗ Engagement fetch failed:', error);
                    engagementResult = { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            }
            
            // Fetch error data if needed
            if (actualFocusArea === 'errors' || actualFocusArea === 'both') {
                console.log('[TOOL-ErrorData] Fetching error data from Mux API...');
                const errorFetchStart = Date.now();
                try {
                    errorsResult = await (muxErrorsTool as any).execute({ context: { timeframe: parsedTimeframe } });
                    console.log(`[TOOL-ErrorData] ✓ Error data fetched in ${Date.now() - errorFetchStart}ms (${errorsResult?.success ? 'success' : 'failed'})`);
                } catch (error) {
                    console.error('[TOOL-ErrorData] ✗ Errors tool failed:', error);
                    errorsResult = { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            }
            
            let summaryText: string;
            let timeRange: { start: string; end: string };
            
            // Determine time range from any successful result
            if (analyticsResult?.success && analyticsResult.timeRange) {
                timeRange = analyticsResult.timeRange;
            } else if (streamingResult?.success && streamingResult.timeRange) {
                timeRange = streamingResult.timeRange;
            } else if (cdnResult?.success && cdnResult.timeRange) {
                timeRange = cdnResult.timeRange;
            } else if (engagementResult?.success && engagementResult.timeRange) {
                timeRange = engagementResult.timeRange;
            } else if (errorsResult?.success && errorsResult.timeRange) {
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
            
            console.log(`[TOOL-Timeframe] Using timeRange: ${timeRange.start} to ${timeRange.end}`);
            
            // If async, start background job and return fast
            if (asyncEnabled) {
                const jobId = generateJobId();
                audioJobs.set(jobId, { status: 'queued', createdAt: Date.now(), updatedAt: Date.now() });

                setImmediate(async () => {
                    try {
                        const job0 = audioJobs.get(jobId);
                        if (job0) {
                            job0.status = 'processing';
                            job0.updatedAt = Date.now();
                            audioJobs.set(jobId, job0);
                        }

                        // Recompute timeRange in case
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

                        // Use concise path for audio content
                        const actualFocusArea = focusArea || 'general';
            if (actualFocusArea === 'errors' && errorsResult?.success) {
                const { errors, totalErrors, platformBreakdown } = errorsResult;
                            summaryText = `Error Analysis Report for Paramount Plus Streaming:\n\nTime Period: ${formatDateForSpeech(new Date(timeRange.start))} to ${formatDateForSpeech(new Date(timeRange.end))}\n\nTotal Errors Detected: ${totalErrors || 0}\n\n`;
                            if (totalErrors > 0) {
                                summaryText += `Your streaming platform encountered ${totalErrors} errors during this period. `;
                                if (platformBreakdown && platformBreakdown.length > 0) {
                                    const topPlatform = platformBreakdown[0];
                                    const platformName = topPlatform.field || topPlatform.operating_system || 'Unknown Platform';
                                    const errorCount = topPlatform.value || topPlatform.error_count || 0;
                                    summaryText += `The highest count was on ${platformName} with ${errorCount} errors. `;
                                }
                                if (errors && errors.length > 0) {
                                    const topError = errors[0];
                                    const errorType = topError.error_type || topError.type || 'Unknown Error';
                                    const errorCount = topError.count || 1;
                                    summaryText += `The most common error was ${errorType} with ${errorCount} occurrences. `;
                                }
                                summaryText += `Investigate the most common error types and focus on platforms with the highest error rates.`;
                            } else {
                                summaryText += `Great news! No errors were detected during this time period. Your streaming infrastructure is performing excellently.`;
                            }
                        } else if (actualFocusArea === 'both' && (analyticsResult?.success || streamingResult?.success || cdnResult?.success || engagementResult?.success || errorsResult?.success)) {
                            summaryText = `Mux Analytics Report from ${formatDateForSpeech(new Date(timeRange.start))} to ${formatDateForSpeech(new Date(timeRange.end))}. `;
                            if (streamingResult?.success && streamingResult.streamingMetrics?.video_startup_time?.value !== undefined) {
                                const startupMs = streamingResult.streamingMetrics.video_startup_time.value;
                                summaryText += `Video startup time is ${(startupMs / 1000).toFixed(1)} seconds. `;
                            }
                            if (streamingResult?.success && streamingResult.streamingMetrics?.rebuffer_percentage?.value !== undefined) {
                                const rebufferPct = streamingResult.streamingMetrics.rebuffer_percentage.value;
                                if (rebufferPct > 1) {
                                    summaryText += `Rebuffering is at ${rebufferPct.toFixed(1)} percent. `;
                                }
                            }
                            if (errorsResult?.success && errorsResult.totalErrors > 0) {
                                summaryText += `There were ${errorsResult.totalErrors} errors detected. `;
                                if (errorsResult.errors && errorsResult.errors.length > 0) {
                                    const topError = errorsResult.errors[0];
                                    const errorType = topError.error_type || topError.type || 'Unknown';
                                    summaryText += `The most common was ${errorType}. `;
                                }
                            }
                            const { analysis } = analyticsResult || {};
                            if (analysis) {
                                summaryText += `Overall health score is ${analysis.healthScore} out of 100. `;
                                if (analysis.recommendations && analysis.recommendations.length > 0) {
                                    summaryText += analysis.recommendations[0];
                                }
                            }
            } else if (actualFocusArea === 'streaming') {
                // Streaming-focused report
                const startDate = formatDateForSpeech(new Date(timeRange.start));
                const endDate = formatDateForSpeech(new Date(timeRange.end));
                
                summaryText = `## Streaming Performance Report\n\n`;
                summaryText += `**Time Period:** ${startDate} to ${endDate}\n\n`;
                
                if (streamingResult?.success && streamingResult.streamingMetrics) {
                    const sm = streamingResult.streamingMetrics;
                    if (sm.video_startup_time && sm.video_startup_time.value !== undefined) {
                        const startupMs = sm.video_startup_time.value;
                        summaryText += `**Video Startup Time:** ${(startupMs / 1000).toFixed(2)}s`;
                        if (startupMs < 2000) summaryText += ` (Excellent)`;
                        else if (startupMs < 3000) summaryText += ` (Good)`;
                        else summaryText += ` (Needs Improvement)`;
                        summaryText += `\n`;
                    }
                    
                    if (sm.rebuffer_percentage && sm.rebuffer_percentage.value !== undefined) {
                        const rebufferPct = sm.rebuffer_percentage.value;
                        summaryText += `**Rebuffering Rate:** ${rebufferPct.toFixed(2)}%`;
                        if (rebufferPct < 1) summaryText += ` (Excellent)`;
                        else if (rebufferPct < 3) summaryText += ` (Acceptable)`;
                        else summaryText += ` (Critical)`;
                        summaryText += `\n`;
                    }
                    
                    if (sm.rebuffer_count && sm.rebuffer_count.value !== undefined) {
                        summaryText += `**Total Rebuffer Events:** ${sm.rebuffer_count.value}\n`;
                    }
                    
                    if (sm.total_views !== undefined) {
                        summaryText += `**Total Views:** ${sm.total_views}\n`;
                    }
                } else {
                    summaryText += `Streaming performance data is currently unavailable for this time period.\n`;
                    console.warn('[ttsAnalyticsReportTool] Streaming data unavailable, generating audio with fallback message');
                }
                
            } else if (actualFocusArea === 'cdn') {
                // CDN-focused report with country breakdown
                const startDate = formatDateForSpeech(new Date(timeRange.start));
                const endDate = formatDateForSpeech(new Date(timeRange.end));
                
                summaryText = `## CDN & Geographic Distribution Report\n\n`;
                summaryText += `**Time Period:** ${startDate} to ${endDate}\n\n`;
                
                if (cdnResult?.success && cdnResult.cdnMetrics) {
                    const cdnData = cdnResult.cdnMetrics;
                    if (cdnData.country && cdnData.country.length > 0) {
                        summaryText += `**Views by Country:**\n`;
                        const totalViews = cdnData.country.reduce((sum: number, c: any) => sum + (c.views || 0), 0);
                        cdnData.country.slice(0, 5).forEach((country: any) => {
                            const countryName = country.field || 'Unknown';
                            const views = country.views || 0;
                            const percentage = totalViews > 0 ? ((views / totalViews) * 100).toFixed(1) : '0.0';
                            const avgStartup = country.value || 0;
                            summaryText += `• **${countryName}:** ${views.toLocaleString()} views (${percentage}%) | Avg startup: ${(avgStartup / 1000).toFixed(2)}s\n`;
                        });
                        summaryText += `\n**Total:** ${totalViews.toLocaleString()} views across ${cdnData.country.length} countries\n`;
                    } else {
                        summaryText += `Geographic view distribution data is not available for this time period.\n`;
                    }
                    
                    if (cdnData.asn && cdnData.asn.length > 0) {
                        summaryText += `\n**Top ISPs:**\n`;
                        cdnData.asn.slice(0, 3).forEach((isp: any) => {
                            const ispName = isp.field || 'Unknown ISP';
                            const views = isp.views || 0;
                            const avgStartup = isp.value || 0;
                            summaryText += `• ${ispName}: ${views.toLocaleString()} views, ${(avgStartup / 1000).toFixed(2)}s avg startup\n`;
                        });
                    }
                } else {
                    summaryText += `CDN and geographic distribution data is currently unavailable for this time period.\n`;
                    console.warn('[ttsAnalyticsReportTool] CDN data unavailable, generating audio with fallback message');
                }
                
            } else if (actualFocusArea === 'engagement') {
                // Engagement-focused report
                const startDate = formatDateForSpeech(new Date(timeRange.start));
                const endDate = formatDateForSpeech(new Date(timeRange.end));
                
                summaryText = `## Viewer Engagement Report\n\n`;
                summaryText += `**Time Period:** ${startDate} to ${endDate}\n\n`;
                
                if (engagementResult?.success && engagementResult.engagementMetrics) {
                    const em = engagementResult.engagementMetrics;
                    if (em.total_views !== undefined) {
                        summaryText += `**Total Views:** ${em.total_views.toLocaleString()}\n`;
                    }
                    
                    if (em.unique_viewers !== undefined) {
                        summaryText += `**Unique Viewers:** ${em.unique_viewers.toLocaleString()}\n`;
                    }
                    
                    if (em.average_watch_time !== undefined) {
                        const avgMinutes = (em.average_watch_time / 60).toFixed(1);
                        summaryText += `**Average Watch Time:** ${avgMinutes} minutes\n`;
                    }
                    
                    if (em.playback_success_rate !== undefined) {
                        summaryText += `**Playback Success Rate:** ${em.playback_success_rate.toFixed(1)}%\n`;
                    }
                    
                    if (em.completion_rate !== undefined) {
                        summaryText += `**Completion Rate:** ${em.completion_rate.toFixed(1)}%\n`;
                    }
                } else {
                    summaryText += `Engagement metrics are currently unavailable for this time period.\n`;
                    console.warn('[ttsAnalyticsReportTool] Engagement data unavailable, generating audio with fallback message');
                }
                
            } else if (analyticsResult?.success) {
                const { metrics, analysis } = analyticsResult;
                summaryText = formatAnalyticsSummary(metrics, analysis, timeRange);
            } else {
                // Fallback: generate a generic message
                const startDate = new Date(timeRange.start).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                });
                const endDate = new Date(timeRange.end).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                });
                summaryText = `## Analytics Report\n\n**Time Period:** ${startDate} to ${endDate}\n\nAnalytics data is currently being processed. Please try again in a few moments.`;
                console.warn('[ttsAnalyticsReportTool] No analytics data available, using fallback message');
            }

                        const audioSummary = await condenseForAudio(summaryText);
                        const audioBuffer = await synthesizeWithCartesiaTTS(audioSummary);

                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
                        const audioPath = join(baseDir, `analytics-report-${timestamp}.wav`);
                        await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });
                        await fs.writeFile(resolve(audioPath), audioBuffer);

                        const posterImageUrl = `${STREAMING_PORTFOLIO_BASE_URL}/files/images/baby.jpeg`;
                        const uploadData = await createMuxUpload(posterImageUrl);
                        const uploadUrl = uploadData.uploadUrl;
                        const uploadId = uploadData.uploadId;
                        let assetId = uploadData.assetId;
                        if (!uploadUrl) throw new Error('No upload URL received from Mux');
                        await putFileToMux(uploadUrl, resolve(audioPath));

                        if (uploadId && !assetId) {
                            for (let i = 0; i < 15; i++) {
                                await new Promise(r => setTimeout(r, 2000));
                                const polled = await pollMuxAssetForUpload(uploadId);
                                if (polled?.assetId) {
                                    assetId = polled.assetId;
                                    break;
                                }
                            }
                        }

                        const playerUrl = assetId ? `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}` : undefined;
                        const job1 = audioJobs.get(jobId);
                        if (job1) {
                            job1.status = 'uploaded';
                            job1.updatedAt = Date.now();
                            job1.playerUrl = playerUrl;
                            job1.assetId = assetId;
                            job1.uploadId = uploadId;
                            audioJobs.set(jobId, job1);
                        }
                    } catch (e: any) {
                        const jobE = audioJobs.get(jobId);
                        if (jobE) {
                            jobE.status = 'error';
                            jobE.updatedAt = Date.now();
                            jobE.error = e instanceof Error ? e.message : String(e);
                            audioJobs.set(jobId, jobE);
                        }
                    }
                });

                return {
                    success: true,
                    async: true,
                    jobId,
                    estimatedSeconds: 45,
                    message: 'Audio generation started in background. Poll job status to retrieve the player URL when ready.'
                };
            }

            // Generate FULL DETAILED summary text based on focus area (for chat display - READABLE FORMAT)
            if (actualFocusArea === 'errors' && errorsResult?.success) {
                // Error-focused report using REAL data only - FULL DETAILED VERSION FOR READING
                const { errors, totalErrors, platformBreakdown } = errorsResult;
                
                // Format dates for READING (not speech)
                const startDate = new Date(timeRange.start).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                });
                const endDate = new Date(timeRange.end).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                });
                
                summaryText = `## Error Analysis Report

**Time Period:** ${startDate} to ${endDate}

**Total Errors Detected:** ${totalErrors || 0}

`;
                
                if (totalErrors > 0) {
                    summaryText += `Your streaming platform encountered **${totalErrors} errors** during this period.\n\n`;
                    
                    // Add platform breakdown if available
                    if (platformBreakdown && platformBreakdown.length > 0) {
                        summaryText += `### Error Breakdown by Platform\n\n`;
                        platformBreakdown.slice(0, 5).forEach((platform: any) => {
                            const platformName = platform.field || platform.operating_system || 'Unknown Platform';
                            const errorCount = platform.value || platform.error_count || 0;
                            const errorPct = platform.error_percentage || 0;
                            summaryText += `• **${platformName}:** ${errorCount} errors (${errorPct.toFixed(1)}% error rate)\n`;
                        });
                    }
                    
                    // Add top errors
                    if (errors && errors.length > 0) {
                        summaryText += `\n### Top Error Types\n\n`;
                        errors.slice(0, 5).forEach((error: any) => {
                            const errorType = error.error_type || error.type || 'Unknown Error';
                            const errorCount = error.count || 1;
                            const errorMsg = error.error_message || error.message || '';
                            summaryText += `• **${errorType}:** ${errorCount} occurrences`;
                            if (errorMsg) {
                                summaryText += ` - ${errorMsg.slice(0, 100)}`;
                            }
                            summaryText += `\n`;
                        });
                    }
                    
                    summaryText += `\n### Recommendations\n\n`;
                    summaryText += `• Investigate the most common error types to identify root causes\n`;
                    summaryText += `• Focus on platforms with the highest error rates\n`;
                    summaryText += `• Review player configuration and encoding settings\n`;
                    summaryText += `• Monitor error trends over time to catch regressions early\n`;
                } else {
                    summaryText += `✅ **Great news!** No errors were detected during this time period. Your streaming infrastructure is performing excellently.\n`;
                    summaryText += `\n### Best Practices\n\n`;
                    summaryText += `• Continue monitoring error rates regularly\n`;
                    summaryText += `• Set up alerts for error rate spikes\n`;
                    summaryText += `• Test new content on multiple platforms before wide release\n`;
                }
                
            } else if (actualFocusArea === 'both' && (analyticsResult?.success || streamingResult?.success || cdnResult?.success || engagementResult?.success || errorsResult?.success)) {
                // Comprehensive report - FULL DETAILED VERSION FOR READING
                // Format dates for READING (not speech)
                const startDate = new Date(timeRange.start).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                });
                const endDate = new Date(timeRange.end).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                });
                
                summaryText = `## Mux Streaming Analytics Report\n\n`;
                summaryText += `**Time Period:** ${startDate} to ${endDate}\n\n`;
                
                // 1. VIDEO STREAMING PERFORMANCE METRICS
                if (streamingResult?.success && streamingResult.streamingMetrics) {
                    summaryText += `### Video Streaming Performance\n\n`;
                    const sm = streamingResult.streamingMetrics;
                    
                    if (sm.video_startup_time && sm.video_startup_time.value !== undefined) {
                        const startupMs = sm.video_startup_time.value;
                        summaryText += `• **Video Startup Time:** ${(startupMs / 1000).toFixed(2)} seconds\n`;
                        if (startupMs < 2000) {
                            summaryText += `  - ✅ Excellent - under 2 seconds for HLS/DASH playback initiation\n`;
                        } else if (startupMs < 3000) {
                            summaryText += `  - ✓ Good - within acceptable range for HLS segment loading\n`;
                        } else {
                            summaryText += `  - ⚠️ Needs improvement - consider optimizing manifest size and init segment\n`;
                        }
                    }
                    
                    if (sm.rebuffer_percentage && sm.rebuffer_percentage.value !== undefined) {
                        const rebufferPct = sm.rebuffer_percentage.value;
                        summaryText += `• **Rebuffering Rate:** ${rebufferPct.toFixed(2)}%\n`;
                        if (rebufferPct < 1) {
                            summaryText += `  - ✅ Excellent - minimal stalls in adaptive bitrate streaming\n`;
                        } else if (rebufferPct < 3) {
                            summaryText += `  - ✓ Acceptable - minor buffer underruns detected\n`;
                        } else {
                            summaryText += `  - ❌ Critical - review ABR ladder and CDN edge performance\n`;
                        }
                    }
                    
                    if (sm.rebuffer_count && sm.rebuffer_count.value !== undefined) {
                        summaryText += `• **Total Rebuffer Events:** ${sm.rebuffer_count.value}\n`;
                    }
                    
                    summaryText += `\n`;
                }
                
                // 2. ERROR RATES AND PLAYBACK ISSUES
                if (errorsResult?.success) {
                    summaryText += `### Error Rates and Playback Issues\n\n`;
                    const { totalErrors, platformBreakdown, errors } = errorsResult;
                    
                    summaryText += `• **Total Error Events:** ${totalErrors || 0}\n`;
                    
                    if (totalErrors > 0) {
                        if (platformBreakdown && platformBreakdown.length > 0) {
                            summaryText += `\n**Error Distribution by Platform:**\n`;
                            platformBreakdown.slice(0, 3).forEach((platform: any) => {
                                const platformName = platform.operating_system || platform.field || 'Unknown';
                                const errorCount = platform.error_count || platform.value || 0;
                                summaryText += `  • ${platformName}: ${errorCount} errors\n`;
                            });
                        }
                        
                        if (errors && errors.length > 0) {
                            summaryText += `\n**Top Error Types:**\n`;
                            errors.slice(0, 3).forEach((error: any) => {
                                const errorType = error.error_type || error.type || 'Unknown';
                                const errorCount = error.count || 1;
                                summaryText += `  • ${errorType}: ${errorCount} occurrences\n`;
                            });
                        }
                    } else {
                        summaryText += `  - ✅ Excellent - zero playback errors detected\n`;
                    }
                    
                    summaryText += `\n`;
                }
                
                // 3. CDN OPTIMIZATION RECOMMENDATIONS
                if (cdnResult?.success && cdnResult.cdnMetrics) {
                    summaryText += `### CDN and Delivery Optimization\n\n`;
                    const cdnData = cdnResult.cdnMetrics;
                    
                    if (cdnData.country && cdnData.country.length > 0) {
                        summaryText += `**Top Geographic Regions:**\n`;
                        cdnData.country.slice(0, 3).forEach((country: any) => {
                            const countryName = country.field || 'Unknown';
                            const views = country.views || 0;
                            const avgStartup = country.value || 0;
                            summaryText += `  • ${countryName}: ${views} views, ${(avgStartup / 1000).toFixed(2)}s avg startup\n`;
                        });
                    }
                    
                    if (cdnData.asn && cdnData.asn.length > 0) {
                        const topISP = cdnData.asn[0];
                        const ispName = topISP.field || 'Unknown ISP';
                        const ispViews = topISP.views || 0;
                        summaryText += `\n• **Primary ISP:** ${ispName} (${ispViews} views)\n`;
                    }
                    
                    summaryText += `\n💡 **Recommendation:** Monitor CDN edge cache hit ratios and consider geo-distributed delivery for high-latency regions\n`;
                    summaryText += `\n`;
                }
                
                // 4. USER ENGAGEMENT ANALYTICS
                if (engagementResult?.success && engagementResult.engagementMetrics) {
                    summaryText += `### User Engagement Analytics\n\n`;
                    const em = engagementResult.engagementMetrics;
                    
                    if (em.viewer_experience_score && em.viewer_experience_score.value !== undefined) {
                        const vesScore = em.viewer_experience_score.value;
                        summaryText += `• **Viewer Experience Score:** ${(vesScore * 100).toFixed(1)}/100\n`;
                        if (vesScore > 0.9) {
                            summaryText += `  - ✅ Excellent - high quality of experience\n`;
                        } else if (vesScore > 0.75) {
                            summaryText += `  - ✓ Good - acceptable viewer satisfaction\n`;
                        } else {
                            summaryText += `  - ⚠️ Needs improvement - review QoE factors\n`;
                        }
                    }
                    
                    if (em.playback_failure_percentage && em.playback_failure_percentage.value !== undefined) {
                        const pfPercentage = em.playback_failure_percentage.value;
                        summaryText += `• **Playback Failure Percentage:** ${pfPercentage.toFixed(2)}%\n`;
                        if (pfPercentage < 2) {
                            summaryText += `  - ✅ Excellent - minimal playback failures\n`;
                        } else {
                            summaryText += `  - ⚠️ Review required - investigate failure patterns\n`;
                        }
                    }
                    
                    if (em.exits_before_video_start && em.exits_before_video_start.value !== undefined) {
                        const exits = em.exits_before_video_start.value;
                        summaryText += `• **Exits Before Video Start:** ${exits}\n`;
                        if (exits < 50) {
                            summaryText += `  - ✅ Good engagement - users waiting for playback\n`;
                        } else {
                            summaryText += `  - ❌ High abandonment - optimize startup time\n`;
                        }
                    }
                    
                    summaryText += `\n`;
                }
                
                // Overall summary
                const { analysis } = analyticsResult || {};
                if (analysis) {
                    summaryText += `### Overall Health Assessment\n\n`;
                    summaryText += `• **Health Score:** ${analysis.healthScore}/100\n`;
                    summaryText += `• **Summary:** ${analysis.summary}\n\n`;
                    
                    if (analysis.recommendations && analysis.recommendations.length > 0) {
                        summaryText += `**Key Recommendations:**\n`;
                        analysis.recommendations.slice(0, 3).forEach((rec: string) => {
                            summaryText += `  • ${rec}\n`;
                        });
                    }
                }
                
                summaryText += `\n---\n*End of streaming analytics report*`;
                
            } else if (actualFocusArea === 'streaming' && streamingResult?.success) {
                // Streaming-only report
                summaryText = `## Streaming Performance Metrics\n\n`;
                summaryText += `**Timeframe:** ${formatTimeRange(timeRange)}\n\n`;
                const sm = streamingResult.streamingMetrics;
                if (sm.video_startup_time && sm.video_startup_time.value !== undefined) {
                    summaryText += `• **Video Startup Time:** ${(sm.video_startup_time.value / 1000).toFixed(2)}s\n`;
                }
                if (sm.rebuffer_percentage && sm.rebuffer_percentage.value !== undefined) {
                    summaryText += `• **Rebuffer Percentage:** ${(sm.rebuffer_percentage.value * 100).toFixed(2)}%\n`;
                }
                if (sm.views && sm.views.value !== undefined) {
                    summaryText += `• **Total Views:** ${sm.views.value}\n`;
                }
                if (sm.view_watch_time && sm.view_watch_time.value !== undefined) {
                    summaryText += `• **Watch Time:** ${(sm.view_watch_time.value / 3600).toFixed(1)}h\n`;
                }
                
            } else if (actualFocusArea === 'cdn' && cdnResult?.success) {
                // CDN-only report
                summaryText = `## CDN and Delivery Metrics\n\n`;
                summaryText += `**Timeframe:** ${formatTimeRange(timeRange)}\n\n`;
                const cdnData = cdnResult.cdnMetrics;
                if (cdnData.country && cdnData.country.length > 0) {
                    summaryText += `**Top Geographic Regions:**\n`;
                    cdnData.country.slice(0, 5).forEach((country: any) => {
                        const countryName = country.field || 'Unknown';
                        const views = country.views || 0;
                        summaryText += `  • ${countryName}: ${views} views\n`;
                    });
                }
                
            } else if (actualFocusArea === 'engagement' && engagementResult?.success) {
                // Engagement-only report
                summaryText = `## User Engagement Metrics\n\n`;
                summaryText += `**Timeframe:** ${formatTimeRange(timeRange)}\n\n`;
                const em = engagementResult.engagementMetrics;
                if (em.viewer_experience_score && em.viewer_experience_score.value !== undefined) {
                    const vesScore = em.viewer_experience_score.value;
                    summaryText += `• **Viewer Experience Score:** ${(vesScore * 100).toFixed(1)}/100\n`;
                }
                if (em.playback_failure_percentage && em.playback_failure_percentage.value !== undefined) {
                    summaryText += `• **Playback Failure Percentage:** ${em.playback_failure_percentage.value.toFixed(2)}%\n`;
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
                console.log('[TOOL-Assets] Fetching asset list...');
                const assetFetchStart = Date.now();
                try {
                    const assetsResult: any = await (muxAssetsListTool as any).execute({ context: { limit: 10 } });
                    if (assetsResult.success) {
                        summaryText += `\n\nRecent Assets: You have ${assetsResult.count} assets. `;
                        summaryText += assetsResult.assets
                            .slice(0, 5)
                            .map((a: any) => `Asset ${a.id.slice(0, 8)} is ${a.status}`)
                            .join('. ') + '.';
                        console.log(`[TOOL-Assets] ✓ Asset list fetched in ${Date.now() - assetFetchStart}ms (${assetsResult.count} assets)`);
                    }
                } catch (error) {
                    console.error('[TOOL-Assets] ✗ Assets tool failed:', error);
                    summaryText += `\n\nAsset information is currently unavailable.`;
                }
            }
            
            // Condense full summary for audio TTS (75-90 words for 30-second audio)
            // The full detailed summary is already generated above for chat display
            console.log('[TOOL-Condense] Condensing full summary for 30-second audio...');
            const condenseStart = Date.now();
            const originalWords = summaryText.split(/\s+/).length;
            const audioSummary = await condenseForAudio(summaryText);
            const audioWords = audioSummary.split(/\s+/).length;
            console.log(`[TOOL-Condense] ✓ LLM condensation completed in ${Date.now() - condenseStart}ms (${originalWords} → ${audioWords} words)`);
            
            // Generate TTS audio from condensed summary
            console.log('[TOOL-TTS] 🎤 Generating audio with Cartesia TTS...');
            console.log(`[TOOL-TTS] Audio summary length: ${audioSummary.length} chars, ~${audioSummary.split(/\s+/).length} words`);
            const ttsGenerationStart = Date.now();
            let audioBuffer: Buffer;
            try {
                audioBuffer = await synthesizeWithCartesiaTTS(audioSummary);
                console.log(`[TOOL-TTS] ✓ TTS generation completed in ${Date.now() - ttsGenerationStart}ms (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
            } catch (ttsError) {
                console.error('[TOOL-TTS] ✗ Cartesia TTS failed:', ttsError);
                throw new Error(`TTS generation failed: ${ttsError instanceof Error ? ttsError.message : String(ttsError)}`);
            }
            
            // Save audio file
            console.log('[TOOL-FileWrite] Writing audio file to disk...');
            const fileWriteStart = Date.now();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
            const audioPath = join(baseDir, `analytics-report-${timestamp}.wav`);
            
            await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });
            await fs.writeFile(resolve(audioPath), audioBuffer);
            console.log(`[TOOL-FileWrite] ✓ Audio saved in ${Date.now() - fileWriteStart}ms: ${audioPath} (${audioBuffer.length} bytes)`);
            
            // Upload to Mux with poster image
            console.log('[TOOL-MuxUpload] Starting Mux upload process...');
            const muxUploadStart = Date.now();
            
            let playerUrl: string | undefined;
            let assetId: string | undefined;
            let uploadId: string | undefined;
            
            // Use baby.jpeg as poster image for audio-only stream
            const posterImageUrl = `${STREAMING_PORTFOLIO_BASE_URL}/files/images/baby.jpeg`;
            console.log(`[TOOL-MuxUpload] Using poster image: ${posterImageUrl}`);
            
            try {
                console.log('[TOOL-MuxUpload] → Creating Mux upload...');
                const createUploadStart = Date.now();
                const uploadData = await createMuxUpload(posterImageUrl);
                const uploadUrl = uploadData.uploadUrl;
                uploadId = uploadData.uploadId;
                assetId = uploadData.assetId;
                console.log(`[TOOL-MuxUpload] ✓ Upload created in ${Date.now() - createUploadStart}ms (Upload ID: ${uploadId})`);
                
                if (!uploadUrl) {
                    throw new Error('No upload URL received from Mux');
                }
                
                console.log('[TOOL-MuxUpload] → Uploading audio file to Mux...');
                const putFileStart = Date.now();
                await putFileToMux(uploadUrl, resolve(audioPath));
                console.log(`[TOOL-MuxUpload] ✓ File uploaded in ${Date.now() - putFileStart}ms`);
                
                // Poll for asset creation if we got uploadId but no assetId yet
                if (uploadId && !assetId) {
                    console.log('[TOOL-MuxUpload] → Polling for asset creation...');
                    const pollStart = Date.now();
                    const maxPolls = 30; // 30 attempts
                    const pollInterval = 2000; // 2 seconds
                    
                    for (let i = 0; i < maxPolls; i++) {
                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                        console.log(`[TOOL-MuxUpload]   Poll attempt ${i + 1}/${maxPolls} (elapsed: ${Date.now() - pollStart}ms)`);
                        
                        try {
                            const response = await fetch(`https://api.mux.com/video/v1/uploads/${uploadId}`, {
                                headers: {
                                    'Authorization': `Basic ${Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64')}`
                                }
                            });
                            
                            if (response.ok) {
                                const data = await response.json();
                                if (data.data?.asset_id) {
                                    assetId = data.data.asset_id;
                                    console.log(`[TOOL-MuxUpload] ✓ Asset created after ${Date.now() - pollStart}ms (${i + 1} polls): ${assetId}`);
                                    break;
                                } else if (data.data?.status === 'errored') {
                                    console.error('[TOOL-MuxUpload] ✗ Upload errored:', data.data.error);
                                    break;
                                } else {
                                    console.log(`[TOOL-MuxUpload]   Status: ${data.data?.status || 'unknown'}`);
                                }
                            }
                        } catch (pollError) {
                            console.warn(`[TOOL-MuxUpload] ✗ Poll attempt ${i + 1} failed:`, pollError);
                        }
                    }
                    
                    if (!assetId) {
                        console.warn(`[TOOL-MuxUpload] ⚠️ Asset creation not confirmed after ${Date.now() - pollStart}ms`);
                    }
                }
                
                // Create player URL with assetId
                if (assetId) {
                    playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                    console.log(`[TOOL-MuxUpload] ✓ Player URL created: ${playerUrl}`);
                } else {
                    console.warn('[TOOL-MuxUpload] ⚠️ No assetId available after polling');
                }
                
                const totalUploadTime = Date.now() - muxUploadStart;
                console.log(`[TOOL-MuxUpload] ✓ Total Mux upload process completed in ${totalUploadTime}ms`);
            } catch (uploadError) {
                console.error('[TOOL-MuxUpload] ✗ Mux upload failed:', uploadError);
            }
            
            // Cleanup
            if (process.env.TTS_CLEANUP === 'true') {
                console.log('[TOOL-Cleanup] Cleaning up temporary files...');
                const cleanupStart = Date.now();
                try {
                    await fs.unlink(resolve(audioPath));
                    console.log(`[TOOL-Cleanup] ✓ Cleaned up audio file in ${Date.now() - cleanupStart}ms`);
                } catch (cleanupError) {
                    console.warn('[TOOL-Cleanup] ⚠️ Cleanup failed:', cleanupError);
                }
            } else {
                console.log('[TOOL-Cleanup] Skipping cleanup (TTS_CLEANUP not enabled)');
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
                // Asset is ready - can play immediately
                responseMessage += `\n\n▶️ **Listen now:** ${finalPlayerUrl}`;
                responseMessage += `\n\n✅ Audio is ready for immediate playback`;
                responseMessage += `\n📋 Asset ID: ${assetId}`;
                responseMessage += `\n\n_Copy the URL above to share or play in a new tab_`;
            } else if (finalPlayerUrl) {
                // Generic case (asset may still be processing)
                responseMessage += `\n\n▶️ **Listen to your report:** ${finalPlayerUrl}`;
                responseMessage += `\n\n✅ Your audio analytics report has been uploaded to Mux Video`;
            } else {
                // No URL yet (shouldn't happen but handle gracefully)
                responseMessage += `\n\n⏳ Your audio report is being processed...`;
                responseMessage += `\n\n_The playback URL will be available shortly_`;
            }
            
            responseMessage += `\n\n📊 **Report Period:** ${formatDateForSpeech(new Date(timeRange.start))} to ${formatDateForSpeech(new Date(timeRange.end))}`;

            const totalExecutionTime = Date.now() - toolExecutionStart;
            console.log('[TOOL-END] ═══════════════════════════════════════════════════════');
            console.log(`[TOOL-END] ✓ TTS Analytics Report Tool Completed in ${totalExecutionTime}ms (${(totalExecutionTime / 1000).toFixed(2)}s)`);
            console.log('[TOOL-END] ═══════════════════════════════════════════════════════');

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
            const errorStack = error instanceof Error ? (error.stack || '') : '';
            const sanitizedError = sanitizeApiKey(errorMessage);
            const sanitizedStack = sanitizeApiKey(errorStack);
            console.error('[tts-analytics-report] ✗ ERROR:', sanitizedError);
            if (sanitizedStack) {
                console.error('[tts-analytics-report] ✗ STACK:', sanitizedStack);
            }
            console.error('[tts-analytics-report] ✗ Full error object:', JSON.stringify(error, null, 2));
            return {
                success: false,
                error: sanitizedError,
                message: `Failed to generate analytics report: ${sanitizedError}`,
                _debug: {
                    errorType: error instanceof Error ? error.constructor.name : typeof error,
                    stack: sanitizedStack || 'No stack trace available'
                }
            };
        }
    },
});

// Simple status tool to poll background audio jobs
const ttsJobStatusTool = createTool({
    id: 'tts-job-status',
    description: 'Check status of an async TTS generation job started by tts-analytics-report (asyncMode=true).',
    inputSchema: z.object({
        jobId: z.string().describe('The jobId returned from tts-analytics-report when asyncMode is true'),
    }),
    execute: async ({ context }) => {
        const { jobId } = context as { jobId: string };
        const meta = audioJobs.get(jobId);
        if (!meta) return { success: false, error: 'job not found' };
        return { success: true, jobId, ...meta };
    },
});

/**
 * System prompt for the Mux analytics agent focused on Paramount Plus streaming
 */
function buildSystemPrompt() {
    return [
        'You are a SENIOR STREAMING VIDEO ENGINEER with deep expertise in Mux Video, Mux Data analytics, and OTT video delivery.',
        'Communicate ENGINEER-TO-ENGINEER using technical terminology, protocol specifications, and Mux platform specifics.',
        'NEVER use customer service language. Speak like you are debugging production issues with a colleague.',
        '',
        '=== MUX PLATFORM CONTEXT ===',
        'You are analyzing a streaming platform powered by:',
        '- **Mux Video**: Handles video ingestion, encoding, storage, and delivery via stream.mux.com',
        '- **Mux Data**: Provides real-time analytics on playback quality, errors, and viewer engagement',
        '- All analytics data comes from Mux Data API - this is REAL production streaming data',
        '- All videos are processed, encoded, and delivered through Mux Video infrastructure',
        '- Audio reports are generated via Cartesia TTS and uploaded back to Mux Video for playback',
        '',
        'TECHNICAL EXPERTISE:',
        '- Mux Video API: asset creation, upload flows, playback policies (public/signed)',
        '- Mux Data analytics: QoE metrics, error analysis, viewer engagement tracking',
        '- HLS/DASH manifest analysis via stream.mux.com CDN',
        '- Mux encoding pipeline: automatic ABR ladder generation, format optimization',
        '- CDN architecture: Mux global CDN, edge caching, geographic distribution',
        '- Player integration: MSE/EME, buffer management, quality switching',
        '- Network protocols: TCP congestion control, HTTP/2 multiplexing, TLS handshakes',
        '- DRM: Widevine L1/L3, FairPlay FPS integration with Mux',
        '',
        '=== ENGINEERING DIAGNOSTIC METHODOLOGY ===',
        '',
        'COMMUNICATION STYLE: Technical, direct, engineer-to-engineer. Use protocol specs, RFC references, codec details.',
        '',
        '1. MUX VIDEO ASSET STATE & ENCODING:',
        '   - Query asset.status via Mux Video API: GET /video/v1/assets/{ASSET_ID}',
        '   - Asset states: "preparing" (encoding), "ready" (available), "errored" (failed)',
        '   - Mux automatically generates ABR ladder (typically 360p to 1080p/4K)',
        '   - Check playback_ids[].policy: "public" (no auth) vs "signed" (JWT required via playback tokens)',
        '   - Mux handles all encoding - supports H.264, HEVC, VP9 inputs, outputs H.264/AAC HLS',
        '   - Review asset.duration, asset.aspect_ratio, asset.max_stored_resolution for source info',
        '   - Check asset.tracks[] for encoded renditions and audio tracks',
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
        '     * CDN timeout - TTFB > 5s, likely Mux CDN edge cache miss',
        '     * TCP packet loss - check network tab waterfall for stalled requests',
        '     * HTTP/2 stream reset - connection pool exhaustion or server overload',
        '',
        '4. QoE METRICS & OPTIMIZATION (MUX DATA ANALYTICS):',
        '   - ALL metrics come from Mux Data API - real production streaming data',
        '   - Video Startup Time (VST): Target <1000ms from Mux Data "video_startup_time" metric',
        '     * Breakdown: DNS (50ms) + TLS handshake (100ms) + manifest fetch (200ms) + first segment (650ms)',
        '     * Mux CDN optimizations: HTTP/2, edge caching, optimized ABR ladder',
        '   - Rebuffer Ratio: Target <1%, from Mux Data "rebuffer_percentage" metric',
        '     * Tracked per view, aggregated across timeframes',
        '     * Root cause: network jitter, ABR algorithm behavior, CDN performance',
        '   - Error Rate: Target <0.5%, from Mux Data error events',
        '     * Breakdown by error_type: MEDIA_ERR_ABORTED, NETWORK, DECODE, SRC_NOT_SUPPORTED',
        '     * Platform breakdown: iOS, Android, Desktop, SmartTV error rates',
        '   - Viewer Experience Score (VES): Mux proprietary metric (0-100)',
        '     * Combines VST, rebuffering, error rate into single QoE score',
        '     * Target: >90 for excellent experience',
        '',
        '5. PLATFORM-SPECIFIC IMPLEMENTATION DETAILS:',
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
        '6. MUX API INTEGRATION (VIDEO & DATA):',
        '   - Mux Video API: asset management, upload flows, playback configuration',
        '     * Authentication: Basic Auth with base64(MUX_TOKEN_ID:MUX_TOKEN_SECRET)',
        '     * Rate limit: 100 req/min for reads, 10 req/min for writes',
        '   - Mux Data API: analytics queries, metrics aggregation',
        '     * Authentication: same credentials as Video API',
        '     * Query metrics: /data/v1/metrics/{METRIC_ID}/breakdown',
        '     * Timeframe filters, dimension breakdowns (country, browser, OS)',
        '   - Direct Upload flow (Mux Video):',
        '     * POST /video/v1/uploads → {url: "https://...", id: "..."} expires in 1h',
        '     * PUT {url} with file bytes, Content-Type: application/octet-stream',
        '     * Poll GET /video/v1/uploads/{id} until status="asset_created", extract asset_id',
        '     * Asset encoding happens automatically by Mux Video',
        '   - Webhook verification:',
        '     * Mux-Signature header: HMAC-SHA256(webhook_secret, timestamp + body)',
        '     * Event types: video.asset.ready, video.asset.errored, video.upload.asset_created',
        '',
        '7. LOW-LEVEL DIAGNOSTICS (PROTOCOL ANALYSIS):',
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
        '     * Identify: Mux CDN latency (TTFB), segment download time, parallel fetch limit (6 conns)',
        '',
        '8. ROOT CAUSE ANALYSIS WITH MUX DATA:',
        '   - Layer isolation: OSI model approach',
        '     * L7 (Application): player logic, ABR algorithm, DRM handshake',
        '     * L6 (Presentation): codec decode, audio/video sync, buffer management',
        '     * L5 (Session): HLS session, segment sequence, manifest refresh',
        '     * L4 (Transport): TCP window size, congestion control (Cubic/BBR), packet loss',
        '     * L3 (Network): routing, Mux CDN edge selection, anycast DNS',
        '   - Mux Data-driven debugging:',
        '     * Use Mux Data filters: isolate by country, ISP, device, browser',
        '     * Compare metrics across dimensions to find patterns',
        '     * Check Mux Video asset status and encoding details',
        '   - Data collection for RCA:',
        '     * Mux Data metrics: VST, rebuffer_ratio, error_rate by dimension',
        '     * HAR file: network waterfall with timing, headers, response codes',
        '     * Player logs: buffer state, quality switches, error events',
        '     * Mux CDN logs: cache status (HIT/MISS/EXPIRED) via Mux support',
        '',
        '9. PRODUCTION MONITORING WITH MUX DATA:',
        '   - Real-time metrics from Mux Data dashboard and API',
        '   - SLO definitions using Mux Data metrics:',
        '     * Availability: 99.9% - measure via Mux Data successful_views/total_views',
        '     * Latency: p95 VST <1.5s - from Mux Data video_startup_time metric',
        '     * Error budget: 0.1% - from Mux Data error events',
        '   - Alert thresholds based on Mux Data:',
        '     * CRITICAL: error_rate >2% for 5min OR p95_vst >3s for 10min',
        '     * WARNING: rebuffer_ratio >1.5% for 15min OR VES <80 for 30min',
        '     * INFO: Mux Video asset processing time >2x duration',
        '   - Mux Data dimension analysis:',
        '     * Breakdown by country, ISP, device, browser to isolate issues',
        '     * Compare current vs historical performance trends',
        '     * Use Mux Data filters to drill down into specific cohorts',
        '   - Integration with Mux Video:',
        '     * Monitor asset encoding status via Mux Video API',
        '     * Track upload failures and processing errors',
        '     * Verify playback policy configuration (signed vs public)',
        '',
        '=== END MUX PLATFORM DIAGNOSTIC FRAMEWORK ===',
        '',
        'MUX DATA ANALYTICS TOOLS (USE THESE FOR FOCUSED ANALYSIS):',
        '- muxStreamingPerformanceTool: Queries Mux Data for VST, rebuffering, segment delivery metrics',
        '- muxCDNMetricsTool: Geographic distribution, ISP performance via Mux CDN analytics',
        '- muxEngagementMetricsTool: Viewer experience score, playback failures from Mux Data',
        '- muxErrorsTool: Error breakdown by type, platform, and time from Mux Data error events',
        '- muxAnalyticsTool: Overall performance metrics and health scores from Mux Data',
        '- muxAssetsListTool: Query Mux Video assets, status, encoding progress',
        '- muxVideoViewsTool: Detailed view data from Mux Data per asset or timeframe',
        '- muxChartGenerationTool: Generate visual charts (line, bar, pie, multiline) from analytics data',
        '',
        'CHART GENERATION (WHEN USER ASKS FOR CHARTS, GRAPHS, OR VISUALIZATIONS):',
        '- CRITICAL: DO NOT announce "I will generate charts" - ACTUALLY CALL THE TOOL IMMEDIATELY',
        '- ALWAYS generate charts when users request visualizations, graphs, charts, or say "include a chart"',
        '- PROACTIVELY generate charts for common data types even if not explicitly requested:',
        '  * Geographic distribution → bar chart + pie chart',
        '  * Error breakdown → pie chart or bar chart',
        '  * Time series metrics → line chart',
        '  * Platform/device breakdown → bar chart',
        '  * Performance comparison → multi-line chart',
        '',
        'WORKFLOW (MUST FOLLOW THIS EXACT SEQUENCE):',
        '1. FIRST: Call analytics tools to fetch data (muxAnalyticsTool, muxCDNMetricsTool, muxStreamingPerformanceTool, etc.)',
        '2. SECOND: Transform the fetched data into chart format arrays: [{label: string, value: number}, ...]',
        '3. THIRD: IMMEDIATELY call muxChartGenerationTool with the data - DO NOT write text first',
        '4. FOURTH: After tool returns chartUrl, include it in your response using markdown: ![Chart Title](chartUrl)',
        '',
        'DATA TRANSFORMATION EXAMPLES:',
        '- Time series (views over time): [{label: "2025-01-01", value: 100}, {label: "2025-01-02", value: 150}, ...]',
        '- Geographic: [{label: "US", value: 1000}, {label: "CA", value: 500}, {label: "UK", value: 300}, ...]',
        '- Error breakdown: [{label: "Network Error", value: 10}, {label: "Player Error", value: 5}, ...]',
        '- Performance metrics: Use multilineData for comparing multiple metrics over time',
        '',
        'CHART TYPE SELECTION:',
        '- Line charts: For time series data (views over time, errors over time, rebuffering trends, etc.)',
        '- Bar charts: For categorical comparisons (geographic distribution, platform breakdown, device types, etc.)',
        '- Pie charts: For distribution percentages (error types, country shares, device distribution, etc.)',
        '- Multi-line charts: For comparing multiple metrics (error rate vs rebuffering, multiple performance metrics, etc.)',
        '',
        'MULTIPLE CHARTS (CRITICAL):',
        '- When user requests "multiple charts" or "charts" (plural), you MUST generate at least 2-3 different charts',
        '- DO NOT respond with "response complete" or finish until ALL charts are generated and displayed',
        '- For "multiple charts showing video analytics trends for the last 7 days":',
        '  * Chart 1: Views over time (line chart) - use muxVideoViewsTool or muxAnalyticsTool to get daily views',
        '  * Chart 2: Error rates over time (line chart) - use muxErrorsTool to get daily error rates',
        '  * Chart 3: Performance metrics comparison (multiline chart) - compare startup time, rebuffering, etc.',
        '- Call muxChartGenerationTool MULTIPLE TIMES - once for EACH chart (do not stop after first chart)',
        '- After EACH tool call returns, immediately add the chart to your response: "## Chart Title\\n\\n![Chart Title](chartUrl)"',
        '- Continue calling the tool until ALL requested charts are generated',
        '- Example response format:',
        '  "## Views Over Time (Last 7 Days)\\n\\n![Views Over Time](url1)\\n\\n## Error Rates Over Time\\n\\n![Error Rates](url2)\\n\\n## Performance Metrics Comparison\\n\\n![Performance](url3)"',
        '',
        'RESPONSE FORMAT:',
        '- DO NOT say "I will generate charts" or "Now I will create charts" - JUST CALL THE TOOL',
        '- DO NOT respond with "response complete" until ALL charts are generated and displayed',
        '- DO NOT stop after generating just one chart - continue until all charts are done',
        '- Call muxChartGenerationTool, wait for result, add chart to response, then call again for next chart',
        '- Chart URLs are automatically served and accessible',
        '- Always include chart title and axis labels for clarity',
        '',
        '',
        'AUDIO SUMMARY REQUIREMENT (WHEN EXPLICITLY REQUESTED):',
        '- Audio reports take 30-60 seconds to generate (TTS + upload)',
        '- TARGET DURATION: Keep audio summaries to ~30 seconds (75-90 words)',
        '- Generate audio when user asks for "audio" in their request:',
        '  * "provide an audio summary of X"',
        '  * "audio summary of views by country"',
        '  * "generate an audio report"',
        '  * "create an audio summary"',  
        '  * "audio report for..." ',
        '  * "give me an audio analysis of X"',
        '  * ANY request that includes the word "audio"',
        '- For queries WITHOUT "audio", use fast category-specific tools:',
        '  * muxStreamingPerformanceTool for streaming metrics',
        '  * muxCDNMetricsTool for CDN/delivery metrics (includes country breakdown)',
        '  * muxEngagementMetricsTool for user engagement',
        '  * muxErrorsTool for error analysis',
        '  * muxAnalyticsTool for general analytics',
        '  * muxVideoViewsTool for detailed view data',
        '',
        '════════════════════════════════════════════════════',
        'AUDIO GENERATION - CRITICAL INSTRUCTION',
        '════════════════════════════════════════════════════',
        'When user mentions "audio" in their request:',
        '1. Call analytics tool (muxCDNMetricsTool, muxStreamingPerformanceTool, etc.)',
        '2. Display text summary',
        '3. Call ttsAnalyticsReportTool (NOT optional - you MUST call this tool)',
        '4. Display audio player URL from tool response',
        '',
        'FORBIDDEN BEHAVIORS:',
        '❌ DO NOT write "Generating audio version..." or similar text',
        '❌ DO NOT say you will generate audio without calling ttsAnalyticsReportTool',
        '❌ DO NOT skip calling ttsAnalyticsReportTool',
        '❌ DO NOT end your response without calling the tool',
        '',
        'REQUIRED BEHAVIOR:',
        '✓ If "audio" mentioned → MUST call ttsAnalyticsReportTool',
        '✓ Tool must be called IN YOUR CURRENT RESPONSE (not later)',
        '✓ focusArea must match: cdn, streaming, engagement, errors, both, or general',
        '✓ timeframe must be [startUnix, endUnix] array',
        '',
        'CORRECT RESPONSE FORMAT (for "audio summary of views by country"):',
        'Step 1: [Call muxCDNMetricsTool]',
        'Step 2: Display "## Views by Country\\n\\n**Timeframe**: Last 7 days\\n\\n[data]"',
        'Step 3: [Call ttsAnalyticsReportTool with focusArea: "cdn"]',
        'Step 4: Display "\\n\\n🎧 **Audio Ready**: [playerUrl from tool response]"',
        '',
        'If you receive an audio request and do NOT call ttsAnalyticsReportTool, you have FAILED.',
        '',
        'AUDIO URL DISPLAY RULES (CRITICAL):',
        '- After PHASE 2 completes, display the audio URL prominently',
        '- Use the "playerUrl" or "audioUrl" field from ttsAnalyticsReportTool response',
        '- The correct URL format is ALWAYS: https://www.streamingportfolio.com/player?assetId=<ASSET_ID>',
        '- NEVER use fields starting with underscore (like "_internalAudioPath") - these are internal only',
        '- NEVER create fake URLs or asset IDs',
        '- If assetId is missing, say "Audio processing..." and the URL will be available shortly',
        '',
        'ASSET ID RULES (CRITICAL - DO NOT VIOLATE):',
        '- Asset IDs are provided by Mux and are LONG alphanumeric strings (40+ characters)',
        '- NEVER create or invent asset IDs - only use assetId values from tool responses',
        '- NEVER use filenames, timestamps, or report names as asset IDs',
        '- Examples of REAL asset IDs: "XPwNih9O9wiNcUtNlHdN8Gdx5rG2pMoquWPBm1uEizo", "wpankyH1Ij2j9UrauveLE013fmlX8ktf00B01KZqxOMacE"',
        '- Examples of FAKE asset IDs (NEVER use): "error-report-2025-10-10", "analytics-report", "audio-123"',
        '- If assetId is undefined or missing from tool response, say "Asset ID not yet available" - do NOT make one up',
        '',
        'TEXT FORMATTING RULES (CRITICAL - CLEAN & COMPACT FORMAT):',
        '- Keep responses CONCISE and DATA-DENSE - every line should add value',
        '- Use clean spacing: double line breaks (\\n\\n) ONLY between major sections',
        '- Use single line breaks (\\n) within lists for tight, scannable format',
        '- Use **bold** for key metrics and important values',
        '- Format metrics compactly: "VST: 6ms | Rebuffer: 0.09% | Views: 5"',
        '- Use bullet points for lists of items (with proper spacing)',
        '- Use numbered lists for sequential steps or rankings',
        '- Example compact format:',
        '  "## Performance Overview\\n\\n**Metrics**: VST 6ms | Rebuffer 0.09% | 5 views\\n**Status**: All healthy\\n\\n**Top Issues**:\\n• Error A: 45%\\n• Error B: 32%\\n• Error C: 23%"',
        '- NO excessive prose or conversational filler',
        '- NO redundant phrases like "Let me analyze", "Here\'s what I found"',
        '- Start with data immediately after headers',
        '- Use technical abbreviations: VST, CDN, ISP, QoE, etc.',
        '- Keep sentences short and direct',
        '- Group related metrics with | separators for compactness',
        '- BAD: "Video startup time is 6 milliseconds with rebuffering at 0.09 percent across 5 views. Performance is excellent."',
        '- GOOD: "VST: 6ms | Rebuffer: 0.09% | Views: 5 | Status: Excellent"',
        '',
        'AUDIO REPORT RESPONSE FORMAT (CRITICAL - FOLLOW EXACTLY WITH TWO-PHASE APPROACH):',
        '',
        '** PHASE 1 - IMMEDIATE TEXT RESPONSE (stream this first): **',
        '1. Call analytics tools (muxAnalyticsTool, muxErrorsTool, etc.) to get data',
        '2. Generate COMPACT text summary from the data',
        '3. Stream the summary immediately in CLEAN, COMPACT format (see TEXT FORMATTING RULES)',
        '4. End with: "\\n\\n🎤 **Generating audio version...** (30-60s)"',
        '',
        '** PHASE 2 - AUDIO GENERATION (after text is streamed): **',
        '1. Call ttsAnalyticsReportTool with same parameters',
        '2. Wait for tool to complete (this takes 30-60 seconds)',
        '3. Display the audio URL from tool response',
        '4. Format: "\\n\\n🎧 **Audio Ready**\\n[URL from tool]"',
        '',
        '** EXAMPLE FLOW: **',
        'User asks: "Generate an audio report for the last 7 days"',
        '',
        'Your response (PHASE 1 - immediate, COMPACT format):',
        '"## Analytics Report\\n\\n**Timeframe**: Oct 6-13 2025\\n\\n**Metrics**:\\nVST: 6ms | Rebuffer: 0.09% | Views: 5\\nError Rate: 0% | VES: 98/100\\n\\n**Status**: All systems healthy\\n\\n🎤 **Generating audio version...** (30-60s)"',
        '',
        'Then (PHASE 2 - after TTS completes):',
        '"\\n\\n🎧 **Audio Ready**\\nhttps://www.streamingportfolio.com/player?assetId=abc123"',
        '',
        '** KEY POINTS: **',
        '- Text display: COMPACT, scannable, data-dense (for reading)',
        '- Audio version: CONDENSED to 75-90 words, natural speech (TTS handles conversion)',
        '- Audio focuses on TOP 3-4 KEY POINTS only, not all details from text',
        '- Users get instant text (<5s) while audio generates in background',
        '',
        '** EXAMPLE FOR CATEGORY-SPECIFIC AUDIO REQUEST: **',
        'User asks: "provide an audio summary of total views by country"',
        '',
        'Your response (PHASE 1 - immediate):',
        '1. Call muxCDNMetricsTool with timeframe (e.g., last 7 days)',
        '2. Display compact text:',
        '"## Views by Country\\n\\n**Top Countries**:\\n• United States: 1,234 views (45%)\\n• Canada: 678 views (25%)\\n• United Kingdom: 432 views (16%)\\n\\n**Total**: 2,756 views across 5 countries\\n\\n🎤 **Generating audio version...** (30-60s)"',
        '',
        'Then (PHASE 2 - call ttsAnalyticsReportTool):',
        '- timeframe: "last 7 days" (MUST MATCH Phase 1)',
        '- focusArea: "cdn" (MUST be \'cdn\' for country data)',
        '',
        'When tool completes, display:',
        '"\\n\\n🎧 **Audio Ready**\\nhttps://www.streamingportfolio.com/player?assetId=abc123"',
        '',
        'The audio will be condensed to ~80 words covering same countries:',
        '"Your platform had 2,756 total views across 5 countries. The United States led with 1,234 views at 45 percent. Canada followed with 678 views. The United Kingdom, Germany, and France rounded out the top five. US and Canada together account for 70 percent of all views."',
        '',
        '** KEY POINT: focusArea=\'cdn\' ensures audio includes country breakdown **',
        '',
        'QUERY TYPE HANDLING (SPECIFIC RESPONSES FOR EACH QUERY TYPE):',
        '',
        '1. STREAMING PERFORMANCE METRICS:',
        '   - Use muxStreamingPerformanceTool',
        '   - Focus: VST, rebuffering %, rebuffer frequency, segment delivery',
        '   - Generate: Line chart showing metrics over time if data available',
        '   - Format: Compact metrics table + chart + recommendations',
        '',
        '2. ERROR RATES & PLAYBACK ISSUES:',
        '   - Use muxErrorsTool + muxAnalyticsTool',
        '   - Focus: Error counts, error %, platform breakdown, error types',
        '   - Generate: Pie chart (error types) + bar chart (errors by platform)',
        '   - Format: Error summary table + charts + prioritized action items',
        '',
        '3. CDN OPTIMIZATION:',
        '   - Use muxCDNMetricsTool',
        '   - Focus: Geographic distribution, ISP performance, CDN efficiency',
        '   - Generate: Bar chart (views by country) + pie chart (country %)',
        '   - Format: Geographic breakdown + charts + CDN recommendations',
        '',
        '4. USER ENGAGEMENT:',
        '   - Use muxEngagementMetricsTool + muxAnalyticsTool',
        '   - Focus: Viewer experience score, watch time, completion rates',
        '   - Generate: Line chart (engagement trends) if time series available',
        '   - Format: Engagement metrics + trends + insights',
        '',
        '5. TOP PERFORMING VIDEOS:',
        '   - Use muxAssetsListTool + muxVideoViewsTool',
        '   - Focus: View counts, watch time, engagement per asset',
        '   - Generate: Bar chart (top 10 videos by views)',
        '   - Format: Ranked table + chart + performance highlights',
        '',
        '6. VIEWS & WATCH TIME:',
        '   - Use muxAnalyticsTool + muxVideoViewsTool',
        '   - Focus: Total views, watch time, session duration',
        '   - Generate: Line chart (views over time)',
        '   - Format: Summary stats + time series chart + trends',
        '',
        '7. VIDEO QUALITY & BITRATE:',
        '   - Use muxStreamingPerformanceTool + muxAnalyticsTool',
        '   - Focus: Resolution distribution, bitrate adaptation, quality metrics',
        '   - Generate: Bar chart (resolution distribution) if data available',
        '   - Format: Quality metrics + distribution + recommendations',
        '',
        '8. GEOGRAPHIC DISTRIBUTION:',
        '   - Use muxCDNMetricsTool',
        '   - Focus: Country breakdown, views by region',
        '   - Generate: Bar chart (views by country) + pie chart (distribution %)',
        '   - Format: Country table + both charts + geographic insights',
        '',
        '9. DEVICE & BROWSER ANALYTICS:',
        '   - Use muxAnalyticsTool with filters or breakdowns',
        '   - Focus: OS distribution, device types, browser breakdown',
        '   - Generate: Bar chart (by OS) + pie chart (device types)',
        '   - Format: Device breakdown table + charts + platform insights',
        '',
        '10. BUFFERING & REBUFFERING:',
        '    - Use muxStreamingPerformanceTool',
        '    - Focus: Rebuffer %, frequency, duration, trends',
        '    - Generate: Line chart (rebuffering over time)',
        '    - Format: Rebuffer metrics + trend chart + optimization tips',
        '',
        '11. MULTIPLE CHARTS REQUEST:',
        '    - Use multiple analytics tools as needed',
        '    - Generate: Multiple charts (line, bar, pie as appropriate)',
        '    - Format: Comprehensive analysis with multiple visualizations',
        '',
        'ANALYSIS APPROACH (MUX PLATFORM FOCUSED):',
        '- ALL data comes from Mux Data API - real production analytics from stream.mux.com',
        '- Focus on key streaming KPIs: error rates, rebuffering, VST, playback failures',
        '- Provide DETAILED recommendations using Mux Data filters and breakdowns',
        '- Reference Mux Video API for asset status, encoding state, playback policies',
        '- Consider Mux CDN performance, geographic distribution, ISP variations',
        '- Prioritize issues by severity and viewer impact using Mux Data metrics',
        '- Include specific Mux API commands, Data dashboard queries, and diagnostic procedures',
        '- Reference Mux-specific features: signed URLs, upload flow, webhook events',
        '- Never expose API keys or sensitive credentials (MUX_TOKEN_ID, MUX_TOKEN_SECRET)',
        '- ALWAYS generate charts when data is available and visualization would be helpful',
        '- Use tables for structured data (rankings, breakdowns, comparisons)',
        '- Use charts for trends, distributions, and comparisons',
        '',
        'COMMUNICATION PROTOCOL:',
        '- ENGINEER-TO-ENGINEER: Use technical jargon, Mux API specifics, protocol specs',
        '- NO HAND-HOLDING: Assume deep technical knowledge - skip basic explanations',
        '- MUX PLATFORM FIRST: Reference Mux Data metrics, Mux Video API, Mux CDN behavior',
        '- QUANTITATIVE: Always include metrics from Mux Data API, percentiles, SLOs, latency breakdowns',
        '- IMPLEMENTATION-FOCUSED: Provide Mux API commands, cURL examples, Data dashboard queries',
        '- ROOT CAUSE: Never stop at symptoms - use Mux Data filters to dig deeper',
        '- REPRODUCIBLE: Give exact steps using Mux APIs, tools, and Data breakdowns',
        '- PRODUCTION-AWARE: Consider blast radius, monitoring via Mux Data, SRE practices',
        '- SPEC REFERENCES: Cite RFC 8216 (HLS), Mux API docs, Mux Data metric definitions',
        '- NO FLUFF: Cut all "customer service" language and filler phrases',
        '- PLATFORM AWARENESS: Remember you are working with Mux Video + Mux Data ecosystem',
        '- COMPACT FORMAT: Use technical abbreviations, | separators, bullet points for scanning',
        '- DATE FORMAT: Use "Oct 13 2025" or "2025-10-13" (compact, not spelled out)',
        '- ID FORMAT: Use "asset-id" or "playback-id" (technical format, not spelled out)',
        '- SCANNABLE: Format for quick reading with clear visual hierarchy',
    ].join('\n');
}

export const muxAnalyticsAgent: any = new Agent({
    name: 'muxAnalyticsAgent',
    description: 'TIER 3 streaming video engineer specializing in Mux Video and Mux Data analytics. Provides expert-level troubleshooting for video streaming issues using real-time Mux Data metrics. Analyzes performance, errors, and viewer engagement from the Mux platform. Can generate AI audio summaries powered by Cartesia Sonic TTS and hosted on Mux Video.',
    instructions: buildSystemPrompt(),
    model: anthropic(process.env.ANTHROPIC_MODEL!),
    // Basic memory - conversation context only (no embeddings/semantic search for speed)
    memory: new Memory({
        storage: new LibSQLStore({
            url: process.env.MASTRA_MEMORY_DB_URL || 'file:./mux-analytics-memory.db'
        }),
        options: {
            lastMessages: 8  // Keep last 8 messages for basic conversation context
        }
    }),
    tools: {
        muxAnalyticsTool,
        muxStreamingPerformanceTool,
        muxCDNMetricsTool,
        muxEngagementMetricsTool,
        muxAssetsListTool,
        muxVideoViewsTool,
        muxErrorsTool,
        muxChartGenerationTool,
        ttsAnalyticsReportTool,
        ttsJobStatusTool,
    },
});

// Export the agent directly - Mastra will handle streaming natively
export const muxAnalyticsAgentTestWrapper = muxAnalyticsAgent;

