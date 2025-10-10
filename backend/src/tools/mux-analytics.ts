import { createTool } from "@mastra/core/tools";
import { z } from "zod";

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

// Mux API valid timeframe constraints
// Based on actual Mux API response: valid timeframe [Jul 2 2025, Oct 10 2025]
const MUX_API_VALID_START = 1751414400; // Jul 2 2025 00:00:00 UTC
const MUX_API_VALID_END = 1760068051;   // Oct 10 2025 03:47:31 UTC (from API response)

/**
 * Get current time as Unix timestamp
 */
export function getCurrentTime(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Parse relative time expressions like "last 7 days", "last 24 hours", etc.
 * Returns [startTime, endTime] as Unix timestamps
 */
export function parseRelativeTimeframe(timeframe: string): [number, number] {
    const now = getCurrentTime();
    const lowerTimeframe = timeframe.toLowerCase().trim();
    
    // Handle "last X days" patterns
    const daysMatch = lowerTimeframe.match(/last\s+(\d+)\s+days?/);
    if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        const startTime = now - (days * 24 * 60 * 60);
        return [startTime, now];
    }
    
    // Handle "last X hours" patterns
    const hoursMatch = lowerTimeframe.match(/last\s+(\d+)\s+hours?/);
    if (hoursMatch) {
        const hours = parseInt(hoursMatch[1], 10);
        const startTime = now - (hours * 60 * 60);
        return [startTime, now];
    }
    
    // Handle "last X minutes" patterns
    const minutesMatch = lowerTimeframe.match(/last\s+(\d+)\s+minutes?/);
    if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1], 10);
        const startTime = now - (minutes * 60);
        return [startTime, now];
    }
    
    // Handle "last X weeks" patterns
    const weeksMatch = lowerTimeframe.match(/last\s+(\d+)\s+weeks?/);
    if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1], 10);
        const startTime = now - (weeks * 7 * 24 * 60 * 60);
        return [startTime, now];
    }
    
    // Handle "last X months" patterns
    const monthsMatch = lowerTimeframe.match(/last\s+(\d+)\s+months?/);
    if (monthsMatch) {
        const months = parseInt(monthsMatch[1], 10);
        // Approximate months as 30 days
        const startTime = now - (months * 30 * 24 * 60 * 60);
        return [startTime, now];
    }
    
    // Default to last 24 hours if no pattern matches
    console.warn(`Could not parse relative timeframe "${timeframe}", defaulting to last 24 hours`);
    return [now - (24 * 60 * 60), now];
}

/**
 * Generate valid timestamps within Mux API constraints
 * If requested timeframe is outside valid range, adjust to valid range
 * Now uses current time as the reference point for relative timeframes
 */
function getValidTimeframe(requestedStart?: number, requestedEnd?: number): [number, number] {
    const now = getCurrentTime();
    
    // Default to last 24 hours from current time
    const defaultEnd = now;
    const defaultStart = now - (24 * 60 * 60);
    
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
 * Mux Analytics Tool - Fetch overall metrics using MCP
 */
export const muxAnalyticsTool = createTool({
    id: "mux-analytics",
    description: "Fetch Mux video streaming analytics and metrics for a specific time range using MCP tools. Returns overall performance data including views, errors, rebuffering, and startup times. Supports relative time expressions like 'last 7 days', 'last 24 hours' or Unix timestamp arrays [start, end]. If no timeframe is provided, defaults to last 24 hours of available data.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end] for the time range to analyze"),
            z.array(z.string()).length(2).transform(arr => arr.map(s => {
                const num = parseInt(s, 10);
                return isNaN(num) ? undefined : num;
            })).describe("String timestamp array [start, end] that will be converted to numbers")
        ]).optional(),
        filters: z.array(z.string()).describe("Optional filters like 'operating_system:iOS' or 'country:US'").optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters } = context as { timeframe?: any; filters?: string[] };
        
        try {
            // Parse timeframe - handle both relative expressions and Unix timestamps
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe) {
                if (typeof timeframe === 'string') {
                    // Handle relative time expressions like "last 7 days", "last 24 hours"
                    [startTime, endTime] = parseRelativeTimeframe(timeframe);
                } else if (Array.isArray(timeframe) && timeframe.length >= 2) {
                    // Handle Unix timestamp arrays
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
            }
            
            // Use valid timeframe within Mux API constraints
            const [start, end] = getValidTimeframe(startTime, endTime);
            
            // Import MCP client dynamically to avoid circular dependencies
            const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
            
            // Connect to MCP if not already connected
            if (!muxDataMcpClient.isConnected()) {
                await muxDataMcpClient.connect();
            }
            
            // Get MCP tools
            const tools = await muxDataMcpClient.getTools();
            
            // Try multiple approaches to get real analytics data
            let metricsData: any = null;
            
            // Approach 1: Try get_overall_values tool
            if (tools['get_overall_values']) {
                try {
                    const params: any = {
                        METRIC_ID: 'video_startup_failure_percentage', // Required parameter for Mux Data API
                        timeframe: [start, end],
                    };
                    
                    if (filters && filters.length > 0) {
                        params.filters = filters;
                    }
                    
                    metricsData = await tools['get_overall_values'].execute({ context: params });
                    console.log('[mux-analytics] Got data via get_overall_values:', metricsData);
                } catch (error) {
                    console.warn('[mux-analytics] get_overall_values failed:', error);
                }
            }
            
            // Approach 2: Try invoke_api_endpoint with different metrics
            if (!metricsData && tools['invoke_api_endpoint']) {
                try {
                    const metricsToTry = [
                        'video_startup_failure_percentage',
                        'video_startup_time',
                        'video_rebuffer_percentage',
                        'video_error_percentage'
                    ];
                    
                    for (const metricId of metricsToTry) {
                        try {
                            const params = {
                                endpoint_name: 'get_overall_values_data_metrics',
                                args: {
                                    METRIC_ID: metricId,
                                    timeframe: [start, end],
                                    ...(filters && filters.length > 0 && { filters })
                                }
                            };
                            
                            metricsData = await tools['invoke_api_endpoint'].execute({ context: params });
                            console.log(`[mux-analytics] Got data via invoke_api_endpoint (${metricId}):`, metricsData);
                            break; // Success, stop trying other metrics
                        } catch (metricError) {
                            console.warn(`[mux-analytics] Metric ${metricId} failed:`, metricError);
                        }
                    }
                } catch (error) {
                    console.warn('[mux-analytics] invoke_api_endpoint approach failed:', error);
                }
            }
            
            // If we still don't have data, return failure instead of mock data
            if (!metricsData || !metricsData.data) {
                throw new Error('Unable to retrieve real analytics data from Mux API. Please check your Mux account has data for the requested timeframe.');
            }
            
            // Analyze the real data
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
                message: 'Failed to fetch Mux analytics data via MCP'
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
 * Mux Video Views Tool - Get detailed view data using MCP
 */
export const muxVideoViewsTool = createTool({
    id: "mux-video-views",
    description: "Fetch detailed video view data from Mux using MCP tools. Returns individual viewing sessions with metadata. Supports relative time expressions like 'last 7 days', 'last 24 hours' or Unix timestamp arrays [start, end]. If no timeframe is provided, defaults to last 24 hours of available data.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end]"),
            z.array(z.string()).length(2).transform(arr => arr.map(s => {
                const num = parseInt(s, 10);
                return isNaN(num) ? undefined : num;
            })).describe("String timestamp array [start, end] that will be converted to numbers")
        ]).optional(),
        filters: z.array(z.string()).describe("Optional filters").optional(),
        limit: z.number().describe("Max number of views to return (default 25)").optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters, limit } = context as { timeframe?: any; filters?: string[]; limit?: number };
        
        try {
            // Parse timeframe - handle both relative expressions and Unix timestamps
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe) {
                if (typeof timeframe === 'string') {
                    // Handle relative time expressions like "last 7 days", "last 24 hours"
                    [startTime, endTime] = parseRelativeTimeframe(timeframe);
                } else if (Array.isArray(timeframe) && timeframe.length >= 2) {
                    // Handle Unix timestamp arrays
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
            }
            
            // Use valid timeframe within Mux API constraints
            const [start, end] = getValidTimeframe(startTime, endTime);
            
            // Import MCP client dynamically to avoid circular dependencies
            const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
            
            // Connect to MCP if not already connected
            if (!muxDataMcpClient.isConnected()) {
                await muxDataMcpClient.connect();
            }
            
            // Get MCP tools
            const tools = await muxDataMcpClient.getTools();
            
            // Try multiple approaches to get video views data
            let viewsData: any = null;
            
            // Approach 1: Look for specific video views tool
            const videoViewsToolName = Object.keys(tools).find(name => 
                name.includes('video') && name.includes('view')
            );
            
            if (videoViewsToolName) {
                try {
                    const params: any = {
                        timeframe: [start, end],
                        limit: limit || 25,
                    };
                    
                    if (filters && filters.length > 0) {
                        params.filters = filters;
                    }
                    
                    viewsData = await tools[videoViewsToolName].execute({ context: params });
                    console.log('[mux-video-views] Got data via video views tool:', viewsData);
                } catch (error) {
                    console.warn('[mux-video-views] Video views tool failed:', error);
                }
            }
            
            // Approach 2: Try invoke_api_endpoint for video views
            if (!viewsData && tools['invoke_api_endpoint']) {
                try {
                    const endpointsToTry = [
                        'list_data_video_views',
                        'get_data_video_views',
                        'list_video_views'
                    ];
                    
                    for (const endpoint of endpointsToTry) {
                        try {
                            const params = {
                                endpoint_name: endpoint,
                                args: {
                                    timeframe: [start, end],
                                    limit: limit || 25,
                                    ...(filters && filters.length > 0 && { filters })
                                }
                            };
                            
                            viewsData = await tools['invoke_api_endpoint'].execute({ context: params });
                            console.log(`[mux-video-views] Got data via invoke_api_endpoint (${endpoint}):`, viewsData);
                            break; // Success, stop trying other endpoints
                        } catch (endpointError) {
                            console.warn(`[mux-video-views] Endpoint ${endpoint} failed:`, endpointError);
                        }
                    }
                } catch (error) {
                    console.warn('[mux-video-views] invoke_api_endpoint approach failed:', error);
                }
            }
            
            // If we still don't have data, return failure instead of mock data
            if (!viewsData) {
                throw new Error('Unable to retrieve video views data from Mux API. Video views endpoint may not be available or your account may not have view data for the requested timeframe.');
            }
            
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
                message: 'Failed to fetch video views data via MCP'
            };
        }
    },
});

/**
 * Mux Errors Tool - Get error data broken down by dimension using MCP
 */
export const muxErrorsTool = createTool({
    id: "mux-errors",
    description: "Fetch error data from Mux broken down by platform, browser, or other dimensions using MCP tools. Returns error counts, percentages, and detailed error information. Supports relative time expressions like 'last 7 days', 'last 24 hours' or Unix timestamp arrays [start, end]. If no timeframe is provided, defaults to last 24 hours of available data.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end]"),
            z.array(z.string()).length(2).transform(arr => arr.map(s => {
                const num = parseInt(s, 10);
                return isNaN(num) ? undefined : num;
            })).describe("String timestamp array [start, end] that will be converted to numbers")
        ]).optional(),
        filters: z.array(z.string()).describe("Optional filters like 'operating_system:iOS'").optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters } = context as { timeframe?: any; filters?: string[] };
        
        try {
            // Parse timeframe - handle both relative expressions and Unix timestamps
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe) {
                if (typeof timeframe === 'string') {
                    // Handle relative time expressions like "last 7 days", "last 24 hours"
                    [startTime, endTime] = parseRelativeTimeframe(timeframe);
                } else if (Array.isArray(timeframe) && timeframe.length >= 2) {
                    // Handle Unix timestamp arrays
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
            }
            
            // Use valid timeframe within Mux API constraints
            const [start, end] = getValidTimeframe(startTime, endTime);
            
            // Import MCP client dynamically to avoid circular dependencies
            const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
            
            // Connect to MCP if not already connected
            if (!muxDataMcpClient.isConnected()) {
                await muxDataMcpClient.connect();
            }
            
            // Get MCP tools
            const tools = await muxDataMcpClient.getTools();
            
            // Try multiple approaches to get error data
            let errorsData: any = null;
            let osBreakdown: any[] = [];
            
            // Approach 1: Try list_errors tool
            if (tools['list_errors']) {
                try {
                    const params: any = {
                        timeframe: [start, end],
                    };
                    
                    if (filters && filters.length > 0) {
                        params.filters = filters;
                    }
                    
                    errorsData = await tools['list_errors'].execute({ context: params });
                    console.log('[mux-errors] Got data via list_errors:', errorsData);
                } catch (error) {
                    console.warn('[mux-errors] list_errors failed:', error);
                }
            }
            
            // Approach 2: Try invoke_api_endpoint for errors
            if (!errorsData && tools['invoke_api_endpoint']) {
                try {
                    const endpointsToTry = [
                        'list_data_errors',
                        'get_data_errors',
                        'list_errors'
                    ];
                    
                    for (const endpoint of endpointsToTry) {
                        try {
                            const params = {
                                endpoint_name: endpoint,
                                args: {
                                    timeframe: [start, end],
                                    ...(filters && filters.length > 0 && { filters })
                                }
                            };
                            
                            errorsData = await tools['invoke_api_endpoint'].execute({ context: params });
                            console.log(`[mux-errors] Got data via invoke_api_endpoint (${endpoint}):`, errorsData);
                            break; // Success, stop trying other endpoints
                        } catch (endpointError) {
                            console.warn(`[mux-errors] Endpoint ${endpoint} failed:`, endpointError);
                        }
                    }
                } catch (error) {
                    console.warn('[mux-errors] invoke_api_endpoint approach failed:', error);
                }
            }
            
            // Try to get platform breakdown if we have error data
            if (errorsData && tools['list_breakdown_values']) {
                try {
                    const breakdownData = await tools['list_breakdown_values'].execute({ 
                        context: {
                            METRIC_ID: 'video_startup_failure_percentage', // Required parameter
                            timeframe: [start, end],
                            group_by: 'operating_system',
                            order_by: 'negative_impact',
                            order_direction: 'desc',
                            limit: 20
                        }
                    });
                    osBreakdown = breakdownData.data || [];
                    console.log('[mux-errors] Got platform breakdown:', osBreakdown);
                } catch (breakdownError) {
                    console.warn('[mux-errors] Could not fetch platform breakdown:', breakdownError);
                }
            }
            
            // If we still don't have data, return failure instead of mock data
            if (!errorsData) {
                throw new Error('Unable to retrieve error data from Mux API. Error endpoints may not be available or your account may not have error data for the requested timeframe.');
            }
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                errors: errorsData.data || [],
                totalErrors: errorsData.total_row_count || 0,
                platformBreakdown: osBreakdown,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[mux-errors] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch error data via MCP'
            };
        }
    },
});

/**
 * Format analytics data into a concise, conversational text summary (under 1000 words)
 * Optimized for natural-sounding text-to-speech output
 */
export function formatAnalyticsSummary(
    metrics: any,
    analysis: { summary: string; issues: string[]; recommendations: string[]; healthScore: number },
    timeRange: { start: string; end: string }
): string {
    const parts: string[] = [];
    
    // Conversational header
    parts.push(`Hello! Here's your Mux Video Streaming Analytics Report.`);
    
    const startDate = new Date(timeRange.start);
    const endDate = new Date(timeRange.end);
    const startReadable = startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endReadable = endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    parts.push(`This report covers the time period from ${startReadable} to ${endReadable}.`);
    parts.push('');
    
    // Health Score - more conversational
    parts.push(`Let's start with your overall health score... which is ${analysis.healthScore} out of 100.`);
    parts.push(analysis.summary);
    parts.push('');
    
    // Key Metrics - conversational style
    parts.push('Now, let me walk you through the key performance indicators.');
    
    if (metrics.total_views !== undefined) {
        parts.push(`First, you had a total of ${metrics.total_views.toLocaleString()} views during this period.`);
    }
    
    if (metrics.total_playing_time_seconds !== undefined) {
        const hours = Math.floor(metrics.total_playing_time_seconds / 3600);
        const minutes = Math.floor((metrics.total_playing_time_seconds % 3600) / 60);
        parts.push(`Your viewers watched for a combined ${hours} hours and ${minutes} minutes.`);
    }
    
    if (metrics.average_startup_time_ms !== undefined) {
        const startupSeconds = (metrics.average_startup_time_ms / 1000).toFixed(1);
        parts.push(`Videos took an average of ${startupSeconds} seconds to start playing.`);
    }
    
    if (metrics.total_rebuffer_percentage !== undefined) {
        const rebufferPct = metrics.total_rebuffer_percentage.toFixed(1);
        if (metrics.total_rebuffer_percentage < 2) {
            parts.push(`Rebuffering was minimal at just ${rebufferPct} percent... that's excellent!`);
        } else if (metrics.total_rebuffer_percentage < 5) {
            parts.push(`The rebuffering rate was ${rebufferPct} percent... which is within acceptable range.`);
        } else {
            parts.push(`The rebuffering rate was ${rebufferPct} percent... which needs attention.`);
        }
    }
    
    if (metrics.total_error_percentage !== undefined) {
        const errorPct = metrics.total_error_percentage.toFixed(1);
        if (metrics.total_error_percentage < 1) {
            parts.push(`Error rate was excellent at just ${errorPct} percent.`);
        } else if (metrics.total_error_percentage < 3) {
            parts.push(`Error rate was ${errorPct} percent... that's acceptable but could be improved.`);
        } else {
            parts.push(`Error rate was ${errorPct} percent... which definitely needs investigation.`);
        }
    }
    parts.push('');
    
    // Issues - more conversational
    if (analysis.issues.length > 0) {
        if (analysis.issues.length === 1) {
            parts.push('I identified one issue that needs your attention.');
        } else {
            parts.push(`I found ${analysis.issues.length} issues that need your attention.`);
        }
        
        analysis.issues.forEach((issue, i) => {
            parts.push(`Issue number ${i + 1}... ${issue}`);
        });
        parts.push('');
    }
    
    // Recommendations - conversational
    if (analysis.recommendations.length > 0) {
        if (analysis.recommendations.length === 1) {
            parts.push('Here is my recommendation to improve performance.');
        } else {
            parts.push(`I have ${analysis.recommendations.length} recommendations to improve your streaming performance.`);
        }
        
        analysis.recommendations.forEach((rec, i) => {
            parts.push(`Recommendation ${i + 1}... ${rec}`);
        });
        parts.push('');
    }
    
    // Closing summary - conversational tone
    if (analysis.healthScore >= 90) {
        parts.push('Overall... your streaming infrastructure is performing exceptionally well! Keep up the great work and continue monitoring for any changes in traffic patterns or new device types.');
    } else if (analysis.healthScore >= 75) {
        parts.push('Overall... your performance is good, with just some areas for optimization. I recommend addressing the items above to improve your user experience.');
    } else if (analysis.healthScore >= 50) {
        parts.push('Overall... your performance needs some improvement. I suggest focusing on the critical issues first, particularly those affecting playback reliability.');
    } else {
        parts.push('I need to be honest with you... this requires critical attention. Multiple performance issues were detected that are significantly impacting user experience. Please prioritize immediate remediation of these issues.');
    }
    
    parts.push('');
    parts.push('That concludes your analytics report. Thank you for listening!');
    
    const summary = parts.join('\n');
    
    // Ensure under 1000 words
    const wordCount = summary.split(/\s+/).length;
    if (wordCount > 1000) {
        // Truncate to ~950 words to be safe
        const words = summary.split(/\s+/).slice(0, 950);
        return words.join(' ') + '... This summary has been truncated to stay under one thousand words. Thank you for listening.';
    }
    
    return summary;
}

