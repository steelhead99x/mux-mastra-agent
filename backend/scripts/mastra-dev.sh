#!/bin/bash

# Wrapper script to start Mastra with proper environment loading
# This ensures the .env file is loaded before Mastra starts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

echo "[mastra-dev] Starting Mastra with environment setup..."

# Ensure .env exists
if [ ! -f "$OUTPUT_ENV" ]; then
    echo "[mastra-dev] .env missing, restoring..."
    npm run restore-env
fi

# Verify .env is readable
if [ ! -r "$OUTPUT_ENV" ]; then
    echo "[mastra-dev] ❌ .env file is not readable"
    exit 1
fi

# Load environment variables and start Mastra
echo "[mastra-dev] Loading environment from: $OUTPUT_ENV"

# Use a safer method to load environment variables
set -a  # automatically export all variables
source "$OUTPUT_ENV"
set +a  # stop automatically exporting

# Verify critical environment variables
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "[mastra-dev] ❌ ANTHROPIC_API_KEY is not set"
    echo "[mastra-dev] Please check your .env file"
    exit 1
fi

if [ -z "$MUX_TOKEN_ID" ] || [ -z "$MUX_TOKEN_SECRET" ]; then
    echo "[mastra-dev] ❌ MUX credentials are not set"
    echo "[mastra-dev] Please check your .env file"
    exit 1
fi

echo "[mastra-dev] ✅ Environment variables loaded successfully"
echo "[mastra-dev] 🚀 Starting Mastra dev server..."

# Start Mastra
cd "$BACKEND_DIR"
npx mastra dev
