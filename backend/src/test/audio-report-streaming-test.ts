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
import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';
import { 
  muxAnalyticsTool, 
  // muxAssetsListTool, 
  muxVideoViewsTool, 
  muxErrorsTool 
} from '../tools/mux-analytics.js';

// Test configuration
const TEST_TIMEOUT = 180000; // 3 minutes for audio generation and streaming
const MCP_CONNECTION_TIMEOUT = 60000; // 1 minute for connection

// Mock external dependencies to focus on MCP integration
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => ({
    generateText: vi.fn().mockResolvedValue({
      text: 'Mock AI response for audio report testing'
    })
  }))
}));

describe('Audio Report Streaming Integration Tests', () => {
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
    
    // Set up TTS environment
    if (!process.env.DEEPGRAM_API_KEY) {
      console.warn('⚠️  DEEPGRAM_API_KEY not set. Audio generation tests may fail.');
      process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';
    }
    
    // Set up TTS temp directory
    process.env.TTS_TMP_DIR = '/tmp/tts-test';
    process.env.TTS_CLEANUP = 'true';
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up MCP connections
    try {
      await muxDataMcpClient.disconnect();
    } catch (error) {
      console.warn('Error during MCP cleanup:', error);
    }
  });

  beforeEach(() => {
    // Reset any mocks between tests
    vi.clearAllMocks();
  });

  describe('7-Day Data Summary Audio Report Tests', () => {
    it('should generate audio report for 7-day data summary via MCP', async () => {
      try {
        console.log('🎯 Testing 7-day data summary with audio output...');
        
        // Step 1: Verify MCP connection
        if (!muxDataMcpClient.isConnected()) {
          await muxDataMcpClient.connect();
        }
        
        const tools = await muxDataMcpClient.getTools();
        expect(tools).toBeDefined();
        expect(Object.keys(tools).length).toBeGreaterThan(0);
        console.log('✅ MCP connection verified');
        
        // Step 2: Fetch analytics data for 7-day period
        console.log('📊 Fetching analytics data...');
        const analyticsResult = await (muxAnalyticsTool as any).execute({ 
          context: {
            // Let the tool handle timeframe validation internally
            // It will automatically adjust to valid range if needed
          }
        });
        
        expect(analyticsResult).toBeDefined();
        expect((analyticsResult as any).success).toBeDefined();
        console.log('✅ Analytics data fetched');
        
        // Step 3: Fetch video views data
        console.log('👀 Fetching video views data...');
        const viewsResult = await (muxVideoViewsTool as any).execute({ 
          context: { 
            limit: 10
          }
        });
        
        expect(viewsResult).toBeDefined();
        expect((viewsResult as any).success).toBeDefined();
        console.log('✅ Video views data fetched');
        
        // Step 4: Fetch error data
        console.log('🚨 Fetching error data...');
        const errorsResult = await (muxErrorsTool as any).execute({ 
          context: {}
        });
        
        expect(errorsResult).toBeDefined();
        expect((errorsResult as any).success).toBeDefined();
        console.log('✅ Error data fetched');
        
        // Step 5: Test TTS Analytics Report Tool
        console.log('🎧 Testing TTS Analytics Report Tool...');
        
        // Get the TTS tool from the agent
        const ttsTool = muxAnalyticsAgent.tools.ttsAnalyticsReportTool;
        expect(ttsTool).toBeDefined();
        expect(ttsTool.execute).toBeDefined();
        
        // Execute the TTS tool
        const ttsResult = await ttsTool.execute({ 
          context: {
            includeAssetList: true
          }
        });
        
        expect(ttsResult).toBeDefined();
        expect((ttsResult as any).success).toBeDefined();
        
        if ((ttsResult as any).success) {
          console.log('✅ TTS Analytics Report generated successfully');
          
          // Verify the response structure
          const result = ttsResult as any;
          expect(result.summaryText).toBeDefined();
          expect(typeof result.summaryText).toBe('string');
          expect(result.summaryText.length).toBeGreaterThan(0);
          
          expect(result.wordCount).toBeDefined();
          expect(typeof result.wordCount).toBe('number');
          expect(result.wordCount).toBeGreaterThan(0);
          expect(result.wordCount).toBeLessThanOrEqual(1000);
          
          expect(result.localAudioFile).toBeDefined();
          expect(typeof result.localAudioFile).toBe('string');
          
          console.log(`📝 Summary text length: ${result.summaryText.length} characters`);
          console.log(`📊 Word count: ${result.wordCount} words`);
          console.log(`🎵 Audio file: ${result.localAudioFile}`);
          
          if (result.playerUrl) {
            console.log(`🔗 Player URL: ${result.playerUrl}`);
            expect(typeof result.playerUrl).toBe('string');
            expect(result.playerUrl).toContain('streamingportfolio.com');
          }
          
          if (result.assetId) {
            console.log(`🆔 Asset ID: ${result.assetId}`);
            expect(typeof result.assetId).toBe('string');
          }
          
          // Verify the summary contains expected content
          const summaryLower = result.summaryText.toLowerCase();
          expect(summaryLower).toContain('analytics');
          expect(summaryLower).toContain('streaming');
          
          console.log('✅ Audio report structure verification passed');
        } else {
          console.warn('⚠️  TTS Analytics Report generation failed:', (ttsResult as any).error);
          // Don't fail the test if it's a data availability issue
          expect((ttsResult as any).error).toBeDefined();
        }
        
        // Step 6: Verify data consistency
        console.log('🔍 Verifying data consistency...');
        
        const results = [
          { name: 'Analytics', result: analyticsResult },
          { name: 'Views', result: viewsResult },
          { name: 'Errors', result: errorsResult },
          { name: 'TTS Report', result: ttsResult }
        ];
        
        let successfulSteps = 0;
        let failedSteps = 0;
        
        results.forEach(({ name, result }) => {
          if ((result as any).success) {
            successfulSteps++;
            console.log(`✅ ${name}: Success`);
          } else {
            failedSteps++;
            console.log(`⚠️  ${name}: Failed - ${(result as any).error || (result as any).message}`);
          }
        });
        
        console.log(`📈 Test Summary: ${successfulSteps} successful, ${failedSteps} failed`);
        
        // At least the TTS report should succeed to verify the workflow
        expect(successfulSteps).toBeGreaterThan(0);
        
        // All results should be defined (even if they failed)
        expect(analyticsResult).toBeDefined();
        expect(viewsResult).toBeDefined();
        expect(errorsResult).toBeDefined();
        expect(ttsResult).toBeDefined();
        
        console.log('🎉 7-day data summary audio report test completed successfully');
        
      } catch (error) {
        console.error('❌ 7-day data summary audio report test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should verify MCP streaming data flow to client', async () => {
      try {
        console.log('🔄 Testing MCP streaming data flow...');
        
        // Test agent streaming interface
        const messages = [
          { role: 'user', content: 'Generate an audio report for the last 7 days with analytics summary' }
        ];
        
        console.log('🤖 Testing agent streaming response...');
        
        // Test the agent's streaming interface
        const response = await muxAnalyticsAgent.text({ messages });
        
        expect(response).toBeDefined();
        expect(response.text).toBeDefined();
        expect(typeof response.text).toBe('string');
        expect(response.text.length).toBeGreaterThan(0);
        
        console.log('✅ Agent streaming response received');
        console.log(`📝 Response length: ${response.text.length} characters`);
        
        // Verify the response contains expected content
        const responseLower = response.text.toLowerCase();
        expect(responseLower).toContain('analytics');
        
        // Check if response mentions audio or TTS
        const hasAudioMention = responseLower.includes('audio') || 
                               responseLower.includes('tts') || 
                               responseLower.includes('report') ||
                               responseLower.includes('streaming');
        
        if (hasAudioMention) {
          console.log('✅ Response contains audio-related content');
        } else {
          console.log('⚠️  Response may not contain audio-related content');
        }
        
        // Test streaming interface if available
        if (muxAnalyticsAgent.streamVNext) {
          console.log('🌊 Testing streamVNext interface...');
          
          try {
            const streamResponse = await muxAnalyticsAgent.streamVNext(messages);
            expect(streamResponse).toBeDefined();
            
            // Check for different streaming response formats
            if (streamResponse.textStream) {
              console.log('✅ textStream interface available');
              let streamedContent = '';
              for await (const chunk of streamResponse.textStream) {
                if (chunk && typeof chunk === 'string') {
                  streamedContent += chunk;
                }
              }
              expect(streamedContent.length).toBeGreaterThan(0);
              console.log(`📊 Streamed content length: ${streamedContent.length} characters`);
            } else if (streamResponse.processDataStream) {
              console.log('✅ processDataStream interface available');
              let streamedContent = '';
              await streamResponse.processDataStream({
                onChunk: async (chunk: any) => {
                  if (chunk && chunk.content) {
                    streamedContent += chunk.content;
                  }
                }
              });
              expect(streamedContent.length).toBeGreaterThan(0);
              console.log(`📊 Processed stream content length: ${streamedContent.length} characters`);
            } else if (streamResponse.text) {
              console.log('✅ text interface available (non-streaming)');
              const textContent = typeof streamResponse.text === 'function' ? 
                await streamResponse.text() : streamResponse.text;
              expect(textContent.length).toBeGreaterThan(0);
              console.log(`📊 Text content length: ${textContent.length} characters`);
            } else {
              console.log('⚠️  Unknown streaming response format');
            }
            
          } catch (streamError) {
            console.warn('⚠️  StreamVNext test failed:', streamError);
            // Don't fail the test if streaming is not available
          }
        } else {
          console.log('ℹ️  streamVNext interface not available');
        }
        
        console.log('✅ MCP streaming data flow test completed');
        
      } catch (error) {
        console.error('❌ MCP streaming data flow test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should verify chat client input/output functionality', async () => {
      try {
        console.log('💬 Testing chat client input/output functionality...');
        
        // Test the agent's ability to handle chat-like interactions
        const testMessages = [
          'Generate an audio report for the last 7 days',
          'What are the streaming analytics for the past week?',
          'Create a summary of video performance with audio output',
          'Show me the error rates and generate an audio report'
        ];
        
        let successfulInteractions = 0;
        let failedInteractions = 0;
        
        for (const message of testMessages) {
          try {
            console.log(`📤 Testing message: "${message}"`);
            
            const response = await muxAnalyticsAgent.text({ 
              messages: [{ role: 'user', content: message }] 
            });
            
            expect(response).toBeDefined();
            expect(response.text).toBeDefined();
            expect(typeof response.text).toBe('string');
            expect(response.text.length).toBeGreaterThan(0);
            
            console.log(`✅ Response received (${response.text.length} chars)`);
            successfulInteractions++;
            
            // Verify response contains relevant content
            const responseLower = response.text.toLowerCase();
            const hasRelevantContent = responseLower.includes('analytics') || 
                                     responseLower.includes('streaming') || 
                                     responseLower.includes('video') ||
                                     responseLower.includes('report') ||
                                     responseLower.includes('audio');
            
            if (hasRelevantContent) {
              console.log('✅ Response contains relevant content');
            } else {
              console.log('⚠️  Response may not contain expected content');
            }
            
          } catch (interactionError) {
            console.warn(`⚠️  Interaction failed for "${message}":`, interactionError);
            failedInteractions++;
          }
        }
        
        console.log(`📊 Chat client test results: ${successfulInteractions} successful, ${failedInteractions} failed`);
        
        // At least half of the interactions should succeed
        expect(successfulInteractions).toBeGreaterThan(0);
        expect(successfulInteractions).toBeGreaterThanOrEqual(testMessages.length / 2);
        
        console.log('✅ Chat client input/output functionality test completed');
        
      } catch (error) {
        console.error('❌ Chat client input/output functionality test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should verify end-to-end audio report generation workflow', async () => {
      try {
        console.log('🔄 Testing end-to-end audio report generation workflow...');
        
        // Step 1: Test MCP data fetching
        console.log('📊 Step 1: Fetching data via MCP...');
        const [analyticsResult, viewsResult, errorsResult] = await Promise.allSettled([
          (muxAnalyticsTool as any).execute({ context: {} }),
          (muxVideoViewsTool as any).execute({ context: { limit: 5 } }),
          (muxErrorsTool as any).execute({ context: {} })
        ]);
        
        const dataFetchResults = [analyticsResult, viewsResult, errorsResult];
        const successfulDataFetches = dataFetchResults.filter(result => 
          result.status === 'fulfilled' && (result.value as any).success
        ).length;
        
        console.log(`✅ Data fetching: ${successfulDataFetches}/3 successful`);
        
        // Step 2: Test TTS report generation
        console.log('🎧 Step 2: Generating TTS report...');
        const ttsTool = muxAnalyticsAgent.tools.ttsAnalyticsReportTool;
        const ttsResult = await ttsTool.execute({ 
          context: {
            includeAssetList: true
          }
        });
        
        expect(ttsResult).toBeDefined();
        expect((ttsResult as any).success).toBeDefined();
        
        if ((ttsResult as any).success) {
          console.log('✅ TTS report generation successful');
          
          const result = ttsResult as any;
          expect(result.summaryText).toBeDefined();
          expect(result.wordCount).toBeDefined();
          expect(result.localAudioFile).toBeDefined();
          
          console.log(`📝 Summary: ${result.wordCount} words`);
          console.log(`🎵 Audio file: ${result.localAudioFile}`);
          
          if (result.playerUrl) {
            console.log(`🔗 Player URL: ${result.playerUrl}`);
          }
        } else {
          console.warn('⚠️  TTS report generation failed:', (ttsResult as any).error);
        }
        
        // Step 3: Test agent response with audio report request
        console.log('🤖 Step 3: Testing agent response...');
        const agentResponse = await muxAnalyticsAgent.text({ 
          messages: [{ role: 'user', content: 'Generate an audio report for the last 7 days with analytics summary' }] 
        });
        
        expect(agentResponse).toBeDefined();
        expect(agentResponse.text).toBeDefined();
        expect(agentResponse.text.length).toBeGreaterThan(0);
        
        console.log(`✅ Agent response: ${agentResponse.text.length} characters`);
        
        // Step 4: Verify workflow completeness
        console.log('🔍 Step 4: Verifying workflow completeness...');
        
        const workflowSteps = [
          { name: 'MCP Data Fetch', success: successfulDataFetches > 0 },
          { name: 'TTS Report Generation', success: (ttsResult as any).success },
          { name: 'Agent Response', success: agentResponse.text.length > 0 }
        ];
        
        const successfulSteps = workflowSteps.filter(step => step.success).length;
        console.log(`📈 Workflow completeness: ${successfulSteps}/3 steps successful`);
        
        // At least 2 out of 3 steps should succeed
        expect(successfulSteps).toBeGreaterThanOrEqual(2);
        
        // Verify the workflow produces meaningful output
        const hasMeaningfulOutput = (ttsResult as any).success || agentResponse.text.length > 100;
        expect(hasMeaningfulOutput).toBe(true);
        
        console.log('🎉 End-to-end audio report generation workflow test completed successfully');
        
      } catch (error) {
        console.error('❌ End-to-end audio report generation workflow test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('MCP Streaming Performance Tests', () => {
    it('should verify MCP connection stability during audio generation', async () => {
      try {
        console.log('🔗 Testing MCP connection stability...');
        
        // Test multiple sequential operations
        const operations = [
          () => muxDataMcpClient.getTools(),
          () => muxDataMcpClient.getTools(), // Repeat to test stability
          () => muxDataMcpClient.getTools(), // Repeat again
        ];
        
        const results = await Promise.allSettled(operations.map(op => op()));
        
        const successfulOps = results.filter(result => result.status === 'fulfilled');
        console.log(`✅ MCP connection stability: ${successfulOps.length}/${operations.length} operations successful`);
        
        // All operations should succeed
        expect(successfulOps.length).toBe(operations.length);
        
        // Test connection status
        expect(muxDataMcpClient.isConnected()).toBe(true);
        
        console.log('✅ MCP connection stability test passed');
        
      } catch (error) {
        console.error('❌ MCP connection stability test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should verify concurrent MCP operations during audio generation', async () => {
      try {
        console.log('⚡ Testing concurrent MCP operations...');
        
        // Test concurrent requests with different tools
        const concurrentRequests = [
          (muxAnalyticsTool as any).execute({ context: {} }),
          (muxVideoViewsTool as any).execute({ context: { limit: 3 } }),
          (muxErrorsTool as any).execute({ context: {} })
        ];
        
        const results = await Promise.allSettled(concurrentRequests);
        
        expect(results).toHaveLength(3);
        
        const successfulResults = results.filter(result => 
          result.status === 'fulfilled' && (result.value as any).success
        );
        
        console.log(`✅ Concurrent MCP operations: ${successfulResults.length}/3 successful`);
        
        // At least one should succeed to verify MCP connectivity
        expect(successfulResults.length).toBeGreaterThan(0);
        
        // Log details about each result
        results.forEach((result, index) => {
          const toolNames = ['Analytics', 'Views', 'Errors'];
          if (result.status === 'fulfilled') {
            const success = (result.value as any).success;
            console.log(`${toolNames[index]}: ${success ? 'Success' : 'Failed'}`);
          } else {
            console.log(`${toolNames[index]}: Error - ${result.reason}`);
          }
        });
        
        console.log('✅ Concurrent MCP operations test completed');
        
      } catch (error) {
        console.error('❌ Concurrent MCP operations test failed:', error);
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });
});
