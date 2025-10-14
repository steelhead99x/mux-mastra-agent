#!/bin/bash
# Post-install script to remove problematic packages

set -e

echo "🧹 Cleaning up problematic native modules..."

# Remove inotify if it exists
if [ -d "node_modules/inotify" ]; then
    echo "Removing inotify package..."
    rm -rf node_modules/inotify
fi

# Remove any other problematic packages
for pkg in "fsevents" "node-gyp" "inotify"; do
    if [ -d "node_modules/$pkg" ]; then
        echo "Removing $pkg package..."
        rm -rf "node_modules/$pkg"
    fi
done

echo "✅ Cleanup complete!"
