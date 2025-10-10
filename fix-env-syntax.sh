#!/bin/bash

# Fix .env syntax error - add quotes to WEATHER_MCP_USER_AGENT

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found!"
    exit 1
fi

echo "🔧 Fixing .env syntax error..."

# Backup original
cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"

# Fix the line with sed
sed -i '' 's/^WEATHER_MCP_USER_AGENT=WeatherAgent\/1.0 (media-vault-agent@streamingportfolio.com)$/WEATHER_MCP_USER_AGENT="WeatherAgent\/1.0 (media-vault-agent@streamingportfolio.com)"/' "$ENV_FILE"

# Also fix BACKEND_PORT
sed -i '' 's/^BACKEND_PORT=4111$/BACKEND_PORT=3001/' "$ENV_FILE"

echo "✅ Fixed!"
echo ""
echo "Changes made:"
echo "1. Added quotes to WEATHER_MCP_USER_AGENT"
echo "2. Changed BACKEND_PORT from 4111 to 3001"
echo ""
echo "Backup saved to: $ENV_FILE.backup.*"
echo ""
echo "Now run: cd backend && npm run dev"

