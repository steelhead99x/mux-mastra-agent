#!/bin/bash

# Mux MCP Integration Test Runner
# This script sets up the environment and runs the MCP integration tests

set -e

echo "🧪 Mux MCP Integration Test Runner"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    exit 1
fi

# Check for required environment variables
echo "🔍 Checking environment setup..."

if [ -z "$MUX_TOKEN_ID" ] || [ -z "$MUX_TOKEN_SECRET" ]; then
    echo "⚠️  Warning: MUX_TOKEN_ID and MUX_TOKEN_SECRET not set in environment"
    echo "   Some tests may fail or use mock data"
    echo "   Set these variables to test with real Mux MCP connections"
    echo ""
fi

# Check if .env file exists
if [ -f ".env" ]; then
    echo "✅ Found .env file"
    source .env
else
    echo "⚠️  No .env file found, using environment variables only"
fi

# Set test environment variables
export NODE_ENV=test
export USE_MUX_MCP=true
export MUX_CONNECTION_TIMEOUT=60000

echo "📋 Test Configuration:"
echo "   NODE_ENV: $NODE_ENV"
echo "   USE_MUX_MCP: $USE_MUX_MCP"
echo "   MUX_CONNECTION_TIMEOUT: $MUX_CONNECTION_TIMEOUT"
echo ""

# Check if Mux credentials are available
if [ -n "$MUX_TOKEN_ID" ] && [ -n "$MUX_TOKEN_SECRET" ]; then
    echo "✅ Mux credentials found"
    echo "   MUX_TOKEN_ID: ${MUX_TOKEN_ID:0:8}..."
    echo "   MUX_TOKEN_SECRET: ${MUX_TOKEN_SECRET:0:8}..."
else
    echo "⚠️  Mux credentials not found - tests will use mock data"
fi

echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the MCP integration tests
echo "🚀 Running Mux MCP Integration Tests..."
echo ""

# Run with verbose output and timeout
npm run test:mcp -- --reporter=verbose --timeout=120000

echo ""
echo "✅ MCP Integration Tests Complete!"
echo ""
echo "📊 Test Summary:"
echo "   - MCP Client Connection Tests"
echo "   - MCP Tools Availability Tests" 
echo "   - MCP Data Flow Tests"
echo "   - Agent Integration Tests"
echo "   - Error Handling and Fallback Tests"
echo "   - End-to-End Workflow Tests"
echo "   - Performance and Reliability Tests"
echo ""
echo "💡 Tips:"
echo "   - Set MUX_TOKEN_ID and MUX_TOKEN_SECRET for full integration testing"
echo "   - Use 'npm run test:mcp:watch' for watch mode"
echo "   - Check test output for detailed MCP connection status"
