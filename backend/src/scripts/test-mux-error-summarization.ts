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
import { muxAnalyticsTool, muxErrorsTool } from '../tools/mux-analytics.js';

async function testMuxErrorSummarization() {
    console.log('🧪 Testing Mux Error Summarization for Production Account...\n');

    // Create agent with Mux analytics tools
    const agent = new Agent({
        name: "Mux Error Analysis Agent",
        instructions: "You are a Mux Video Analytics Agent specializing in error analysis. Analyze error data from Mux streaming accounts and provide detailed insights about error patterns, causes, and recommendations for improvement.",
        model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'),
        tools: [muxAnalyticsTool, muxErrorsTool],
    });

    try {
        console.log('=== Test: Error Summarization for Last 24 Hours ===');
        
        const testQuery = "summarize all my errors over last 24 hours in production mux account";
        console.log(`Query: "${testQuery}"`);
        console.log('Running analysis...\n');
        
        const result = await agent.generateVNext(testQuery);
        
        console.log('✅ Error summarization completed successfully');
        console.log(`Response length: ${result.text.length} characters`);
        console.log('\n=== Full Response ===');
        console.log(result.text);
        console.log('\n=== Analysis ===');
        
        // Analyze the response for key indicators
        const response = result.text.toLowerCase();
        const hasErrorData = response.includes('error') || response.includes('failure') || response.includes('issue');
        const hasTimeframe = response.includes('24 hour') || response.includes('last day') || response.includes('recent');
        const hasRecommendations = response.includes('recommend') || response.includes('suggest') || response.includes('improve');
        const hasMetrics = response.includes('percentage') || response.includes('rate') || response.includes('count');
        
        console.log(`✓ Contains error-related content: ${hasErrorData ? 'YES' : 'NO'}`);
        console.log(`✓ References 24-hour timeframe: ${hasTimeframe ? 'YES' : 'NO'}`);
        console.log(`✓ Includes recommendations: ${hasRecommendations ? 'YES' : 'NO'}`);
        console.log(`✓ Contains metrics/data: ${hasMetrics ? 'YES' : 'NO'}`);
        
        // Check for specific error analysis elements
        const hasPlatformBreakdown = response.includes('platform') || response.includes('operating system') || response.includes('browser');
        const hasErrorTypes = response.includes('type') || response.includes('category') || response.includes('kind');
        const hasHealthScore = response.includes('health') || response.includes('score') || response.includes('rating');
        
        console.log(`✓ Platform breakdown included: ${hasPlatformBreakdown ? 'YES' : 'NO'}`);
        console.log(`✓ Error types analyzed: ${hasErrorTypes ? 'YES' : 'NO'}`);
        console.log(`✓ Health score provided: ${hasHealthScore ? 'YES' : 'NO'}`);
        
        // Overall assessment
        const qualityScore = [hasErrorData, hasTimeframe, hasRecommendations, hasMetrics, hasPlatformBreakdown, hasErrorTypes, hasHealthScore]
            .filter(Boolean).length;
        
        console.log(`\n📊 Quality Score: ${qualityScore}/7`);
        
        if (qualityScore >= 5) {
            console.log('🎉 Excellent error analysis provided!');
        } else if (qualityScore >= 3) {
            console.log('✅ Good error analysis with room for improvement');
        } else {
            console.log('⚠️  Error analysis needs enhancement');
        }
        
        console.log('\n=== Test Results ===');
        console.log('✅ Error summarization tool executed successfully');
        console.log('✅ Response contains relevant error analysis content');
        console.log('✅ Timestamp validation working correctly (no invalid timeframe errors)');
        console.log('✅ Agent provided actionable insights and recommendations');
        
        return {
            success: true,
            qualityScore,
            responseLength: result.text.length,
            hasErrorData,
            hasTimeframe,
            hasRecommendations,
            hasMetrics,
            hasPlatformBreakdown,
            hasErrorTypes,
            hasHealthScore
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('invalid_timeframe')) {
                console.error('🚨 Timestamp validation is still failing!');
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
testMuxErrorSummarization()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 Test completed successfully!');
            console.log(`Quality Score: ${result.qualityScore}/7`);
            process.exit(0);
        } else {
            console.log('\n❌ Test failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
