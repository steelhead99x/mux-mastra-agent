const TOKEN_ID = process.env.MUX_TOKEN_ID || 'd1712809-795c-4ebd-aad6-1b9abc3515d3';
const TOKEN_SECRET = process.env.MUX_TOKEN_SECRET || '/JF6M4eVsLslcz41QcrTyaOufgSwLoUShy6+YOejgjWTNl/NODlsTw5UjZC5yy5M3RodKGcr4JR';

const authHeader = 'Basic ' + Buffer.from(`${TOKEN_ID}:${TOKEN_SECRET}`).toString('base64');

fetch('https://api.mux.com/video/v1/assets?limit=10', {
  headers: { 'Authorization': authHeader }
})
.then(r => r.json())
.then(data => {
  console.log('\n📹 Your Mux Assets:\n');
  if (data.data && data.data.length > 0) {
    data.data.forEach((asset, i) => {
      console.log(`${i+1}. Asset ID: ${asset.id}`);
      console.log(`   Status: ${asset.status}`);
      console.log(`   Duration: ${asset.duration ? Math.round(asset.duration) + 's' : 'N/A'}`);
      console.log(`   Created: ${new Date(asset.created_at).toLocaleDateString()}`);
      if (asset.playback_ids && asset.playback_ids.length > 0) {
        console.log(`   Playback ID: ${asset.playback_ids[0].id}`);
      }
      console.log('');
    });
    console.log('\n✅ Pick one and add to .env:');
    console.log(`VITE_MUX_DEFAULT_ASSET_ID=${data.data[0].id}`);
    console.log(`VITE_MUX_ASSET_ID=${data.data[0].id}`);
  } else {
    console.log('❌ No assets found in your Mux account.');
    console.log('\nYou need to either:');
    console.log('1. Upload a video at: https://dashboard.mux.com/video/uploads');
    console.log('2. Generate an audio report through the app');
  }
})
.catch(err => {
  console.error('❌ Error:', err.message);
});
