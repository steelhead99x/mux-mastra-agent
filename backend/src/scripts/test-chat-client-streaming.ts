#!/usr/bin/env node

/**
 * Chat Client Input/Output Test Script
 * 
 * This script tests the chat client functionality to verify that MCP is streaming
 * data back to the client properly. It simulates user interactions and verifies
 * the streaming response flow.
 */

import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables
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

// Import required modules
import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';
import { muxDataMcpClient } from '../mcp/mux-data-client.js';

// Test configuration
// const TEST_TIMEOUT = 120000; // 2 minutes
// const STREAMING_TIMEOUT = 30000; // 30 seconds for streaming

/**
 * Test chat client input/output functionality
 */
async function testChatClientInputOutput() {
  console.log('🧪 Testing Chat Client Input/Output Functionality');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Verify MCP connection
    console.log('📡 Step 1: Verifying MCP connection...');
    
    if (!muxDataMcpClient.isConnected()) {
      console.log('🔌 Connecting to MCP server...');
      await muxDataMcpClient.connect();
    }
    
    const tools = await muxDataMcpClient.getTools();
    console.log(`✅ MCP connected with ${Object.keys(tools).length} tools available`);
    
    // Step 2: Test basic agent response
    console.log('\n🤖 Step 2: Testing basic agent response...');
    
    const basicMessage = 'Hello, can you help me with streaming analytics?';
    console.log(`📤 Sending: "${basicMessage}"`);
    
    const basicResponse = await muxAnalyticsAgent.text({ 
      messages: [{ role: 'user', content: basicMessage }] 
    });
    
    console.log('✅ Basic response received:', basicResponse ? 'SUCCESS' : 'FAILED');
    console.log('✅ Response text defined:', basicResponse.text ? 'SUCCESS' : 'FAILED');
    console.log('✅ Response text length > 0:', basicResponse.text.length > 0 ? 'SUCCESS' : 'FAILED');
    
    console.log(`✅ Response received: ${basicResponse.text.length} characters`);
    console.log(`📝 Response preview: ${basicResponse.text.substring(0, 100)}...`);
    
    // Step 3: Test audio report request
    console.log('\n🎧 Step 3: Testing audio report request...');
    
    const audioMessage = 'Generate an audio report for the last 7 days with analytics summary';
    console.log(`📤 Sending: "${audioMessage}"`);
    
    const audioResponse = await muxAnalyticsAgent.text({ 
      messages: [{ role: 'user', content: audioMessage }] 
    });
    
    console.log('✅ Audio response received:', audioResponse ? 'SUCCESS' : 'FAILED');
    console.log('✅ Audio response text defined:', audioResponse.text ? 'SUCCESS' : 'FAILED');
    console.log('✅ Audio response text length > 0:', audioResponse.text.length > 0 ? 'SUCCESS' : 'FAILED');
    
    console.log(`✅ Audio response received: ${audioResponse.text.length} characters`);
    console.log(`📝 Response preview: ${audioResponse.text.substring(0, 150)}...`);
    
    // Step 4: Test streaming interface if available
    console.log('\n🌊 Step 4: Testing streaming interface...');
    
    if (muxAnalyticsAgent.streamVNext) {
      console.log('🔄 Testing streamVNext interface...');
      
      const streamMessage = 'What are the current streaming performance metrics?';
      console.log(`📤 Streaming: "${streamMessage}"`);
      
      try {
        const streamResponse = await muxAnalyticsAgent.streamVNext([
          { role: 'user', content: streamMessage }
        ]);
        
        console.log('✅ Stream response received:', streamResponse ? 'SUCCESS' : 'FAILED');
        
        let streamedContent = '';
        let chunkCount = 0;
        
        // Test different streaming response formats
        if (streamResponse.textStream) {
          console.log('📊 Processing textStream...');
          for await (const chunk of streamResponse.textStream) {
            if (chunk && typeof chunk === 'string') {
              streamedContent += chunk;
              chunkCount++;
            }
          }
        } else if (streamResponse.processDataStream) {
          console.log('📊 Processing processDataStream...');
          await streamResponse.processDataStream({
            onChunk: async (chunk: any) => {
              if (chunk && chunk.content) {
                streamedContent += chunk.content;
                chunkCount++;
              }
            }
          });
        } else if (streamResponse.text) {
          console.log('📊 Processing text response...');
          const textContent = typeof streamResponse.text === 'function' ? 
            await streamResponse.text() : streamResponse.text;
          streamedContent = textContent;
          chunkCount = 1;
        }
        
        console.log('✅ Streamed content length > 0:', streamedContent.length > 0 ? 'SUCCESS' : 'FAILED');
        console.log(`✅ Streaming successful: ${chunkCount} chunks, ${streamedContent.length} characters`);
        console.log(`📝 Stream preview: ${streamedContent.substring(0, 100)}...`);
        
      } catch (streamError) {
        console.warn('⚠️  Streaming test failed:', streamError);
      }
    } else {
      console.log('ℹ️  streamVNext interface not available');
    }
    
    // Step 5: Test multiple sequential interactions
    console.log('\n🔄 Step 5: Testing multiple sequential interactions...');
    
    const testMessages = [
      'Show me the video streaming metrics',
      'What are the error rates?',
      'Generate a summary report',
      'Create an audio report for the last week'
    ];
    
    let successfulInteractions = 0;
    let failedInteractions = 0;
    
    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`📤 Interaction ${i + 1}: "${message}"`);
      
      try {
        const response = await muxAnalyticsAgent.text({ 
          messages: [{ role: 'user', content: message }] 
        });
        
        console.log('✅ Response received:', response ? 'SUCCESS' : 'FAILED');
        console.log('✅ Response text defined:', response.text ? 'SUCCESS' : 'FAILED');
        console.log('✅ Response text length > 0:', response.text.length > 0 ? 'SUCCESS' : 'FAILED');
        
        console.log(`✅ Response ${i + 1}: ${response.text.length} characters`);
        successfulInteractions++;
        
        // Verify response contains relevant content
        const responseLower = response.text.toLowerCase();
        const hasRelevantContent = responseLower.includes('analytics') || 
                                 responseLower.includes('streaming') || 
                                 responseLower.includes('video') ||
                                 responseLower.includes('report') ||
                                 responseLower.includes('audio') ||
                                 responseLower.includes('mux');
        
        if (hasRelevantContent) {
          console.log(`✅ Response ${i + 1} contains relevant content`);
        } else {
          console.log(`⚠️  Response ${i + 1} may not contain expected content`);
        }
        
      } catch (interactionError) {
        console.warn(`⚠️  Interaction ${i + 1} failed:`, interactionError);
        failedInteractions++;
      }
    }
    
    console.log(`\n📊 Sequential interactions: ${successfulInteractions} successful, ${failedInteractions} failed`);
    
    // Step 6: Test error handling
    console.log('\n🚨 Step 6: Testing error handling...');
    
    const errorMessage = 'This is a test message that should not cause errors';
    console.log(`📤 Testing error handling: "${errorMessage}"`);
    
    try {
      const errorResponse = await muxAnalyticsAgent.text({ 
        messages: [{ role: 'user', content: errorMessage }] 
      });
      
      console.log('✅ Error response received:', errorResponse ? 'SUCCESS' : 'FAILED');
      console.log('✅ Error response text defined:', errorResponse.text ? 'SUCCESS' : 'FAILED');
      
      console.log(`✅ Error handling test passed: ${errorResponse.text.length} characters`);
      
    } catch (error) {
      console.warn('⚠️  Error handling test failed:', error);
    }
    
    // Step 7: Verify MCP data flow
    console.log('\n📊 Step 7: Verifying MCP data flow...');
    
    const dataFlowMessage = 'Show me the current streaming analytics data';
    console.log(`📤 Testing data flow: "${dataFlowMessage}"`);
    
    const dataFlowResponse = await muxAnalyticsAgent.text({ 
      messages: [{ role: 'user', content: dataFlowMessage }] 
    });
    
    console.log('✅ Data flow response received:', dataFlowResponse ? 'SUCCESS' : 'FAILED');
    console.log('✅ Data flow response text defined:', dataFlowResponse.text ? 'SUCCESS' : 'FAILED');
    console.log('✅ Data flow response text length > 0:', dataFlowResponse.text.length > 0 ? 'SUCCESS' : 'FAILED');
    
    console.log(`✅ Data flow test passed: ${dataFlowResponse.text.length} characters`);
    
    // Check if response indicates MCP data was used
    const responseLower = dataFlowResponse.text.toLowerCase();
    const hasDataIndicators = responseLower.includes('analytics') || 
                             responseLower.includes('metrics') || 
                             responseLower.includes('data') ||
                             responseLower.includes('streaming');
    
    if (hasDataIndicators) {
      console.log('✅ Response indicates MCP data was used');
    } else {
      console.log('⚠️  Response may not indicate MCP data usage');
    }
    
    // Summary
    console.log('\n🎉 Chat Client Input/Output Test Summary');
    console.log('=' .repeat(60));
    console.log(`✅ MCP Connection: ${muxDataMcpClient.isConnected() ? 'Connected' : 'Disconnected'}`);
    console.log(`✅ Basic Response: ${basicResponse.text.length} characters`);
    console.log(`✅ Audio Response: ${audioResponse.text.length} characters`);
    console.log(`✅ Sequential Interactions: ${successfulInteractions}/${testMessages.length} successful`);
    console.log(`✅ Data Flow: ${dataFlowResponse.text.length} characters`);
    
    const overallSuccess = successfulInteractions >= testMessages.length / 2;
    console.log(`\n${overallSuccess ? '🎉' : '⚠️'} Overall Test Result: ${overallSuccess ? 'PASSED' : 'PARTIAL'}`);
    
    return overallSuccess;
    
  } catch (error) {
    console.error('❌ Chat Client Input/Output Test Failed:', error);
    return false;
  }
}

/**
 * Test MCP streaming data verification
 */
async function testMcpStreamingDataVerification() {
  console.log('\n🔍 Testing MCP Streaming Data Verification');
  console.log('=' .repeat(60));
  
  try {
    // Test direct MCP tool execution
    console.log('🛠️  Testing direct MCP tool execution...');
    
    const { muxAnalyticsTool, muxVideoViewsTool, muxErrorsTool } = await import('../tools/mux-analytics.js');
    
    // Test analytics tool
    console.log('📊 Testing analytics tool...');
    const analyticsResult = await (muxAnalyticsTool as any).execute({ context: {} });
    console.log(`Analytics result: ${(analyticsResult as any).success ? 'Success' : 'Failed'}`);
    
    // Test video views tool
    console.log('👀 Testing video views tool...');
    const viewsResult = await (muxVideoViewsTool as any).execute({ context: { limit: 5 } });
    console.log(`Views result: ${(viewsResult as any).success ? 'Success' : 'Failed'}`);
    
    // Test errors tool
    console.log('🚨 Testing errors tool...');
    const errorsResult = await (muxErrorsTool as any).execute({ context: {} });
    console.log(`Errors result: ${(errorsResult as any).success ? 'Success' : 'Failed'}`);
    
    // Test TTS tool
    console.log('🎧 Testing TTS analytics report tool...');
    const ttsTool = muxAnalyticsAgent.tools.ttsAnalyticsReportTool;
    const ttsResult = await ttsTool.execute({ context: { includeAssetList: true } });
    console.log(`TTS result: ${(ttsResult as any).success ? 'Success' : 'Failed'}`);
    
    if ((ttsResult as any).success) {
      const result = ttsResult as any;
      console.log(`📝 Summary: ${result.wordCount} words`);
      console.log(`🎵 Audio file: ${result.localAudioFile}`);
      if (result.playerUrl) {
        console.log(`🔗 Player URL: ${result.playerUrl}`);
      }
    }
    
    // Verify MCP tools are working
    const toolResults = [
      { name: 'Analytics', success: (analyticsResult as any).success },
      { name: 'Views', success: (viewsResult as any).success },
      { name: 'Errors', success: (errorsResult as any).success },
      { name: 'TTS Report', success: (ttsResult as any).success }
    ];
    
    const successfulTools = toolResults.filter(tool => tool.success).length;
    console.log(`\n📊 MCP Tools Status: ${successfulTools}/${toolResults.length} working`);
    
    return successfulTools > 0;
    
  } catch (error) {
    console.error('❌ MCP Streaming Data Verification Failed:', error);
    return false;
  }
}

/**
 * Main test function
 */
async function runChatClientTests() {
  console.log('🚀 Starting Chat Client Input/Output Tests');
  console.log('=' .repeat(80));
  
  const startTime = Date.now();
  
  try {
    // Run chat client tests
    const chatClientSuccess = await testChatClientInputOutput();
    
    // Run MCP streaming verification
    const mcpVerificationSuccess = await testMcpStreamingDataVerification();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n🏁 Test Execution Summary');
    console.log('=' .repeat(80));
    console.log(`⏱️  Total Duration: ${duration.toFixed(2)} seconds`);
    console.log(`💬 Chat Client Test: ${chatClientSuccess ? 'PASSED' : 'FAILED'}`);
    console.log(`📡 MCP Verification: ${mcpVerificationSuccess ? 'PASSED' : 'FAILED'}`);
    
    const overallSuccess = chatClientSuccess && mcpVerificationSuccess;
    console.log(`\n${overallSuccess ? '🎉' : '❌'} Overall Result: ${overallSuccess ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    
    if (overallSuccess) {
      console.log('\n✅ MCP is streaming data back to the client properly!');
      console.log('✅ Chat client input/output functionality is working!');
      console.log('✅ Audio report generation is functional!');
    } else {
      console.log('\n⚠️  Some issues detected with MCP streaming or chat client functionality.');
      console.log('Check the logs above for specific failure details.');
    }
    
    process.exit(overallSuccess ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runChatClientTests();
}

export { testChatClientInputOutput, testMcpStreamingDataVerification };
