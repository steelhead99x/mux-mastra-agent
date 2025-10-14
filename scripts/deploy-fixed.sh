#!/bin/bash

set -e

echo "🚀 Deploying Mux Mastra Agent with npm permission fixes..."

# Variables
DROPLET_IP="${DROPLET_IP:-YOUR_DROPLET_IP}"
APP_DIR="~/apps/mux-mastra-agent"
IMAGE_NAME="mux-mastra-agent:latest"

# Check if DROPLET_IP is set
if [ "$DROPLET_IP" = "YOUR_DROPLET_IP" ]; then
    echo "❌ Please set DROPLET_IP environment variable"
    echo "   export DROPLET_IP=your.droplet.ip.address"
    exit 1
fi

echo "📦 Building Docker image with Node.js 24 and modern file watching..."
docker build -t $IMAGE_NAME -f Dockerfile.simple .

echo "📤 Transferring image to droplet..."
docker save $IMAGE_NAME | gzip > /tmp/mux-mastra-agent.tar.gz
scp /tmp/mux-mastra-agent.tar.gz muxagent@$DROPLET_IP:/tmp/

echo "🔄 Deploying on server..."
ssh muxagent@$DROPLET_IP << 'EOF'
  echo "Loading Docker image..."
  docker load < /tmp/mux-mastra-agent.tar.gz
  
  echo "Stopping old container..."
  docker stop mux-mastra-agent || true
  docker rm mux-mastra-agent || true
  
  echo "Creating data directories..."
  mkdir -p ~/apps/mux-mastra-agent/data
  mkdir -p ~/apps/mux-mastra-agent/backend/files/charts
  
  echo "Running new container with proper permissions..."
  cd ~/apps/mux-mastra-agent
  docker run -d \
    --name mux-mastra-agent \
    --restart unless-stopped \
    -p 3001:3001 \
    -v ~/apps/mux-mastra-agent/data:/app/data \
    -v ~/apps/mux-mastra-agent/backend/files:/app/backend/files \
    --env-file .env \
    mux-mastra-agent:latest
  
  echo "Waiting for container to start..."
  sleep 10
  
  echo "Checking container logs..."
  docker logs mux-mastra-agent --tail 20
  
  echo "Checking container status..."
  docker ps | grep mux-mastra-agent
  
  echo "Testing health endpoint..."
  curl -f http://localhost:3001/api/health || echo "Health check failed"
  
  # Cleanup
  rm /tmp/mux-mastra-agent.tar.gz
  
  echo "✅ Deployment complete!"
EOF

# Cleanup local
rm /tmp/mux-mastra-agent.tar.gz

echo "🎉 Deployment successful!"
echo "🌐 Your app should be available at: http://$DROPLET_IP:3001"
echo "📊 Check logs with: ssh muxagent@$DROPLET_IP 'docker logs -f mux-mastra-agent'"
