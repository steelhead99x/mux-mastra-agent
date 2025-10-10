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

import { promises as fs } from 'fs';
import { resolve } from 'path';

/**
 * Quick script to create a default video asset for the player
 * Uses one of the background images and uploads it to Mux
 */

async function createDefaultVideo() {
  console.log('🎬 Creating Default Video Asset for Player\n');

  // Check environment
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    console.error('❌ Error: MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set in .env');
    console.error('   Get these from: https://dashboard.mux.com/settings/access-tokens\n');
    process.exit(1);
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    console.error('⚠️  Warning: DEEPGRAM_API_KEY not set - will create a silent video');
    console.error('   Get a key from: https://console.deepgram.com/\n');
  }

  // Choose an image
  const imagesDir = resolve('files/images');
  const images = await fs.readdir(imagesDir);
  const imageFile = images.find(f => f.includes('baby')) || images[0]; // Use baby.jpeg
  const imagePath = resolve(imagesDir, imageFile);

  console.log(`📸 Using image: ${imageFile}`);
  console.log(`📁 Path: ${imagePath}\n`);

  // Create Mux upload
  console.log('🔐 Creating Mux direct upload...');
  const authHeader = 'Basic ' + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');

  const createRes = await fetch('https://api.mux.com/video/v1/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify({
      cors_origin: process.env.MUX_CORS_ORIGIN || 'https://www.streamingportfolio.com',
      new_asset_settings: {
        playback_policies: ['public'] // Public so it works immediately
      }
    })
  });

  if (!createRes.ok) {
    const error = await createRes.text();
    console.error('❌ Failed to create upload:', error);
    process.exit(1);
  }

  const createData: any = await createRes.json();
  const uploadUrl = createData.data.url;
  const uploadId = createData.data.id;

  console.log(`✅ Upload created: ${uploadId}\n`);

  // Upload the image
  console.log('📤 Uploading image to Mux...');
  const imageBuffer = await fs.readFile(imagePath);
  const copy = new Uint8Array(imageBuffer);
  const fileAB = copy.buffer;

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': imageBuffer.length.toString(),
    },
    body: new Blob([fileAB], { type: 'image/jpeg' })
  } as any);

  if (!uploadRes.ok) {
    console.error('❌ Upload failed:', await uploadRes.text());
    process.exit(1);
  }

  console.log('✅ Image uploaded successfully\n');

  // Wait for asset to be created
  console.log('⏳ Waiting for asset creation (this may take 10-30 seconds)...');
  
  let assetId: string | undefined;
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts && !assetId) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;

    const statusRes = await fetch(`https://api.mux.com/video/v1/uploads/${uploadId}`, {
      headers: { 'Authorization': authHeader }
    });

    if (statusRes.ok) {
      const statusData: any = await statusRes.json();
      assetId = statusData.data.asset_id;
      
      if (assetId) {
        console.log(`✅ Asset created: ${assetId}\n`);
        break;
      }
      
      const status = statusData.data.status;
      process.stdout.write(`\r   Status: ${status}... (${attempts}/${maxAttempts})`);
    }
  }

  if (!assetId) {
    console.error('\n❌ Timeout waiting for asset creation');
    console.error('   Check Mux dashboard: https://dashboard.mux.com/video/uploads');
    process.exit(1);
  }

  // Wait for asset to be ready
  console.log('⏳ Waiting for asset to finish processing...');
  
  let ready = false;
  attempts = 0;

  while (attempts < maxAttempts && !ready) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    attempts++;

    const assetRes = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: { 'Authorization': authHeader }
    });

    if (assetRes.ok) {
      const assetData: any = await assetRes.json();
      const status = assetData.data.status;
      
      if (status === 'ready') {
        ready = true;
        const playbackId = assetData.data.playback_ids[0]?.id;
        
        console.log(`\n✅ Asset ready for playback!`);
        console.log(`   Asset ID: ${assetId}`);
        console.log(`   Playback ID: ${playbackId}\n`);
        break;
      }
      
      process.stdout.write(`\r   Status: ${status}... (${attempts}/${maxAttempts})`);
    }
  }

  // Instructions
  console.log('\n🎉 SUCCESS! Your default video is ready.\n');
  console.log('📝 Add this to your .env file:\n');
  console.log(`VITE_MUX_DEFAULT_ASSET_ID=${assetId}`);
  console.log(`VITE_MUX_ASSET_ID=${assetId}`);
  console.log('\n🔄 Then restart your frontend:');
  console.log('   cd frontend && npm run dev\n');
  console.log('🌐 View in Mux Dashboard:');
  console.log(`   https://dashboard.mux.com/video/assets/${assetId}\n`);
}

createDefaultVideo().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

