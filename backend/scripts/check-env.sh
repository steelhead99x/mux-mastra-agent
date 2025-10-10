#!/bin/bash

# Quick script to check and restore .env if missing
# Run this if you notice Mastra dev is missing environment variables

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

echo "[env-check] Checking .env status..."

# Check if root .env exists
if [ ! -f "$ROOT_ENV" ]; then
    echo "[env-check] ❌ Root .env file not found at $ROOT_ENV"
    echo "[env-check] Please copy env.example to .env and configure your API keys"
    exit 1
fi

# Check if Mastra output .env exists
if [ -f "$OUTPUT_ENV" ] || [ -L "$OUTPUT_ENV" ]; then
    echo "[env-check] ✅ Mastra .env exists"
    if [ -L "$OUTPUT_ENV" ]; then
        echo "[env-check] 📎 It's a symlink to: $(readlink "$OUTPUT_ENV")"
    else
        echo "[env-check] 📄 It's a regular file"
    fi
else
    echo "[env-check] ⚠️  Mastra .env missing, restoring..."
    npm run restore-env
fi

echo "[env-check] ✅ Environment check complete"
