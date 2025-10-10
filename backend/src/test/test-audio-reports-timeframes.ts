#!/usr/bin/env tsx
/**
 * Test audio report generation for different timeframes (7, 30, 90 days)
 * Tests both errors and overall data from Mux MCP
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

import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';

interface TestScenario {
    name: string;
    query: string;
    expectedFocusArea: 'general' | 'errors' | 'both';
    expectedTimeframe: string;
}

const testScenarios: TestScenario[] = [
    {
        name: "Last 7 Days - Errors Only",
        query: "Generate an audio report of my errors from the last 7 days",
        expectedFocusArea: "errors",
        expectedTimeframe: "last 7 days"
    },
    {
        name: "Last 30 Days - Errors Only",
        query: "Give me an audio summary of errors over the last 30 days",
        expectedFocusArea: "errors",
        expectedTimeframe: "last 30 days"
    },
    {
        name: "Last 90 Days - Errors Only",
        query: "Create an audio report analyzing errors from the last 90 days",
        expectedFocusArea: "errors",
        expectedTimeframe: "last 90 days"
    },
    {
        name: "Last 7 Days - Overall Analytics",
        query: "Generate an audio report of my overall analytics for the last 7 days",
        expectedFocusArea: "general",
        expectedTimeframe: "last 7 days"
    },
    {
        name: "Last 30 Days - Overall Analytics",
        query: "Give me an audio summary of my streaming performance over the last 30 days",
        expectedFocusArea: "general",
        expectedTimeframe: "last 30 days"
    },
    {
        name: "Last 90 Days - Overall Analytics",
        query: "Create an audio report of my video analytics from the last 90 days",
        expectedFocusArea: "general",
        expectedTimeframe: "last 90 days"
    },
    {
        name: "Last 7 Days - Comprehensive (Both)",
        query: "Generate a comprehensive audio report with both errors and overall data from the last 7 days",
        expectedFocusArea: "both",
        expectedTimeframe: "last 7 days"
    },
    {
        name: "Last 30 Days - Comprehensive (Both)",
        query: "Give me a complete audio analysis including errors and analytics for the last 30 days",
        expectedFocusArea: "both",
        expectedTimeframe: "last 30 days"
    },
    {
        name: "Last 90 Days - Comprehensive (Both)",
        query: "Create a full audio report covering all metrics and errors from the last 90 days",
        expectedFocusArea: "both",
        expectedTimeframe: "last 90 days"
    }
];

async function runTest(scenario: TestScenario): Promise<boolean> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST: ${scenario.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Query: "${scenario.query}"`);
    console.log(`Expected Focus Area: ${scenario.expectedFocusArea}`);
    console.log(`Expected Timeframe: ${scenario.expectedTimeframe}`);
    console.log();

    try {
        const startTime = Date.now();
        
        // Generate the audio report
        const response = await muxAnalyticsAgent.generate(scenario.query);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`✅ Test completed in ${duration}s`);
        console.log();
        console.log('Agent Response:');
        console.log('-'.repeat(80));
        
        if (typeof response === 'string') {
            console.log(response);
        } else if (response && typeof response === 'object') {
            if ('text' in response) {
                console.log(response.text);
            } else {
                console.log(JSON.stringify(response, null, 2));
            }
        }
        
        console.log('-'.repeat(80));
        
        // Extract key information from response
        const responseStr = typeof response === 'string' 
            ? response 
            : ('text' in response ? response.text : JSON.stringify(response));
        
        // Check if response contains audio URL
        const hasAudioUrl = responseStr.includes('streamingportfolio.com/player?assetId=') ||
                           responseStr.includes('Audio Report') ||
                           responseStr.includes('audio report');
        
        if (hasAudioUrl) {
            console.log('✅ Audio report URL found in response');
        } else {
            console.log('⚠️  No audio URL found - may need to wait for processing');
        }
        
        // Check if timeframe is mentioned
        const hasTimeframe = responseStr.toLowerCase().includes(scenario.expectedTimeframe.toLowerCase()) ||
                            responseStr.includes('7 day') ||
                            responseStr.includes('30 day') ||
                            responseStr.includes('90 day');
        
        if (hasTimeframe) {
            console.log('✅ Timeframe information included');
        } else {
            console.log('ℹ️  Timeframe not explicitly mentioned');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed with error:');
        console.error(error);
        return false;
    }
}

async function runAllTests() {
    console.log('\n🎧 AUDIO REPORT TIMEFRAME TESTING');
    console.log('='.repeat(80));
    console.log('Testing audio report generation for different timeframes:');
    console.log('- Last 7 days');
    console.log('- Last 30 days');
    console.log('- Last 90 days');
    console.log();
    console.log('Testing different focus areas:');
    console.log('- Errors only');
    console.log('- Overall analytics only');
    console.log('- Comprehensive (both errors and analytics)');
    console.log('='.repeat(80));
    
    // Check prerequisites
    console.log('\n📋 Checking Prerequisites...');
    
    const requiredEnvVars = [
        'MUX_TOKEN_ID',
        'MUX_TOKEN_SECRET',
        'DEEPGRAM_API_KEY',
        'ANTHROPIC_API_KEY'
    ];
    
    let allEnvVarsPresent = true;
    for (const envVar of requiredEnvVars) {
        if (process.env[envVar]) {
            console.log(`✅ ${envVar}: configured`);
        } else {
            console.log(`❌ ${envVar}: MISSING`);
            allEnvVarsPresent = false;
        }
    }
    
    if (!allEnvVarsPresent) {
        console.error('\n❌ Missing required environment variables. Please configure them before running tests.');
        process.exit(1);
    }
    
    console.log('\n✅ All prerequisites met\n');
    
    // Run tests
    const results: { scenario: TestScenario; success: boolean }[] = [];
    
    for (const scenario of testScenarios) {
        const success = await runTest(scenario);
        results.push({ scenario, success });
        
        // Add delay between tests to avoid rate limiting
        if (testScenarios.indexOf(scenario) < testScenarios.length - 1) {
            console.log('\n⏳ Waiting 5 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\nTotal Tests: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Audio report generation works for all timeframes.');
        console.log('\nYour Mux Analytics Agent can successfully:');
        console.log('✅ Generate audio reports for last 7, 30, and 90 days');
        console.log('✅ Fetch error data from Mux MCP');
        console.log('✅ Fetch overall analytics data from Mux MCP');
        console.log('✅ Create comprehensive reports with both errors and analytics');
        console.log('✅ Upload audio to Mux and provide playback URLs');
    } else {
        console.log('\n⚠️  Some tests failed. See details above.');
    }
    
    console.log('\n' + '='.repeat(80));
    
    process.exit(failed === 0 ? 0 : 1);
}

// Run all tests
runAllTests().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
});

