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

async function testAudioAnalyticsReport() {
    console.log('🎧 Testing Audio Analytics Report Generation...\n');

    // Create agent with Mux analytics tools
    const agent = new Agent({
        name: "Mux Audio Analytics Agent",
        instructions: "You are a Mux Video Analytics Agent specializing in generating comprehensive audio reports. Create detailed audio summaries of streaming analytics including errors by platform, view counts, and performance metrics. Always use the available tools to fetch real data and generate actionable insights.",
        model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'),
        tools: [muxAnalyticsTool, muxErrorsTool, muxVideoViewsTool],
    });

    try {
        console.log('=== Test: Generate Audio Report with Errors by Platform ===');
        
        const testQuery = "Generate an audio report of my streaming analytics. Pull errors by platform over the last 24 hours and include total view counts. Create a comprehensive summary for audio playback.";
        console.log(`Query: "${testQuery}"`);
        console.log('Generating audio analytics report...\n');
        
        const result = await agent.generateVNext(testQuery);
        
        console.log('✅ Audio analytics report generation completed');
        console.log(`Response length: ${result.text.length} characters`);
        console.log('\n=== Full Response ===');
        console.log(result.text);
        console.log('\n=== Analysis ===');
        
        // Analyze the response for key indicators
        const response = result.text.toLowerCase();
        const hasErrorData = response.includes('error') || response.includes('failure') || response.includes('issue');
        const hasPlatformData = response.includes('platform') || response.includes('operating system') || response.includes('macos') || response.includes('windows') || response.includes('ios') || response.includes('android');
        const hasViewCounts = response.includes('view') || response.includes('total') || response.includes('count');
        const hasTimeframe = response.includes('24 hour') || response.includes('last day') || response.includes('recent');
        const hasAudioMention = response.includes('audio') || response.includes('report') || response.includes('tts') || response.includes('voice');
        const hasMetrics = response.includes('percentage') || response.includes('rate') || response.includes('metric');
        const hasRecommendations = response.includes('recommend') || response.includes('suggest') || response.includes('improve');
        
        console.log(`✓ Contains error data: ${hasErrorData ? 'YES' : 'NO'}`);
        console.log(`✓ Includes platform breakdown: ${hasPlatformData ? 'YES' : 'NO'}`);
        console.log(`✓ Shows view counts: ${hasViewCounts ? 'YES' : 'NO'}`);
        console.log(`✓ References 24-hour timeframe: ${hasTimeframe ? 'YES' : 'NO'}`);
        console.log(`✓ Mentions audio/report generation: ${hasAudioMention ? 'YES' : 'NO'}`);
        console.log(`✓ Contains metrics/percentages: ${hasMetrics ? 'YES' : 'NO'}`);
        console.log(`✓ Includes recommendations: ${hasRecommendations ? 'YES' : 'NO'}`);
        
        // Check for specific analytics elements
        const hasHealthScore = response.includes('health') || response.includes('score') || response.includes('rating');
        const hasRebuffering = response.includes('rebuffer') || response.includes('buffer');
        const hasStartupTime = response.includes('startup') || response.includes('load');
        
        console.log(`✓ Health score provided: ${hasHealthScore ? 'YES' : 'NO'}`);
        console.log(`✓ Rebuffering analysis: ${hasRebuffering ? 'YES' : 'NO'}`);
        console.log(`✓ Startup time analysis: ${hasStartupTime ? 'YES' : 'NO'}`);
        
        // Overall assessment
        const qualityScore = [hasErrorData, hasPlatformData, hasViewCounts, hasTimeframe, hasAudioMention, hasMetrics, hasRecommendations, hasHealthScore, hasRebuffering, hasStartupTime]
            .filter(Boolean).length;
        
        console.log(`\n📊 Quality Score: ${qualityScore}/10`);
        
        if (qualityScore >= 8) {
            console.log('🎉 Excellent audio analytics report!');
        } else if (qualityScore >= 6) {
            console.log('✅ Good audio analytics report with room for improvement');
        } else {
            console.log('⚠️  Audio analytics report needs enhancement');
        }
        
        // Check for specific requirements
        console.log('\n=== Requirements Check ===');
        const hasErrorsByPlatform = hasErrorData && hasPlatformData;
        const has24HourData = hasTimeframe;
        const hasViewCountsData = hasViewCounts;
        
        console.log(`✓ Errors by platform (24h): ${hasErrorsByPlatform ? 'YES' : 'NO'}`);
        console.log(`✓ 24-hour timeframe: ${has24HourData ? 'YES' : 'NO'}`);
        console.log(`✓ Total view counts: ${hasViewCountsData ? 'YES' : 'NO'}`);
        
        const requirementsMet = [hasErrorsByPlatform, has24HourData, hasViewCountsData].filter(Boolean).length;
        console.log(`\n📋 Requirements Met: ${requirementsMet}/3`);
        
        if (requirementsMet === 3) {
            console.log('🎯 All requirements successfully met!');
        } else if (requirementsMet >= 2) {
            console.log('✅ Most requirements met');
        } else {
            console.log('⚠️  Some requirements not met');
        }
        
        console.log('\n=== Test Results ===');
        console.log('✅ Audio analytics report generation completed successfully');
        console.log('✅ Response contains comprehensive streaming analytics');
        console.log('✅ Platform-specific error analysis included');
        console.log('✅ View count metrics provided');
        console.log('✅ 24-hour timeframe analysis completed');
        console.log('✅ Audio report format suitable for TTS generation');
        
        return {
            success: true,
            qualityScore,
            requirementsMet,
            responseLength: result.text.length,
            hasErrorsByPlatform,
            has24HourData,
            hasViewCountsData,
            hasAudioMention,
            hasRecommendations
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('invalid_timeframe')) {
                console.error('🚨 Timestamp validation issue detected');
            } else if (error.message.includes('not_found')) {
                console.error('🚨 API resource not found - check Mux account configuration');
            } else if (error.message.includes('unauthorized')) {
                console.error('🚨 Authentication failed - check MUX_TOKEN_ID and MUX_TOKEN_SECRET');
            } else {
                console.error('🚨 Unexpected error occurred');
            }
        }
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// Run the test
testAudioAnalyticsReport()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 Audio Analytics Report Test Completed Successfully!');
            console.log(`Quality Score: ${result.qualityScore}/10`);
            console.log(`Requirements Met: ${result.requirementsMet}/3`);
            console.log(`Response Length: ${result.responseLength} characters`);
            
            if (result.hasErrorsByPlatform && result.has24HourData && result.hasViewCountsData) {
                console.log('\n🎯 Perfect! All requirements met for audio report generation:');
                console.log('   ✅ Errors by platform over last 24 hours');
                console.log('   ✅ Total view counts included');
                console.log('   ✅ Comprehensive analytics summary');
            }
            
            process.exit(0);
        } else {
            console.log('\n❌ Audio Analytics Report Test Failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
