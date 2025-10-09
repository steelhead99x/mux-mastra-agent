import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Mux Data API base URL
const MUX_DATA_API_BASE = 'https://api.mux.com/data/v1';

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

// Check if we should use MCP (evaluate at runtime, not module load time)
function shouldUseMCP(): boolean {
    return process.env.USE_MUX_MCP === 'true';
}

// Mux API valid timeframe constraints
const MUX_API_VALID_START = 1751241600; // Jun 30 2025
const MUX_API_VALID_END = 1759964076;   // Oct 8 2025

/**
 * Generate valid timestamps within Mux API constraints
 * If requested timeframe is outside valid range, adjust to valid range
 */
function getValidTimeframe(requestedStart?: number, requestedEnd?: number): [number, number] {
    // Default to last 24 hours within valid range
    // Use the end of the valid range as our reference point since current time is outside valid range
    const defaultEnd = MUX_API_VALID_END;
    const defaultStart = Math.max(MUX_API_VALID_START, defaultEnd - (24 * 60 * 60));
    
    let start = requestedStart || defaultStart;
    let end = requestedEnd || defaultEnd;
    
    // Ensure timestamps are within valid range
    // If either timestamp is outside the valid range, use defaults instead
    if (start < MUX_API_VALID_START || start > MUX_API_VALID_END || 
        end < MUX_API_VALID_START || end > MUX_API_VALID_END) {
        start = defaultStart;
        end = defaultEnd;
    } else {
        start = Math.max(MUX_API_VALID_START, Math.min(MUX_API_VALID_END, start));
        end = Math.max(MUX_API_VALID_START, Math.min(MUX_API_VALID_END, end));
    }
    
    // Ensure start is before end and timeframe is positive
    if (start >= end) {
        start = end - (24 * 60 * 60); // 24 hours before end
        start = Math.max(MUX_API_VALID_START, start);
    }
    
    // Ensure minimum timeframe of 1 hour
    const minTimeframe = 60 * 60; // 1 hour in seconds
    if (end - start < minTimeframe) {
        start = Math.max(MUX_API_VALID_START, end - minTimeframe);
    }
    
    return [start, end];
}

// Lazy-load MCP client only if needed
let muxDataMcpClient: any = null;
async function getMcpClient() {
    if (!muxDataMcpClient && shouldUseMCP()) {
        const { muxDataMcpClient: client } = await import('../mcp/mux-data-client.js');
        muxDataMcpClient = client;
        await muxDataMcpClient.connect();
    }
    return muxDataMcpClient;
}

/**
 * Make authenticated request to Mux Data API
 * Uses MCP if USE_MUX_MCP=true, otherwise uses direct REST API
 */
async function muxDataRequest(endpoint: string, params?: Record<string, any>): Promise<any> {
    // Try MCP first if enabled
    if (shouldUseMCP()) {
        try {
            const mcpClient = await getMcpClient();
            if (mcpClient) {
                const tools = await mcpClient.getTools();
                
                // Use invoke_api_endpoint directly with proper endpoint names
                if (tools['invoke_api_endpoint']) {
                    // Map our internal endpoints to MCP endpoint names
                    let endpointName: string;
                    
                    if (endpoint === '/errors') {
                        endpointName = 'list_data_errors';
                    } else if (endpoint === '/video-views') {
                        endpointName = 'list_data_video_views';
                    } else if (endpoint === '/metrics/overall') {
                        endpointName = 'get_overall_values_data_metrics';
                    } else if (endpoint.includes('/breakdown')) {
                        // Convert breakdown endpoints to MCP format
                        endpointName = endpoint.replace(/^\//, '').replace(/\//g, '_');
                    } else {
                        // Generic conversion
                        endpointName = endpoint.replace(/^\//, '').replace(/\//g, '_');
                    }
                    
                    console.log(`[mux-analytics] Calling MCP endpoint: ${endpointName}`);
                    
                    return await tools['invoke_api_endpoint'].execute({
                        context: {
                            endpoint_name: endpointName,
                            args: params || {},
                        },
                    });
                }
            }
        } catch (mcpError) {
            console.warn('[mux-analytics] MCP request failed, falling back to REST API:', mcpError);
        }
    }
    
    // Fallback to direct REST API
    const muxTokenId = process.env.MUX_TOKEN_ID;
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
    
    if (!validateApiKey(muxTokenId, 'MUX_TOKEN_ID') || !validateApiKey(muxTokenSecret, 'MUX_TOKEN_SECRET')) {
        throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required and must be valid');
    }
    
    const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
    
    // Build URL with query params
    const url = new URL(`${MUX_DATA_API_BASE}${endpoint}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                // Handle timeframe array specially - must be added as separate query params
                if (key === 'timeframe' && Array.isArray(value)) {
                    value.forEach((v: any) => {
                        url.searchParams.append('timeframe[]', String(v));
                    });
                } else if (key === 'filters' && Array.isArray(value)) {
                    // Handle filters array - each filter is a separate param
                    value.forEach((v: any) => {
                        url.searchParams.append('filters[]', String(v));
                    });
                } else if (!Array.isArray(value)) {
                    url.searchParams.append(key, String(value));
                }
            }
        });
    }
    
    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        }
    } as any);
    
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const sanitizedError = sanitizeApiKey(errorText);
        throw new Error(`Mux Data API error ${response.status}: ${sanitizedError}`);
    }
    
    return await response.json();
}

/**
 * Analyze video quality metrics and provide recommendations
 */
function analyzeMetrics(data: any): {
    summary: string;
    issues: string[];
    recommendations: string[];
    healthScore: number;
} {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let healthScore = 100;
    
    // Check for high error rates
    if (data.total_error_percentage > 5) {
        issues.push(`High error rate: ${data.total_error_percentage.toFixed(2)}% of views encountered errors`);
        recommendations.push('Investigate error logs and ensure proper encoding settings. Consider implementing better error handling in your player.');
        healthScore -= 20;
    } else if (data.total_error_percentage > 2) {
        issues.push(`Moderate error rate: ${data.total_error_percentage.toFixed(2)}% of views had errors`);
        recommendations.push('Monitor error patterns and consider reviewing encoding profiles.');
        healthScore -= 10;
    }
    
    // Check rebuffering
    if (data.total_rebuffer_percentage > 10) {
        issues.push(`High rebuffering: ${data.total_rebuffer_percentage.toFixed(2)}% of viewing time spent rebuffering`);
        recommendations.push('Optimize CDN delivery, consider lower bitrate ladder for poor connections, or implement adaptive bitrate more aggressively.');
        healthScore -= 25;
    } else if (data.total_rebuffer_percentage > 5) {
        issues.push(`Moderate rebuffering: ${data.total_rebuffer_percentage.toFixed(2)}% rebuffering detected`);
        recommendations.push('Review CDN performance and consider expanding edge locations.');
        healthScore -= 15;
    }
    
    // Check startup time
    if (data.average_startup_time_ms > 5000) {
        issues.push(`Slow startup: Average ${(data.average_startup_time_ms / 1000).toFixed(2)}s to start playback`);
        recommendations.push('Enable player preloading, optimize initial segment size, and consider using lower resolution for initial frame.');
        healthScore -= 15;
    } else if (data.average_startup_time_ms > 3000) {
        issues.push(`Moderate startup time: ${(data.average_startup_time_ms / 1000).toFixed(2)}s average`);
        recommendations.push('Consider optimizing player initialization and reducing initial segment size.');
        healthScore -= 10;
    }
    
    // Check video quality
    if (data.average_video_startup_failure_percentage > 2) {
        issues.push(`Video startup failures: ${data.average_video_startup_failure_percentage.toFixed(2)}%`);
        recommendations.push('Check video encoding compatibility and ensure proper fallback mechanisms.');
        healthScore -= 20;
    }
    
    // Check playback failure score
    if (data.playback_failure_score > 50) {
        issues.push(`High playback failure score: ${data.playback_failure_score}`);
        recommendations.push('Critical: Investigate player configuration, DRM settings, and network delivery issues immediately.');
        healthScore -= 30;
    } else if (data.playback_failure_score > 20) {
        issues.push(`Elevated playback failure score: ${data.playback_failure_score}`);
        recommendations.push('Review player logs and monitor for systematic failures.');
        healthScore -= 15;
    }
    
    // Positive indicators
    const positiveNotes: string[] = [];
    if (data.total_error_percentage < 1) {
        positiveNotes.push('Excellent error rate (<1%)');
    }
    if (data.total_rebuffer_percentage < 2) {
        positiveNotes.push('Excellent playback smoothness');
    }
    if (data.average_startup_time_ms < 2000) {
        positiveNotes.push('Fast startup time');
    }
    
    const summary = issues.length === 0
        ? `Streaming performance is excellent. ${positiveNotes.join(', ')}.`
        : `Found ${issues.length} area(s) requiring attention. Health score: ${Math.max(0, healthScore)}/100`;
    
    return { summary, issues, recommendations, healthScore: Math.max(0, healthScore) };
}

/**
 * Mux Analytics Tool - Fetch overall metrics
 */
export const muxAnalyticsTool = createTool({
    id: "mux-analytics",
    description: "Fetch Mux video streaming analytics and metrics for a specific time range. Returns overall performance data including views, errors, rebuffering, and startup times. If no timeframe is provided, defaults to last 24 hours of available data.",
    inputSchema: z.object({
        timeframe: z.union([
            z.array(z.number()).length(2),
            z.array(z.string()).length(2).transform(arr => arr.map(s => {
                const num = parseInt(s, 10);
                return isNaN(num) ? undefined : num;
            }))
        ]).describe("Unix timestamp array [start, end] for the time range to analyze").optional(),
        filters: z.array(z.string()).describe("Optional filters like 'operating_system:iOS' or 'country:US'").optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters } = context as { timeframe?: any; filters?: string[] };
        
        try {
            // Parse timeframe if it's a string or contains invalid values
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe && Array.isArray(timeframe) && timeframe.length >= 2) {
                const parseTimestamp = (val: any): number | undefined => {
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        const parsed = parseInt(val, 10);
                        return isNaN(parsed) ? undefined : parsed;
                    }
                    return undefined;
                };
                
                startTime = parseTimestamp(timeframe[0]);
                endTime = parseTimestamp(timeframe[1]);
            }
            
            // Use valid timeframe within Mux API constraints
            const [start, end] = getValidTimeframe(startTime, endTime);
            
            const params: any = {
                timeframe: [start, end],
            };
            
            if (filters && filters.length > 0) {
                params.filters = filters;
            }
            
            // Fetch overall metrics
            const metricsData = await muxDataRequest('/metrics/overall', params);
            
            // Analyze the data
            const analysis = analyzeMetrics(metricsData.data || metricsData);
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                metrics: metricsData.data || metricsData,
                analysis,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[mux-analytics] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch Mux analytics data'
            };
        }
    },
});

/**
 * Mux Assets List Tool - Get all video assets
 */
export const muxAssetsListTool = createTool({
    id: "mux-assets-list",
    description: "List all Mux video assets in the account. Useful for getting an overview of content library.",
    inputSchema: z.object({
        limit: z.number().describe("Maximum number of assets to return").optional(),
        page: z.number().describe("Page number for pagination").optional(),
    }),
    execute: async ({ context }) => {
        const { limit, page } = context as { limit?: number; page?: number };
        
        try {
            const muxTokenId = process.env.MUX_TOKEN_ID;
            const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
            
            if (!validateApiKey(muxTokenId, 'MUX_TOKEN_ID') || !validateApiKey(muxTokenSecret, 'MUX_TOKEN_SECRET')) {
                throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required and must be valid');
            }
            
            const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
            
            const url = new URL('https://api.mux.com/video/v1/assets');
            if (limit) url.searchParams.append('limit', String(limit));
            if (page) url.searchParams.append('page', String(page));
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            } as any);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                const sanitizedError = sanitizeApiKey(errorText);
                throw new Error(`Mux API error ${response.status}: ${sanitizedError}`);
            }
            
            const data = await response.json() as any;
            const assets = data.data || [];
            
            return {
                success: true,
                count: assets.length,
                assets: assets.map((asset: any) => ({
                    id: asset.id,
                    status: asset.status,
                    duration: asset.duration,
                    max_stored_resolution: asset.max_stored_resolution,
                    created_at: asset.created_at,
                    playback_ids: asset.playback_ids?.map((p: any) => p.id) || [],
                })),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[mux-assets-list] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch Mux assets'
            };
        }
    },
});

/**
 * Mux Video Views Tool - Get detailed view data
 */
export const muxVideoViewsTool = createTool({
    id: "mux-video-views",
    description: "Fetch detailed video view data from Mux. Returns individual viewing sessions with metadata. If no timeframe is provided, defaults to last 24 hours of available data.",
    inputSchema: z.object({
        timeframe: z.union([
            z.array(z.number()).length(2),
            z.array(z.string()).length(2).transform(arr => arr.map(s => {
                const num = parseInt(s, 10);
                return isNaN(num) ? undefined : num;
            }))
        ]).describe("Unix timestamp array [start, end]").optional(),
        filters: z.array(z.string()).describe("Optional filters").optional(),
        limit: z.number().describe("Max number of views to return (default 25)").optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters, limit } = context as { timeframe?: any; filters?: string[]; limit?: number };
        
        try {
            // Parse timeframe if it's a string or contains invalid values
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe && Array.isArray(timeframe) && timeframe.length >= 2) {
                const parseTimestamp = (val: any): number | undefined => {
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        const parsed = parseInt(val, 10);
                        return isNaN(parsed) ? undefined : parsed;
                    }
                    return undefined;
                };
                
                startTime = parseTimestamp(timeframe[0]);
                endTime = parseTimestamp(timeframe[1]);
            }
            
            // Use valid timeframe within Mux API constraints
            const [start, end] = getValidTimeframe(startTime, endTime);
            
            const params: any = {
                timeframe: [start, end],
                limit: limit || 25,
            };
            
            if (filters && filters.length > 0) {
                params.filters = filters;
            }
            
            const viewsData = await muxDataRequest('/video-views', params);
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                views: viewsData.data || [],
                totalViews: viewsData.data?.length || 0,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[mux-video-views] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch video views data'
            };
        }
    },
});

/**
 * Mux Errors Tool - Get error data broken down by dimension
 */
export const muxErrorsTool = createTool({
    id: "mux-errors",
    description: "Fetch error data from Mux broken down by platform, browser, or other dimensions. Returns error counts, percentages, and detailed error information. If no timeframe is provided, defaults to last 24 hours of available data.",
    inputSchema: z.object({
        timeframe: z.union([
            z.array(z.number()).length(2),
            z.array(z.string()).length(2).transform(arr => arr.map(s => {
                const num = parseInt(s, 10);
                return isNaN(num) ? undefined : num;
            }))
        ]).describe("Unix timestamp array [start, end]").optional(),
        filters: z.array(z.string()).describe("Optional filters like 'operating_system:iOS'").optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters } = context as { timeframe?: any; filters?: string[] };
        
        try {
            // Parse timeframe if it's a string or contains invalid values
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe && Array.isArray(timeframe) && timeframe.length >= 2) {
                const parseTimestamp = (val: any): number | undefined => {
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        const parsed = parseInt(val, 10);
                        return isNaN(parsed) ? undefined : parsed;
                    }
                    return undefined;
                };
                
                startTime = parseTimestamp(timeframe[0]);
                endTime = parseTimestamp(timeframe[1]);
            }
            
            // Use valid timeframe within Mux API constraints
            const [start, end] = getValidTimeframe(startTime, endTime);
            
            const params: any = {
                timeframe: [start, end],
            };
            
            if (filters && filters.length > 0) {
                params.filters = filters;
            }
            
            // Fetch error data
            const errorsData = await muxDataRequest('/errors', params);
            
            // Also get breakdown by operating system
            const osBreakdown = await muxDataRequest('/metrics/video_startup_failure_percentage/breakdown', {
                ...params,
                group_by: 'operating_system',
                order_by: 'negative_impact',
                order_direction: 'desc',
                limit: 20
            });
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                errors: errorsData.data || [],
                totalErrors: errorsData.total_row_count || 0,
                platformBreakdown: osBreakdown.data || [],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[mux-errors] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch error data'
            };
        }
    },
});

/**
 * Format analytics data into a concise text summary (under 1000 words)
 */
export function formatAnalyticsSummary(
    metrics: any,
    analysis: { summary: string; issues: string[]; recommendations: string[]; healthScore: number },
    timeRange: { start: string; end: string }
): string {
    const parts: string[] = [];
    
    // Header
    parts.push(`Mux Video Streaming Analytics Report`);
    parts.push(`Time Range: ${new Date(timeRange.start).toLocaleString()} to ${new Date(timeRange.end).toLocaleString()}`);
    parts.push('');
    
    // Health Score
    parts.push(`Overall Health Score: ${analysis.healthScore} out of 100`);
    parts.push(analysis.summary);
    parts.push('');
    
    // Key Metrics
    parts.push('Key Performance Indicators:');
    if (metrics.total_views !== undefined) {
        parts.push(`- Total Views: ${metrics.total_views.toLocaleString()}`);
    }
    if (metrics.total_playing_time_seconds !== undefined) {
        const hours = Math.floor(metrics.total_playing_time_seconds / 3600);
        const minutes = Math.floor((metrics.total_playing_time_seconds % 3600) / 60);
        parts.push(`- Total Watch Time: ${hours}h ${minutes}m`);
    }
    if (metrics.average_startup_time_ms !== undefined) {
        parts.push(`- Average Startup Time: ${(metrics.average_startup_time_ms / 1000).toFixed(2)} seconds`);
    }
    if (metrics.total_rebuffer_percentage !== undefined) {
        parts.push(`- Rebuffering Rate: ${metrics.total_rebuffer_percentage.toFixed(2)}%`);
    }
    if (metrics.total_error_percentage !== undefined) {
        parts.push(`- Error Rate: ${metrics.total_error_percentage.toFixed(2)}%`);
    }
    parts.push('');
    
    // Issues
    if (analysis.issues.length > 0) {
        parts.push('Issues Identified:');
        analysis.issues.forEach((issue, i) => {
            parts.push(`${i + 1}. ${issue}`);
        });
        parts.push('');
    }
    
    // Recommendations
    if (analysis.recommendations.length > 0) {
        parts.push('Engineering Recommendations:');
        analysis.recommendations.forEach((rec, i) => {
            parts.push(`${i + 1}. ${rec}`);
        });
        parts.push('');
    }
    
    // Positive notes
    if (analysis.healthScore >= 90) {
        parts.push('Your streaming infrastructure is performing exceptionally well. Continue monitoring for any changes in traffic patterns or new device types.');
    } else if (analysis.healthScore >= 75) {
        parts.push('Overall performance is good, with some areas for optimization. Address the recommendations above to improve user experience.');
    } else if (analysis.healthScore >= 50) {
        parts.push('Performance needs improvement. Focus on the critical issues first, particularly those affecting playback reliability.');
    } else {
        parts.push('Critical attention required. Multiple performance issues detected that significantly impact user experience. Prioritize immediate remediation.');
    }
    
    const summary = parts.join(' ');
    
    // Ensure under 1000 words
    const wordCount = summary.split(/\s+/).length;
    if (wordCount > 1000) {
        // Truncate to ~900 words to be safe
        const words = summary.split(/\s+/).slice(0, 900);
        return words.join(' ') + '... (Summary truncated to stay under 1000 words)';
    }
    
    return summary;
}

