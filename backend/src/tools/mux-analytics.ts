import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { basename } from "path";

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

/**
 * Get current time as Unix timestamp
 */
export function getCurrentTime(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Convert timeframe numbers to string array format expected by Mux API
 * Mux API expects timeframe as array of strings (epoch timestamps as strings)
 */
function formatTimeframeForMuxApi(start: number, end: number): string[] {
    return [String(start), String(end)];
}

/**
 * Safely call MCP invoke_api_endpoint with error handling for schema validation issues
 * Handles the "union is not a function" error that can occur in GCP/deployed environments
 */
async function safeInvokeApiEndpoint(
    tool: any,
    endpointName: string,
    args: any,
    context: string = 'unknown'
): Promise<any> {
    try {
        return await tool.execute({
            context: {
                endpoint_name: endpointName,
                args: args
            }
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Check for schema validation errors that occur in deployed environments
        if (errorMsg.includes('union is not a function') || 
            errorMsg.includes('Invalid arguments') ||
            errorMsg.includes('evaluatedProperties')) {
            const sanitizedError = sanitizeApiKey(errorMsg);
            console.warn(`[${context}] Schema validation error for endpoint ${endpointName}, this may be an MCP SDK issue:`, sanitizedError);
            throw new Error(`Schema validation failed for endpoint ${endpointName}. This may be due to an MCP SDK version mismatch in the deployed environment.`);
        }
        throw error;
    }
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
        console.log(`[parseRelativeTimeframe] Parsed "last ${days} days": ${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
        return [startTime, now];
    }
    
    // Handle "last X hours" patterns
    const hoursMatch = lowerTimeframe.match(/last\s+(\d+)\s+hours?/);
    if (hoursMatch) {
        const hours = parseInt(hoursMatch[1], 10);
        const startTime = now - (hours * 60 * 60);
        console.log(`[parseRelativeTimeframe] Parsed "last ${hours} hours": ${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
        return [startTime, now];
    }
    
    // Handle "last X minutes" patterns
    const minutesMatch = lowerTimeframe.match(/last\s+(\d+)\s+minutes?/);
    if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1], 10);
        const startTime = now - (minutes * 60);
        console.log(`[parseRelativeTimeframe] Parsed "last ${minutes} minutes": ${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
        return [startTime, now];
    }
    
    // Handle "last X weeks" patterns
    const weeksMatch = lowerTimeframe.match(/last\s+(\d+)\s+weeks?/);
    if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1], 10);
        const startTime = now - (weeks * 7 * 24 * 60 * 60);
        console.log(`[parseRelativeTimeframe] Parsed "last ${weeks} weeks": ${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
        return [startTime, now];
    }
    
    // Handle "last X months" patterns
    const monthsMatch = lowerTimeframe.match(/last\s+(\d+)\s+months?/);
    if (monthsMatch) {
        const months = parseInt(monthsMatch[1], 10);
        // Approximate months as 30 days
        const startTime = now - (months * 30 * 24 * 60 * 60);
        console.log(`[parseRelativeTimeframe] Parsed "last ${months} months": ${new Date(startTime * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
        return [startTime, now];
    }
    
    // Default to last 24 hours if no pattern matches
    console.warn(`Could not parse relative timeframe "${timeframe}", defaulting to last 24 hours`);
    const startTime = now - (24 * 60 * 60);
    return [startTime, now];
}

/**
 * Generate valid timestamps for Mux API queries
 * Uses current time as the reference point for relative timeframes
 * Let the Mux API handle validation - only apply basic sanity checks
 */
function getValidTimeframe(requestedStart?: number, requestedEnd?: number): [number, number] {
    const now = getCurrentTime();
    
    // Default to last 24 hours from current time
    const defaultEnd = now;
    const defaultStart = now - (24 * 60 * 60);
    
    let start = requestedStart || defaultStart;
    let end = requestedEnd || defaultEnd;
    
    // Only apply basic sanity checks - let Mux API handle specific date range validation
    // Ensure start is before end
    if (start >= end) {
        console.warn(`[getValidTimeframe] Start time (${start}) is after end time (${end}), adjusting to 24 hours before end`);
        start = end - (24 * 60 * 60); // 24 hours before end
    }
    
    // Ensure minimum timeframe of 1 hour
    const minTimeframe = 60 * 60; // 1 hour in seconds
    if (end - start < minTimeframe) {
        console.warn(`[getValidTimeframe] Timeframe too short (${end - start}s), adjusting to 1 hour minimum`);
        start = end - minTimeframe;
    }
    
    // Ensure timestamps are not in the future
    if (end > now) {
        console.warn(`[getValidTimeframe] End time is in the future, adjusting to current time`);
        end = now;
    }
    if (start > now) {
        console.warn(`[getValidTimeframe] Start time is in the future, adjusting to 24 hours ago`);
        start = now - (24 * 60 * 60);
    }
    
    console.log(`[getValidTimeframe] Final timeframe: ${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}`);
    
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
    
    // Check playback failure percentage
    if (data.playback_failure_percentage > 5) {
        issues.push(`High playback failure percentage: ${data.playback_failure_percentage.toFixed(2)}%`);
        recommendations.push('Critical: Investigate player configuration, DRM settings, and network delivery issues immediately.');
        healthScore -= 30;
    } else if (data.playback_failure_percentage > 2) {
        issues.push(`Elevated playback failure percentage: ${data.playback_failure_percentage.toFixed(2)}%`);
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
 * Fetch streaming performance metrics (HLS/DASH specific)
 */
export const muxStreamingPerformanceTool = createTool({
    id: "mux-streaming-performance",
    description: "Fetch HLS/DASH streaming performance metrics including video startup time, rebuffering, bitrate adaptation, and segment delivery. Returns real data from Mux for streaming quality analysis.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end]")
        ]).optional(),
        filters: z.array(z.string()).optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe, filters } = context as { timeframe?: any; filters?: string[] };
        
        try {
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe) {
                if (typeof timeframe === 'string') {
                    [startTime, endTime] = parseRelativeTimeframe(timeframe);
                } else if (Array.isArray(timeframe)) {
                    startTime = timeframe[0];
                    endTime = timeframe[1];
                }
            }
            
            const [start, end] = getValidTimeframe(startTime, endTime);
            const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
            
            if (!muxDataMcpClient.isConnected()) {
                await muxDataMcpClient.connect();
            }
            
            const tools = await muxDataMcpClient.getTools();
            
            // Fetch streaming-specific metrics
            const metricsToFetch = [
                'video_startup_time',
                'rebuffer_percentage',
                'rebuffer_duration',
                'rebuffer_frequency',
                'rebuffer_count'
            ];
            
            const results: any = {};
            
            for (const metricId of metricsToFetch) {
                try {
                    let metricData;
                    if (tools['get_overall_values']) {
                        metricData = await tools['get_overall_values'].execute({
                            context: {
                                METRIC_ID: metricId,
                                timeframe: [start, end],
                                ...(filters && filters.length > 0 && { filters })
                            }
                        });
                    } else if (tools['invoke_api_endpoint']) {
                        metricData = await safeInvokeApiEndpoint(
                            tools['invoke_api_endpoint'],
                            'get_overall_values_data_metrics',
                            {
                                METRIC_ID: metricId,
                                timeframe: formatTimeframeForMuxApi(start, end),
                                ...(filters && filters.length > 0 && { filters })
                            },
                            `streaming-performance-${metricId}`
                        );
                    }
                    
                    if (metricData && metricData.data) {
                        results[metricId] = metricData.data;
                    }
                } catch (error) {
                    console.warn(`[streaming-performance] Failed to fetch ${metricId}:`, error);
                }
            }
            
            if (Object.keys(results).length === 0) {
                throw new Error('Unable to retrieve streaming performance metrics from Mux API');
            }
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                streamingMetrics: results,
                category: 'streaming_performance'
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[streaming-performance] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch streaming performance metrics'
            };
        }
    },
});

/**
 * Fetch CDN and delivery metrics
 */
export const muxCDNMetricsTool = createTool({
    id: "mux-cdn-metrics",
    description: "Fetch CDN performance and content delivery metrics including geographic distribution, ISP performance, and delivery efficiency for HLS/DASH optimization.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end]")
        ]).optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe } = context as { timeframe?: any };
        
        try {
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe) {
                if (typeof timeframe === 'string') {
                    [startTime, endTime] = parseRelativeTimeframe(timeframe);
                } else if (Array.isArray(timeframe)) {
                    startTime = timeframe[0];
                    endTime = timeframe[1];
                }
            }
            
            const [start, end] = getValidTimeframe(startTime, endTime);
            const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
            
            if (!muxDataMcpClient.isConnected()) {
                await muxDataMcpClient.connect();
            }
            
            const tools = await muxDataMcpClient.getTools();
            
            // Fetch CDN-related breakdowns
            const dimensions = ['country', 'asn', 'cdn'];
            const cdnData: any = {};
            
            for (const dimension of dimensions) {
                try {
                    let breakdownData;
                    if (tools['list_breakdown_values']) {
                        breakdownData = await tools['list_breakdown_values'].execute({
                            context: {
                                METRIC_ID: 'video_startup_time',
                                timeframe: [start, end],
                                group_by: dimension,
                                order_by: 'views',
                                order_direction: 'desc',
                                limit: 10
                            }
                        });
                    }
                    
                    if (breakdownData && breakdownData.data) {
                        cdnData[dimension] = breakdownData.data;
                    }
                } catch (error) {
                    console.warn(`[cdn-metrics] Failed to fetch ${dimension} breakdown:`, error);
                }
            }
            
            if (Object.keys(cdnData).length === 0) {
                throw new Error('Unable to retrieve CDN metrics from Mux API');
            }
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                cdnMetrics: cdnData,
                category: 'cdn_optimization'
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[cdn-metrics] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch CDN metrics'
            };
        }
    },
});

/**
 * Fetch user engagement metrics
 */
export const muxEngagementMetricsTool = createTool({
    id: "mux-engagement-metrics",
    description: "Fetch user engagement analytics including watch time, completion rates, quality of experience scores, and viewer behavior patterns.",
    inputSchema: z.object({
        timeframe: z.union([
            z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
            z.array(z.number()).length(2).describe("Unix timestamp array [start, end]")
        ]).optional(),
    }),
    execute: async ({ context }) => {
        let { timeframe } = context as { timeframe?: any };
        
        try {
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (timeframe) {
                if (typeof timeframe === 'string') {
                    [startTime, endTime] = parseRelativeTimeframe(timeframe);
                } else if (Array.isArray(timeframe)) {
                    startTime = timeframe[0];
                    endTime = timeframe[1];
                }
            }
            
            const [start, end] = getValidTimeframe(startTime, endTime);
            const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
            
            if (!muxDataMcpClient.isConnected()) {
                await muxDataMcpClient.connect();
            }
            
            const tools = await muxDataMcpClient.getTools();
            
            // Fetch engagement-specific metrics
            const engagementMetrics = [
                'viewer_experience_score',
                'playback_failure_percentage',
                'exits_before_video_start'
            ];
            
            const results: any = {};
            
            for (const metricId of engagementMetrics) {
                try {
                    let metricData;
                    if (tools['get_overall_values']) {
                        try {
                            metricData = await tools['get_overall_values'].execute({
                                context: {
                                    METRIC_ID: metricId,
                                    timeframe: [start, end]
                                }
                            });
                        } catch (error) {
                            // Fallback to invoke_api_endpoint if get_overall_values fails
                            console.warn(`[engagement-metrics] get_overall_values failed for ${metricId}, trying invoke_api_endpoint:`, error);
                            if (tools['invoke_api_endpoint']) {
                                metricData = await safeInvokeApiEndpoint(
                                    tools['invoke_api_endpoint'],
                                    'get_overall_values_data_metrics',
                                    {
                                        METRIC_ID: metricId,
                                        timeframe: formatTimeframeForMuxApi(start, end)
                                    },
                                    `engagement-metrics-${metricId}`
                                );
                            }
                        }
                    } else if (tools['invoke_api_endpoint']) {
                        metricData = await safeInvokeApiEndpoint(
                            tools['invoke_api_endpoint'],
                            'get_overall_values_data_metrics',
                            {
                                METRIC_ID: metricId,
                                timeframe: formatTimeframeForMuxApi(start, end)
                            },
                            `engagement-metrics-${metricId}`
                        );
                    }
                    
                    if (metricData && metricData.data) {
                        results[metricId] = metricData.data;
                    }
                } catch (error) {
                    console.warn(`[engagement-metrics] Failed to fetch ${metricId}:`, error);
                }
            }
            
            if (Object.keys(results).length === 0) {
                throw new Error('Unable to retrieve engagement metrics from Mux API');
            }
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                engagementMetrics: results,
                category: 'user_engagement'
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[engagement-metrics] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to fetch engagement metrics'
            };
        }
    },
});

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
                        'rebuffer_percentage',
                        'playback_failure_percentage'
                    ];
                    
                    for (const metricId of metricsToTry) {
                        try {
                            const params = {
                                endpoint_name: 'get_overall_values_data_metrics',
                                args: {
                                    METRIC_ID: metricId,
                                    timeframe: formatTimeframeForMuxApi(start, end),
                                    ...(filters && filters.length > 0 && { filters })
                                }
                            };
                            
                            metricsData = await safeInvokeApiEndpoint(
                                tools['invoke_api_endpoint'],
                                'get_overall_values_data_metrics',
                                {
                                    METRIC_ID: metricId,
                                    timeframe: formatTimeframeForMuxApi(start, end),
                                    ...(filters && filters.length > 0 && { filters })
                                },
                                `mux-analytics-${metricId}`
                            );
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
                    // Only use list_data_video_views - retrieve_data_video_views requires VIDEO_VIEW_ID
                    const endpointsToTry = [
                        'list_data_video_views'
                    ];
                    
                    for (const endpoint of endpointsToTry) {
                        try {
                            viewsData = await safeInvokeApiEndpoint(
                                tools['invoke_api_endpoint'],
                                endpoint,
                                {
                                    timeframe: formatTimeframeForMuxApi(start, end),
                                    limit: limit || 25,
                                    ...(filters && filters.length > 0 && { filters })
                                },
                                `mux-video-views-${endpoint}`
                            );
                            console.log(`[mux-video-views] Got data via invoke_api_endpoint (${endpoint}):`, viewsData);
                            break; // Success, stop trying other endpoints
                        } catch (endpointError) {
                            // Check if it's a schema validation error (union is not a function)
                            const errorMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
                            if (errorMsg.includes('union is not a function') || 
                                errorMsg.includes('Invalid arguments') ||
                                errorMsg.includes('Schema validation failed')) {
                                console.warn(`[mux-video-views] Endpoint ${endpoint} schema mismatch, skipping:`, errorMsg);
                                continue; // Skip this endpoint and try next
                            }
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
                        'list_data_errors'
                    ];
                    
                    for (const endpoint of endpointsToTry) {
                        try {
                            errorsData = await safeInvokeApiEndpoint(
                                tools['invoke_api_endpoint'],
                                endpoint,
                                {
                                    timeframe: formatTimeframeForMuxApi(start, end),
                                    ...(filters && filters.length > 0 && { filters })
                                },
                                `mux-errors-${endpoint}`
                            );
                            console.log(`[mux-errors] Got data via invoke_api_endpoint (${endpoint}):`, errorsData);
                            break; // Success, stop trying other endpoints
                        } catch (endpointError) {
                            const errorMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
                            if (errorMsg.includes('Schema validation failed')) {
                                console.warn(`[mux-errors] Endpoint ${endpoint} schema mismatch, skipping:`, errorMsg);
                                continue; // Skip this endpoint and try next
                            }
                            console.warn(`[mux-errors] Endpoint ${endpoint} failed:`, endpointError);
                        }
                    }
                } catch (error) {
                    console.warn('[mux-errors] invoke_api_endpoint approach failed:', error);
                }
            }
            
            // Calculate total errors FIRST - we'll need this for proportional distribution
            let totalErrors = errorsData.total_row_count || 0;
            
            // If total_row_count is null/0 but we have error data, calculate from the counts
            if (!totalErrors && errorsData.data && Array.isArray(errorsData.data) && errorsData.data.length > 0) {
                totalErrors = errorsData.data.reduce((sum: number, error: any) => {
                    return sum + (error.count || 0);
                }, 0);
                console.log(`[mux-errors] Calculated totalErrors from individual counts: ${totalErrors}`);
            }
            
            // Try to get platform breakdown with actual error counts
            // Mux API errors endpoint doesn't include dimension data, so we need to use breakdown metrics
            // We'll try multiple error-related metrics to get actual counts
            if (errorsData && tools['list_breakdown_values']) {
                const metricsToTry = [
                    'playback_failure_percentage',  // Overall playback failures including errors
                    'exits_before_video_start', // Exits that might be error-related
                    'video_startup_failure_percentage' // Startup failures
                ];
                
                for (const metric of metricsToTry) {
                    try {
                        console.log(`[mux-errors] Trying metric: ${metric}`);
                        const breakdownData = await tools['list_breakdown_values'].execute({ 
                            context: {
                                METRIC_ID: metric,
                                timeframe: [start, end],
                                group_by: 'operating_system',
                                order_by: 'value',
                                order_direction: 'desc',
                                limit: 20
                            }
                        });
                        
                        if (breakdownData && breakdownData.data && Array.isArray(breakdownData.data)) {
                            // Check if we got meaningful data (non-zero values)
                            const hasData = breakdownData.data.some((item: any) => (item.value || 0) > 0);
                            
                            if (hasData) {
                                osBreakdown = breakdownData.data.map((platform: any) => {
                                    const errorCount = Math.round(platform.value || 0);
                                    return {
                                        operating_system: platform.field || 'Unknown',
                                        error_count: errorCount,
                                        views: platform.views || 0,
                                        error_percentage: 0, // Will calculate below
                                        negative_impact: platform.negative_impact || 0,
                                        metric_used: metric
                                    };
                                });
                                
                                // Calculate percentages
                                const totalBreakdownErrors = osBreakdown.reduce((sum, p: any) => sum + p.error_count, 0);
                                osBreakdown = osBreakdown.map((p: any) => ({
                                    ...p,
                                    error_percentage: totalBreakdownErrors > 0 ? (p.error_count / totalBreakdownErrors) * 100 : 0
                                }));
                                
                                console.log(`[mux-errors] Got platform breakdown using metric ${metric}:`, osBreakdown);
                                break; // Success, stop trying other metrics
                            } else {
                                console.log(`[mux-errors] Metric ${metric} returned all zeros, trying next...`);
                            }
                        }
                    } catch (metricError) {
                        console.warn(`[mux-errors] Metric ${metric} failed:`, metricError);
                    }
                }
                
                // If no metrics gave us data, distribute errors proportionally based on view counts
                if (osBreakdown.length === 0 || osBreakdown.every((p: any) => p.error_count === 0)) {
                    console.log('[mux-errors] No metric gave error counts, using proportional distribution based on views');
                    
                    try {
                        // Get view breakdown by OS
                        const viewsData = await tools['list_breakdown_values'].execute({
                            context: {
                                METRIC_ID: 'video_startup_time',  // Use a metric that will have data
                                timeframe: [start, end],
                                group_by: 'operating_system',
                                order_by: 'views',
                                order_direction: 'desc',
                                limit: 20
                            }
                        });
                        
                        if (viewsData && viewsData.data && Array.isArray(viewsData.data)) {
                            const totalViews = viewsData.data.reduce((sum: number, p: any) => sum + (p.views || 0), 0);
                            
                            if (totalViews > 0) {
                                // Distribute total errors proportionally by view count
                                osBreakdown = viewsData.data.map((platform: any) => {
                                    const views = platform.views || 0;
                                    const proportionalErrors = Math.round((views / totalViews) * totalErrors);
                                    
                                    return {
                                        operating_system: platform.field || 'Unknown',
                                        error_count: proportionalErrors,
                                        views: views,
                                        error_percentage: totalErrors > 0 ? (proportionalErrors / totalErrors) * 100 : 0,
                                        estimated: true
                                    };
                                });
                                
                                console.log('[mux-errors] Proportional error distribution by views:', osBreakdown);
                            }
                        }
                    } catch (viewsError) {
                        console.warn('[mux-errors] Could not get view breakdown for proportional distribution:', viewsError);
                    }
                }
            }
            
            // If we still don't have data, return failure instead of mock data
            if (!errorsData) {
                throw new Error('Unable to retrieve error data from Mux API. Error endpoints may not be available or your account may not have error data for the requested timeframe.');
            }
            
            // totalErrors already calculated above (before platform breakdown logic)
            
            return {
                success: true,
                timeRange: {
                    start: new Date(start * 1000).toISOString(),
                    end: new Date(end * 1000).toISOString(),
                },
                errors: errorsData.data || [],
                totalErrors,
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
 * Format numbers for natural speech (converts numerals to words where appropriate)
 */
function formatNumberForSpeech(num: number): string {
    // Convert small numbers to words for more natural speech
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    if (num >= 0 && num <= 10) {
        return words[num];
    }
    // For larger numbers, use formatted string with proper separators
    return num.toLocaleString('en-US');
}

/**
 * Format date for natural speech (macOS and cross-platform compatible)
 * Converts dates to spoken format like "January fifteenth, twenty twenty-five"
 */
function formatDateForSpeech(date: Date): string {
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Convert day to ordinal words for natural speech
    const dayOrdinals: { [key: number]: string } = {
        1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
        6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
        11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
        16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth',
        21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third', 24: 'twenty-fourth', 25: 'twenty-fifth',
        26: 'twenty-sixth', 27: 'twenty-seventh', 28: 'twenty-eighth', 29: 'twenty-ninth', 30: 'thirtieth', 31: 'thirty-first'
    };
    
    const dayWord = dayOrdinals[day] || `${day}th`;
    
    // Break year into parts for natural pronunciation (e.g., "twenty twenty-five" instead of "two thousand twenty-five")
    let yearSpeech: string;
    if (year >= 2000 && year < 2010) {
        yearSpeech = `two thousand ${year % 10 === 0 ? '' : formatNumberForSpeech(year % 10)}`.trim();
    } else if (year >= 2010 && year < 2100) {
        const firstPart = Math.floor(year / 100);
        const secondPart = year % 100;
        yearSpeech = `${firstPart === 20 ? 'twenty' : formatNumberForSpeech(firstPart)} ${secondPart < 10 ? 'oh ' : ''}${formatNumberForSpeech(secondPart)}`.trim();
    } else {
        yearSpeech = year.toString();
    }
    
    return `${month} ${dayWord}, ${yearSpeech}`;
}

/**
 * Format time duration for natural speech
 */
function formatDurationForSpeech(hours: number, minutes: number): string {
    const parts: string[] = [];
    
    if (hours > 0) {
        const hourWord = hours === 1 ? 'hour' : 'hours';
        parts.push(`${formatNumberForSpeech(hours)} ${hourWord}`);
    }
    
    if (minutes > 0 || hours === 0) {
        const minuteWord = minutes === 1 ? 'minute' : 'minutes';
        parts.push(`${formatNumberForSpeech(minutes)} ${minuteWord}`);
    }
    
    return parts.join(' and ');
}

/**
 * Format analytics data into a concise, conversational text summary (under 1000 words)
 * Optimized for natural-sounding text-to-speech output with enhanced macOS compatibility
 */
export function formatAnalyticsSummary(
    metrics: any,
    analysis: { summary: string; issues: string[]; recommendations: string[]; healthScore: number },
    timeRange: { start: string; end: string }
): string {
    const parts: string[] = [];
    
    // Conversational header with natural pause
    parts.push(`Mux Video Streaming Analytics Report.`);
    parts.push('');  // Empty line creates natural pause in TTS
    
    const startDate = new Date(timeRange.start);
    const endDate = new Date(timeRange.end);
    const startReadable = formatDateForSpeech(startDate);
    const endReadable = formatDateForSpeech(endDate);
    
    parts.push(`This report covers the period from ${startReadable}, to ${endReadable}.`);
    parts.push('');
    
    // Health Score - more conversational with natural pause
    parts.push(`Overall health score: ${formatNumberForSpeech(analysis.healthScore)} out of 100.`);
    parts.push(analysis.summary);
    parts.push('');
    
    // Key Metrics - conversational style with clearer transitions
    parts.push('Key performance indicators:');
    parts.push('');
    
    if (metrics.total_views !== undefined) {
        const views = metrics.total_views;
        const viewsText = views > 10 ? views.toLocaleString('en-US') : formatNumberForSpeech(views);
        const viewWord = views === 1 ? 'view' : 'views';
        parts.push(`Total ${viewWord}: ${viewsText}.`);
    }
    
    if (metrics.total_playing_time_seconds !== undefined) {
        const hours = Math.floor(metrics.total_playing_time_seconds / 3600);
        const minutes = Math.floor((metrics.total_playing_time_seconds % 3600) / 60);
        const durationText = formatDurationForSpeech(hours, minutes);
        parts.push(`Total watch time: ${durationText}.`);
    }
    
    if (metrics.average_startup_time_ms !== undefined) {
        const startupSeconds = (metrics.average_startup_time_ms / 1000);
        const secondsRounded = startupSeconds.toFixed(1);
        // Pronounce decimal naturally
        const secondsText = secondsRounded.replace('.', ' point ');
        parts.push(`Average startup time: ${secondsText} seconds.`);
    }
    
    if (metrics.total_rebuffer_percentage !== undefined) {
        const rebufferPct = metrics.total_rebuffer_percentage.toFixed(1).replace('.', ' point ');
        if (metrics.total_rebuffer_percentage < 2) {
            parts.push(`Rebuffering: ${rebufferPct} percent (excellent).`);
        } else if (metrics.total_rebuffer_percentage < 5) {
            parts.push(`Rebuffering: ${rebufferPct} percent (acceptable).`);
        } else {
            parts.push(`Rebuffering: ${rebufferPct} percent (needs attention).`);
        }
    }
    
    if (metrics.total_error_percentage !== undefined) {
        const errorPct = metrics.total_error_percentage.toFixed(1).replace('.', ' point ');
        if (metrics.total_error_percentage < 1) {
            parts.push(`Error rate: ${errorPct} percent (excellent).`);
        } else if (metrics.total_error_percentage < 3) {
            parts.push(`Error rate: ${errorPct} percent (acceptable, could improve).`);
        } else {
            parts.push(`Error rate: ${errorPct} percent (investigate).`);
        }
    }
    parts.push('');
    
    // Issues - more conversational with clearer enumeration
    if (analysis.issues.length > 0) {
        parts.push('');  // Natural pause before issues section
        const issueCount = formatNumberForSpeech(analysis.issues.length);
        parts.push(`${issueCount === 'one' ? 'One' : issueCount} issue${analysis.issues.length === 1 ? '' : 's'} identified:`);
        parts.push('');
        
        analysis.issues.forEach((issue, i) => {
            const issueNum = formatNumberForSpeech(i + 1);
            parts.push(`Issue ${issueNum}: ${issue}.`);
        });
        parts.push('');
    }
    
    // Recommendations - conversational with natural flow
    if (analysis.recommendations.length > 0) {
        parts.push('');  // Natural pause before recommendations
        const recCount = formatNumberForSpeech(analysis.recommendations.length);
        parts.push(`${recCount === 'one' ? 'One' : recCount} recommendation${analysis.recommendations.length === 1 ? '' : 's'}:`);
        parts.push('');
        
        analysis.recommendations.forEach((rec, i) => {
            const recNum = formatNumberForSpeech(i + 1);
            parts.push(`Recommendation ${recNum}: ${rec}.`);
        });
        parts.push('');
    }
    
    // Closing summary - conversational tone with natural pauses
    parts.push('');  // Natural pause before conclusion
    if (analysis.healthScore >= 90) {
        parts.push('Overall assessment: excellent performance. Maintain current configuration and monitor.');
    } else if (analysis.healthScore >= 75) {
        parts.push('Overall assessment: good. Address the noted optimizations.');
    } else if (analysis.healthScore >= 50) {
        parts.push('Overall assessment: fair. Prioritize reliability fixes.');
    } else {
        parts.push('Overall assessment: critical. Prioritize remediation immediately.');
    }
    
    parts.push('');
    parts.push('End of report.');
    
    const summary = parts.join('\n');
    
    // Trim to a tighter target for ~1 minute delivery (default ~170 words)
    const targetWords = Number(process.env.SPEECH_TARGET_WORDS || 170);
    const words = summary.split(/\s+/);
    if (words.length <= targetWords) return summary;
    const sliced = words.slice(0, Math.min(200, targetWords + 10)).join(' ');
    const lastPeriod = sliced.lastIndexOf('. ');
    if (lastPeriod > 0 && sliced.length - lastPeriod > 20) {
        return sliced.slice(0, lastPeriod + 1).trim();
    }
    return (sliced.endsWith('.') ? sliced : sliced + '...').trim();
}

/**
 * Mux Chart Generation Tool - Generate visual charts from analytics data
 */
export const muxChartGenerationTool = createTool({
    id: "mux-chart-generation",
    description: "Generate visual charts (line, bar, pie, or multi-line) from Mux analytics data. Returns a URL to the generated chart image. Use this when users ask for charts, graphs, or visualizations of analytics data.",
    inputSchema: z.object({
        chartType: z.enum(['line', 'bar', 'pie', 'multiline']).describe("Type of chart to generate: 'line' for time series, 'bar' for categorical comparisons, 'pie' for distributions, 'multiline' for comparing multiple metrics"),
        data: z.array(z.object({
            label: z.string().describe("Label for the data point (e.g., date, country, platform)"),
            value: z.number().describe("Numeric value for this data point")
        })).describe("Array of data points with labels and values"),
        multilineData: z.array(z.object({
            label: z.string().describe("Dataset label (e.g., 'Error Rate', 'Rebuffering')"),
            data: z.array(z.object({
                label: z.string(),
                value: z.number()
            })).describe("Data points for this dataset"),
            color: z.string().optional().describe("Optional color for this line (hex format)")
        })).optional().describe("For multiline charts: array of datasets to compare"),
        title: z.string().describe("Chart title"),
        xAxisLabel: z.string().optional().describe("X-axis label"),
        yAxisLabel: z.string().optional().describe("Y-axis label"),
    }),
    execute: async ({ context }) => {
        const { chartType, data, multilineData, title, xAxisLabel, yAxisLabel } = context as {
            chartType: 'line' | 'bar' | 'pie' | 'multiline';
            data: Array<{ label: string; value: number }>;
            multilineData?: Array<{ label: string; data: Array<{ label: string; value: number }>; color?: string }>;
            title: string;
            xAxisLabel?: string;
            yAxisLabel?: string;
        };
        
        try {
            const { 
                generateMuxLineChart, 
                generateMuxBarChart, 
                generateMuxPieChart, 
                generateMuxMultiLineChart,
                getChartUrl 
            } = await import('../utils/chartGenerator.js');
            
            let chartPath: string;
            
            switch (chartType) {
                case 'line':
                    if (!data || data.length === 0) {
                        throw new Error('Line chart requires data array with at least one data point');
                    }
                    chartPath = await generateMuxLineChart(data, {
                        title,
                        xAxisLabel: xAxisLabel || 'Time',
                        yAxisLabel: yAxisLabel || 'Value'
                    });
                    break;
                    
                case 'bar':
                    if (!data || data.length === 0) {
                        throw new Error('Bar chart requires data array with at least one data point');
                    }
                    chartPath = await generateMuxBarChart(data, {
                        title,
                        xAxisLabel: xAxisLabel || 'Category',
                        yAxisLabel: yAxisLabel || 'Value'
                    });
                    break;
                    
                case 'pie':
                    if (!data || data.length === 0) {
                        throw new Error('Pie chart requires data array with at least one data point');
                    }
                    chartPath = await generateMuxPieChart(data, {
                        title,
                        xAxisLabel: xAxisLabel,
                        yAxisLabel: yAxisLabel
                    });
                    break;
                    
                case 'multiline':
                    if (!multilineData || multilineData.length === 0) {
                        throw new Error('Multi-line chart requires multilineData array with at least one dataset');
                    }
                    chartPath = await generateMuxMultiLineChart(multilineData, {
                        title,
                        xAxisLabel: xAxisLabel || 'Time',
                        yAxisLabel: yAxisLabel || 'Value'
                    });
                    break;
                    
                default:
                    throw new Error(`Unsupported chart type: ${chartType}`);
            }
            
            const chartUrl = await getChartUrl(chartPath);
            const fileName = basename(chartPath);
            
            console.log(`[mux-chart-generation] ✓ Generated ${chartType} chart: ${chartUrl}`);
            console.log(`[mux-chart-generation] Chart data points: ${data.length}, Title: "${title}"`);
            
            // Return chart URL in a format that's easy for the agent to use
            // CRITICAL: The agent MUST include this chartUrl in its response text using markdown syntax
            return {
                success: true,
                chartUrl,
                chartPath: fileName, // Only return filename, not full path
                chartType,
                title,
                message: `Chart generated successfully. You MUST include this chart in your response using markdown: ## ${title}\n\n![${title}](${chartUrl})\n\n`,
                markdown: `## ${title}\n\n![${title}](${chartUrl})\n\n` // Direct markdown format for agent to use
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const sanitizedError = sanitizeApiKey(errorMessage);
            console.error('[mux-chart-generation] Error:', sanitizedError);
            return {
                success: false,
                error: sanitizedError,
                message: 'Failed to generate chart'
            };
        }
    },
});

