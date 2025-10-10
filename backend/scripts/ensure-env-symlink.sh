#!/bin/bash

# Script to ensure .env symlink exists in Mastra output directory
# This ensures environment variables are available to Mastra playground

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

echo "[env-symlink] Ensuring .env symlink for Mastra playground..."

# Check if root .env exists
if [ ! -f "$ROOT_ENV" ]; then
    echo "[env-symlink] ERROR: Root .env file not found at $ROOT_ENV"
    echo "[env-symlink] Please copy env.example to .env and configure your API keys"
    exit 1
fi

# Create output directory if it doesn't exist
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "[env-symlink] Creating output directory: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
fi

# Remove existing .env file/symlink if it exists
if [ -e "$OUTPUT_ENV" ]; then
    echo "[env-symlink] Removing existing .env file/symlink"
    rm -f "$OUTPUT_ENV"
fi

# Create symlink to root .env
echo "[env-symlink] Creating symlink: $OUTPUT_ENV -> $ROOT_ENV"
ln -sf "$ROOT_ENV" "$OUTPUT_ENV"

# Verify the symlink works
if [ -L "$OUTPUT_ENV" ] && [ -f "$OUTPUT_ENV" ]; then
    echo "[env-symlink] ✅ Symlink created successfully"
    echo "[env-symlink] Environment variables should now be available to Mastra playground"
else
    echo "[env-symlink] ❌ Failed to create symlink"
    exit 1
fi
