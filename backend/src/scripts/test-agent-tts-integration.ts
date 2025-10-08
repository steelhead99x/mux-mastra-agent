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

console.log('🧪 Testing Mux Analytics Agent with TTS Tool Integration...\n');

// Import the agent
import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';

async function testMuxAnalyticsAgentWithTTS() {
    try {
        console.log('=== Test 1: Audio Report Request ===');
        const audioQuery = "Generate an audio report of my streaming analytics. Pull errors by platform over the last 7 days and include total view counts.";
        console.log(`Query: "${audioQuery}"`);
        console.log('Processing request...\n');
        
        const result = await muxAnalyticsAgent.generateVNext(audioQuery);
        
        console.log('✅ Agent response received');
        console.log(`Response length: ${result.text.length} characters`);
        console.log('\n=== Response ===');
        console.log(result.text);
        console.log('\n=== Response Analysis ===');
        
        const response = result.text.toLowerCase();
        
        // Check for key indicators
        const hasAudioFile = response.includes('.wav') || response.includes('audio file') || response.includes('audio report generated');
        const hasPlayerUrl = response.includes('player') || response.includes('streamingportfolio') || response.includes('http');
        const hasTTSMention = response.includes('tts') || response.includes('text-to-speech');
        const has7Days = response.includes('7 day') || response.includes('seven day') || response.includes('past week');
        const hasErrors = response.includes('error');
        const hasViews = response.includes('view');
        const hasPlatform = response.includes('platform') || response.includes('macos') || response.includes('windows');
        
        console.log(`Audio file reference: ${hasAudioFile ? '✅ YES' : '❌ NO'}`);
        console.log(`Player URL provided: ${hasPlayerUrl ? '✅ YES' : '❌ NO'}`);
        console.log(`TTS mentioned: ${hasTTSMention ? '✅ YES' : '❌ NO'}`);
        console.log(`7-day timeframe: ${has7Days ? '✅ YES' : '❌ NO'}`);
        console.log(`Errors mentioned: ${hasErrors ? '✅ YES' : '❌ NO'}`);
        console.log(`Views mentioned: ${hasViews ? '✅ YES' : '❌ NO'}`);
        console.log(`Platform data: ${hasPlatform ? '✅ YES' : '❌ NO'}`);
        
        const successScore = [hasAudioFile, hasErrors, hasViews, hasPlatform].filter(Boolean).length;
        
        console.log(`\n📊 Success Score: ${successScore}/4`);
        
        if (hasAudioFile && hasPlayerUrl) {
            console.log('\n🎉 SUCCESS! Audio file was generated and player URL provided');
            return { success: true, audioGenerated: true };
        } else if (hasErrors && hasViews && hasPlatform) {
            console.log('\n✅ PARTIAL SUCCESS: Analytics data retrieved but audio file not generated');
            console.log('⚠️  The ttsAnalyticsReportTool may not have been triggered');
            return { success: true, audioGenerated: false };
        } else {
            console.log('\n❌ FAILED: Unable to retrieve analytics data or generate audio');
            return { success: false, audioGenerated: false };
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// Run the test
testMuxAnalyticsAgentWithTTS()
    .then(result => {
        console.log('\n=== Test Results Summary ===');
        if (result.success) {
            if (result.audioGenerated) {
                console.log('🎉 Audio generation test PASSED');
                console.log('✅ Agent successfully generated audio report');
                console.log('✅ TTS tool integration working');
                console.log('✅ Player URL provided for streaming');
                process.exit(0);
            } else {
                console.log('⚠️  Partial success');
                console.log('✅ Agent retrieved analytics data');
                console.log('❌ Audio file not generated automatically');
                console.log('📝 Note: Agent may need explicit instruction to use TTS tool');
                process.exit(1);
            }
        } else {
            console.log('❌ Test FAILED');
            console.log(`Error: ${result.error || 'Unknown error'}`);
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });


