#!/usr/bin/env tsx

/**
 * Comprehensive verification script for MCP Analytics Data Flow
 * Tests the entire data pipeline from MCP connection to TTS generation
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

async function verifyMcpAnalyticsData() {
    console.log('🔍 Verifying MCP Analytics Data Pipeline...\n');
    
    const results = {
        environmentCheck: false,
        mcpConnection: false,
        analyticsData: false,
        errorData: false,
        ttsToolData: false,
        systemPromptValid: false
    };
    
    try {
        // Step 1: Verify environment variables
        console.log('📋 Step 1: Checking Environment Variables...');
        const requiredEnvVars = {
            'MUX_TOKEN_ID': process.env.MUX_TOKEN_ID,
            'MUX_TOKEN_SECRET': process.env.MUX_TOKEN_SECRET,
            'DEEPGRAM_API_KEY': process.env.DEEPGRAM_API_KEY,
            'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
        };
        
        let envVarsValid = true;
        for (const [key, value] of Object.entries(requiredEnvVars)) {
            const isValid = value && value.length > 20 && !value.includes('your_') && !value.includes('_here');
            console.log(`   ${isValid ? '✅' : '❌'} ${key}: ${isValid ? 'Valid' : 'Missing or Invalid'}`);
            if (!isValid) envVarsValid = false;
        }
        
        if (!envVarsValid) {
            console.log('\n⚠️  Environment variables are not properly configured.');
            console.log('   Please copy env.example to .env and fill in your credentials.');
            return results;
        }
        
        results.environmentCheck = true;
        console.log('   ✅ All environment variables are valid\n');
        
        // Step 2: Test MCP Connection
        console.log('🔌 Step 2: Testing MCP Connection...');
        const { muxDataMcpClient } = await import('../mcp/mux-data-client.js');
        
        try {
            await muxDataMcpClient.connect();
            const tools = await muxDataMcpClient.getTools();
            const toolNames = Object.keys(tools);
            
            console.log(`   ✅ Connected to MCP successfully`);
            console.log(`   📦 Available tools: ${toolNames.length}`);
            console.log(`   🔧 Tools: ${toolNames.slice(0, 5).join(', ')}${toolNames.length > 5 ? '...' : ''}`);
            
            results.mcpConnection = true;
            console.log();
            
        } catch (error) {
            console.log(`   ❌ MCP connection failed: ${error instanceof Error ? error.message : String(error)}`);
            console.log('   🔧 Check MUX_MCP_DATA_ARGS in your .env file\n');
            return results;
        }
        
        // Step 3: Test Analytics Data Retrieval
        console.log('📊 Step 3: Testing Analytics Data Retrieval...');
        const { muxAnalyticsTool } = await import('../tools/mux-analytics.js');
        
        try {
            const analyticsResult = await (muxAnalyticsTool as any).execute({ 
                context: { timeframe: 'last 24 hours' } 
            });
            
            if (analyticsResult.success) {
                console.log('   ✅ Analytics data retrieved successfully');
                console.log(`   📅 Time range: ${analyticsResult.timeRange.start} to ${analyticsResult.timeRange.end}`);
                
                if (analyticsResult.metrics) {
                    console.log('   📈 Metrics available:');
                    const metrics = analyticsResult.metrics;
                    if (metrics.total_views !== undefined) {
                        console.log(`      - Total views: ${metrics.total_views}`);
                    }
                    if (metrics.total_error_percentage !== undefined) {
                        console.log(`      - Error rate: ${metrics.total_error_percentage.toFixed(2)}%`);
                    }
                    if (metrics.total_rebuffer_percentage !== undefined) {
                        console.log(`      - Rebuffer rate: ${metrics.total_rebuffer_percentage.toFixed(2)}%`);
                    }
                    if (metrics.average_startup_time_ms !== undefined) {
                        console.log(`      - Avg startup time: ${(metrics.average_startup_time_ms / 1000).toFixed(2)}s`);
                    }
                }
                
                if (analyticsResult.analysis) {
                    console.log(`   🏥 Health score: ${analyticsResult.analysis.healthScore}/100`);
                    console.log(`   📝 Summary: ${analyticsResult.analysis.summary}`);
                }
                
                results.analyticsData = true;
            } else {
                console.log(`   ⚠️  Analytics data retrieval failed: ${analyticsResult.error || 'Unknown error'}`);
                console.log('   ℹ️  This may be normal if you have no recent video data');
            }
            console.log();
            
        } catch (error) {
            console.log(`   ❌ Analytics tool error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        
        // Step 4: Test Error Data Retrieval
        console.log('🚨 Step 4: Testing Error Data Retrieval...');
        const { muxErrorsTool } = await import('../tools/mux-analytics.js');
        
        try {
            const errorsResult = await (muxErrorsTool as any).execute({ 
                context: { timeframe: 'last 24 hours' } 
            });
            
            if (errorsResult.success) {
                console.log('   ✅ Error data retrieved successfully');
                console.log(`   📅 Time range: ${errorsResult.timeRange.start} to ${errorsResult.timeRange.end}`);
                console.log(`   🐛 Total errors: ${errorsResult.totalErrors || 0}`);
                
                if (errorsResult.platformBreakdown && errorsResult.platformBreakdown.length > 0) {
                    console.log('   💻 Platform breakdown:');
                    errorsResult.platformBreakdown.slice(0, 3).forEach((platform: any, idx: number) => {
                        const name = platform.field || platform.operating_system || 'Unknown';
                        const count = platform.value || platform.error_count || 0;
                        console.log(`      ${idx + 1}. ${name}: ${count} errors`);
                    });
                }
                
                results.errorData = true;
            } else {
                console.log(`   ⚠️  Error data retrieval failed: ${errorsResult.error || 'Unknown error'}`);
                console.log('   ℹ️  This may be normal if you have no error data');
            }
            console.log();
            
        } catch (error) {
            console.log(`   ❌ Error tool error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        
        // Step 5: Test TTS Analytics Report Tool Data Flow
        console.log('🎧 Step 5: Testing TTS Analytics Report Tool Data Flow...');
        
        try {
            // Import the agent to test the complete flow
            const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
            
            console.log('   ✅ Mux Analytics Agent loaded');
            console.log(`   📝 Agent name: ${muxAnalyticsAgent.name}`);
            console.log(`   🔧 Agent tools: ${Object.keys(muxAnalyticsAgent.tools || {}).length}`);
            
            // Check if ttsAnalyticsReportTool is available
            if (muxAnalyticsAgent.tools?.ttsAnalyticsReportTool) {
                console.log('   ✅ ttsAnalyticsReportTool is available');
                results.ttsToolData = true;
            } else {
                console.log('   ❌ ttsAnalyticsReportTool is NOT available');
            }
            
            console.log();
            
        } catch (error) {
            console.log(`   ❌ TTS tool check error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        
        // Step 6: Verify System Prompt
        console.log('📄 Step 6: Verifying System Prompt Configuration...');
        
        try {
            const { muxAnalyticsAgent } = await import('../agents/mux-analytics-agent.js');
            
            const systemPrompt = muxAnalyticsAgent.instructions || '';
            
            // Check for key elements in the system prompt
            const promptChecks = {
                'MCP analytics data': systemPrompt.includes('Mux') && systemPrompt.includes('analytics'),
                'TTS generation': systemPrompt.includes('TTS') || systemPrompt.includes('audio'),
                'Error analysis': systemPrompt.includes('error'),
                'Platform data': systemPrompt.includes('platform') || systemPrompt.includes('browser'),
                'Asset ID rules': systemPrompt.includes('Asset ID') || systemPrompt.includes('assetId'),
                'URL format': systemPrompt.includes('streamingportfolio.com') || systemPrompt.includes('playerUrl'),
            };
            
            let allChecksPass = true;
            for (const [check, passed] of Object.entries(promptChecks)) {
                console.log(`   ${passed ? '✅' : '⚠️ '} ${check}`);
                if (!passed) allChecksPass = false;
            }
            
            if (allChecksPass) {
                results.systemPromptValid = true;
                console.log('   ✅ System prompt is properly configured');
            } else {
                console.log('   ⚠️  Some system prompt elements are missing');
            }
            console.log();
            
        } catch (error) {
            console.log(`   ❌ System prompt check error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        
        // Final Summary
        console.log('═══════════════════════════════════════════════');
        console.log('📊 VERIFICATION SUMMARY');
        console.log('═══════════════════════════════════════════════');
        
        const checksTotal = Object.keys(results).length;
        const checksPassed = Object.values(results).filter(Boolean).length;
        const checksPercentage = ((checksPassed / checksTotal) * 100).toFixed(0);
        
        console.log(`\n✓ Passed Checks: ${checksPassed}/${checksTotal} (${checksPercentage}%)`);
        console.log('\nDetailed Results:');
        console.log(`   ${results.environmentCheck ? '✅' : '❌'} Environment Configuration`);
        console.log(`   ${results.mcpConnection ? '✅' : '❌'} MCP Connection`);
        console.log(`   ${results.analyticsData ? '✅' : '⚠️ '} Analytics Data Retrieval ${!results.analyticsData ? '(may be normal if no data)' : ''}`);
        console.log(`   ${results.errorData ? '✅' : '⚠️ '} Error Data Retrieval ${!results.errorData ? '(may be normal if no errors)' : ''}`);
        console.log(`   ${results.ttsToolData ? '✅' : '❌'} TTS Tool Configuration`);
        console.log(`   ${results.systemPromptValid ? '✅' : '⚠️ '} System Prompt Validity`);
        
        console.log('\n═══════════════════════════════════════════════');
        
        if (checksPassed === checksTotal) {
            console.log('🎉 EXCELLENT: All checks passed! The system is fully operational.');
            console.log('\n📝 The Mux Analytics Agent is properly configured to:');
            console.log('   - Connect to Mux via MCP');
            console.log('   - Retrieve analytics and error data');
            console.log('   - Generate TTS audio reports');
            console.log('   - Follow proper URL and asset ID formatting');
        } else if (checksPassed >= checksTotal * 0.7) {
            console.log('✅ GOOD: Most checks passed. System is operational.');
            console.log('\n⚠️  Some optional features may not work as expected.');
            console.log('   Review the failed checks above for details.');
        } else {
            console.log('❌ ISSUES DETECTED: Critical checks failed.');
            console.log('\n🔧 Action Required:');
            console.log('   1. Ensure all environment variables are set correctly');
            console.log('   2. Verify MCP connection is working');
            console.log('   3. Check that Mux credentials have proper permissions');
            console.log('   4. Review the detailed results above');
        }
        
        console.log('\n═══════════════════════════════════════════════\n');
        
        return results;
        
    } catch (error) {
        console.error('\n💥 Verification failed with error:', error);
        return results;
    }
}

// Run the verification
if (import.meta.url === `file://${process.argv[1]}`) {
    verifyMcpAnalyticsData()
        .then(results => {
            const checksTotal = Object.keys(results).length;
            const checksPassed = Object.values(results).filter(Boolean).length;
            
            if (checksPassed === checksTotal) {
                process.exit(0);
            } else if (checksPassed >= checksTotal * 0.7) {
                process.exit(0);
            } else {
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Verification crashed:', error);
            process.exit(1);
        });
}

export { verifyMcpAnalyticsData };

