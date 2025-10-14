#!/bin/sh
# Startup script for the backend service
# This ensures we always run the correct command based on the environment

set -e

echo "Starting application..."
echo "NODE_ENV: $NODE_ENV"
echo "HOME: $HOME"
echo "NPM_CONFIG_CACHE: $NPM_CONFIG_CACHE"
echo "Current directory: $(pwd)"
echo "User: $(whoami)"
echo "User ID: $(id)"

# Verify npm cache directory is accessible
if [ -n "$NPM_CONFIG_CACHE" ]; then
    echo "Verifying npm cache directory: $NPM_CONFIG_CACHE"
    if [ -d "$NPM_CONFIG_CACHE" ]; then
        echo "✅ NPM cache directory exists and is accessible"
        ls -la "$NPM_CONFIG_CACHE"
    else
        echo "❌ NPM cache directory does not exist, creating it..."
        mkdir -p "$NPM_CONFIG_CACHE"
    fi
else
    echo "⚠️  NPM_CONFIG_CACHE not set"
fi

# Check if we're in production
if [ "$NODE_ENV" = "production" ]; then
    echo "Running in PRODUCTION mode"
    
    # Verify dist directory exists
    if [ ! -d "dist" ]; then
        echo "ERROR: dist directory not found!"
        echo "Contents of current directory:"
        ls -la
        exit 1
    fi
    
    # Verify index.js exists
    if [ ! -f "dist/index.js" ]; then
        echo "ERROR: dist/index.js not found!"
        echo "Contents of dist directory:"
        ls -la dist/
        exit 1
    fi
    
    echo "Starting production server..."
    exec node dist/index.js
else
    echo "Running in DEVELOPMENT mode"
    echo "ERROR: Development mode not supported in Docker container!"
    echo "Source files are not available in the container."
    echo "Please use production mode or run locally for development."
    echo "Current NODE_ENV: $NODE_ENV"
    echo "Contents of current directory:"
    ls -la
    exit 1
fi

