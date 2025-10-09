#!/bin/bash

# Chat Client Streaming Test Runner
# This script runs the chat client input/output tests to verify MCP streaming functionality

set -e

echo "🚀 Starting Chat Client Streaming Tests"
echo "========================================"

# Change to the backend directory
cd "$(dirname "$0")/.."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the backend directory"
    exit 1
fi

# Check if environment variables are set
if [ -z "$MUX_TOKEN_ID" ] || [ -z "$MUX_TOKEN_SECRET" ]; then
    echo "⚠️  Warning: MUX_TOKEN_ID and MUX_TOKEN_SECRET not set"
    echo "   Some tests may fail or use fallback data"
fi

if [ -z "$DEEPGRAM_API_KEY" ]; then
    echo "⚠️  Warning: DEEPGRAM_API_KEY not set"
    echo "   Audio generation tests may fail"
fi

# Set test environment variables
export NODE_ENV=test
export USE_MUX_MCP=true
export MUX_CONNECTION_TIMEOUT=60000
export TTS_TMP_DIR=/tmp/tts-test
export TTS_CLEANUP=true

echo "📦 Installing dependencies..."
npm install

echo "🧪 Running chat client streaming tests..."
echo ""

# Run the test script
node --loader ts-node/esm src/scripts/test-chat-client-streaming.ts

echo ""
echo "✅ Chat client streaming tests completed!"
