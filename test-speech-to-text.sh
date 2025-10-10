#!/bin/bash

# Test script for speech-to-text functionality
echo "Testing Speech-to-Text Integration..."

# Check if backend is running
echo "1. Checking if backend is running..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is not running. Please start it first with: cd backend && npm run dev"
    exit 1
fi

# Check if Deepgram API key is configured
echo "2. Checking Deepgram configuration..."
if [ -z "$DEEPGRAM_API_KEY" ]; then
    echo "⚠️  DEEPGRAM_API_KEY not set in environment"
    echo "   Please add your Deepgram API key to your .env file"
    echo "   Get your API key from: https://console.deepgram.com/"
else
    echo "✅ Deepgram API key is configured"
fi

# Test the speech-to-text endpoint
echo "3. Testing speech-to-text endpoint..."
if [ -f "test-audio.wav" ]; then
    echo "   Using test audio file..."
    response=$(curl -s -X POST -F "audio=@test-audio.wav" http://localhost:3001/api/speech-to-text)
    if echo "$response" | grep -q "transcript"; then
        echo "✅ Speech-to-text endpoint is working"
        echo "   Response: $response"
    else
        echo "❌ Speech-to-text endpoint failed"
        echo "   Response: $response"
    fi
else
    echo "⚠️  No test audio file found. Create a test-audio.wav file to test the endpoint"
fi

echo ""
echo "🎤 Speech-to-text integration test complete!"
echo ""
echo "To test the frontend:"
echo "1. Start the frontend: cd frontend && npm run dev"
echo "2. Open http://localhost:3000"
echo "3. Click the microphone button in the chat input"
echo "4. Allow microphone access when prompted"
echo "5. Speak your question and watch it appear in the input field"
