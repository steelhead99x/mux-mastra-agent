#!/usr/bin/env tsx
/**
 * Demo: Generate audio reports for different timeframes
 * 
 * This script demonstrates how to ask the Mux Analytics Agent to generate
 * audio reports for different time periods (7, 30, 90 days) focusing on:
 * - Errors only
 * - Overall analytics only
 * - Both errors and analytics
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

/**
 * Example queries you can use with the Mux Analytics Agent
 */
const EXAMPLE_QUERIES = {
    // ERROR REPORTS
    errors_7_days: "Generate an audio report of my errors from the last 7 days",
    errors_30_days: "Give me an audio summary of errors over the last 30 days",
    errors_90_days: "Create an audio report analyzing errors from the last 90 days",
    
    // OVERALL ANALYTICS REPORTS
    analytics_7_days: "Generate an audio report of my overall analytics for the last 7 days",
    analytics_30_days: "Give me an audio summary of my streaming performance over the last 30 days",
    analytics_90_days: "Create an audio report of my video analytics from the last 90 days",
    
    // COMPREHENSIVE REPORTS (BOTH ERRORS AND ANALYTICS)
    comprehensive_7_days: "Generate a comprehensive audio report with both errors and overall data from the last 7 days",
    comprehensive_30_days: "Give me a complete audio analysis including errors and analytics for the last 30 days",
    comprehensive_90_days: "Create a full audio report covering all metrics and errors from the last 90 days",
};

async function generateAudioReport(query: string) {
    console.log('\n' + '='.repeat(80));
    console.log('🎧 GENERATING AUDIO REPORT');
    console.log('='.repeat(80));
    console.log(`Query: "${query}"`);
    console.log();
    
    try {
        const startTime = Date.now();
        console.log('⏳ Processing request...\n');
        
        const response = await muxAnalyticsAgent.generate(query);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('='.repeat(80));
        console.log('RESPONSE');
        console.log('='.repeat(80));
        
        if (typeof response === 'string') {
            console.log(response);
        } else if (response && typeof response === 'object') {
            if ('text' in response) {
                console.log(response.text);
            } else {
                console.log(JSON.stringify(response, null, 2));
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log(`✅ Completed in ${duration}s`);
        console.log('='.repeat(80));
        
        return response;
        
    } catch (error) {
        console.error('\n❌ Error generating audio report:');
        console.error(error);
        throw error;
    }
}

async function main() {
    console.log('\n🎙️  MUX ANALYTICS AGENT - AUDIO REPORT DEMO');
    console.log('='.repeat(80));
    console.log();
    console.log('This demo shows how to generate audio reports for different timeframes:');
    console.log('- Last 7 days');
    console.log('- Last 30 days');
    console.log('- Last 90 days');
    console.log();
    console.log('You can focus on:');
    console.log('1. Errors only (error analysis)');
    console.log('2. Overall analytics (performance metrics)');
    console.log('3. Both errors and analytics (comprehensive report)');
    console.log();
    
    // Check which demo to run from command line argument
    const demoType = process.argv[2] || 'errors_7_days';
    
    if (!(demoType in EXAMPLE_QUERIES)) {
        console.log('Available demo types:');
        Object.keys(EXAMPLE_QUERIES).forEach(key => {
            console.log(`  - ${key}`);
        });
        console.log();
        console.log(`Usage: tsx demo-audio-reports.ts [demo_type]`);
        console.log(`Example: tsx demo-audio-reports.ts errors_7_days`);
        process.exit(1);
    }
    
    const query = EXAMPLE_QUERIES[demoType as keyof typeof EXAMPLE_QUERIES];
    
    console.log(`📊 Running Demo: ${demoType}`);
    console.log('='.repeat(80));
    
    try {
        await generateAudioReport(query);
        
        console.log('\n\n📚 TIP: You can also ask the agent in natural language:');
        console.log('  - "Show me errors from last week"');
        console.log('  - "What were my analytics for the last month?"');
        console.log('  - "Give me a full report for the last 90 days"');
        console.log('  - "Analyze my streaming errors from the past 7 days"');
        console.log();
        console.log('The agent will automatically:');
        console.log('  ✅ Parse the time expression (7 days, 30 days, 90 days)');
        console.log('  ✅ Fetch data from Mux via MCP');
        console.log('  ✅ Generate a natural-sounding audio report');
        console.log('  ✅ Upload to Mux and provide a playback URL');
        console.log();
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n💥 Demo failed:', error);
        process.exit(1);
    }
}

// Run demo
main();

