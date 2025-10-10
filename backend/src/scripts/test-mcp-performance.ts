#!/usr/bin/env node

/**
 * Test script to verify MCP performance improvements
 * This script tests the optimized asset upload and playback URL generation
 */

import { createMuxUpload, createPlaybackId, retrieveAssetIdFromUpload, generateSignedPlaybackUrl } from '../agents/media-vault-agent.js';
import { resolve } from 'path';
import { promises as fs } from 'fs';

async function testMcpPerformance() {
    console.log('🚀 Testing MCP Performance Improvements...\n');
    
    const startTime = Date.now();
    
    try {
        // Test 1: Create upload using MCP
        console.log('📤 Test 1: Creating upload using MCP...');
        const uploadStartTime = Date.now();
        
        const uploadData = await createMuxUpload();
        const uploadDuration = Date.now() - uploadStartTime;
        
        console.log(`✅ Upload created in ${uploadDuration}ms`);
        console.log(`   Upload ID: ${uploadData.uploadId}`);
        console.log(`   Upload URL: ${uploadData.uploadUrl ? 'Present' : 'Missing'}`);
        console.log(`   Asset ID: ${uploadData.assetId || 'Not provided'}`);
        console.log();
        
        if (!uploadData.uploadUrl) {
            throw new Error('No upload URL received');
        }
        
        // Test 2: Upload a small test file
        console.log('📁 Test 2: Uploading test file...');
        const uploadFileStartTime = Date.now();
        
        // Create a small test audio file
        const testAudioPath = resolve('./test-outputs/test-audio.wav');
        await fs.mkdir(resolve('./test-outputs'), { recursive: true });
        
        // Create a minimal WAV file header (44 bytes) for testing
        const wavHeader = Buffer.from([
            0x52, 0x49, 0x46, 0x46, // "RIFF"
            0x24, 0x00, 0x00, 0x00, // File size - 8
            0x57, 0x41, 0x56, 0x45, // "WAVE"
            0x66, 0x6D, 0x74, 0x20, // "fmt "
            0x10, 0x00, 0x00, 0x00, // Format chunk size
            0x01, 0x00,             // Audio format (PCM)
            0x01, 0x00,             // Number of channels
            0x44, 0xAC, 0x00, 0x00, // Sample rate
            0x88, 0x58, 0x01, 0x00, // Byte rate
            0x02, 0x00,             // Block align
            0x10, 0x00,             // Bits per sample
            0x64, 0x61, 0x74, 0x61, // "data"
            0x00, 0x00, 0x00, 0x00  // Data size
        ]);
        
        await fs.writeFile(testAudioPath, wavHeader);
        
        // Upload the test file
        const { putFileToMux } = await import('../agents/media-vault-agent.js');
        await putFileToMux(uploadData.uploadUrl, testAudioPath);
        
        const uploadFileDuration = Date.now() - uploadFileStartTime;
        console.log(`✅ File uploaded in ${uploadFileDuration}ms`);
        console.log();
        
        // Test 3: Retrieve asset ID using MCP (non-blocking)
        console.log('🔍 Test 3: Retrieving asset ID using MCP...');
        const retrieveStartTime = Date.now();
        
        let assetId: string | undefined;
        if (uploadData.uploadId) {
            assetId = await retrieveAssetIdFromUpload(uploadData.uploadId);
        }
        
        const retrieveDuration = Date.now() - retrieveStartTime;
        console.log(`✅ Asset ID retrieved in ${retrieveDuration}ms`);
        console.log(`   Asset ID: ${assetId || 'Not available yet'}`);
        console.log();
        
        // Test 4: Create playback ID using MCP (if asset ID is available)
        if (assetId) {
            console.log('🎬 Test 4: Creating playback ID using MCP...');
            const playbackStartTime = Date.now();
            
            try {
                const playbackId = await createPlaybackId(assetId);
                const playbackDuration = Date.now() - playbackStartTime;
                
                console.log(`✅ Playback ID created in ${playbackDuration}ms`);
                console.log(`   Playback ID: ${playbackId}`);
                console.log();
                
                // Test 5: Generate signed playback URL using MCP
                console.log('🔐 Test 5: Generating signed playback URL using MCP...');
                const signStartTime = Date.now();
                
                const testToken = 'test-token-123';
                const signedUrl = await generateSignedPlaybackUrl(playbackId, testToken);
                const signDuration = Date.now() - signStartTime;
                
                console.log(`✅ Signed URL generated in ${signDuration}ms`);
                console.log(`   Signed URL: ${signedUrl}`);
                console.log();
                
            } catch (error) {
                console.log(`⚠️  Playback ID creation failed (asset may not be ready yet): ${error instanceof Error ? error.message : String(error)}`);
                console.log();
            }
        } else {
            console.log('⚠️  Skipping playback ID creation - asset ID not available yet');
            console.log();
        }
        
        // Cleanup
        try {
            await fs.unlink(testAudioPath);
            console.log('🧹 Cleaned up test file');
        } catch (error) {
            console.log('⚠️  Failed to cleanup test file:', error);
        }
        
        const totalDuration = Date.now() - startTime;
        console.log(`\n🎉 Performance test completed in ${totalDuration}ms`);
        console.log(`   Upload creation: ${uploadDuration}ms`);
        console.log(`   File upload: ${uploadFileDuration}ms`);
        console.log(`   Asset ID retrieval: ${retrieveDuration}ms`);
        
        if (totalDuration < 5000) {
            console.log('✅ EXCELLENT: Total time under 5 seconds - performance optimized!');
        } else if (totalDuration < 10000) {
            console.log('✅ GOOD: Total time under 10 seconds - acceptable performance');
        } else {
            console.log('⚠️  SLOW: Total time over 10 seconds - may need further optimization');
        }
        
    } catch (error) {
        console.error('❌ Performance test failed:', error);
        process.exit(1);
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testMcpPerformance().catch(console.error);
}

export { testMcpPerformance };

