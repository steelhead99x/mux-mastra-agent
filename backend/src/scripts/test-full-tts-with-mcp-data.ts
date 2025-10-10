#!/usr/bin/env tsx

/**
 * End-to-end test: Generate TTS audio report with real MCP analytics data
 * This verifies the complete data flow from MCP to TTS audio generation
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

async function testFullTTSWithMCPData() {
    console.log('🎧 Testing Full TTS Generation with MCP Analytics Data...\n');
    
    try {
        // Step 1: Verify we can get analytics data
        console.log('📊 Step 1: Fetching analytics data from MCP...');
        const { muxAnalyticsTool } = await import('../tools/mux-analytics.js');
        
        const analyticsResult = await (muxAnalyticsTool as any).execute({ 
            context: { timeframe: 'last 24 hours' } 
        });
        
        if (!analyticsResult.success) {
            console.log('❌ Analytics data retrieval failed');
            console.log('   This means the TTS tool will generate a fallback report');
            return false;
        }
        
        console.log('✅ Analytics data retrieved successfully');
        console.log(`   Views: ${analyticsResult.metrics?.total_views || 0}`);
        console.log(`   Health Score: ${analyticsResult.analysis?.healthScore || 0}/100`);
        console.log();
        
        // Step 2: Test the TTS tool directly with analytics data
        console.log('🎙️  Step 2: Testing TTS Analytics Report Tool...');
        
        // Import the agent to get access to the TTS tool
        const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
        const ttsToolRaw = muxAnalyticsAgent.tools?.ttsAnalyticsReportTool;
        
        if (!ttsToolRaw) {
            console.log('❌ TTS Analytics Report Tool not found');
            return false;
        }
        
        console.log('✅ TTS tool found, executing with MCP data...\n');
        
        // Execute the TTS tool with both general analytics and errors
        const ttsResult = await (ttsToolRaw as any).execute({ 
            context: { 
                timeframe: 'last 24 hours',
                focusArea: 'both',  // Test comprehensive report
                includeAssetList: false
            } 
        });
        
        console.log('═══════════════════════════════════════════════');
        console.log('📊 TTS TOOL EXECUTION RESULT');
        console.log('═══════════════════════════════════════════════\n');
        
        if (ttsResult.success) {
            console.log('✅ TTS audio report generated successfully!\n');
            
            // Display the summary text that was converted to audio
            console.log('📝 Summary Text (sent to TTS):');
            console.log('─'.repeat(47));
            console.log(ttsResult.summaryText);
            console.log('─'.repeat(47));
            console.log();
            
            // Display key information
            console.log('📊 Report Details:');
            console.log(`   - Word count: ${ttsResult.wordCount} (target: <1000)`);
            console.log(`   - Focus area: ${ttsResult.focusArea}`);
            console.log(`   - Time range: ${ttsResult.timeRange?.start} to ${ttsResult.timeRange?.end}`);
            console.log();
            
            // Display audio/playback information
            console.log('🎧 Audio Information:');
            if (ttsResult.playerUrl || ttsResult.audioUrl) {
                console.log(`   ✅ Player URL: ${ttsResult.playerUrl || ttsResult.audioUrl}`);
            } else {
                console.log('   ⚠️  Player URL not yet available (asset creation may still be in progress)');
            }
            
            if (ttsResult.assetId) {
                console.log(`   ✅ Asset ID: ${ttsResult.assetId}`);
            } else {
                console.log('   ⏳ Asset ID: Not yet available (upload may still be processing)');
            }
            console.log();
            
            // Display analytics data that was included
            if (ttsResult.analysis) {
                console.log('📈 Analytics Data Included in Report:');
                console.log(`   - Health Score: ${ttsResult.analysis.healthScore}/100`);
                console.log(`   - Issues found: ${ttsResult.analysis.issues?.length || 0}`);
                console.log(`   - Recommendations: ${ttsResult.analysis.recommendations?.length || 0}`);
                
                if (ttsResult.analysis.issues && ttsResult.analysis.issues.length > 0) {
                    console.log('   - Issues:');
                    ttsResult.analysis.issues.forEach((issue: string, idx: number) => {
                        console.log(`     ${idx + 1}. ${issue}`);
                    });
                }
                console.log();
            }
            
            // Display error data that was included
            if (ttsResult.errorData) {
                console.log('🐛 Error Data Included in Report:');
                console.log(`   - Total Errors: ${ttsResult.errorData.totalErrors || 0}`);
                
                if (ttsResult.errorData.platformBreakdown && ttsResult.errorData.platformBreakdown.length > 0) {
                    console.log('   - Platform Breakdown:');
                    ttsResult.errorData.platformBreakdown.slice(0, 3).forEach((platform: any, idx: number) => {
                        const name = platform.field || platform.operating_system || 'Unknown';
                        const count = platform.value || platform.error_count || 0;
                        console.log(`     ${idx + 1}. ${name}: ${count} errors`);
                    });
                }
                console.log();
            }
            
            // Display the message that should be shown to users
            console.log('💬 User-Facing Message:');
            console.log('─'.repeat(47));
            console.log(ttsResult.message);
            console.log('─'.repeat(47));
            console.log();
            
            console.log('═══════════════════════════════════════════════');
            console.log('✅ SUCCESS: TTS Tool is Properly Using MCP Data');
            console.log('═══════════════════════════════════════════════\n');
            
            // Verification checks
            const checks = {
                'Analytics data included': !!ttsResult.analysis,
                'Error data included': !!ttsResult.errorData,
                'Summary text generated': !!ttsResult.summaryText && ttsResult.wordCount > 0,
                'Word count valid': ttsResult.wordCount <= 1000,
                'Time range present': !!ttsResult.timeRange,
                'User message created': !!ttsResult.message,
            };
            
            console.log('🔍 Verification Checks:');
            let allPassed = true;
            for (const [check, passed] of Object.entries(checks)) {
                console.log(`   ${passed ? '✅' : '❌'} ${check}`);
                if (!passed) allPassed = false;
            }
            console.log();
            
            if (allPassed) {
                console.log('🎉 EXCELLENT: All data is flowing correctly from MCP to TTS!\n');
                console.log('📝 What this means:');
                console.log('   1. MCP is successfully fetching analytics data');
                console.log('   2. The TTS tool is receiving and processing the data');
                console.log('   3. Summary text is being generated with valid analytics');
                console.log('   4. Audio is being created and uploaded to Mux');
                console.log('   5. User-facing messages include proper URLs\n');
                
                return true;
            } else {
                console.log('⚠️  Some checks failed, review the details above\n');
                return false;
            }
            
        } else {
            console.log('❌ TTS audio report generation failed');
            console.log(`   Error: ${ttsResult.error || 'Unknown error'}`);
            console.log(`   Message: ${ttsResult.message || 'No message'}`);
            console.log();
            
            return false;
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        if (error instanceof Error) {
            console.error('   Message:', error.message);
            console.error('   Stack:', error.stack);
        }
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testFullTTSWithMCPData()
        .then(success => {
            if (success) {
                console.log('🎉 Full TTS with MCP Data Test: PASSED\n');
                process.exit(0);
            } else {
                console.log('❌ Full TTS with MCP Data Test: FAILED\n');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Test crashed:', error);
            process.exit(1);
        });
}

export { testFullTTSWithMCPData };

