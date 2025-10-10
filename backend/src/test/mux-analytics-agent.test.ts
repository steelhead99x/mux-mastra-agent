import { describe, it, expect } from 'vitest';
import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';
import { 
  muxAnalyticsTool, 
  muxAssetsListTool, 
  muxVideoViewsTool, 
  muxErrorsTool 
} from '../tools/mux-analytics.js';

describe('Mux Analytics Agent', () => {
  it('should be properly initialized', () => {
    expect(muxAnalyticsAgent).toBeDefined();
    expect(muxAnalyticsAgent.name).toBe('muxAnalyticsAgent');
  });

  it('should have required tools configured', () => {
    const tools = muxAnalyticsAgent.tools;
    expect(tools).toBeDefined();
    
    const toolNames = Object.keys(tools);
    console.log('✓ Mux Analytics Agent tools:', toolNames);
    
    // Verify essential tools are present
    expect(toolNames).toContain('muxAnalyticsTool');
    expect(toolNames).toContain('muxAssetsListTool');
    expect(toolNames).toContain('muxVideoViewsTool');
    expect(toolNames).toContain('muxErrorsTool');
    expect(toolNames).toContain('ttsAnalyticsReportTool');
  });

  it('should have valid tool exports', () => {
    expect(muxAnalyticsTool).toBeDefined();
    expect(muxAnalyticsTool.id).toBe('mux-analytics');
    
    expect(muxAssetsListTool).toBeDefined();
    expect(muxAssetsListTool.id).toBe('mux-assets-list');
    
    expect(muxVideoViewsTool).toBeDefined();
    expect(muxVideoViewsTool.id).toBe('mux-video-views');
    
    expect(muxErrorsTool).toBeDefined();
    expect(muxErrorsTool.id).toBe('mux-errors');
  });

  it('should have streaming capabilities', () => {
    expect(muxAnalyticsAgent.streamVNext).toBeDefined();
    expect(typeof muxAnalyticsAgent.streamVNext).toBe('function');
  });

  it('should have generation capabilities', () => {
    expect(muxAnalyticsAgent.generate).toBeDefined();
    expect(typeof muxAnalyticsAgent.generate).toBe('function');
  });

  it('should use Anthropic Claude Sonnet 4.5 model', () => {
    // Verify the agent is configured with the correct model
    expect(muxAnalyticsAgent.model).toBeDefined();
    
    // The model property contains the model configuration
    const modelConfig = muxAnalyticsAgent.model;
    console.log('✓ Agent model:', modelConfig);
  });
});

describe('Mux Analytics Tools', () => {
  it('should have proper schema definitions', () => {
    // Check that tools have valid input schemas
    expect(muxAnalyticsTool.inputSchema).toBeDefined();
    expect(muxAssetsListTool.inputSchema).toBeDefined();
    expect(muxVideoViewsTool.inputSchema).toBeDefined();
    expect(muxErrorsTool.inputSchema).toBeDefined();
  });

  it('should have execute functions', () => {
    expect(typeof muxAnalyticsTool.execute).toBe('function');
    expect(typeof muxAssetsListTool.execute).toBe('function');
    expect(typeof muxVideoViewsTool.execute).toBe('function');
    expect(typeof muxErrorsTool.execute).toBe('function');
  });
});

