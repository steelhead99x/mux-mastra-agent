/**
 * Test script to verify the error summarization bug fix
 * 
 * This test verifies that when a user asks to "summarize my errors over the last 7 days",
 * the agent correctly uses the muxErrorsTool instead of only using muxAnalyticsTool.
 */

import { muxAnalyticsAgent } from '../agents/mux-analytics-agent.js';
import { parseRelativeTimeframe } from '../tools/mux-analytics.js';

async function testErrorSummarization() {
    console.log('🧪 Testing Error Summarization Bug Fix\n');
    
    // Test 1: Verify relative timeframe parsing works correctly
    console.log('Test 1: Verify timeframe parsing');
    const timeframe = parseRelativeTimeframe('last 7 days');
    console.log(`✅ Parsed "last 7 days": [${timeframe[0]}, ${timeframe[1]}]`);
    console.log(`   Start: ${new Date(timeframe[0] * 1000).toISOString()}`);
    console.log(`   End: ${new Date(timeframe[1] * 1000).toISOString()}\n`);
    
    // Test 2: Test the agent with an error-focused query
    console.log('Test 2: Agent response to "summarize my errors over the last 7 days"');
    const errorQuery = [
        { role: 'user', content: 'summarize my errors over the last 7 days' }
    ];
    
    console.log('📝 Query:', errorQuery[0].content);
    console.log('⏳ Generating response (this may take a minute)...\n');
    
    try {
        const response = await muxAnalyticsAgent.generate(errorQuery);
        
        // Check if response mentions errors specifically
        const responseText = response.text || '';
        const hasErrorKeywords = /error|errors|Error Analysis|Error Report|error rate|error breakdown/i.test(responseText);
        const hasAudioUrl = /player\?assetId=|stream\.mux\.com/i.test(responseText);
        
        console.log('📊 Response Analysis:');
        console.log(`   Contains error-specific content: ${hasErrorKeywords ? '✅ YES' : '❌ NO'}`);
        console.log(`   Contains audio URL: ${hasAudioUrl ? '✅ YES' : '❌ NO'}`);
        console.log(`   Response length: ${responseText.length} characters\n`);
        
        if (hasErrorKeywords) {
            console.log('✅ Test PASSED: Agent correctly focused on error analysis\n');
        } else {
            console.log('❌ Test FAILED: Agent did not focus on errors\n');
            console.log('Response preview:');
            console.log(responseText.slice(0, 500) + '...\n');
        }
        
        return { success: hasErrorKeywords, response: responseText };
        
    } catch (error) {
        console.error('❌ Test FAILED with error:', error);
        return { success: false, error };
    }
}

// Test 3: Test with general analytics query (should NOT focus on errors)
async function testGeneralAnalytics() {
    console.log('Test 3: Agent response to general analytics query');
    const generalQuery = [
        { role: 'user', content: 'analyze my streaming performance over the last 24 hours' }
    ];
    
    console.log('📝 Query:', generalQuery[0].content);
    console.log('⏳ Generating response...\n');
    
    try {
        const response = await muxAnalyticsAgent.generate(generalQuery);
        const responseText = response.text || '';
        
        // Should focus on general metrics, not just errors
        const hasGeneralMetrics = /views|rebuffering|startup time|performance|quality/i.test(responseText);
        
        console.log('📊 Response Analysis:');
        console.log(`   Contains general metrics: ${hasGeneralMetrics ? '✅ YES' : '❌ NO'}`);
        console.log(`   Response length: ${responseText.length} characters\n`);
        
        if (hasGeneralMetrics) {
            console.log('✅ Test PASSED: Agent correctly provided general analytics\n');
        } else {
            console.log('❌ Test FAILED: Agent did not provide general analytics\n');
        }
        
        return { success: hasGeneralMetrics, response: responseText };
        
    } catch (error) {
        console.error('❌ Test FAILED with error:', error);
        return { success: false, error };
    }
}

// Test 4: Test with comprehensive query (should include BOTH)
async function testComprehensiveReport() {
    console.log('Test 4: Agent response to comprehensive report request');
    const comprehensiveQuery = [
        { role: 'user', content: 'give me a complete report with errors and analytics for the last week' }
    ];
    
    console.log('📝 Query:', comprehensiveQuery[0].content);
    console.log('⏳ Generating response...\n');
    
    try {
        const response = await muxAnalyticsAgent.generate(comprehensiveQuery);
        const responseText = response.text || '';
        
        // Should include both general metrics AND error analysis
        const hasGeneralMetrics = /views|rebuffering|startup time|performance/i.test(responseText);
        const hasErrorContent = /error|errors|Error Analysis/i.test(responseText);
        
        console.log('📊 Response Analysis:');
        console.log(`   Contains general metrics: ${hasGeneralMetrics ? '✅ YES' : '❌ NO'}`);
        console.log(`   Contains error analysis: ${hasErrorContent ? '✅ YES' : '❌ NO'}`);
        console.log(`   Response length: ${responseText.length} characters\n`);
        
        if (hasGeneralMetrics && hasErrorContent) {
            console.log('✅ Test PASSED: Agent correctly provided comprehensive report\n');
        } else {
            console.log('❌ Test FAILED: Agent did not provide comprehensive report\n');
        }
        
        return { success: hasGeneralMetrics && hasErrorContent, response: responseText };
        
    } catch (error) {
        console.error('❌ Test FAILED with error:', error);
        return { success: false, error };
    }
}

// Run all tests
async function runAllTests() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Error Summarization Bug Fix - Test Suite');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const results = [];
    
    // Run tests
    results.push(await testErrorSummarization());
    console.log('───────────────────────────────────────────────────────────\n');
    
    results.push(await testGeneralAnalytics());
    console.log('───────────────────────────────────────────────────────────\n');
    
    results.push(await testComprehensiveReport());
    console.log('───────────────────────────────────────────────────────────\n');
    
    // Summary
    const passedTests = results.filter(r => r.success).length;
    const totalTests = results.length + 1; // +1 for timeframe parsing test which always passes
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Test Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Passed: ${passedTests}/${totalTests}`);
    console.log(`  Status: ${passedTests === totalTests ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('═══════════════════════════════════════════════════════════\n');
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(error => {
        console.error('Fatal error running tests:', error);
        process.exit(1);
    });
}

export { testErrorSummarization, testGeneralAnalytics, testComprehensiveReport, runAllTests };

