#!/bin/sh
# Startup script that runs both nginx and the backend service

set -e

echo "Starting application with nginx..."

# Generate SSL certificate if it doesn't exist
if [ ! -f "/etc/nginx/ssl/server.crt" ]; then
    echo "Generating self-signed SSL certificate..."
    /app/scripts/generate-ssl-cert.sh
fi

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    # Kill backend node processes
    pkill -f "node.*dist/index.js" 2>/dev/null || true
    # Stop nginx gracefully
    nginx -s quit 2>/dev/null || true
    # Force kill nginx if it doesn't stop
    pkill nginx 2>/dev/null || true
    exit 0
}

# Trap signals
trap cleanup SIGTERM SIGINT

# Start backend in background as weatheruser
echo "Starting backend server..."
cd /app/backend
su -s /bin/sh weatheruser -c "cd /app/backend && ./start.sh" &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Check if backend is running by checking for node process
if ! pgrep -f "node.*dist/index.js" > /dev/null; then
    echo "ERROR: Backend failed to start!"
    ps aux | grep node || true
    exit 1
fi

echo "Backend started successfully"

# Start nginx in foreground (runs as root)
echo "Starting nginx..."
echo "Application is ready!"
echo "Backend: http://localhost:3001"
echo "Frontend (HTTPS): https://10.21.16.43:3003"
echo "API (HTTPS): https://api.10.21.16.43:3003"

# Start nginx in foreground - this will block until nginx exits
exec nginx -g "daemon off;"

