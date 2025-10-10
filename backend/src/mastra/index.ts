import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js'
import { muxAnalyticsTool, muxAssetsListTool, muxVideoViewsTool, muxErrorsTool } from '../tools/mux-analytics.js'

export { default as mastra } from '../index.js'

// Export with consistent naming: agent ID 'mux-analytics' matches the new agent
export const agents = { 
  'mux-analytics': muxAnalyticsAgent,
  // Legacy support: also export as 'video professional streaming media at paramount plus' for backwards compatibility
  'video professional streaming media at paramount plus': muxAnalyticsAgent
}
export const tools = { 
  muxAnalyticsTool,
  muxAssetsListTool,
  muxVideoViewsTool,
  muxErrorsTool
}

// MCP Servers configuration (empty for now)
export const mcpServers = {}

export default { agents, tools, mcpServers }
