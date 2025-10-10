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
      if (!origin) return callback(null, true); // allow same-origin/non-browser tools
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Enable credentials for production domains
  }));
  
  // Handle preflight quickly (Express 5 compat with path-to-regexp v6)
  app.options(/.*/, cors());
  app.use(express.json());
  
  // Enhanced health check with MCP status
  app.get('/health', async (_req: any, res: any) => {
    try {
      // Basic health check
      const health: any = { 
        status: 'healthy', 
        service: 'mux-analytics-agent',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        workingDirectory: process.cwd(),
        mcpStatus: 'unknown'
      };
      
      // Test MCP connection if credentials are available
      if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
        try {
          const { muxMcpClient } = await import('./mcp/mux-upload-client.js');
          const tools = await muxMcpClient.getTools();
          health.mcpStatus = 'connected';
          health.mcpTools = Object.keys(tools).length;
        } catch (mcpError: any) {
          health.mcpStatus = 'error';
          health.mcpError = mcpError?.message || String(mcpError);
        }
      } else {
        health.mcpStatus = 'not_configured';
      }
      
      res.json(health);
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        service: 'mux-analytics-agent',
        timestamp: new Date().toISOString(),
        error: error?.message || String(error),
        environment: process.env.NODE_ENV
      });
    }
  });
  
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
  
  // Streaming endpoint for MastraClient compatibility
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
        stream = await agent.streamVNext(messages);
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
          for await (const chunk of stream.textStream) {
            if (chunk && typeof chunk === 'string') {
              chunkCount++;
              res.write(chunk);
              // Flush the buffer to send data immediately
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            }
          }
          console.log(`[streamVNext] Stream completed successfully with ${chunkCount} chunks`);
          res.end();
        } catch (streamError) {
          console.error('[streamVNext] Stream error:', streamError);
          // Don't write error to stream, just end cleanly
          if (!res.writableEnded) {
            res.end();
          }
        }
      } else if (stream && stream.text) {
        res.write(stream.text);
        res.end();
      } else {
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
        stream = await agent.streamVNext(messages);
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
  
  // Start the server
  const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  
  app.listen(PORT, HOST, () => {
    console.log(`Mux Analytics Agent server listening on http://${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Working directory: ${process.cwd()}`);
    console.log(`Agent: Mux Video Streaming Analytics Engineer`);
  });
}