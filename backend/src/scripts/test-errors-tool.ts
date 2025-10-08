import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables
const rootEnvPath = resolvePath(process.cwd(), '../.env');
const localEnvPath = resolvePath(process.cwd(), '.env');

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else if (existsSync(localEnvPath)) {
  config({ path: localEnvPath });
} else {
  config();
}

import { muxErrorsTool } from '../tools/mux-analytics.js';

async function testErrorsTool() {
  console.log('Testing muxErrorsTool...');
  
  try {
    // Test with default 24-hour timeframe
    const result: any = await (muxErrorsTool as any).execute({ context: {} });
    
    console.log('\n=== Error Data Results ===');
    console.log('Success:', result.success);
    console.log('Time Range:', result.timeRange);
    console.log('Total Errors:', result.totalErrors);
    console.log('Error Count:', result.errors?.length || 0);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n=== Top Errors ===');
      result.errors.slice(0, 5).forEach((error: any) => {
        console.log(`  - Code ${error.code} (${error.player_error_code}): ${error.message}`);
        console.log(`    Count: ${error.count}, Percentage: ${error.percentage.toFixed(2)}%`);
        console.log(`    Last Seen: ${error.last_seen}`);
      });
    }
    
    if (result.platformBreakdown && result.platformBreakdown.length > 0) {
      console.log('\n=== Errors by Platform (Operating System) ===');
      result.platformBreakdown.forEach((platform: any) => {
        console.log(`  - ${platform.field}: ${platform.value.toFixed(2)}% failure rate`);
        console.log(`    Views: ${platform.views}, Negative Impact: ${platform.negative_impact}`);
      });
    }
    
    if (!result.success) {
      console.log('\nError Message:', result.message);
      console.log('Error:', result.error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testErrorsTool();




