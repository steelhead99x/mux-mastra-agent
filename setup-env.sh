#!/bin/bash

# Mux Mastra Agent - Environment Setup Script
# This script helps set up the unified environment configuration

echo "🚀 Setting up Mux Mastra Agent environment..."

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Backing up to .env.backup"
    cp .env .env.backup
fi

# Copy env.example to .env
if [ -f "env.example" ]; then
    cp env.example .env
    echo "✅ Created .env file from env.example"
    echo ""
    echo "📝 Next steps:"
    echo "1. Edit .env file and configure your API keys:"
    echo "   - ANTHROPIC_API_KEY (required for AI agent)"
    echo "   - MUX_TOKEN_ID and MUX_TOKEN_SECRET (required for Mux analytics)"
    echo "   - DEEPGRAM_API_KEY (optional, for TTS features)"
    echo ""
    echo "2. Start the backend:"
    echo "   cd backend && npm run dev"
    echo ""
    echo "3. Start the frontend (in another terminal):"
    echo "   cd frontend && npm run dev"
    echo ""
    echo "🌐 The application will be available at:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend:  http://localhost:3001"
else
    echo "❌ env.example file not found!"
    echo "Please ensure you're running this script from the project root directory."
    exit 1
fi
