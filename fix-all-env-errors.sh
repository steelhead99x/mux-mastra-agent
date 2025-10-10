#!/bin/bash

# Fix all .env syntax errors

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found!"
    exit 1
fi

echo "🔧 Fixing all .env syntax errors..."

# Backup original
BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"

# Fix line 59: WEATHER_MCP_USER_AGENT (if not already fixed)
sed -i '' 's/^WEATHER_MCP_USER_AGENT=WeatherAgent\/1.0 (media-vault-agent@streamingportfolio.com)$/WEATHER_MCP_USER_AGENT="WeatherAgent\/1.0 (media-vault-agent@streamingportfolio.com)"/' "$ENV_FILE"

# Fix line 132: VITE_WEATHER_AGENT_ID
sed -i '' 's/^VITE_WEATHER_AGENT_ID=video professional streaming media at paramount plus$/VITE_WEATHER_AGENT_ID="video professional streaming media at paramount plus"/' "$ENV_FILE"

# Fix BACKEND_PORT to match VITE_MASTRA_API_HOST
sed -i '' 's/^BACKEND_PORT=4111$/BACKEND_PORT=3001/' "$ENV_FILE"

# Verify fixes
echo ""
echo "✅ Fixed!"
echo ""
echo "Changes made:"
echo "1. Added quotes to WEATHER_MCP_USER_AGENT (line 59)"
echo "2. Added quotes to VITE_WEATHER_AGENT_ID (line 132)"  
echo "3. Changed BACKEND_PORT from 4111 to 3001"
echo ""
echo "Backup saved to: $BACKUP_FILE"
echo ""

# Show the problematic lines after fix
echo "Verifying fixes:"
echo "────────────────────────────────────────"
grep "WEATHER_MCP_USER_AGENT" "$ENV_FILE"
grep "VITE_WEATHER_AGENT_ID" "$ENV_FILE"
grep "BACKEND_PORT" "$ENV_FILE"
echo "────────────────────────────────────────"
echo ""
echo "✅ All syntax errors fixed!"
echo ""
echo "Next steps:"
echo "1. Kill any running backend: pkill -f 'mastra dev' && pkill -f 'tsx --watch'"
echo "2. Start fresh: npm run dev"
echo "3. Visit http://localhost:3000"


