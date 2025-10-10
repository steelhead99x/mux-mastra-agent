// Load environment variables before Mastra config
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from the Mastra output directory
config({ path: resolve('.mastra/output/.env') });

/** @type {import('mastra').MastraConfig} */
export default {
  srcDir: './src',
  outDir: './dist',
  entry: './src/index.ts',
  agents: {
    mediaVaultAgent: './src/agents/media-vault-agent.ts',
    muxAnalyticsAgent: './src/agents/mux-analytics-agent.ts'
  },
  tools: {
    muxAnalyticsTool: './src/tools/mux-analytics.ts'
  },
  // Enable playground in development
  playground: process.env.NODE_ENV === 'development',
  // Server configuration
  server: {
    port: process.env.MASTRA_PLAYGROUND_PORT || process.env.BACKEND_PORT || process.env.PORT || 3002,
    host: process.env.HOST || '0.0.0.0',
    // Enable CORS for development
    cors: process.env.NODE_ENV === 'development' ? {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173'],
      credentials: true
    } : false
  }
};
