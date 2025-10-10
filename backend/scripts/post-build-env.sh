#!/bin/bash

# Post-build hook to ensure .env symlink exists after Mastra rebuilds
# This script should be run after Mastra generates the output directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

# Wait a moment for Mastra to finish generating files
sleep 2

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "[post-build] Output directory not found, skipping .env symlink creation"
    exit 0
fi

# Check if root .env exists
if [ ! -f "$ROOT_ENV" ]; then
    echo "[post-build] Root .env file not found, skipping symlink creation"
    exit 0
fi

# Remove existing .env file/symlink if it exists
if [ -e "$OUTPUT_ENV" ]; then
    rm -f "$OUTPUT_ENV"
fi

# Create symlink to root .env
ln -sf "$ROOT_ENV" "$OUTPUT_ENV"

# Verify the symlink works (silent on success)
if [ ! -L "$OUTPUT_ENV" ] || [ ! -f "$OUTPUT_ENV" ]; then
    echo "[post-build] ❌ Failed to create .env symlink"
    exit 1
fi
