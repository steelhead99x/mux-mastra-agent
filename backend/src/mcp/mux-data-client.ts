/**
 * Mux Data API MCP Client
 * Provides access to Mux analytics, metrics, errors, and video view data via MCP
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Logger utility for consistent logging
 */
class Logger {
    static info(message: string): void {
        console.log(`[INFO] ${message}`);
    }

    static debug(message: string): void {
        console.debug(`[MuxDataMCP] ${message}`);
    }

    static error(message: string, error?: any): void {
        console.error(`[ERROR] ${message}`, error);
    }

    static warn(message: string): void {
        console.warn(`[WARN] ${message}`);
    }
}

/**
 * Mux Data MCP Client
 * Handles connection to Mux MCP server for data/analytics endpoints
 */
export class MuxDataMcpClient {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private connected: boolean = false;
    private tools: Record<string, any> = {};

    /**
     * Parse and validate MCP arguments from environment variable
     */
    private parseMcpArgs(envValue: string | undefined): string[] {
        // Default to data.errors, data.metrics, and data.video_views resources
        const defaultArgs = [
            "@mux/mcp",
            "client=cursor",
            "--tools=dynamic",
            "--resource=data.errors",
            "--resource=data.metrics",
            "--resource=data.video_views"
        ];

        if (!envValue) {
            Logger.debug("Using default MCP args (MUX_MCP_DATA_ARGS not set)");
            return defaultArgs;
        }

        // Parse comma-separated values
        const args = envValue.split(',').map(arg => arg.trim()).filter(Boolean);
        
        if (args.length === 0) {
            Logger.warn("Empty MUX_MCP_DATA_ARGS, using defaults");
            return defaultArgs;
        }

        Logger.debug(`Parsed MCP args: ${JSON.stringify(args)}`);
        return args;
    }

    /**
     * Connect to the Mux MCP server
     */
    async connect(): Promise<void> {
        if (this.connected && this.client) {
            Logger.debug('Already connected to Mux Data MCP server');
            return;
        }

        try {
            const tokenId = process.env.MUX_TOKEN_ID;
            const tokenSecret = process.env.MUX_TOKEN_SECRET;

            if (!tokenId || !tokenSecret) {
                throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required');
            }

            Logger.info('Connecting to Mux Data MCP server...');
            Logger.debug(`MUX_TOKEN_ID: ${tokenId ? '[CONFIGURED]' : '[MISSING]'}`);
            Logger.debug(`MUX_TOKEN_SECRET: ${tokenSecret ? '[CONFIGURED]' : '[MISSING]'}`);

            // Parse MCP arguments
            const mcpArgs = this.parseMcpArgs(process.env.MUX_MCP_DATA_ARGS);
            Logger.debug(`MCP Args: ${mcpArgs.join(' ')}`);

            // Create transport
            Logger.debug('[MuxDataMCP] Creating StdioClientTransport...');
            this.transport = new StdioClientTransport({
                command: 'npx',
                args: mcpArgs,
                env: {
                    ...process.env,
                    MUX_TOKEN_ID: tokenId,
                    MUX_TOKEN_SECRET: tokenSecret,
                },
            });

            // Create client
            Logger.debug('[MuxDataMCP] Creating MCP Client...');
            this.client = new Client({
                name: 'mux-data-analytics',
                version: '1.0.0',
            }, {
                capabilities: {},
            });

            // Connect with timeout
            const timeoutMs = parseInt(process.env.MUX_CONNECTION_TIMEOUT || '45000', 10);
            Logger.debug(`Using connection timeout: ${timeoutMs}ms`);

            Logger.debug(`[MuxDataMCP] Starting connection with timeout: ${timeoutMs}ms`);
            const connectPromise = this.client.connect(this.transport);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`MCP connection timeout after ${timeoutMs}ms`)), timeoutMs)
            );

            Logger.debug('[MuxDataMCP] Waiting for connection...');
            await Promise.race([connectPromise, timeoutPromise]);

            this.connected = true;
            Logger.info('Connected to Mux Data MCP server successfully');

            // List available tools
            const result = await this.client.listTools();
            const toolNames = result.tools?.map((t: any) => t.name) || [];
            Logger.debug(`Available MCP tools: ${JSON.stringify(toolNames)}`);

        } catch (error) {
            Logger.error('Failed to connect to Mux Data MCP server:', error);
            this.cleanup();
            throw error;
        }
    }

    /**
     * Get available tools from the MCP server
     */
    async getTools(): Promise<Record<string, any>> {
        if (!this.connected || !this.client) {
            await this.connect();
        }

        if (Object.keys(this.tools).length > 0) {
            return this.tools;
        }

        try {
            const result = await this.client!.listTools();
            const tools: Record<string, any> = {};

            // Create Mastra tools from MCP tools
            for (const tool of result.tools || []) {
                const mastraTool = this.createMastraTool(tool);
                tools[tool.name] = mastraTool;
            }

            // If MCP exposes invoke_api_endpoint, add convenience wrappers
            if (tools['invoke_api_endpoint']) {
                const addWrapper = (id: string, endpoint: string, description: string) => {
                    tools[id] = createTool({
                        id,
                        description,
                        inputSchema: z.object({
                            METRIC_ID: z.string().optional().describe("Metric ID for the query"),
                            timeframe: z.union([
                                z.string().describe("Relative time expression like 'last 7 days', 'last 24 hours', etc."),
                                z.array(z.number()).length(2).describe("Unix timestamp array [start, end]"),
                                z.array(z.string()).length(2).describe("String timestamp array [start, end]")
                            ]).optional(),
                            filters: z.array(z.string()).optional(),
                            limit: z.number().optional(),
                            group_by: z.string().optional(),
                        }).passthrough(), // Allow additional fields to pass through
                        execute: async ({ context }) => {
                            // Parse timeframe if it's a relative expression
                            let processedContext = { ...context };
                            if (context.timeframe) {
                                if (typeof context.timeframe === 'string') {
                                    // Import the parsing function from mux-analytics.ts
                                    const { parseRelativeTimeframe } = await import('../tools/mux-analytics.js');
                                    const [start, end] = parseRelativeTimeframe(context.timeframe);
                                    // Mux API expects timeframe as array of strings (epoch timestamps as strings)
                                    processedContext.timeframe = [String(start), String(end)];
                                } else if (Array.isArray(context.timeframe) && context.timeframe.length === 2) {
                                    // Convert number array to string array for Mux API
                                    processedContext.timeframe = [
                                        String(context.timeframe[0]),
                                        String(context.timeframe[1])
                                    ];
                                }
                            }
                            
                            return await tools['invoke_api_endpoint'].execute({
                                context: {
                                    endpoint_name: endpoint,
                                    args: processedContext,
                                },
                            });
                        },
                    });
                };

                // Add convenience wrappers for common data endpoints
                addWrapper('list_errors', 'list_data_errors', 'List all errors from Mux Data API');
                addWrapper('list_breakdown_values', 'list_breakdown_values_data_metrics', 'Get metric breakdown values by dimension');
                addWrapper('get_overall_values', 'get_overall_values_data_metrics', 'Get overall metric values');
            }

            Logger.info(`Successfully created ${Object.keys(tools).length} Mastra tools from Mux Data MCP`);
            this.tools = tools;
            return tools;

        } catch (error) {
            Logger.error('Failed to get tools from Mux Data MCP:', error);
            throw error;
        }
    }

    /**
     * Create a Mastra tool from an MCP tool definition
     */
    private createMastraTool(mcpTool: any): any {
        return createTool({
            id: mcpTool.name,
            description: mcpTool.description || `Mux Data API: ${mcpTool.name}`,
            inputSchema: this.convertInputSchema(mcpTool.inputSchema),
            execute: async ({ context }) => {
                if (!this.client) {
                    throw new Error('MCP client not connected');
                }

                try {
                    const result = await this.client.callTool({
                        name: mcpTool.name,
                        arguments: context || {},
                    });

                    if (result.isError) {
                        const errorContent = result.content as any;
                        throw new Error(errorContent?.[0]?.text || 'Unknown MCP error');
                    }

                    const content = (result.content as any)?.[0];
                    if (content?.type === 'text') {
                        try {
                            return JSON.parse(content.text);
                        } catch {
                            return { result: content.text };
                        }
                    }

                    return result;
                } catch (error) {
                    Logger.error(`Error calling MCP tool ${mcpTool.name}:`, error);
                    throw error;
                }
            },
        });
    }

    /**
     * Convert MCP input schema to Zod schema
     */
    private convertInputSchema(inputSchema: any): z.ZodTypeAny {
        if (!inputSchema || typeof inputSchema !== 'object') {
            return z.object({}).passthrough();
        }

        const properties = inputSchema.properties || {};
        const zodSchema: Record<string, z.ZodTypeAny> = {};

        for (const [key, value] of Object.entries(properties)) {
            const prop = value as any;
            let fieldSchema: z.ZodTypeAny;

            if (prop.type === 'array') {
                fieldSchema = z.array(z.any());
            } else if (prop.type === 'number' || prop.type === 'integer') {
                fieldSchema = z.number();
            } else if (prop.type === 'boolean') {
                fieldSchema = z.boolean();
            } else {
                fieldSchema = z.any();
            }

            if (!inputSchema.required?.includes(key)) {
                fieldSchema = fieldSchema.optional();
            }

            zodSchema[key] = fieldSchema;
        }

        return z.object(zodSchema).passthrough();
    }

    /**
     * Cleanup resources
     */
    private cleanup(): void {
        if (this.client) {
            try {
                this.client.close();
            } catch (error) {
                Logger.warn('Error closing MCP client');
            }
            this.client = null;
        }
        this.transport = null;
        this.connected = false;
        this.tools = {};
    }

    /**
     * Check if the MCP client is connected
     */
    isConnected(): boolean {
        return this.connected && this.client !== null;
    }

    /**
     * Disconnect from the MCP server
     */
    async disconnect(): Promise<void> {
        Logger.info('Disconnecting from Mux Data MCP server');
        this.cleanup();
    }
}

// Export singleton instance
export const muxDataMcpClient = new MuxDataMcpClient();

