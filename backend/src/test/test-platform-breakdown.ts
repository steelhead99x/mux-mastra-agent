#!/usr/bin/env tsx

/**
 * Test script to verify platform breakdown shows actual error counts
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

import { muxErrorsTool } from '../tools/mux-analytics.js';

console.log('🔍 Testing Platform Breakdown with Real Error Counts\n');
console.log('='.repeat(80));

async function testPlatformBreakdown() {
    try {
        console.log('\n📅 Fetching errors for "last 7 days" with platform breakdown...\n');
        
        const result = await (muxErrorsTool as any).execute({
            context: {
                timeframe: 'last 7 days'
            }
        });
        
        if (result.success) {
            console.log('\n✅ Result Summary:\n');
            console.log(`   Total Errors: ${result.totalErrors}`);
            console.log(`   Number of Error Types: ${result.errors?.length || 0}`);
            console.log(`   Platform Breakdown Items: ${result.platformBreakdown?.length || 0}`);
            
            if (result.platformBreakdown && result.platformBreakdown.length > 0) {
                console.log('\n💻 Platform Error Breakdown:');
                console.log('   ' + '-'.repeat(70));
                result.platformBreakdown.forEach((platform: any, idx: number) => {
                    const os = platform.operating_system || 'Unknown';
                    const errorCount = platform.error_count || 0;
                    const errorPct = platform.error_percentage || 0;
                    
                    console.log(`   ${idx + 1}. ${os}:`);
                    console.log(`      - Error Count: ${errorCount}`);
                    console.log(`      - Error Percentage: ${errorPct.toFixed(1)}%`);
                    
                    if (errorCount === 0) {
                        console.log(`      ⚠️  WARNING: 0 errors reported for this platform!`);
                    } else {
                        console.log(`      ✅ Has error data`);
                    }
                    console.log('');
                });
                
                // Verify that total platform errors match total errors
                const platformTotal = result.platformBreakdown.reduce(
                    (sum: number, p: any) => sum + (p.error_count || 0), 
                    0
                );
                
                console.log('   ' + '-'.repeat(70));
                console.log(`   Sum of platform errors: ${platformTotal}`);
                console.log(`   Total errors reported: ${result.totalErrors}`);
                
                if (platformTotal === result.totalErrors) {
                    console.log('   ✅ Platform breakdown matches total!');
                } else if (platformTotal === 0 && result.totalErrors > 0) {
                    console.log('   ❌ PROBLEM: Platform breakdown shows 0 but there are errors!');
                } else {
                    console.log(`   ⚠️  Mismatch: ${platformTotal} vs ${result.totalErrors}`);
                }
            } else {
                console.log('\n⚠️  No platform breakdown data available');
            }
            
        } else {
            console.log('\n❌ Error fetching data:');
            console.log(`   Error: ${result.error}`);
            console.log(`   Message: ${result.message}`);
        }
        
    } catch (error) {
        console.error('\n❌ Exception occurred:', error);
    }
}

testPlatformBreakdown().then(() => {
    console.log('\n' + '='.repeat(80));
    console.log('✨ Test complete!\n');
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});

