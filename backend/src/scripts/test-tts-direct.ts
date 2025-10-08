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

import { promises as fs } from 'fs';
import { resolve, dirname, join } from 'path';

// Generate TTS with Deepgram (same function as in mux-analytics-agent.ts)
async function synthesizeWithDeepgramTTS(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPGRAM_API_KEY not set in environment');
    }
    const model = process.env.DEEPGRAM_TTS_MODEL || process.env.DEEPGRAM_VOICE || 'aura-asteria-en';
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16');

    console.log(`[TTS] Using Deepgram model: ${model}`);
    console.log(`[TTS] Text length: ${text.length} characters`);

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
        } as any,
        body: JSON.stringify({ text })
    } as any);

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Deepgram TTS failed (${res.status}): ${errText}`);
    }
    
    const ab = await res.arrayBuffer();
    console.log(`[TTS] Audio generated: ${ab.byteLength} bytes`);
    return Buffer.from(ab);
}

async function testTTSAudioGeneration() {
    console.log('🎧 Testing TTS Audio Generation for Analytics Report...\n');

    try {
        // Check if Deepgram API key is configured
        if (!process.env.DEEPGRAM_API_KEY) {
            console.error('❌ DEEPGRAM_API_KEY not configured');
            console.log('Please set DEEPGRAM_API_KEY in your environment variables');
            return { success: false, error: 'DEEPGRAM_API_KEY not configured' };
        }

        console.log('✅ Deepgram API key found');

        // Create sample analytics report text
        const analyticsReportText = `Streaming Analytics Audio Report for the Last 24 Hours:

Total Views: 25 unique video views were recorded during this period.

Platform Error Breakdown:
- MacOS was the primary platform for video views
- Total Errors: 0 
- Negative Performance Impact: Minimal (score of 1)

Viewing Highlights:
- Most views were on Chrome browser
- Viewer Experience Scores were consistently high, ranging from 0.90 to 0.99
- Longest single view duration was approximately 49 minutes

Key Insights:
1. No critical errors were detected in the last 24 hours
2. All videos played successfully across the platform
3. Viewer engagement appears strong with multiple extended viewing sessions

Recommendation: Continue monitoring performance, but current streaming quality looks excellent.`;

        console.log('📝 Sample analytics report text prepared');
        console.log(`Word count: ${analyticsReportText.split(/\s+/).length} words`);

        // Generate TTS audio
        console.log('\n🎤 Generating TTS audio...');
        const audioBuffer = await synthesizeWithDeepgramTTS(analyticsReportText);

        // Save audio file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
        const audioPath = join(baseDir, `analytics-report-${timestamp}.wav`);

        await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });
        await fs.writeFile(resolve(audioPath), audioBuffer);

        console.log(`✅ Audio file saved: ${audioPath}`);
        console.log(`📁 File size: ${audioBuffer.length} bytes`);

        // Check if file was created successfully
        const stats = await fs.stat(audioPath);
        console.log(`📊 File stats: ${stats.size} bytes, created at ${stats.birthtime}`);

        // Test if we can read the file back
        const readBuffer = await fs.readFile(audioPath);
        console.log(`✅ File verification: ${readBuffer.length} bytes read back`);

        console.log('\n=== TTS Test Results ===');
        console.log('✅ TTS audio generation completed successfully');
        console.log('✅ Audio file created and saved');
        console.log('✅ File verification passed');
        console.log('✅ Ready for Mux upload');

        return {
            success: true,
            audioPath,
            fileSize: audioBuffer.length,
            wordCount: analyticsReportText.split(/\s+/).length
        };

    } catch (error) {
        console.error('❌ TTS test failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('DEEPGRAM_API_KEY')) {
                console.error('🚨 Deepgram API key not configured');
            } else if (error.message.includes('401')) {
                console.error('🚨 Deepgram API authentication failed - check your API key');
            } else if (error.message.includes('429')) {
                console.error('🚨 Deepgram API rate limit exceeded');
            } else {
                console.error('🚨 Deepgram TTS error:', error.message);
            }
        }
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// Run the test
testTTSAudioGeneration()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 TTS Audio Generation Test Completed Successfully!');
            console.log(`Audio file: ${result.audioPath}`);
            console.log(`File size: ${result.fileSize} bytes`);
            console.log(`Word count: ${result.wordCount} words`);
            
            console.log('\n🎯 Next steps:');
            console.log('1. The TTS audio generation is working correctly');
            console.log('2. Audio files can be created and saved');
            console.log('3. The issue is likely in the analytics data retrieval or tool integration');
            console.log('4. Check MUX_TOKEN_ID and MUX_TOKEN_SECRET for Mux upload functionality');
            
            process.exit(0);
        } else {
            console.log('\n❌ TTS Audio Generation Test Failed!');
            console.log(`Error: ${result.error}`);
            
            console.log('\n🔧 Troubleshooting:');
            console.log('1. Ensure DEEPGRAM_API_KEY is set in your environment');
            console.log('2. Check your Deepgram API key is valid and has TTS permissions');
            console.log('3. Verify your Deepgram account has sufficient credits');
            
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
