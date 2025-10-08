#!/usr/bin/env node

/**
 * Test script to verify that playback ID creation is working correctly
 * This script tests the createPlaybackId function and verifies the flow
 */

// Import the media vault agent to test the playback ID creation
import { createPlaybackId } from '../agents/media-vault-agent.js';

async function testPlaybackIdCreation() {
    console.log('🧪 Testing Playback ID Creation...\n');
    
    // Test with a known asset ID (you can replace this with a real asset ID for testing)
    const testAssetId = process.env.MUX_TEST_ASSET_ID || '00ixOU3x6YI02DXIzeQ00wEzTwAHyUojsiewp7fC4FNeNw';
    
    if (!testAssetId) {
        console.error('❌ No test asset ID provided. Set MUX_TEST_ASSET_ID environment variable.');
        return;
    }
    
    console.log(`📋 Testing with Asset ID: ${testAssetId}`);
    
    try {
        console.log('🔧 Creating playback ID...');
        const playbackId = await createPlaybackId(testAssetId);
        
        console.log('✅ SUCCESS: Playback ID created!');
        console.log(`🆔 Playback ID: ${playbackId}`);
        console.log(`🔗 HLS URL: https://stream.mux.com/${playbackId}.m3u8`);
        
        // Verify the playback ID format (should be a string with reasonable length)
        if (playbackId && typeof playbackId === 'string' && playbackId.length > 10) {
            console.log('✅ Playback ID format looks valid');
        } else {
            console.log('⚠️  Playback ID format may be invalid');
        }
        
    } catch (error) {
        console.error('❌ FAILED: Playback ID creation failed');
        console.error('Error:', error instanceof Error ? error.message : String(error));
        
        // Check if it's a common error
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('MUX_TOKEN_ID') || errorMsg.includes('MUX_TOKEN_SECRET')) {
            console.log('\n💡 Make sure MUX_TOKEN_ID and MUX_TOKEN_SECRET are set in your environment');
        } else if (errorMsg.includes('404')) {
            console.log('\n💡 The asset ID may not exist or may not be accessible with your credentials');
        } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
            console.log('\n💡 Check your Mux API credentials and permissions');
        }
    }
}

// Run the test
testPlaybackIdCreation().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
}).finally(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
});
