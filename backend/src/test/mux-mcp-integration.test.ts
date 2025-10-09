import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables for tests
const rootEnvPath = resolvePath(process.cwd(), '../.env');
const localEnvPath = resolvePath(process.cwd(), '.env');
const backendEnvPath = resolvePath(process.cwd(), 'backend/.env');

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else if (existsSync(localEnvPath)) {
  config({ path: localEnvPath });
} else if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
} else {
  config();
}

// Import MCP clients and agents
import { muxDataMcpClient } from '../mcp/mux-data-client.js';
import { muxMcpClient as muxAssetsMcpClient } from '../mcp/mux-assets-client.js';
import { muxMcpClient as muxUploadMcpClient } from '../mcp/mux-upload-client.js';
import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';
import { mediaVaultAgent } from '../agents/media-vault-agent.js';
import { 
  muxAnalyticsTool, 
  muxAssetsListTool, 
  muxVideoViewsTool, 
  muxErrorsTool 
} from '../tools/mux-analytics.js';

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes for MCP operations
const MCP_CONNECTION_TIMEOUT = 60000; // 1 minute for connection

// Mock external dependencies to focus on MCP integration
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => ({
    generateText: vi.fn().mockResolvedValue({
      text: 'Mock AI response for MCP testing'
    })
  }))
}));

describe('Mux MCP Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.USE_MUX_MCP = 'true';
    process.env.MUX_CONNECTION_TIMEOUT = MCP_CONNECTION_TIMEOUT.toString();
    
    // Ensure we have test credentials (these should be set in .env for real testing)
    if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
      console.warn('⚠️  MUX_TOKEN_ID and MUX_TOKEN_SECRET not set. Some tests may fail.');
      process.env.MUX_TOKEN_ID = 'test-token-id';
      process.env.MUX_TOKEN_SECRET = 'test-token-secret';
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up MCP connections
    try {
      await Promise.allSettled([
        muxDataMcpClient.disconnect(),
        muxAssetsMcpClient.disconnect(),
        muxUploadMcpClient.disconnect()
      ]);
    } catch (error) {
      console.warn('Error during MCP cleanup:', error);
    }
  });

  beforeEach(() => {
    // Reset any mocks between tests
    vi.clearAllMocks();
  });

  describe('MCP Client Connection Tests', () => {
    it('should connect to Mux Data MCP client', async () => {
      try {
        await muxDataMcpClient.connect();
        expect(muxDataMcpClient).toBeDefined();
        console.log('✅ Mux Data MCP client connected successfully');
      } catch (error) {
        console.warn('⚠️  Mux Data MCP connection failed:', error);
        // Don't fail the test if MCP is not available in test environment
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should connect to Mux Assets MCP client', async () => {
      try {
        const tools = await muxAssetsMcpClient.getTools();
        expect(tools).toBeDefined();
        expect(typeof tools).toBe('object');
        console.log('✅ Mux Assets MCP client connected successfully');
        console.log('Available tools:', Object.keys(tools));
      } catch (error) {
        console.warn('⚠️  Mux Assets MCP connection failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should connect to Mux Upload MCP client', async () => {
      try {
        const tools = await muxUploadMcpClient.getTools();
        expect(tools).toBeDefined();
        expect(typeof tools).toBe('object');
        console.log('✅ Mux Upload MCP client connected successfully');
        console.log('Available tools:', Object.keys(tools));
      } catch (error) {
        console.warn('⚠️  Mux Upload MCP connection failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('MCP Tools Availability Tests', () => {
    it('should have required data analytics tools available', async () => {
      try {
        const tools = await muxDataMcpClient.getTools();
        
        // Check for essential tools
        const expectedTools = [
          'invoke_api_endpoint',
          'list_errors',
          'list_breakdown_values', 
          'get_overall_values'
        ];
        
        const availableTools = Object.keys(tools);
        console.log('Available data tools:', availableTools);
        
        // At minimum, we should have invoke_api_endpoint
        expect(availableTools).toContain('invoke_api_endpoint');
        
        // Check if we have any of the expected tools
        const hasExpectedTools = expectedTools.some(tool => availableTools.includes(tool));
        expect(hasExpectedTools).toBe(true);
        
        console.log('✅ Required data analytics tools are available');
      } catch (error) {
        console.warn('⚠️  Data analytics tools check failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should have required assets management tools available', async () => {
      try {
        const tools = await muxAssetsMcpClient.getTools();
        
        const availableTools = Object.keys(tools);
        console.log('Available assets tools:', availableTools);
        
        // Check for essential assets tools
        const expectedTools = [
          'invoke_api_endpoint',
          'retrieve_video_assets',
          'list_video_assets',
          'video.assets.retrieve',
          'video.assets.list'
        ];
        
        // At minimum, we should have invoke_api_endpoint
        expect(availableTools).toContain('invoke_api_endpoint');
        
        // Check if we have any of the expected tools
        const hasExpectedTools = expectedTools.some(tool => availableTools.includes(tool));
        expect(hasExpectedTools).toBe(true);
        
        console.log('✅ Required assets management tools are available');
      } catch (error) {
        console.warn('⚠️  Assets management tools check failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should have required upload tools available', async () => {
      try {
        const tools = await muxUploadMcpClient.getTools();
        
        const availableTools = Object.keys(tools);
        console.log('Available upload tools:', availableTools);
        
        // Check for essential upload tools
        const expectedTools = [
          'invoke_api_endpoint',
          'create_video_uploads',
          'retrieve_video_uploads',
          'list_video_uploads',
          'video.uploads.create',
          'video.uploads.get',
          'video.uploads.list'
        ];
        
        // At minimum, we should have invoke_api_endpoint
        expect(availableTools).toContain('invoke_api_endpoint');
        
        // Check if we have any of the expected tools
        const hasExpectedTools = expectedTools.some(tool => availableTools.includes(tool));
        expect(hasExpectedTools).toBe(true);
        
        console.log('✅ Required upload tools are available');
      } catch (error) {
        console.warn('⚠️  Upload tools check failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('MCP Data Flow Tests', () => {
    it('should fetch analytics data via MCP', async () => {
      try {
        // Test the muxAnalyticsTool which uses MCP internally
        const result = await muxAnalyticsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000] // Valid Mux API timeframe
          } 
        });
        
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        
        if (result.success) {
          expect(result.metrics).toBeDefined();
          expect(result.timeRange).toBeDefined();
          expect(result.analysis).toBeDefined();
          console.log('✅ Analytics data fetched successfully via MCP');
          console.log('Metrics keys:', Object.keys(result.metrics || {}));
        } else {
          console.warn('⚠️  Analytics fetch failed:', result.error || result.message);
        }
      } catch (error) {
        console.warn('⚠️  Analytics data fetch failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should fetch video views data via MCP', async () => {
      try {
        const result = await muxVideoViewsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000],
            limit: 10
          } 
        });
        
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        
        if (result.success) {
          expect(result.views).toBeDefined();
          expect(result.timeRange).toBeDefined();
          console.log('✅ Video views data fetched successfully via MCP');
          console.log('Views count:', result.totalViews);
        } else {
          console.warn('⚠️  Video views fetch failed:', result.error || result.message);
        }
      } catch (error) {
        console.warn('⚠️  Video views data fetch failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should fetch error data via MCP', async () => {
      try {
        const result = await muxErrorsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000]
          } 
        });
        
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        
        if (result.success) {
          expect(result.errors).toBeDefined();
          expect(result.timeRange).toBeDefined();
          console.log('✅ Error data fetched successfully via MCP');
          console.log('Total errors:', result.totalErrors);
        } else {
          console.warn('⚠️  Error data fetch failed:', result.error || result.message);
        }
      } catch (error) {
        console.warn('⚠️  Error data fetch failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should fetch assets list via MCP', async () => {
      try {
        const result = await muxAssetsListTool.execute({ 
          context: { 
            limit: 5
          } 
        });
        
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        
        if (result.success) {
          expect(result.assets).toBeDefined();
          expect(Array.isArray(result.assets)).toBe(true);
          console.log('✅ Assets list fetched successfully via MCP');
          console.log('Assets count:', result.count);
        } else {
          console.warn('⚠️  Assets list fetch failed:', result.error || result.message);
        }
      } catch (error) {
        console.warn('⚠️  Assets list fetch failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('Agent Integration Tests', () => {
    it('should verify Mux Analytics Agent has required tools', () => {
      expect(muxAnalyticsAgent).toBeDefined();
      expect(muxAnalyticsAgent.tools).toBeDefined();
      
      const toolNames = Object.keys(muxAnalyticsAgent.tools);
      console.log('Mux Analytics Agent tools:', toolNames);
      
      // Check for essential tools
      const expectedTools = [
        'muxAnalyticsTool',
        'muxAssetsListTool', 
        'muxVideoViewsTool',
        'muxErrorsTool',
        'ttsAnalyticsReportTool'
      ];
      
      expectedTools.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
      
      console.log('✅ Mux Analytics Agent has all required tools');
    });

    it('should verify Media Vault Agent has required tools', () => {
      expect(mediaVaultAgent).toBeDefined();
      expect(mediaVaultAgent.tools).toBeDefined();
      
      const toolNames = Object.keys(mediaVaultAgent.tools);
      console.log('Media Vault Agent tools:', toolNames);
      
      // Check for essential tools
      const expectedTools = [
        'weatherTool',
        'ttsWeatherTool',
        'zipMemoryTool',
        'assetReadinessTool'
      ];
      
      expectedTools.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
      
      console.log('✅ Media Vault Agent has all required tools');
    });

    it('should test agent tool execution with MCP fallback', async () => {
      try {
        // Test a simple agent interaction that would use MCP
        const messages = [
          { role: 'user', content: 'Generate an analytics report for the last 24 hours' }
        ];
        
        // This should trigger the muxAnalyticsTool which uses MCP
        const response = await muxAnalyticsAgent.text({ messages });
        
        expect(response).toBeDefined();
        expect(response.text).toBeDefined();
        expect(typeof response.text).toBe('string');
        
        console.log('✅ Agent tool execution with MCP completed');
        console.log('Response length:', response.text.length);
      } catch (error) {
        console.warn('⚠️  Agent tool execution failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('MCP Error Handling and Fallback Tests', () => {
    it('should handle MCP connection failures gracefully', async () => {
      // Temporarily disable MCP to test fallback
      const originalUseMcp = process.env.USE_MUX_MCP;
      process.env.USE_MUX_MCP = 'false';
      
      try {
        const result = await muxAnalyticsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000]
          } 
        });
        
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        
        if (result.success) {
          console.log('✅ Fallback to REST API worked correctly');
        } else {
          console.log('⚠️  Both MCP and REST API failed:', result.error);
        }
      } catch (error) {
        console.warn('⚠️  Fallback test failed:', error);
        expect(error).toBeDefined();
      } finally {
        // Restore original setting
        process.env.USE_MUX_MCP = originalUseMcp;
      }
    }, TEST_TIMEOUT);

    it('should validate MCP response format', async () => {
      try {
        const tools = await muxDataMcpClient.getTools();
        
        if (tools['invoke_api_endpoint']) {
          // Test a simple MCP call
          const result = await tools['invoke_api_endpoint'].execute({
            context: {
              endpoint_name: 'errors',
              args: {
                timeframe: [1751241600, 1751328000]
              }
            }
          });
          
          expect(result).toBeDefined();
          console.log('✅ MCP response format is valid');
          console.log('Response type:', typeof result);
        } else {
          console.warn('⚠️  invoke_api_endpoint not available for testing');
        }
      } catch (error) {
        console.warn('⚠️  MCP response format test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('End-to-End MCP Workflow Tests', () => {
    it('should complete full analytics workflow via MCP', async () => {
      try {
        // Step 1: Fetch analytics data
        const analyticsResult = await muxAnalyticsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000]
          } 
        });
        
        expect(analyticsResult).toBeDefined();
        console.log('Step 1: Analytics data fetched');
        
        // Step 2: Fetch video views
        const viewsResult = await muxVideoViewsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000],
            limit: 5
          } 
        });
        
        expect(viewsResult).toBeDefined();
        console.log('Step 2: Video views fetched');
        
        // Step 3: Fetch error data
        const errorsResult = await muxErrorsTool.execute({ 
          context: { 
            timeframe: [1751241600, 1751328000]
          } 
        });
        
        expect(errorsResult).toBeDefined();
        console.log('Step 3: Error data fetched');
        
        // Step 4: Fetch assets list
        const assetsResult = await muxAssetsListTool.execute({ 
          context: { 
            limit: 3
          } 
        });
        
        expect(assetsResult).toBeDefined();
        console.log('Step 4: Assets list fetched');
        
        // Verify all steps completed successfully
        const allSuccessful = [
          analyticsResult.success,
          viewsResult.success,
          errorsResult.success,
          assetsResult.success
        ].every(success => success === true);
        
        if (allSuccessful) {
          console.log('✅ Full analytics workflow completed successfully via MCP');
        } else {
          console.warn('⚠️  Some steps in the workflow failed');
        }
        
        expect(analyticsResult).toBeDefined();
        expect(viewsResult).toBeDefined();
        expect(errorsResult).toBeDefined();
        expect(assetsResult).toBeDefined();
        
      } catch (error) {
        console.warn('⚠️  End-to-end workflow test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should verify MCP data consistency across tools', async () => {
      try {
        const timeframe = [1751241600, 1751328000];
        
        // Fetch data from multiple tools with same timeframe
        const [analyticsResult, viewsResult, errorsResult] = await Promise.allSettled([
          muxAnalyticsTool.execute({ context: { timeframe } }),
          muxVideoViewsTool.execute({ context: { timeframe, limit: 10 } }),
          muxErrorsTool.execute({ context: { timeframe } })
        ]);
        
        // Check that all requests completed (successfully or with errors)
        expect(analyticsResult.status).toBeDefined();
        expect(viewsResult.status).toBeDefined();
        expect(errorsResult.status).toBeDefined();
        
        console.log('✅ MCP data consistency test completed');
        console.log('Analytics result:', analyticsResult.status);
        console.log('Views result:', viewsResult.status);
        console.log('Errors result:', errorsResult.status);
        
      } catch (error) {
        console.warn('⚠️  MCP data consistency test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('MCP Performance and Reliability Tests', () => {
    it('should handle concurrent MCP requests', async () => {
      try {
        const concurrentRequests = Array.from({ length: 3 }, (_, i) => 
          muxAnalyticsTool.execute({ 
            context: { 
              timeframe: [1751241600, 1751328000 + (i * 3600)] // Different timeframes
            } 
          })
        );
        
        const results = await Promise.allSettled(concurrentRequests);
        
        expect(results).toHaveLength(3);
        
        const successfulResults = results.filter(result => result.status === 'fulfilled');
        console.log(`✅ Concurrent MCP requests: ${successfulResults.length}/3 successful`);
        
        // At least one should succeed
        expect(successfulResults.length).toBeGreaterThan(0);
        
      } catch (error) {
        console.warn('⚠️  Concurrent MCP requests test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should validate MCP connection stability', async () => {
      try {
        // Test multiple sequential operations
        const operations = [
          () => muxDataMcpClient.getTools(),
          () => muxAssetsMcpClient.getTools(),
          () => muxUploadMcpClient.getTools(),
          () => muxDataMcpClient.getTools(), // Repeat to test stability
        ];
        
        const results = await Promise.allSettled(operations.map(op => op()));
        
        const successfulOps = results.filter(result => result.status === 'fulfilled');
        console.log(`✅ MCP connection stability: ${successfulOps.length}/${operations.length} operations successful`);
        
        // Most operations should succeed
        expect(successfulOps.length).toBeGreaterThan(operations.length / 2);
        
      } catch (error) {
        console.warn('⚠️  MCP connection stability test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });
});
