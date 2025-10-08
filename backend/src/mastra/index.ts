import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js'
import { muxAnalyticsTool, muxAssetsListTool, muxVideoViewsTool, muxErrorsTool } from '../tools/mux-analytics.js'

export { default as mastra } from '../index.js'

// Export with consistent naming: agent ID 'mux-analytics' matches the new agent
export const agents = { 
  'mux-analytics': muxAnalyticsAgent,
  // Legacy support: also export as 'weather' for backwards compatibility
  weather: muxAnalyticsAgent
}
export const tools = { 
  muxAnalyticsTool,
  muxAssetsListTool,
  muxVideoViewsTool,
  muxErrorsTool
}

// Minimal telemetry configuration for Mastra dev playground
export const telemetry = {
  enabled: true,
  serviceName: 'weather-agent',
  sampling: {
    type: 'always_on' as const
  }
}

// MCP Servers configuration (empty for now)
export const mcpServers = {}

export default { agents, tools, mcpServers, telemetry }
