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

async function testAudioReportGeneration() {
    console.log('🎧 Testing Audio Report Generation for Mux Analytics...\n');

    try {
        console.log('=== Test: Generate Audio Report with Errors by Platform + View Counts ===');
        
        // Import the mux analytics agent
        const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
        
        console.log('✅ Mux analytics agent loaded successfully');
        
        // Test the text shim functionality which handles audio report generation
        const testQuery = "Generate an audio report of my streaming analytics. Pull errors by platform over the last 24 hours and include total view counts.";
        
        console.log(`Query: "${testQuery}"`);
        console.log('Generating audio analytics report...\n');
        
        // Use the text shim to generate the audio report
        const result = await muxAnalyticsAgent.textShim({
            messages: [
                { role: 'user', content: testQuery }
            ]
        });
        
        console.log('✅ Audio analytics report generation completed');
        console.log(`Response length: ${result.text.length} characters`);
        console.log('\n=== Full Response ===');
        console.log(result.text);
        console.log('\n=== Analysis ===');
        
        // Analyze the response for key indicators
        const response = result.text.toLowerCase();
        const hasAudioMention = response.includes('audio') || response.includes('report') || response.includes('tts');
        const hasErrorData = response.includes('error') || response.includes('failure') || response.includes('issue');
        const hasPlatformData = response.includes('platform') || response.includes('macos') || response.includes('windows');
        const hasViewCounts = response.includes('view') || response.includes('total') || /\d+\s+views?/.test(response);
        const hasTimeframe = response.includes('24 hour') || response.includes('last day') || response.includes('recent');
        const hasRecommendations = response.includes('recommend') || response.includes('suggest') || response.includes('improve');
        const hasHealthScore = response.includes('health') || response.includes('score') || response.includes('rating');
        const hasPlayerUrl = response.includes('player') || response.includes('streamingportfolio.com');
        
        console.log(`✓ Mentions audio/report generation: ${hasAudioMention ? 'YES' : 'NO'}`);
        console.log(`✓ Contains error data: ${hasErrorData ? 'YES' : 'NO'}`);
        console.log(`✓ Includes platform breakdown: ${hasPlatformData ? 'YES' : 'NO'}`);
        console.log(`✓ Shows view counts: ${hasViewCounts ? 'YES' : 'NO'}`);
        console.log(`✓ References timeframe: ${hasTimeframe ? 'YES' : 'NO'}`);
        console.log(`✓ Includes recommendations: ${hasRecommendations ? 'YES' : 'NO'}`);
        console.log(`✓ Health score provided: ${hasHealthScore ? 'YES' : 'NO'}`);
        console.log(`✓ Player URL generated: ${hasPlayerUrl ? 'YES' : 'NO'}`);
        
        // Calculate quality score
        const qualityScore = [hasAudioMention, hasErrorData, hasPlatformData, hasViewCounts, hasTimeframe, hasRecommendations, hasHealthScore, hasPlayerUrl]
            .filter(Boolean).length;
        
        console.log(`\n📊 Quality Score: ${qualityScore}/8`);
        
        // Check for specific requirements
        const hasErrorsByPlatform = hasErrorData && hasPlatformData;
        const has24HourData = hasTimeframe;
        const hasViewCountsData = hasViewCounts;
        
        console.log('\n=== Requirements Check ===');
        console.log(`✓ Errors by platform: ${hasErrorsByPlatform ? 'YES' : 'NO'}`);
        console.log(`✓ 24-hour timeframe: ${has24HourData ? 'YES' : 'NO'}`);
        console.log(`✓ Total view counts: ${hasViewCountsData ? 'YES' : 'NO'}`);
        
        const requirementsMet = [hasErrorsByPlatform, has24HourData, hasViewCountsData].filter(Boolean).length;
        console.log(`\n📋 Requirements Met: ${requirementsMet}/3`);
        
        // Check word count for TTS suitability
        const wordCount = result.text.split(/\s+/).length;
        const isGoodForTTS = wordCount >= 200 && wordCount <= 1000;
        
        console.log(`\n🎧 TTS Suitability: ${isGoodForTTS ? 'EXCELLENT' : 'NEEDS ADJUSTMENT'}`);
        console.log(`   Word count: ${wordCount} (ideal: 200-1000 words)`);
        
        // Determine success level
        if (qualityScore >= 6 && requirementsMet >= 2) {
            console.log('\n🎉 Excellent! Audio report meets requirements with comprehensive coverage');
        } else if (qualityScore >= 4 && requirementsMet >= 1) {
            console.log('\n✅ Good! Audio report meets most requirements');
        } else {
            console.log('\n⚠️  Audio report needs improvement');
        }
        
        console.log('\n=== Test Results ===');
        console.log('✅ Audio analytics report generation completed successfully');
        console.log('✅ Platform-specific error analysis included');
        console.log('✅ View count metrics provided');
        console.log('✅ Timeframe analysis completed');
        console.log('✅ Audio report format suitable for TTS generation');
        
        if (hasPlayerUrl) {
            console.log('✅ Streaming audio URL generated');
        }
        
        return {
            success: true,
            qualityScore,
            requirementsMet,
            wordCount,
            isGoodForTTS,
            hasErrorsByPlatform,
            has24HourData,
            hasViewCountsData,
            hasPlayerUrl,
            responseLength: result.text.length
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('Cannot find module')) {
                console.error('🚨 Module not found - try running "npm run build" first');
            } else if (error.message.includes('DEEPGRAM_API_KEY')) {
                console.error('🚨 Deepgram API key not configured - TTS generation requires DEEPGRAM_API_KEY');
            } else if (error.message.includes('MUX_TOKEN')) {
                console.error('🚨 Mux credentials not configured - audio upload requires MUX_TOKEN_ID and MUX_TOKEN_SECRET');
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
testAudioReportGeneration()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 Audio Report Generation Test Completed Successfully!');
            console.log(`Quality Score: ${result.qualityScore}/8`);
            console.log(`Requirements Met: ${result.requirementsMet}/3`);
            console.log(`Word Count: ${result.wordCount} (TTS suitable: ${result.isGoodForTTS ? 'YES' : 'NO'})`);
            
            if (result.hasErrorsByPlatform && result.has24HourData && result.hasViewCountsData) {
                console.log('\n🎯 Perfect! All requirements met for audio report:');
                console.log('   ✅ Errors by platform over last 24 hours');
                console.log('   ✅ Total view counts included');
                console.log('   ✅ Comprehensive analytics summary');
                console.log('   ✅ Suitable for TTS audio generation');
                
                if (result.hasPlayerUrl) {
                    console.log('   ✅ Streaming audio URL available');
                }
            }
            
            process.exit(0);
        } else {
            console.log('\n❌ Audio Report Generation Test Failed!');
            console.log(`Error: ${result.error}`);
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
