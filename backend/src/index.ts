import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Environment loading - try multiple locations
const possibleEnvPaths = [
  resolvePath(process.cwd(), '../.env'),           // Root .env (when running from backend/)
  resolvePath(process.cwd(), '../../.env'),        // Root .env (when running from .mastra/output/)
  resolvePath(process.cwd(), '.env'),              // Local .env
  resolvePath(process.cwd(), '../.env')            // Parent .env
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    console.log('[env] Loading from:', envPath);
    config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('[env] No .env file found. Please copy env.example to .env and configure your variables.');
  console.warn('[env] Relying on system environment variables.');
  config(); // Load from default location
}

import { Mastra } from '@mastra/core';
import express from 'express';
import cors from 'cors';
import { muxAnalyticsAgent } from './agents/mux-analytics-agent.js';
import speechToTextRouter from './routes/speechToText.js';
import { resolve } from 'path';

// Set telemetry flag to suppress warnings when not using Mastra server environment
(globalThis as any).___MASTRA_TELEMETRY___ = true;

// Check if we're running in Mastra playground mode or custom Express mode
const isPlaygroundMode = process.env.MASTRA_PLAYGROUND === 'true' || process.argv.includes('--playground');
const isCustomMode = process.env.MASTRA_CUSTOM === 'true' || process.argv.includes('--custom');

console.log('[Mastra] Mode:', isPlaygroundMode ? 'Playground' : isCustomMode ? 'Custom Express' : 'Auto-detect');

// Create agents configuration
const agentsConfig = { 
  'mux-analytics': muxAnalyticsAgent,
};

const mastra = new Mastra({
  agents: agentsConfig,
}) as any; // Type cast: Mastra's type definition doesn't expose agents property

// Workaround: Mastra constructor doesn't properly initialize agents in some cases
// This ensures agents are always available for the Express server
if (!mastra.agents || Object.keys(mastra.agents).length === 0) {
  console.warn('[Mastra] Agents not initialized by constructor, adding manually...');
  mastra.agents = agentsConfig;
}

console.log('[Mastra] Agents loaded:', Object.keys(mastra.agents || {}).join(', '));

// Always export the mastra instance for playground mode
export default mastra;

// Only start Express server if not in playground mode
if (!isPlaygroundMode) {
  // Custom Express server mode
  console.log('[Mastra] Starting in custom Express server mode...');
  
  const app = express();
  
  // Configure CORS explicitly for dev and prod
  const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:3001,https://stage-ai.streamingportfolio.com,https://ai.streamingportfolio.com,https://stage-farmagent-vc2i4.ondigitalocean.app';
  const allowedOrigins = new Set(corsOrigins.split(',').map(origin => origin.trim()));
  
  app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, Postman, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      // In development, log but allow (for easier debugging)
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[CORS] Unlisted origin: ${origin} - allowing in dev mode`);
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Enable credentials for production domains
  }));
  
  // Handle preflight quickly (Express 5 compat with path-to-regexp v6)
  app.options(/.*/, cors());
  app.use(express.json());
  
  // Add request logging middleware for debugging
  app.use((req: any, _res: any, next: any) => {
    console.log(`[Express] ${req.method} ${req.path}`);
    next();
  });
  
  // Speech-to-text API routes
  app.use('/api', speechToTextRouter);
  
  // Health check handler (reused for both endpoints)
  // Simplified to avoid blocking on MCP imports
  const healthCheckHandler = (_req: any, res: any) => {
    try {
      // Basic health check - respond immediately without async operations
      const health: any = { 
        status: 'healthy', 
        service: 'mux-analytics-agent',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV,
        workingDirectory: process.cwd(),
        mcpStatus: process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET ? 'configured' : 'not_configured',
        agents: Object.keys(mastra.agents || {}).length
      };
      
      // Send response immediately
      res.json(health);
    } catch (error: any) {
      // Ensure we always send a response, even on error
      if (!res.headersSent) {
        res.status(500).json({
          status: 'error',
          service: 'mux-analytics-agent',
          timestamp: new Date().toISOString(),
          error: error?.message || String(error),
          environment: process.env.NODE_ENV
        });
      }
    }
  };
  
  // Enhanced health check with MCP status (available on both endpoints)
  app.get('/health', healthCheckHandler);
  app.get('/api/health', healthCheckHandler);
  
  // MCP Debug endpoint for troubleshooting
  app.get('/debug/mcp', async (_req: any, res: any) => {
    try {
      const { muxMcpClient } = await import('./mcp/mux-upload-client.js');
      const tools = await muxMcpClient.getTools();
      
      res.json({
        tools: Object.keys(tools),
        connected: muxMcpClient.isConnected(),
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Static file serving for development and production
  const staticPaths = [
    { path: '/files', dir: resolve(process.cwd(), 'files') },
    { path: '/public', dir: resolve(process.cwd(), 'src/public') }
  ];
  
  // Add frontend dist serving for production
  const frontendDist = resolve(process.cwd(), '../frontend/dist');
  if (existsSync(frontendDist)) {
    console.log('[static] Found frontend dist at:', frontendDist);
    staticPaths.push({ path: '/', dir: frontendDist });
  }
  
  staticPaths.forEach(({ path, dir }) => {
    if (existsSync(dir)) {
      console.log(`[static] Serving files from: ${dir}`);
      app.use(path, express.static(dir));
    }
  });
  
  // Agent endpoints
  app.get('/api/agents', (_req: any, res: any) => {
    res.json({
      agents: Object.keys(mastra.agents || {}),
      timestamp: new Date().toISOString()
    });
  });
  
  app.get('/api/agents/:agentId', async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      const agent = mastra.agents?.[agentId];
      
      if (!agent) {
        return res.status(404).json({ 
          error: `Agent ${agentId} not found`, 
          availableAgents: Object.keys(mastra.agents || {})
        });
      }
      
      res.json({
        id: agentId,
        name: agent.name || agentId,
        description: agent.description || 'No description available',
        tools: agent.tools ? Object.keys(agent.tools) : [],
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Standard streaming endpoint (primary endpoint for MastraClient)
  app.post('/api/agents/:agentId/stream', async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      const { messages } = req.body;
      
      console.log(`[stream] Received request for agent: ${agentId}`);
      
      const agent = mastra.agents?.[agentId];
      if (!agent) {
        return res.status(404).json({ 
          error: `Agent ${agentId} not found`, 
          availableAgents: Object.keys(mastra.agents || {}),
          requestedAgent: agentId
        });
      }
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }
      
      // Try to get stream before setting response headers
      // Mastra's agent.stream() handles tool calls internally
      let stream;
      try {
        console.log('[stream] Calling agent.stream with', messages.length, 'messages');
        console.log('[stream] Last user message:', messages[messages.length - 1]?.content?.substring(0, 100));
        
        // Use agent.stream - Mastra handles tool calls and waits for them
        stream = await agent.stream(messages);
        
        if (!stream) {
          throw new Error('Agent returned null stream');
        }
        
        // ENHANCED: Log stream structure for debugging
        console.log('[stream] ========== STREAM STRUCTURE ANALYSIS ==========');
        if (stream && typeof stream === 'object') {
          const streamKeys = Object.keys(stream);
          console.log('[stream] Stream object keys:', streamKeys);
          console.log('[stream] Stream object keys count:', streamKeys.length);
          
          const streamInfo: any = {
            hasTextStream: !!stream.textStream,
            hasText: !!stream.text,
            hasToolCallsStream: !!stream.toolCallsStream,
            hasToolResultsStream: !!stream.toolResultsStream,
            hasToolCalls: 'toolCalls' in stream,
            hasToolResults: 'toolResults' in stream,
            hasFullStream: !!stream.fullStream,
            hasStreamData: !!stream.streamData,
            hasStreamText: !!stream.streamText
          };
          console.log('[stream] Stream structure check:', JSON.stringify(streamInfo, null, 2));
          
          // Log actual stream object structure (first level only)
          if (streamKeys.length > 0) {
            const typeMap: Record<string, string> = {};
            streamKeys.forEach(key => {
              const value = (stream as any)[key];
              typeMap[key] = typeof value;
              if (value && typeof value === 'object') {
                if (value[Symbol.asyncIterator]) {
                  typeMap[key] = 'AsyncIterable';
                } else if (value[Symbol.iterator]) {
                  typeMap[key] = 'Iterable';
                } else if (Array.isArray(value)) {
                  typeMap[key] = 'Array';
                } else {
                  typeMap[key] = 'Object';
                }
              }
            });
            console.log('[stream] Stream object types:', JSON.stringify(typeMap, null, 2));
          }
          
          // Check which stream path we'll use
          if (stream.fullStream) {
            console.log('[stream] ✓ Will use fullStream (includes tool calls and text)');
          } else if (stream.textStream) {
            console.log('[stream] ✓ Will use textStream (text only, tool calls separate)');
            if (stream.toolCallsStream) {
              console.log('[stream]   - Has toolCallsStream (will wait for it)');
            }
            if (stream.toolResultsStream) {
              console.log('[stream]   - Has toolResultsStream (will wait for it)');
            }
          } else if (stream.text) {
            console.log('[stream] ✓ Will use text (non-streaming, already complete)');
          } else {
            console.warn('[stream] ⚠ No recognized stream property found!');
          }
        }
        console.log('[stream] ===============================================');
      } catch (agentError) {
        console.error('[stream] Agent execution failed:', agentError);
        // Return error before headers are sent
        return res.status(500).json({
          error: agentError instanceof Error ? agentError.message : String(agentError),
          stack: agentError instanceof Error ? agentError.stack : undefined
        });
      }
      
      // Increase timeout for long-running streams
      req.setTimeout(300000); // 5 minutes
      res.setTimeout(300000); // 5 minutes
      
      // Set up streaming response headers AFTER successful agent call
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      
      // Stream the response back to the client
      // Per Mastra docs: iterate over stream directly to get all events (text-delta, tool-call, etc.)
      // Then use textStream for the final response after tool calls complete
      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        // Direct iteration - Mastra stream is async iterable (latest API)
        console.log('[stream] Using direct stream iteration (latest Mastra API)');
        try {
          let chunkCount = 0;
          let hasWritten = false;
          let toolCallsCount = 0;
          let totalChars = 0;
          
          req.on('close', () => {
            console.log('[stream] Client disconnected');
          });
          
          // Iterate over stream to get all events including text-delta
          for await (const chunk of stream as AsyncIterable<any>) {
            if (res.writableEnded || res.destroyed) {
              console.log('[stream] Response ended, stopping stream');
              break;
            }
            
            // Handle different event types per Mastra docs
            const eventType = chunk?.type || 'unknown';
            console.log(`[stream] Event type: ${eventType}`);
            
            if (eventType === 'text-delta') {
              // Extract text from text-delta events
              const textDelta = chunk?.payload?.textDelta || chunk?.textDelta || chunk?.delta || '';
              if (textDelta && typeof textDelta === 'string' && textDelta.trim().length > 0) {
                chunkCount++;
                totalChars += textDelta.length;
                hasWritten = true;
                if (textDelta.includes('chart') || textDelta.includes('.png') || textDelta.includes('files/charts')) {
                  console.log(`[stream] ✓ Chunk ${chunkCount} contains chart reference:`, textDelta.substring(0, 200));
                }
                try {
                  res.write(textDelta);
                  if (typeof (res as any).flush === 'function') {
                    (res as any).flush();
                  }
                } catch (writeError) {
                  console.error('[stream] Write error:', writeError);
                  break;
                }
              }
            } else if (eventType === 'tool-call') {
              toolCallsCount++;
              const toolName = chunk?.payload?.toolName || chunk?.toolName || 'unknown';
              console.log(`[stream] Tool call ${toolCallsCount}: ${toolName}`);
            } else if (eventType === 'tool-result') {
              const toolName = chunk?.payload?.toolName || chunk?.toolName || 'unknown';
              console.log(`[stream] Tool result: ${toolName}`);
            } else if (eventType === 'finish') {
              console.log(`[stream] Stream finished, reason: ${chunk?.payload?.finishReason || 'unknown'}`);
            }
          }
          
          console.log(`[stream] Direct iteration completed: ${chunkCount} text chunks, ${totalChars} chars, ${toolCallsCount} tool calls, hasWritten: ${hasWritten}`);
          
          if (!res.writableEnded && !res.destroyed) {
            if (!hasWritten) {
              res.write('\n[Response completed]');
            }
            res.end();
          }
        } catch (streamError) {
          console.error('[stream] Direct iteration error:', streamError);
          if (!res.writableEnded && !res.destroyed) {
            try {
              res.write(`\n[Error: ${streamError instanceof Error ? streamError.message : String(streamError)}]`);
            } catch (writeError) {
              console.error('[stream] Failed to write error:', writeError);
            }
            res.end();
          }
        }
      } else if (stream && stream.textStream) {
        // Fallback: Use textStream if direct iteration not available
        console.log('[stream] Using textStream (waits for tool calls, then streams response)');
        try {
          let chunkCount = 0;
          let hasWritten = false;
          let totalChars = 0;
          
          req.on('close', () => {
            console.log('[stream] Client disconnected');
          });
          
          // textStream includes the agent's final response AFTER tool calls complete
          for await (const chunk of stream.textStream) {
            if (res.writableEnded || res.destroyed) {
              console.log('[stream] Response ended, stopping stream');
              break;
            }
            
            if (chunk && typeof chunk === 'string') {
              chunkCount++;
              totalChars += chunk.length;
              if (chunk.trim().length > 0) {
                hasWritten = true;
              }
              if (chunk.includes('chart') || chunk.includes('.png') || chunk.includes('files/charts')) {
                console.log(`[stream] ✓ Chunk ${chunkCount} contains chart reference:`, chunk.substring(0, 200));
              }
              try {
                res.write(chunk);
                if (typeof (res as any).flush === 'function') {
                  (res as any).flush();
                }
              } catch (writeError) {
                console.error('[stream] Write error:', writeError);
                break;
              }
            }
          }
          
          console.log(`[stream] TextStream completed: ${chunkCount} chunks, ${totalChars} chars, hasWritten: ${hasWritten}`);
          
          if (!res.writableEnded && !res.destroyed) {
            if (!hasWritten) {
              res.write('\n[Response completed]');
            }
            res.end();
          }
        } catch (streamError) {
          console.error('[stream] TextStream error:', streamError);
          if (!res.writableEnded && !res.destroyed) {
            try {
              res.write(`\n[Error: ${streamError instanceof Error ? streamError.message : String(streamError)}]`);
            } catch (writeError) {
              console.error('[stream] Failed to write error:', writeError);
            }
            res.end();
          }
        }
      } else if (stream && stream.fullStream) {
        // Use fullStream which includes tool calls and text
        console.log('[stream] Using fullStream (includes tool calls)');
        try {
          let chunkCount = 0;
          let hasWritten = false;
          let toolCallsCount = 0;
          let totalChars = 0;
          
          req.on('close', () => {
            console.log('[stream] Client disconnected');
          });
          
          for await (const chunk of stream.fullStream) {
            if (res.writableEnded || res.destroyed) {
              console.log('[stream] Response ended, stopping stream');
              break;
            }
            
            // Log chunk structure for debugging
            const chunkType = chunk?.type || 'unknown';
            const chunkKeys = chunk ? Object.keys(chunk) : [];
            console.log(`[stream] FullStream chunk type: ${chunkType}, keys: ${chunkKeys.join(', ')}`);
            
            // Handle different chunk types
            if (chunkType === 'tool-call' || chunk?.toolCallId) {
              toolCallsCount++;
              const toolName = chunk.toolName || chunk.toolCallId || chunk?.name || 'unknown';
              console.log(`[stream] Tool call ${toolCallsCount}: ${toolName}`);
            } else if (chunkType === 'tool-result' || chunk?.toolResult) {
              const toolName = chunk.toolName || chunk.toolCallId || chunk?.name || 'unknown';
              console.log(`[stream] Tool result: ${toolName}`);
            } else {
              // Try multiple ways to extract text content
              let content = '';
              
              // Method 1: Direct text properties
              if (typeof chunk === 'string') {
                content = chunk;
              } else if (chunk?.content) {
                content = typeof chunk.content === 'string' ? chunk.content : '';
              } else if (chunk?.text) {
                content = typeof chunk.text === 'string' ? chunk.text : '';
              } else if (chunk?.delta) {
                content = typeof chunk.delta === 'string' ? chunk.delta : '';
              } else if (chunk?.textDelta) {
                content = typeof chunk.textDelta === 'string' ? chunk.textDelta : '';
              } else if (chunk?.payload?.text) {
                content = typeof chunk.payload.text === 'string' ? chunk.payload.text : '';
              } else if (chunk?.payload?.content) {
                content = typeof chunk.payload.content === 'string' ? chunk.payload.content : '';
              }
              
              // Method 2: Check for text-delta or text type
              if (!content && (chunkType === 'text-delta' || chunkType === 'text')) {
                content = chunk?.content || chunk?.text || chunk?.delta || '';
              }
              
              if (content && typeof content === 'string' && content.trim().length > 0) {
                chunkCount++;
                totalChars += content.length;
                hasWritten = true;
                if (content.includes('chart') || content.includes('.png') || content.includes('files/charts')) {
                  console.log(`[stream] ✓ Chunk ${chunkCount} contains chart reference:`, content.substring(0, 200));
                }
                try {
                  res.write(content);
                  if (typeof (res as any).flush === 'function') {
                    (res as any).flush();
                  }
                } catch (writeError) {
                  console.error('[stream] Write error:', writeError);
                  break;
                }
              } else if (chunkType !== 'tool-call' && chunkType !== 'tool-result') {
                // Log unknown chunk structure for debugging
                console.log(`[stream] Unknown chunk structure (type: ${chunkType}):`, JSON.stringify(chunk, null, 2).substring(0, 300));
              }
            }
          }
          
          console.log(`[stream] FullStream completed: ${chunkCount} chunks, ${totalChars} chars, ${toolCallsCount} tool calls, hasWritten: ${hasWritten}`);
          
          if (!res.writableEnded && !res.destroyed) {
            if (!hasWritten) {
              res.write('\n[Response completed]');
            }
            res.end();
          }
        } catch (streamError) {
          console.error('[stream] FullStream error:', streamError);
          if (!res.writableEnded && !res.destroyed) {
            try {
              res.write(`\n[Error: ${streamError instanceof Error ? streamError.message : String(streamError)}]`);
            } catch (writeError) {
              console.error('[stream] Failed to write error:', writeError);
            }
            res.end();
          }
        }
      } else if (stream && stream.textStream) {
        try {
          let chunkCount = 0;
          let hasWritten = false;
          let toolCallsCount = 0;
          
          // Handle client disconnect
          req.on('close', () => {
            console.log('[stream] Client disconnected');
          });
          
          // Start consuming tool streams in background (don't block text stream)
          const toolStreamPromises: Promise<void>[] = [];
          
          // Handle tool calls stream if present
          if (stream.toolCallsStream) {
            console.log('[stream] Stream has toolCallsStream, consuming in background');
            toolStreamPromises.push(
              (async () => {
                try {
                  for await (const toolCall of stream.toolCallsStream) {
                    toolCallsCount++;
                    const toolName = toolCall?.toolName || toolCall?.toolCallId || 'unknown';
                    console.log(`[stream] Tool call ${toolCallsCount}: ${toolName}`, JSON.stringify(toolCall, null, 2).substring(0, 500));
                  }
                } catch (toolCallError) {
                  console.warn('[stream] Error reading tool calls:', toolCallError);
                }
              })()
            );
          }
          
          // Handle tool results stream if present
          if (stream.toolResultsStream) {
            console.log('[stream] Stream has toolResultsStream, consuming in background');
            toolStreamPromises.push(
              (async () => {
                try {
                  for await (const toolResult of stream.toolResultsStream) {
                    const toolName = toolResult?.toolName || toolResult?.toolCallId || 'unknown';
                    console.log(`[stream] Tool result received for: ${toolName}`, JSON.stringify(toolResult, null, 2).substring(0, 500));
                  }
                } catch (toolResultError) {
                  console.warn('[stream] Error reading tool results:', toolResultError);
                }
              })()
            );
          }
          
          // CRITICAL: Wait for tool calls to complete BEFORE consuming textStream
          // This ensures tool calls execute and their results are included in the response
          if (toolStreamPromises.length > 0) {
            console.log(`[stream] Waiting for ${toolStreamPromises.length} tool stream(s) to complete before text stream...`);
            await Promise.all(toolStreamPromises);
            console.log(`[stream] Tool streams completed, now consuming text stream`);
          }
          
          // Consume text stream (main stream that writes to response)
          // This will include the agent's response AFTER tool calls complete
          let totalChars = 0;
          for await (const chunk of stream.textStream) {
            // Check if response is still writable
            if (res.writableEnded || res.destroyed) {
              console.log('[stream] Response ended, stopping stream');
              break;
            }
            
            if (chunk && typeof chunk === 'string') {
              chunkCount++;
              totalChars += chunk.length;
              // Track if we've written non-whitespace content
              if (chunk.trim().length > 0) {
                hasWritten = true;
              }
              // Log chunks that might contain chart URLs
              if (chunk.includes('chart') || chunk.includes('.png') || chunk.includes('files/charts')) {
                console.log(`[stream] Chunk ${chunkCount} contains chart reference:`, chunk.substring(0, 200));
              }
              try {
                res.write(chunk);
                // Flush the buffer to send data immediately
                if (typeof (res as any).flush === 'function') {
                  (res as any).flush();
                }
              } catch (writeError) {
                console.error('[stream] Write error:', writeError);
                break;
              }
            }
          }
          
          console.log(`[stream] Stream completed successfully with ${chunkCount} chunks, ${totalChars} total chars, ${toolCallsCount} tool calls, hasWritten: ${hasWritten}`);
          
          // Only end if we haven't already
          if (!res.writableEnded && !res.destroyed) {
            if (!hasWritten) {
              // Send a placeholder if nothing was written
              res.write('\n[Response completed]');
            }
            res.end();
          }
        } catch (streamError) {
          console.error('[stream] Stream error:', streamError);
          // Try to send error message if possible
          if (!res.writableEnded && !res.destroyed) {
            try {
              res.write(`\n[Error: ${streamError instanceof Error ? streamError.message : String(streamError)}]`);
            } catch (writeError) {
              console.error('[stream] Failed to write error:', writeError);
            }
            res.end();
          }
        }
      } else if (stream && stream.text) {
        res.write(stream.text);
        res.end();
      } else {
        console.warn('[stream] No stream content available, stream object:', stream ? Object.keys(stream) : 'null');
        res.write('No content available');
        res.end();
      }
    } catch (error: any) {
      console.error('[stream] Error:', error);
      // If headers already sent, can't send JSON - just end the response
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.end();
        }
      } else {
        res.status(500).json({
          error: error?.message || String(error),
          timestamp: new Date().toISOString()
        });
      }
    }
  });
  
  // Streaming endpoint for MastraClient compatibility (alternative name)
  app.post('/api/agents/:agentId/streamVNext', async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      const { messages } = req.body;
      
      console.log(`[streamVNext] Received request for agent: ${agentId}`);
      
      const agent = mastra.agents?.[agentId];
      if (!agent) {
        return res.status(404).json({ 
          error: `Agent ${agentId} not found`, 
          availableAgents: Object.keys(mastra.agents || {}),
          requestedAgent: agentId
        });
      }
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }
      
      // Try to get stream before setting response headers
      let stream;
      try {
        console.log('[streamVNext] Calling agent.stream with', messages.length, 'messages');
        stream = await agent.stream(messages);
        console.log('[streamVNext] Got stream object, keys:', stream ? Object.keys(stream) : 'null');
        if (!stream) {
          throw new Error('Agent returned null stream');
        }
        if (!stream.textStream && !stream.text) {
          console.warn('[streamVNext] Stream has no textStream or text property');
        }
      } catch (agentError) {
        console.error('[streamVNext] Agent execution failed:', agentError);
        // Return error before headers are sent
        return res.status(500).json({
          error: agentError instanceof Error ? agentError.message : String(agentError),
          stack: agentError instanceof Error ? agentError.stack : undefined
        });
      }
      
      // Increase timeout for long-running streams
      req.setTimeout(300000); // 5 minutes
      res.setTimeout(300000); // 5 minutes
      
      // Set up streaming response headers AFTER successful agent call
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      
      // Stream the response back to the client
      if (stream && stream.textStream) {
        try {
          let chunkCount = 0;
          let hasWritten = false;
          
          // Handle client disconnect
          req.on('close', () => {
            console.log('[streamVNext] Client disconnected');
          });
          
          for await (const chunk of stream.textStream) {
            // Check if response is still writable
            if (res.writableEnded || res.destroyed) {
              console.log('[streamVNext] Response ended, stopping stream');
              break;
            }
            
            if (chunk && typeof chunk === 'string') {
              chunkCount++;
              // Track if we've written non-whitespace content
              if (chunk.trim().length > 0) {
                hasWritten = true;
              }
              try {
                res.write(chunk);
                // Flush the buffer to send data immediately
                if (typeof (res as any).flush === 'function') {
                  (res as any).flush();
                }
              } catch (writeError) {
                console.error('[streamVNext] Write error:', writeError);
                break;
              }
            }
          }
          
          console.log(`[streamVNext] Stream completed successfully with ${chunkCount} chunks, hasWritten: ${hasWritten}`);
          
          // Only end if we haven't already
          if (!res.writableEnded && !res.destroyed) {
            if (!hasWritten) {
              // Send a placeholder if nothing was written
              res.write('\n[Response completed]');
            }
            res.end();
          }
        } catch (streamError) {
          console.error('[streamVNext] Stream error:', streamError);
          // Try to send error message if possible
          if (!res.writableEnded && !res.destroyed) {
            try {
              res.write(`\n[Error: ${streamError instanceof Error ? streamError.message : String(streamError)}]`);
            } catch (writeError) {
              console.error('[streamVNext] Failed to write error:', writeError);
            }
            res.end();
          }
        }
      } else if (stream && stream.text) {
        res.write(stream.text);
        res.end();
      } else {
        console.warn('[streamVNext] No stream content available, stream object:', stream ? Object.keys(stream) : 'null');
        res.write('No content available');
        res.end();
      }
    } catch (error: any) {
      console.error('[streamVNext] Error:', error);
      // If headers already sent, can't send JSON - just end the response
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.end();
        }
      } else {
        res.status(500).json({
          error: error?.message || String(error),
          timestamp: new Date().toISOString()
        });
      }
    }
  });
  
  // Alternative streaming endpoint
  app.post('/api/agents/:agentId/stream/vnext', async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      const { messages } = req.body;
      
      console.log(`[streamVNext] Received request for agent: ${agentId}`);
      console.log(`[streamVNext] Messages:`, messages);
      
      const agent = mastra.agents[agentId];
      if (!agent) {
        return res.status(404).json({ error: `Agent ${agentId} not found` });
      }
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }
      
      let stream;
      try {
        stream = await agent.stream(messages);
      } catch (agentError) {
        console.error('[streamVNext] Agent execution failed:', agentError);
        res.writeHead(500, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.write(`[Error: ${agentError instanceof Error ? agentError.message : String(agentError)}]`);
        res.end();
        return;
      }
  
      // Increase timeout for long-running streams
      req.setTimeout(300000); // 5 minutes
      res.setTimeout(300000); // 5 minutes
      
      // Handle the streaming response properly
      if (stream && stream.textStream) {
        // This is a proper streaming response
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
  
        let chunkCount = 0;
        let totalContent = '';
        try {
          for await (const chunk of stream.textStream) {
            if (chunk && typeof chunk === 'string') {
              chunkCount++;
              totalContent += chunk;
              res.write(chunk);
              // Flush the buffer to send data immediately
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            }
          }
          console.log(`[streamVNext] Stream completed with ${chunkCount} chunks, total length: ${totalContent.length}`);
        } catch (streamError) {
          console.error('[streamVNext] Stream error:', streamError);
          // Don't write error to stream after it's already failing
        }
  
        if (!res.writableEnded) {
          res.end();
        }
      } else if (stream.fullStream) {
        // Handle fullStream format
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
  
        let chunkCount = 0;
        let totalContent = '';
        try {
          for await (const chunk of stream.fullStream) {
            if (chunk && chunk.content && typeof chunk.content === 'string') {
              chunkCount++;
              totalContent += chunk.content;
              res.write(chunk.content);
            }
          }
          console.log(`[streamVNext] FullStream completed with ${chunkCount} chunks, total length: ${totalContent.length}`);
        } catch (streamError) {
          console.error('[streamVNext] FullStream error:', streamError);
          res.write(`\n\n[Error: ${streamError instanceof Error ? streamError.message : String(streamError)}]`);
        }
  
        res.end();
      } else if (stream && stream.text) {
        // Handle non-streaming response
        const textContent = typeof stream.text === 'function' ? await stream.text() : stream.text;
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.write(textContent);
        res.end();
      } else {
        // No content available
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.write('No content available');
        res.end();
      }
    } catch (error: any) {
      console.error('[streamVNext] Error:', error);
      res.status(500).json({
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Non-streaming endpoint for compatibility
  app.post('/api/agents/:agentId/generate', async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      const { messages } = req.body;
      
      const agent = mastra.agents[agentId];
      if (!agent) {
        return res.status(404).json({ error: `Agent ${agentId} not found` });
      }
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }
      
      const result = await agent.generate(messages);
      
      res.json({
        content: result.text,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[generate] Error:', error);
      res.status(500).json({
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Add error handling middleware at the end (after all routes)
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[Express] Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });
  
  // Start the server
  const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  
  const server = app.listen(PORT, HOST, () => {
    console.log(`Mux Analytics Agent server listening on http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Working directory: ${process.cwd()}`);
    console.log(`Agent: Mux Video Streaming Analytics Engineer`);
  });
  
  // Handle server errors
  server.on('error', (err: any) => {
    console.error('[Server] Error:', err);
  });
  
  // Keep process alive
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('[Server] Closed');
    });
  });
}