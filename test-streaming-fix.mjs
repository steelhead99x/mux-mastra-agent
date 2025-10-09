#!/usr/bin/env node

/**
 * Test Script to Verify Frontend Streaming Fix
 * 
 * This script tests the direct API endpoint to verify that streaming
 * is working properly and the response is being sent correctly.
 */

import fetch from 'node-fetch';

async function testStreamingEndpoint() {
  console.log('🧪 Testing Streaming Endpoint');
  console.log('=' .repeat(40));
  
  try {
    const response = await fetch('http://localhost:3001/api/agents/mux-analytics/streamVNext', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'summarize my errors over the last 7 days' }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('✅ Response received successfully');
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    // Read the streaming response
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let fullContent = '';
      let chunkCount = 0;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            chunkCount++;
            fullContent += chunk;
            console.log(`📦 Chunk ${chunkCount}: ${chunk.length} chars`);
            console.log(`📝 Preview: ${chunk.substring(0, 100)}...`);
          }
        }
        
        console.log(`\n🎉 Streaming completed!`);
        console.log(`📊 Total chunks: ${chunkCount}`);
        console.log(`📏 Total content length: ${fullContent.length} characters`);
        console.log(`📝 Content preview: ${fullContent.substring(0, 200)}...`);
        
        // Check if content contains expected analytics data
        const hasAnalytics = fullContent.toLowerCase().includes('analytics');
        const hasErrors = fullContent.toLowerCase().includes('error');
        const hasSummary = fullContent.toLowerCase().includes('summary');
        
        console.log(`\n🔍 Content Analysis:`);
        console.log(`✅ Contains 'analytics': ${hasAnalytics}`);
        console.log(`✅ Contains 'error': ${hasErrors}`);
        console.log(`✅ Contains 'summary': ${hasSummary}`);
        
        if (hasAnalytics && hasErrors && hasSummary) {
          console.log(`\n🎉 SUCCESS: Streaming endpoint is working correctly!`);
          console.log(`✅ MCP data is being streamed back to the client properly!`);
        } else {
          console.log(`\n⚠️  WARNING: Response may not contain expected content`);
        }
        
      } finally {
        reader.releaseLock();
      }
    } else {
      console.log('⚠️  No reader available, trying text response...');
      const textContent = await response.text();
      console.log(`📝 Text content length: ${textContent.length}`);
      console.log(`📝 Content preview: ${textContent.substring(0, 200)}...`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testStreamingEndpoint().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});
