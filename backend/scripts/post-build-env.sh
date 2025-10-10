#!/bin/bash

# Post-build script to ensure .env symlink persists after Mastra builds
# This runs after builds to restore the .env symlink if it gets removed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$BACKEND_DIR/.mastra/output"
ROOT_ENV="$BACKEND_DIR/../.env"
OUTPUT_ENV="$OUTPUT_DIR/.env"

# Only run if we're in development mode
if [ "$NODE_ENV" = "production" ]; then
    echo "[post-build-env] Skipping in production mode"
    exit 0
fi

# Check if root .env exists
if [ ! -f "$ROOT_ENV" ]; then
    echo "[post-build-env] WARNING: Root .env file not found at $ROOT_ENV"
    exit 0
fi

# Create output directory if it doesn't exist
if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
fi

# Check if .env symlink already exists and is valid
if [ -L "$OUTPUT_ENV" ] && [ -f "$OUTPUT_ENV" ]; then
    echo "[post-build-env] ✅ .env symlink already exists and is valid"
    exit 0
fi

# Remove any existing file/symlink
if [ -e "$OUTPUT_ENV" ]; then
    rm -f "$OUTPUT_ENV"
fi

# Create symlink to root .env
ln -sf "$ROOT_ENV" "$OUTPUT_ENV"

# Verify the symlink works
if [ -L "$OUTPUT_ENV" ] && [ -f "$OUTPUT_ENV" ]; then
    echo "[post-build-env] ✅ Environment symlink restored after build"
    echo "[post-build-env] Symlink: $OUTPUT_ENV -> $ROOT_ENV"
else
    echo "[post-build-env] ❌ Failed to restore symlink"
    exit 1
fi