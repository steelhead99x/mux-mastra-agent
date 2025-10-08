#!/usr/bin/env tsx

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

import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';

async function testTTSPlaybackURL() {
  console.log('🎧 Testing TTS Tool with Playback URL...\n');

  try {
    // Get the TTS tool from the agent
    const ttsTool = muxAnalyticsAgent.tools['ttsAnalyticsReportTool'];
    
    if (!ttsTool) {
      throw new Error('TTS tool not found in agent');
    }

    console.log('✅ TTS tool found');
    console.log('📝 Executing TTS tool...\n');

    // Execute the TTS tool directly
    const result = await ttsTool.execute({ 
      context: { 
        timeframe: undefined,
        includeAssetList: false 
      } 
    });

    console.log('=== TTS Tool Result ===');
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    console.log('Player URL:', result.playerUrl);
    console.log('Signed Player URL:', result.signedPlayerUrl);
    console.log('Asset ID:', result.assetId);
    console.log('Word Count:', result.wordCount);
    console.log('Summary Text Length:', result.summaryText?.length || 0);

    if (result.success && result.playerUrl) {
      console.log('\n🎉 SUCCESS: Playback URL generated!');
      console.log('🔗 Player URL:', result.playerUrl);
      
      if (result.signedPlayerUrl) {
        console.log('🔐 Signed Player URL:', result.signedPlayerUrl);
      }
      
      // Test if the URL contains the expected format
      if (result.playerUrl.includes('streamingportfolio.com/player?assetId=')) {
        console.log('✅ URL format is correct');
        
        // Extract asset ID from URL
        const url = new URL(result.playerUrl);
        const assetId = url.searchParams.get('assetId');
        console.log('📋 Asset ID from URL:', assetId);
        
        if (assetId && assetId.length > 10) {
          console.log('✅ Asset ID looks valid');
        } else {
          console.log('⚠️  Asset ID may be invalid');
        }
      } else {
        console.log('❌ URL format is incorrect');
      }
    } else {
      console.log('\n❌ FAILED: No playback URL generated');
      if (result.error) {
        console.log('Error:', result.error);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Force exit to close gracefully
    console.log('\n✅ Test completed, exiting...');
    process.exit(0);
  }
}

// Run the test
testTTSPlaybackURL().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
