#!/usr/bin/env node

// Test script to verify Mux upload creation with cors_origin fix
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

import { muxMcpClient } from './.mastra/output/index.mjs';

async function testMuxUpload() {
  console.log('🧪 Testing Mux upload creation with cors_origin fix...');
  
  try {
    // Get MCP tools
    const tools = await muxMcpClient.getTools();
    console.log('✅ MCP tools loaded:', Object.keys(tools));
    
    // Find the create tool
    let createTool = tools['create_video_uploads'] || tools['video.uploads.create'];
    
    if (!createTool) {
      const invokeTool = tools['invoke_api_endpoint'];
      if (!invokeTool) {
        throw new Error('No upload creation tools available');
      }
      
      createTool = {
        execute: async ({ context }) => {
          return await invokeTool.execute({ 
            context: { 
              endpoint_name: 'create_video_uploads',
              arguments: context 
            } 
          });
        }
      };
    }
    
    // Test upload creation with cors_origin
    const corsOrigin = process.env.MUX_CORS_ORIGIN || 'https://www.streamingportfolio.com';
    const createArgs = {
      cors_origin: corsOrigin
    };
    
    console.log('🔧 Creating upload with args:', createArgs);
    
    const result = await createTool.execute({ context: createArgs });
    console.log('✅ Upload created successfully!');
    console.log('📋 Result:', JSON.stringify(result, null, 2));
    
    if (result && result.data) {
      const uploadId = result.data.id;
      const uploadUrl = result.data.url;
      
      console.log(`🎯 Upload ID: ${uploadId}`);
      console.log(`🔗 Upload URL: ${uploadUrl ? 'Present' : 'Missing'}`);
      
      if (uploadUrl) {
        console.log('🎉 SUCCESS: cors_origin fix worked! Upload URL generated.');
      } else {
        console.log('⚠️  WARNING: Upload created but no URL returned');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('cors_origin')) {
      console.error('🚨 cors_origin error still present - fix may not be working');
    } else {
      console.error('🔍 Different error - cors_origin fix may be working');
    }
  } finally {
    await muxMcpClient.disconnect();
  }
}

testMuxUpload().catch(console.error);
