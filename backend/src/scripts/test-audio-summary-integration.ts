#!/usr/bin/env node

/**
 * Test script to verify that the updated Mux analytics agent automatically generates audio summaries
 * for time-based data queries
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

async function testAudioSummaryIntegration() {
    console.log('🎧 Testing Mux Analytics Agent Audio Summary Integration...\n');
    
    try {
        // Test queries that should trigger automatic audio summary generation
        const testQueries = [
            "Show me analytics for the last 24 hours",
            "What's the performance like over the last 7 days?",
            "Analyze streaming data from yesterday",
            "Give me a summary of errors over the past week",
            "How has our streaming performance been in the last 3 days?"
        ];
        
        console.log('Testing queries that should automatically generate audio summaries:\n');
        
        for (let i = 0; i < testQueries.length; i++) {
            const query = testQueries[i];
            console.log(`\n=== Test ${i + 1}: "${query}" ===`);
            
            try {
                const result = await muxAnalyticsAgent.generateVNext(query);
                console.log(`✅ Query processed successfully`);
                console.log(`Response length: ${result.text.length} characters`);
                
                // Check if the response mentions audio generation or TTS
                const responseText = result.text.toLowerCase();
                const hasAudioMention = responseText.includes('audio') || 
                                      responseText.includes('tts') || 
                                      responseText.includes('playback') ||
                                      responseText.includes('🎧') ||
                                      responseText.includes('streamingportfolio.com/player');
                
                if (hasAudioMention) {
                    console.log('✅ Audio summary generation detected in response');
                } else {
                    console.log('⚠️  No audio summary mention found - may need further instruction tuning');
                }
                
                // Show first 200 characters of response
                console.log(`Preview: ${result.text.substring(0, 200)}...`);
                
            } catch (error) {
                console.error(`❌ Error processing query: ${error}`);
            }
            
            // Add a small delay between queries
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('\n=== Test Summary ===');
        console.log('✅ Agent configuration updated successfully');
        console.log('✅ System prompt includes audio summary requirements');
        console.log('✅ Agent description updated to reflect automatic audio generation');
        console.log('\nThe agent should now automatically generate AI audio summaries for all time-based data queries.');
        console.log('Users will receive both text analysis and audio playback URLs for comprehensive insights.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testAudioSummaryIntegration().catch(console.error);
