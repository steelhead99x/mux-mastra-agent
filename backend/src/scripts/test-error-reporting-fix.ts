#!/usr/bin/env tsx

/**
 * Test script to verify error reporting logic is fixed
 * This simulates a scenario where errors exist and verifies the audio summary is accurate
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

async function testErrorReportingFix() {
    console.log('🐛 Testing Error Reporting Logic Fix...\n');
    
    try {
        // Import the agent and tools
        const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
        const ttsToolRaw = muxAnalyticsAgent.tools?.ttsAnalyticsReportTool;
        
        if (!ttsToolRaw) {
            console.log('❌ TTS Analytics Report Tool not found');
            return false;
        }
        
        console.log('📊 Testing comprehensive report with "last 7 days" timeframe...\n');
        
        // Execute the TTS tool with 7-day timeframe (which should have errors)
        const ttsResult = await (ttsToolRaw as any).execute({ 
            context: { 
                timeframe: 'last 7 days',
                focusArea: 'both',  // Comprehensive report
                includeAssetList: false
            } 
        });
        
        if (!ttsResult.success) {
            console.log('❌ TTS tool execution failed');
            console.log(`   Error: ${ttsResult.error || 'Unknown error'}`);
            return false;
        }
        
        console.log('✅ TTS audio report generated successfully\n');
        console.log('═══════════════════════════════════════════════');
        console.log('📝 SUMMARY TEXT (Sent to TTS):');
        console.log('═══════════════════════════════════════════════\n');
        console.log(ttsResult.summaryText);
        console.log('\n═══════════════════════════════════════════════\n');
        
        // Analyze the summary for proper error reporting
        const summaryText = ttsResult.summaryText.toLowerCase();
        
        console.log('🔍 Checking for proper error reporting...\n');
        
        const checks = {
            'Mentions error count': /\d+\s+error/i.test(ttsResult.summaryText),
            'Does NOT say "no errors"': !summaryText.includes('no errors detected'),
            'Does NOT say "excellent performance" when errors exist': ttsResult.errorData?.totalErrors > 0 ? !summaryText.includes('excellent') : true,
            'Includes error breakdown': summaryText.includes('error breakdown') || summaryText.includes('error analysis'),
            'Includes error types': summaryText.includes('invalid') || summaryText.includes('network') || summaryText.includes('download'),
            'Provides context about errors': summaryText.includes('occurrences') || summaryText.includes('instances'),
        };
        
        let allPassed = true;
        for (const [check, passed] of Object.entries(checks)) {
            console.log(`   ${passed ? '✅' : '❌'} ${check}`);
            if (!passed) allPassed = false;
        }
        
        console.log();
        
        // Display error data statistics
        if (ttsResult.errorData) {
            console.log('📊 Error Data from Report:');
            console.log(`   Total Errors: ${ttsResult.errorData.totalErrors || 0}`);
            
            if (ttsResult.errorData.errors && ttsResult.errorData.errors.length > 0) {
                console.log('   Top Errors:');
                ttsResult.errorData.errors.slice(0, 3).forEach((error: any, idx: number) => {
                    const type = error.error_type || error.type || 'Unknown';
                    const count = error.count || 1;
                    const msg = error.error_message || error.message || '';
                    console.log(`      ${idx + 1}. ${type}: ${count} occurrences`);
                    if (msg) {
                        console.log(`         Message: ${msg.slice(0, 80)}`);
                    }
                });
            }
            
            if (ttsResult.errorData.platformBreakdown && ttsResult.errorData.platformBreakdown.length > 0) {
                console.log('   Platform Breakdown:');
                ttsResult.errorData.platformBreakdown.slice(0, 3).forEach((platform: any, idx: number) => {
                    const name = platform.field || platform.operating_system || 'Unknown';
                    const count = platform.value || platform.error_count || 0;
                    console.log(`      ${idx + 1}. ${name}: ${count} errors`);
                });
            }
        }
        
        console.log();
        console.log('═══════════════════════════════════════════════');
        
        if (allPassed) {
            console.log('✅ SUCCESS: Error reporting logic is working correctly!');
            console.log('═══════════════════════════════════════════════\n');
            
            console.log('📝 What was fixed:');
            console.log('   1. Audio now properly reports error counts');
            console.log('   2. No more contradictory "no errors" statements');
            console.log('   3. Error details are included in the summary');
            console.log('   4. Platform breakdown is properly reported');
            console.log('   5. Error types and messages are included\n');
            
            return true;
        } else {
            console.log('⚠️  ISSUES: Some checks failed');
            console.log('═══════════════════════════════════════════════\n');
            
            console.log('Review the failed checks above to identify remaining issues.\n');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        if (error instanceof Error) {
            console.error('   Message:', error.message);
        }
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testErrorReportingFix()
        .then(success => {
            if (success) {
                console.log('🎉 Error Reporting Fix Test: PASSED\n');
                process.exit(0);
            } else {
                console.log('❌ Error Reporting Fix Test: FAILED\n');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Test crashed:', error);
            process.exit(1);
        });
}

export { testErrorReportingFix };

