#!/bin/bash

# Quick Start Script - Get audio reports working in 5 minutes
# Run this after setting up your .env file

set -e

echo ""
echo "🚀 MUX ANALYTICS AGENT - QUICK START"
echo "================================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found"
    echo ""
    echo "Please create a .env file with your API keys:"
    echo ""
    echo "  cp env.example .env"
    echo "  nano .env  # Edit with your actual keys"
    echo ""
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required variables
MISSING_VARS=0

if [ -z "$MUX_TOKEN_ID" ] || [ ${#MUX_TOKEN_ID} -lt 20 ]; then
    echo "❌ MUX_TOKEN_ID not set or invalid"
    MISSING_VARS=1
fi

if [ -z "$MUX_TOKEN_SECRET" ] || [ ${#MUX_TOKEN_SECRET} -lt 20 ]; then
    echo "❌ MUX_TOKEN_SECRET not set or invalid"
    MISSING_VARS=1
fi

if [ -z "$DEEPGRAM_API_KEY" ] || [ ${#DEEPGRAM_API_KEY} -lt 20 ]; then
    echo "❌ DEEPGRAM_API_KEY not set or invalid"
    MISSING_VARS=1
fi

if [ -z "$ANTHROPIC_API_KEY" ] || [ ${#ANTHROPIC_API_KEY} -lt 20 ]; then
    echo "❌ ANTHROPIC_API_KEY not set or invalid"
    MISSING_VARS=1
fi

if [ $MISSING_VARS -eq 1 ]; then
    echo ""
    echo "Please edit .env and add your actual API keys"
    exit 1
fi

echo "✅ Environment variables configured"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install --silent
fi

if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install --silent && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install --silent && cd ..
fi

echo "✅ Dependencies installed"
echo ""

# Run the simple test
echo "🎧 Testing audio report generation..."
echo ""
echo "This will:"
echo "  1. Test Deepgram TTS"
echo "  2. Test Mux MCP connection"
echo "  3. Test the agent"
echo "  4. Generate a real audio report"
echo ""
echo "⏳ This may take 30-60 seconds..."
echo ""

cd backend
tsx src/scripts/simple-audio-test.ts

# If we get here, test passed
echo ""
echo "================================================================"
echo "✅ SUCCESS! Audio reports are working."
echo "================================================================"
echo ""
echo "You can now:"
echo ""
echo "1. Start the development server:"
echo "   npm run dev"
echo ""
echo "2. Ask the agent for audio reports:"
echo "   - \"Generate an audio report of errors from the last 7 days\""
echo "   - \"Give me analytics for the last 30 days\""
echo "   - \"Create a comprehensive report for the last 90 days\""
echo ""
echo "3. Deploy to Digital Ocean:"
echo "   See DIGITAL_OCEAN_FIX.md for deployment guide"
echo ""

