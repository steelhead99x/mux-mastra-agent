#!/bin/bash

# Enhanced script to ensure .env file exists in Mastra output directory
# This creates both a symlink and a copy as backup to ensure environment variables are available

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

# Check if root .env exists
if [ ! -f "$ROOT_ENV" ]; then
    echo "[env-setup] ERROR: Root .env file not found at $ROOT_ENV"
    echo "[env-setup] Please copy env.example to .env and configure your API keys"
    exit 1
fi

# Create output directory if it doesn't exist
if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
fi

# Remove existing .env file/symlink if it exists
if [ -e "$OUTPUT_ENV" ]; then
    rm -f "$OUTPUT_ENV"
fi

# Try symlink first (preferred method)
ln -sf "$ROOT_ENV" "$OUTPUT_ENV"

# Verify the symlink works
if [ -L "$OUTPUT_ENV" ] && [ -f "$OUTPUT_ENV" ]; then
    echo "[env-setup] ✅ Environment symlink created successfully"
    echo "[env-setup] Symlink: $OUTPUT_ENV -> $ROOT_ENV"
else
    echo "[env-setup] ⚠️  Symlink failed, creating copy instead"
    cp "$ROOT_ENV" "$OUTPUT_ENV"
    
    if [ -f "$OUTPUT_ENV" ]; then
        echo "[env-setup] ✅ Environment file copied successfully"
        echo "[env-setup] Copy: $OUTPUT_ENV"
    else
        echo "[env-setup] ❌ Failed to create environment file"
        exit 1
    fi
fi

# Verify the file is readable
if [ -r "$OUTPUT_ENV" ]; then
    echo "[env-setup] ✅ Environment file is readable and ready for Mastra"
else
    echo "[env-setup] ❌ Environment file is not readable"
    exit 1
fi
