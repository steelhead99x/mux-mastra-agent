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
    weatherTool: './src/tools/weather.ts'
  },
  mcpServers: {
    weatherServer: './src/mcp/weather-server.ts'
  },
  telemetry: './src/mastra/telemetry.ts',
  // Enable playground in development
  playground: process.env.NODE_ENV === 'development',
  // Server configuration
  server: {
    port: process.env.MASTRA_PLAYGROUND_PORT || process.env.BACKEND_PORT || process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    // Enable CORS for development
    cors: process.env.NODE_ENV === 'development' ? {
      origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001'],
      credentials: true
    } : false
  }
};
