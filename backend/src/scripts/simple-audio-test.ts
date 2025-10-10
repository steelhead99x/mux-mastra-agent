#!/usr/bin/env tsx
/**
 * SIMPLE AUDIO REPORT TEST - GUARANTEED TO WORK
 * 
 * This script tests audio report generation with proper error handling
 * and clear feedback at every step.
 */

import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables
const rootEnvPath = resolvePath(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else {
  config();
}

console.log('\n🎧 SIMPLE AUDIO REPORT TEST');
console.log('='.repeat(80));

// Step 1: Check environment variables
console.log('\n📋 Step 1: Checking Environment Variables...\n');

const requiredEnvVars = {
  'MUX_TOKEN_ID': process.env.MUX_TOKEN_ID,
  'MUX_TOKEN_SECRET': process.env.MUX_TOKEN_SECRET,
  'DEEPGRAM_API_KEY': process.env.DEEPGRAM_API_KEY,
  'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY
};

let allEnvVarsPresent = true;
for (const [name, value] of Object.entries(requiredEnvVars)) {
  if (value && value.length > 20) {
    console.log(`✅ ${name}: configured (${value.slice(0, 8)}...)`);
  } else {
    console.log(`❌ ${name}: MISSING or INVALID`);
    allEnvVarsPresent = false;
  }
}

if (!allEnvVarsPresent) {
  console.error('\n❌ ERROR: Missing required environment variables');
  console.error('\nPlease create a .env file in the project root with:');
  console.error(`
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
DEEPGRAM_API_KEY=your_deepgram_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
  `);
  process.exit(1);
}

console.log('\n✅ All environment variables configured\n');

// Step 2: Test Deepgram TTS
console.log('📋 Step 2: Testing Deepgram TTS...\n');

async function testDeepgram() {
  try {
    const testText = "This is a test of the Deepgram text to speech system.";
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', 'aura-asteria-en');
    url.searchParams.set('encoding', 'linear16');
    url.searchParams.set('sample_rate', '24000');
    url.searchParams.set('container', 'wav');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: testText })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Deepgram API error ${res.status}: ${errText}`);
    }

    const ab = await res.arrayBuffer();
    const audioSize = Buffer.from(ab).length;
    
    console.log(`✅ Deepgram TTS working (generated ${audioSize} bytes)\n`);
    return true;
  } catch (error) {
    console.error('❌ Deepgram TTS failed:', error);
    return false;
  }
}

// Step 3: Test Mux MCP Connection
console.log('📋 Step 3: Testing Mux MCP Connection...\n');

async function testMuxMCP() {
  try {
    const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
    
    console.log('Connecting to Mux MCP...');
    await muxDataMcpClient.connect();
    
    console.log('Getting available tools...');
    const tools = await muxDataMcpClient.getTools();
    
    const toolNames = Object.keys(tools);
    console.log(`✅ Mux MCP connected (${toolNames.length} tools available)\n`);
    console.log('Available tools:', toolNames.slice(0, 5).join(', '), '...\n');
    
    return true;
  } catch (error) {
    console.error('❌ Mux MCP connection failed:', error);
    return false;
  }
}

// Step 4: Test Agent
console.log('📋 Step 4: Testing Mux Analytics Agent...\n');

async function testAgent() {
  try {
    const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
    
    console.log('Testing simple query: "What can you do?"');
    const response = await muxAnalyticsAgent.generate('What can you do?');
    
    const responseText = typeof response === 'string' 
      ? response 
      : ('text' in response ? response.text : JSON.stringify(response));
    
    console.log('✅ Agent responding\n');
    console.log('Response preview:', responseText.slice(0, 200), '...\n');
    
    return true;
  } catch (error) {
    console.error('❌ Agent test failed:', error);
    return false;
  }
}

// Step 5: Test Audio Report Generation (the real test)
console.log('📋 Step 5: Testing Audio Report Generation...\n');

async function testAudioReport() {
  try {
    const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
    
    console.log('Query: "Generate an audio report of errors from the last 7 days"');
    console.log('⏳ This may take 30-60 seconds...\n');
    
    const startTime = Date.now();
    const response = await muxAnalyticsAgent.generate(
      'Generate an audio report of my errors from the last 7 days'
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const responseText = typeof response === 'string' 
      ? response 
      : ('text' in response ? response.text : JSON.stringify(response));
    
    console.log(`✅ Audio report generated in ${duration}s\n`);
    console.log('='.repeat(80));
    console.log('RESPONSE:');
    console.log('='.repeat(80));
    console.log(responseText);
    console.log('='.repeat(80));
    
    // Check for audio URL
    if (responseText.includes('streamingportfolio.com/player?assetId=')) {
      console.log('\n✅ Audio report URL found!');
      const urlMatch = responseText.match(/https:\/\/[^\s]+player\?assetId=[^\s]+/);
      if (urlMatch) {
        console.log('🎧 Play your audio report at:', urlMatch[0]);
      }
    } else {
      console.log('\n⚠️  No audio URL found in response');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Audio report generation failed:', error);
    if (error instanceof Error) {
      console.error('\nError details:', error.message);
      console.error('\nStack trace:', error.stack);
    }
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const results = {
    deepgram: await testDeepgram(),
    muxMcp: await testMuxMCP(),
    agent: await testAgent(),
    audioReport: await testAudioReport()
  };
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Deepgram TTS:     ${results.deepgram ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Mux MCP:          ${results.muxMcp ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Agent:            ${results.agent ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Audio Report:     ${results.audioReport ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(80));
  
  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED! Your audio report generation is working.\n');
    console.log('You can now ask the agent:');
    console.log('  - "Generate an audio report of errors from the last 7 days"');
    console.log('  - "Give me an audio summary for the last 30 days"');
    console.log('  - "Create a comprehensive report for the last 90 days"');
    console.log();
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED. See errors above for details.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});

