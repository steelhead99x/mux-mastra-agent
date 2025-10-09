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
  telemetry: './src/mastra/telemetry.ts'
};
