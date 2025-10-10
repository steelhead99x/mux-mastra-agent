#!/bin/bash

# Diagnostic and Fix Script for Mux Analytics Agent
# This script identifies and fixes common issues

set -e

echo "🔍 MUX ANALYTICS AGENT - DIAGNOSTIC AND FIX SCRIPT"
echo "================================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track issues
ISSUES_FOUND=0
FIXES_APPLIED=0

# Function to check and report
check_issue() {
    local name="$1"
    local condition="$2"
    local fix_command="$3"
    
    if eval "$condition"; then
        echo -e "${GREEN}✅ $name${NC}"
        return 0
    else
        echo -e "${RED}❌ $name${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        
        if [ -n "$fix_command" ]; then
            echo -e "${YELLOW}   Applying fix...${NC}"
            if eval "$fix_command"; then
                echo -e "${GREEN}   ✅ Fix applied${NC}"
                FIXES_APPLIED=$((FIXES_APPLIED + 1))
            else
                echo -e "${RED}   ❌ Fix failed${NC}"
            fi
        fi
        return 1
    fi
}

echo "📋 Checking Environment Setup..."
echo ""

# Check 1: Node version
check_issue "Node.js version >= 24" \
    "[ \$(node -v | cut -d'.' -f1 | tr -d 'v') -ge 24 ]" \
    ""

# Check 2: .env file exists
check_issue ".env file exists" \
    "[ -f .env ]" \
    "cp env.example .env && echo 'Created .env from template. Please edit it with your actual API keys!'"

# Check 3: Backend dependencies
check_issue "Backend dependencies installed" \
    "[ -d backend/node_modules ]" \
    "cd backend && npm install"

# Check 4: Frontend dependencies
check_issue "Frontend dependencies installed" \
    "[ -d frontend/node_modules ]" \
    "cd frontend && npm install"

# Check 5: Root dependencies
check_issue "Root dependencies installed" \
    "[ -d node_modules ]" \
    "npm install"

echo ""
echo "📋 Checking Environment Variables..."
echo ""

# Load .env if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check environment variables
check_issue "MUX_TOKEN_ID set" \
    "[ -n \"\$MUX_TOKEN_ID\" ] && [ \${#MUX_TOKEN_ID} -gt 20 ]" \
    ""

check_issue "MUX_TOKEN_SECRET set" \
    "[ -n \"\$MUX_TOKEN_SECRET\" ] && [ \${#MUX_TOKEN_SECRET} -gt 20 ]" \
    ""

check_issue "DEEPGRAM_API_KEY set" \
    "[ -n \"\$DEEPGRAM_API_KEY\" ] && [ \${#DEEPGRAM_API_KEY} -gt 20 ]" \
    ""

check_issue "ANTHROPIC_API_KEY set" \
    "[ -n \"\$ANTHROPIC_API_KEY\" ] && [ \${#ANTHROPIC_API_KEY} -gt 20 ]" \
    ""

echo ""
echo "📋 Checking Build Artifacts..."
echo ""

# Check 6: Backend build
check_issue "Backend compiled" \
    "[ -d backend/dist ]" \
    "cd backend && npm run build"

# Check 7: Frontend build
check_issue "Frontend compiled" \
    "[ -d frontend/dist ]" \
    "cd frontend && npm run build"

echo ""
echo "📋 Checking Critical Files..."
echo ""

check_issue "Agent file exists" \
    "[ -f backend/src/agents/mux-analytics-agent.ts ]" \
    ""

check_issue "MCP data client exists" \
    "[ -f backend/src/mcp/mux-data-client.ts ]" \
    ""

check_issue "Tools file exists" \
    "[ -f backend/src/tools/mux-analytics.ts ]" \
    ""

check_issue "Simple test script exists" \
    "[ -f backend/src/scripts/simple-audio-test.ts ]" \
    ""

echo ""
echo "📋 Testing API Connectivity..."
echo ""

# Test Mux API (if credentials are set)
if [ -n "$MUX_TOKEN_ID" ] && [ -n "$MUX_TOKEN_SECRET" ]; then
    echo -n "Testing Mux API... "
    if curl -s -u "$MUX_TOKEN_ID:$MUX_TOKEN_SECRET" https://api.mux.com/video/v1/assets -o /dev/null -w "%{http_code}" | grep -q "200\|404"; then
        echo -e "${GREEN}✅ Connected${NC}"
    else
        echo -e "${RED}❌ Failed - Check credentials${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "${YELLOW}⏭️  Skipping Mux API test (credentials not set)${NC}"
fi

# Test Deepgram API (if key is set)
if [ -n "$DEEPGRAM_API_KEY" ]; then
    echo -n "Testing Deepgram API... "
    if curl -s -X POST "https://api.deepgram.com/v1/speak?model=aura-asteria-en" \
        -H "Authorization: Token $DEEPGRAM_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"text":"test"}' \
        -o /tmp/deepgram-test.wav 2>&1 | grep -q "200\|HTTP"; then
        echo -e "${GREEN}✅ Connected${NC}"
        rm -f /tmp/deepgram-test.wav
    else
        echo -e "${RED}❌ Failed - Check API key${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "${YELLOW}⏭️  Skipping Deepgram API test (key not set)${NC}"
fi

echo ""
echo "================================================================"
echo "DIAGNOSTIC SUMMARY"
echo "================================================================"
echo -e "Issues found: ${RED}$ISSUES_FOUND${NC}"
echo -e "Fixes applied: ${GREEN}$FIXES_APPLIED${NC}"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CHECKS PASSED!${NC}"
    echo ""
    echo "Your system is ready. Run the simple test:"
    echo "  cd backend && tsx src/scripts/simple-audio-test.ts"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠️  ISSUES DETECTED${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    
    if [ ! -f .env ]; then
        echo "1. Edit .env file and add your API keys:"
        echo "   nano .env"
        echo ""
    fi
    
    if [ -z "$MUX_TOKEN_ID" ] || [ -z "$MUX_TOKEN_SECRET" ]; then
        echo "2. Get Mux API credentials from:"
        echo "   https://dashboard.mux.com/settings/access-tokens"
        echo ""
    fi
    
    if [ -z "$DEEPGRAM_API_KEY" ]; then
        echo "3. Get Deepgram API key from:"
        echo "   https://console.deepgram.com/"
        echo ""
    fi
    
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo "4. Get Anthropic API key from:"
        echo "   https://console.anthropic.com/"
        echo ""
    fi
    
    echo "5. Re-run this script after fixing issues:"
    echo "   ./diagnose-and-fix.sh"
    echo ""
    
    exit 1
fi

