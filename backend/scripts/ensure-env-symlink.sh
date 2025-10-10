#!/bin/bash

# Script to ensure .env symlink exists in Mastra output directory
# This ensures environment variables are available to Mastra playground

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

# Check if root .env exists
if [ ! -f "$ROOT_ENV" ]; then
    echo "[env-symlink] ERROR: Root .env file not found at $ROOT_ENV"
    echo "[env-symlink] Please copy env.example to .env and configure your API keys"
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

# Create symlink to root .env
ln -sf "$ROOT_ENV" "$OUTPUT_ENV"

# Verify the symlink works
if [ -L "$OUTPUT_ENV" ] && [ -f "$OUTPUT_ENV" ]; then
    echo "[env-symlink] ✅ Environment configured for Mastra"
    echo "[env-symlink] Symlink: $OUTPUT_ENV -> $ROOT_ENV"
else
    echo "[env-symlink] ❌ Failed to create symlink"
    exit 1
fi
