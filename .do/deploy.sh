#!/bin/bash

# DigitalOcean App Platform Deployment Helper Script
# This script helps you deploy your Mux Mastra Agent to App Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DigitalOcean App Platform Deployment Helper      ║${NC}"
echo -e "${BLUE}║  Mux Mastra Analytics Agent                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if doctl is installed
if ! command -v doctl &> /dev/null; then
    echo -e "${RED}❌ doctl is not installed${NC}"
    echo ""
    echo "Please install doctl first:"
    echo "  macOS: brew install doctl"
    echo "  Linux: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    echo ""
    exit 1
fi

# Check if authenticated
if ! doctl auth list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not authenticated with DigitalOcean${NC}"
    echo ""
    echo "Please authenticate first:"
    echo "  doctl auth init"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ doctl is installed and authenticated${NC}"
echo ""

# Check if app.yaml exists
if [ ! -f ".do/app.yaml" ]; then
    echo -e "${RED}❌ .do/app.yaml not found${NC}"
    echo "Please create the app.yaml file first."
    exit 1
fi

echo -e "${GREEN}✅ app.yaml found${NC}"
echo ""

# Main menu
echo "What would you like to do?"
echo ""
echo "  1) Create new app"
echo "  2) Update existing app"
echo "  3) List apps"
echo "  4) View app info"
echo "  5) View logs"
echo "  6) Create deployment"
echo "  7) List deployments"
echo "  8) Delete app"
echo "  9) Exit"
echo ""
read -p "Enter your choice [1-9]: " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}Creating new app...${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  Make sure you've updated app.yaml with your GitHub repo!${NC}"
        echo ""
        read -p "Continue? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            doctl apps create --spec .do/app.yaml
            echo ""
            echo -e "${GREEN}✅ App created successfully!${NC}"
            echo ""
            echo "Next steps:"
            echo "  1. Go to https://cloud.digitalocean.com/apps"
            echo "  2. Add your secret environment variables"
            echo "  3. Wait for the first deployment to complete"
            echo "  4. Update CORS_ORIGINS with your app URL"
            echo ""
        fi
        ;;
    2)
        echo ""
        echo "Enter your App ID (or press Enter to list apps):"
        read app_id
        
        if [ -z "$app_id" ]; then
            echo ""
            echo -e "${BLUE}Available apps:${NC}"
            doctl apps list
            echo ""
            read -p "Enter App ID: " app_id
        fi
        
        echo ""
        echo -e "${BLUE}Updating app $app_id...${NC}"
        doctl apps update $app_id --spec .do/app.yaml
        echo ""
        echo -e "${GREEN}✅ App updated successfully!${NC}"
        echo "A new deployment will be created automatically."
        ;;
    3)
        echo ""
        echo -e "${BLUE}Available apps:${NC}"
        echo ""
        doctl apps list
        ;;
    4)
        echo ""
        read -p "Enter App ID: " app_id
        echo ""
        doctl apps get $app_id
        ;;
    5)
        echo ""
        read -p "Enter App ID: " app_id
        echo ""
        echo -e "${BLUE}Streaming logs (Ctrl+C to stop)...${NC}"
        echo ""
        doctl apps logs $app_id --type run --follow
        ;;
    6)
        echo ""
        read -p "Enter App ID: " app_id
        echo ""
        echo -e "${BLUE}Creating new deployment...${NC}"
        doctl apps create-deployment $app_id
        echo ""
        echo -e "${GREEN}✅ Deployment created!${NC}"
        echo "Monitor progress at: https://cloud.digitalocean.com/apps/$app_id"
        ;;
    7)
        echo ""
        read -p "Enter App ID: " app_id
        echo ""
        doctl apps list-deployments $app_id
        ;;
    8)
        echo ""
        read -p "Enter App ID: " app_id
        echo ""
        echo -e "${RED}⚠️  WARNING: This will permanently delete the app!${NC}"
        read -p "Are you sure? Type 'DELETE' to confirm: " confirm
        
        if [ "$confirm" = "DELETE" ]; then
            doctl apps delete $app_id --force
            echo ""
            echo -e "${GREEN}✅ App deleted${NC}"
        else
            echo "Cancelled."
        fi
        ;;
    9)
        echo "Goodbye!"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Done!${NC}"
echo ""


