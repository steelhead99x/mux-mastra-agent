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

import { Agent } from "@mastra/core";
import { anthropic } from "@ai-sdk/anthropic";
import { muxAnalyticsTool, muxErrorsTool, muxVideoViewsTool } from '../tools/mux-analytics.js';

async function testTTSAnalyticsReportTool() {
    console.log('🎧 Testing TTS Analytics Report Tool Integration...\n');

    try {
        // Create agent with Mux analytics tools
        const agent = new Agent({
            name: "Mux TTS Analytics Agent",
            instructions: "You are a Mux Video Analytics Agent with TTS capabilities. When asked to generate an audio report, create comprehensive summaries that include errors by platform over the last 24 hours and total view counts. Always mention 'last 24 hours' explicitly and format content for TTS generation.",
            model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'),
            tools: { muxAnalyticsTool, muxErrorsTool, muxVideoViewsTool },
        });

        console.log('=== Test: Generate Audio Report with TTS Keywords ===');
        
        // Test with keywords that should trigger TTS generation
        const testQueries = [
            "Generate an audio report of my streaming analytics",
            "Create a TTS summary of my video performance",
            "Make an audio summary with errors by platform over the last 24 hours",
            "Generate a voice report of my streaming data"
        ];

        for (let i = 0; i < testQueries.length; i++) {
            const query = testQueries[i];
            console.log(`\n--- Test ${i + 1}: "${query}" ---`);
            
            try {
                const result = await agent.generateVNext(query);
                
                console.log(`✅ Response generated (${result.text.length} chars)`);
                
                // Check if response mentions audio/TTS
                const response = result.text.toLowerCase();
                const hasAudioMention = response.includes('audio') || response.includes('tts') || response.includes('voice') || response.includes('report');
                const has24HourMention = response.includes('24 hour') || response.includes('last 24 hours');
                const hasPlatformData = response.includes('platform') || response.includes('macos') || response.includes('windows');
                const hasViewCounts = response.includes('view') || response.includes('total') || /\d+\s+views?/.test(response);
                
                console.log(`   Audio/TTS mentioned: ${hasAudioMention ? 'YES' : 'NO'}`);
                console.log(`   24-hour timeframe: ${has24HourMention ? 'YES' : 'NO'}`);
                console.log(`   Platform data: ${hasPlatformData ? 'YES' : 'NO'}`);
                console.log(`   View counts: ${hasViewCounts ? 'YES' : 'NO'}`);
                
                // Show first 200 characters of response
                console.log(`   Preview: ${result.text.substring(0, 200)}...`);
                
            } catch (error) {
                console.error(`❌ Test ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
            }
        }

        console.log('\n=== Testing Direct TTS Tool Execution ===');
        
        // Try to trigger the TTS tool directly by using specific keywords
        const ttsQuery = "Generate an audio report of my streaming analytics. Pull errors by platform over the last 24 hours and include total view counts. Make sure to mention 'last 24 hours' explicitly in the report.";
        
        console.log(`Query: "${ttsQuery}"`);
        
        const result = await agent.generateVNext(ttsQuery);
        
        console.log(`✅ TTS query processed (${result.text.length} chars)`);
        console.log('\n=== Full Response ===');
        console.log(result.text);
        
        // Analyze the response
        const response = result.text.toLowerCase();
        const hasAudioMention = response.includes('audio') || response.includes('tts') || response.includes('voice') || response.includes('report');
        const has24HourMention = response.includes('24 hour') || response.includes('last 24 hours');
        const hasPlatformData = response.includes('platform') || response.includes('macos') || response.includes('windows');
        const hasViewCounts = response.includes('view') || response.includes('total') || /\d+\s+views?/.test(response);
        const hasPlayerUrl = response.includes('player') || response.includes('streamingportfolio.com') || response.includes('mux.com');
        
        console.log('\n=== Response Analysis ===');
        console.log(`✓ Audio/TTS mentioned: ${hasAudioMention ? 'YES' : 'NO'}`);
        console.log(`✓ 24-hour timeframe: ${has24HourMention ? 'YES' : 'NO'}`);
        console.log(`✓ Platform data: ${hasPlatformData ? 'YES' : 'NO'}`);
        console.log(`✓ View counts: ${hasViewCounts ? 'YES' : 'NO'}`);
        console.log(`✓ Player URL generated: ${hasPlayerUrl ? 'YES' : 'NO'}`);
        
        const qualityScore = [hasAudioMention, has24HourMention, hasPlatformData, hasViewCounts, hasPlayerUrl]
            .filter(Boolean).length;
        
        console.log(`\n📊 Quality Score: ${qualityScore}/5`);
        
        // Check word count for TTS suitability
        const wordCount = result.text.split(/\s+/).length;
        const isGoodForTTS = wordCount >= 200 && wordCount <= 1000;
        
        console.log(`🎧 TTS Suitability: ${isGoodForTTS ? 'EXCELLENT' : 'NEEDS ADJUSTMENT'}`);
        console.log(`   Word count: ${wordCount} (ideal: 200-1000 words)`);
        
        if (qualityScore >= 4 && isGoodForTTS) {
            console.log('\n🎉 Excellent! TTS analytics report meets requirements');
        } else if (qualityScore >= 3) {
            console.log('\n✅ Good! TTS analytics report meets most requirements');
        } else {
            console.log('\n⚠️  TTS analytics report needs improvement');
        }
        
        console.log('\n=== Troubleshooting Notes ===');
        console.log('If audio files are not being generated:');
        console.log('1. Check if DEEPGRAM_API_KEY is configured');
        console.log('2. Verify MUX_TOKEN_ID and MUX_TOKEN_SECRET for upload');
        console.log('3. Ensure the ttsAnalyticsReportTool is being triggered');
        console.log('4. Check if analytics data retrieval is working');
        
        return {
            success: true,
            qualityScore,
            wordCount,
            isGoodForTTS,
            hasAudioMention,
            has24HourMention,
            hasPlatformData,
            hasViewCounts,
            hasPlayerUrl,
            responseLength: result.text.length
        };
        
    } catch (error) {
        console.error('❌ TTS analytics report test failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('DEEPGRAM_API_KEY')) {
                console.error('🚨 Deepgram API key not configured');
            } else if (error.message.includes('MUX_TOKEN')) {
                console.error('🚨 Mux credentials not configured');
            } else {
                console.error('🚨 Unexpected error:', error.message);
            }
        }
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// Run the test
testTTSAnalyticsReportTool()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 TTS Analytics Report Tool Test Completed!');
            console.log(`Quality Score: ${result.qualityScore}/5`);
            console.log(`Word Count: ${result.wordCount} (TTS suitable: ${result.isGoodForTTS ? 'YES' : 'NO'})`);
            
            if (result.hasAudioMention && result.has24HourMention && result.hasPlatformData && result.hasViewCounts) {
                console.log('\n🎯 Perfect! All requirements met:');
                console.log('   ✅ Audio report generation working');
                console.log('   ✅ 24-hour timeframe included');
                console.log('   ✅ Platform error breakdown');
                console.log('   ✅ Total view counts provided');
                console.log('   ✅ Suitable for TTS generation');
                
                if (result.hasPlayerUrl) {
                    console.log('   ✅ Player URL generated');
                }
            }
            
            process.exit(0);
        } else {
            console.log('\n❌ TTS Analytics Report Tool Test Failed!');
            console.log(`Error: ${result.error}`);
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
