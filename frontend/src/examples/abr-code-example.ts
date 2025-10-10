// Example of how the ABR pseudo-code will now be rendered in the chat
const exampleMessage = `IV. ADAPTIVE BITRATE (ABR) REFINEMENT
-------------------------------------
1. Quality Switching Algorithm:
\`\`\`javascript
// Pseudo-code for ABR Logic
function selectRendition(networkConditions, bufferHealth) {
const bandwidthEstimate = measureBandwidth();
const bufferLength = getBufferLength();

if (bandwidthEstimate > highestRendition.bandwidth && 
bufferLength > 30s) {
return highestQualityRendition;
}

return findOptimalRendition(bandwidthEstimate);
}
\`\`\`

This function uses \`measureBandwidth()\` to determine the optimal quality.`;

export { exampleMessage };
