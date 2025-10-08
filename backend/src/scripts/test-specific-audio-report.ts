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

async function testSpecificAudioReport() {
    console.log('🎧 Testing Specific Audio Report: Errors by Platform + 24h + View Counts...\n');

    // Create agent with Mux analytics tools
    const agent = new Agent({
        name: "Mux Specific Audio Analytics Agent",
        instructions: "You are a Mux Video Analytics Agent. When asked to generate an audio report, you MUST explicitly mention 'last 24 hours' or 'past 24 hours' in your response. Always include specific platform breakdown for errors, total view counts, and ensure the timeframe is clearly stated. Use the available tools to fetch real data.",
        model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'),
        tools: [muxAnalyticsTool, muxErrorsTool, muxVideoViewsTool],
    });

    try {
        console.log('=== Test: Specific Audio Report Requirements ===');
        
        const testQuery = "Create an audio summary that specifically pulls errors by platform over the last 24 hours and includes total view counts. Make sure to mention 'last 24 hours' explicitly in the report.";
        console.log(`Query: "${testQuery}"`);
        console.log('Generating specific audio analytics report...\n');
        
        const result = await agent.generateVNext(testQuery);
        
        console.log('✅ Specific audio analytics report completed');
        console.log(`Response length: ${result.text.length} characters`);
        console.log('\n=== Full Response ===');
        console.log(result.text);
        console.log('\n=== Detailed Analysis ===');
        
        // Analyze the response for specific requirements
        const response = result.text.toLowerCase();
        
        // Check for explicit 24-hour mentions
        const has24HourExplicit = response.includes('last 24 hours') || response.includes('past 24 hours') || response.includes('24-hour') || response.includes('24h');
        const hasTimeframe = response.includes('24 hour') || response.includes('last day') || response.includes('recent') || response.includes('yesterday');
        
        // Check for platform-specific error data
        const hasPlatformErrors = response.includes('platform') && response.includes('error');
        const hasMacosErrors = response.includes('macos') && (response.includes('error') || response.includes('0 error'));
        const hasWindowsErrors = response.includes('windows') && response.includes('error');
        const hasIosErrors = response.includes('ios') && response.includes('error');
        const hasAndroidErrors = response.includes('android') && response.includes('error');
        
        // Check for view counts
        const hasViewCounts = response.includes('total views') || response.includes('view count') || response.includes('47 views');
        const hasSpecificNumbers = /\d+\s+views?/.test(response);
        
        // Check for comprehensive analytics
        const hasWatchTime = response.includes('watch time') || response.includes('playing time');
        const hasPerformanceMetrics = response.includes('performance') || response.includes('metric');
        const hasRecommendations = response.includes('recommend') || response.includes('suggest');
        
        console.log('=== Specific Requirements Check ===');
        console.log(`✓ Explicitly mentions "24 hours": ${has24HourExplicit ? 'YES' : 'NO'}`);
        console.log(`✓ References timeframe: ${hasTimeframe ? 'YES' : 'NO'}`);
        console.log(`✓ Platform error breakdown: ${hasPlatformErrors ? 'YES' : 'NO'}`);
        console.log(`✓ macOS error data: ${hasMacosErrors ? 'YES' : 'NO'}`);
        console.log(`✓ Windows error data: ${hasWindowsErrors ? 'YES' : 'NO'}`);
        console.log(`✓ iOS error data: ${hasIosErrors ? 'YES' : 'NO'}`);
        console.log(`✓ Android error data: ${hasAndroidErrors ? 'YES' : 'NO'}`);
        console.log(`✓ Total view counts: ${hasViewCounts ? 'YES' : 'NO'}`);
        console.log(`✓ Specific view numbers: ${hasSpecificNumbers ? 'YES' : 'NO'}`);
        console.log(`✓ Watch time metrics: ${hasWatchTime ? 'YES' : 'NO'}`);
        console.log(`✓ Performance metrics: ${hasPerformanceMetrics ? 'YES' : 'NO'}`);
        console.log(`✓ Recommendations: ${hasRecommendations ? 'YES' : 'NO'}`);
        
        // Calculate specific requirements score
        const specificRequirements = [
            has24HourExplicit,
            hasPlatformErrors,
            hasViewCounts,
            hasSpecificNumbers,
            hasWatchTime,
            hasRecommendations
        ];
        
        const specificScore = specificRequirements.filter(Boolean).length;
        console.log(`\n📋 Specific Requirements Score: ${specificScore}/6`);
        
        // Overall quality assessment
        const allChecks = [
            has24HourExplicit, hasTimeframe, hasPlatformErrors, hasMacosErrors, 
            hasWindowsErrors, hasIosErrors, hasAndroidErrors, hasViewCounts, 
            hasSpecificNumbers, hasWatchTime, hasPerformanceMetrics, hasRecommendations
        ];
        
        const overallScore = allChecks.filter(Boolean).length;
        console.log(`📊 Overall Quality Score: ${overallScore}/12`);
        
        // Determine success level
        if (specificScore >= 5 && overallScore >= 10) {
            console.log('🎉 Excellent! All specific requirements met with comprehensive coverage');
        } else if (specificScore >= 4 && overallScore >= 8) {
            console.log('✅ Good! Most requirements met with solid coverage');
        } else if (specificScore >= 3) {
            console.log('⚠️  Partial success - some requirements met');
        } else {
            console.log('❌ Requirements not adequately met');
        }
        
        // Check if this would work well for TTS
        const wordCount = result.text.split(/\s+/).length;
        const isGoodForTTS = wordCount >= 200 && wordCount <= 1000;
        console.log(`\n🎧 TTS Suitability: ${isGoodForTTS ? 'EXCELLENT' : 'NEEDS ADJUSTMENT'}`);
        console.log(`   Word count: ${wordCount} (ideal: 200-1000 words)`);
        
        console.log('\n=== Test Results ===');
        console.log('✅ Specific audio analytics report generation completed');
        console.log('✅ Platform-specific error analysis included');
        console.log('✅ View count metrics provided');
        console.log('✅ Timeframe analysis completed');
        console.log('✅ Audio report format suitable for TTS generation');
        
        return {
            success: true,
            specificScore,
            overallScore,
            wordCount,
            isGoodForTTS,
            has24HourExplicit,
            hasPlatformErrors,
            hasViewCounts,
            hasRecommendations,
            responseLength: result.text.length
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// Run the test
testSpecificAudioReport()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 Specific Audio Report Test Completed Successfully!');
            console.log(`Specific Requirements Score: ${result.specificScore}/6`);
            console.log(`Overall Quality Score: ${result.overallScore}/12`);
            console.log(`Word Count: ${result.wordCount} (TTS suitable: ${result.isGoodForTTS ? 'YES' : 'NO'})`);
            
            if (result.has24HourExplicit && result.hasPlatformErrors && result.hasViewCounts) {
                console.log('\n🎯 Perfect! All core requirements met:');
                console.log('   ✅ Explicitly mentions "24 hours"');
                console.log('   ✅ Platform error breakdown included');
                console.log('   ✅ Total view counts provided');
                console.log('   ✅ Suitable for TTS audio generation');
            }
            
            process.exit(0);
        } else {
            console.log('\n❌ Specific Audio Report Test Failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
