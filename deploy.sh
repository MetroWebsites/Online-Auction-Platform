#!/bin/bash

# Auction Platform - Quick Deployment Script
# This script guides you through deploying to Cloudflare Pages

set -e  # Exit on error

echo "🚀 Auction Platform - Production Deployment"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the project root directory${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Checking authentication...${NC}"
if ! npx wrangler whoami 2>/dev/null | grep -q "You are logged in"; then
    echo -e "${YELLOW}Not authenticated. Please set your API token:${NC}"
    echo "export CLOUDFLARE_API_TOKEN='your-token-here'"
    echo ""
    echo "Or run: npx wrangler login"
    exit 1
fi
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

echo -e "${BLUE}Step 2: Creating D1 Database...${NC}"
echo "Creating 'auction-db' database..."
DB_OUTPUT=$(npx wrangler d1 create auction-db 2>&1 || true)

if echo "$DB_OUTPUT" | grep -q "database_id"; then
    echo -e "${GREEN}✓ Database created${NC}"
    DB_ID=$(echo "$DB_OUTPUT" | grep "database_id" | sed 's/.*= "\(.*\)"/\1/')
    echo "Database ID: $DB_ID"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Copy this database ID and add it to wrangler.jsonc${NC}"
    echo ""
    echo "Add this to your wrangler.jsonc:"
    echo ""
    echo '  "d1_databases": ['
    echo '    {'
    echo '      "binding": "DB",'
    echo '      "database_name": "auction-db",'
    echo "      \"database_id\": \"$DB_ID\""
    echo '    }'
    echo '  ]'
    echo ""
    read -p "Press Enter after you've updated wrangler.jsonc..."
elif echo "$DB_OUTPUT" | grep -q "already exists"; then
    echo -e "${YELLOW}Database already exists, continuing...${NC}"
else
    echo -e "${RED}Error creating database. Output:${NC}"
    echo "$DB_OUTPUT"
    exit 1
fi
echo ""

echo -e "${BLUE}Step 3: Applying database migrations...${NC}"
npx wrangler d1 migrations apply auction-db --remote
echo -e "${GREEN}✓ Migrations applied${NC}"
echo ""

echo -e "${BLUE}Step 4: Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

echo -e "${BLUE}Step 5: Creating Cloudflare Pages project...${NC}"
if npx wrangler pages project list 2>/dev/null | grep -q "auction-platform"; then
    echo -e "${YELLOW}Project already exists, skipping creation...${NC}"
else
    npx wrangler pages project create auction-platform \
        --production-branch main \
        --compatibility-date 2024-01-01
    echo -e "${GREEN}✓ Project created${NC}"
fi
echo ""

echo -e "${BLUE}Step 6: Deploying to Cloudflare Pages...${NC}"
DEPLOY_OUTPUT=$(npx wrangler pages deploy dist --project-name auction-platform)
echo "$DEPLOY_OUTPUT"
echo ""

# Extract URL from deployment output
if echo "$DEPLOY_OUTPUT" | grep -q "https://"; then
    DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -o "https://[^ ]*pages.dev" | head -1)
    echo -e "${GREEN}✓ Deployment successful!${NC}"
    echo ""
    echo "========================================="
    echo "🎉 YOUR AUCTION PLATFORM IS LIVE!"
    echo "========================================="
    echo ""
    echo "Public URL: $DEPLOY_URL"
    echo ""
    echo "Quick Links:"
    echo "  • Homepage:     $DEPLOY_URL/"
    echo "  • Bidder App:   $DEPLOY_URL/bidder/"
    echo "  • Admin Portal: $DEPLOY_URL/admin/"
    echo "  • API Health:   $DEPLOY_URL/api/health"
    echo ""
    echo "Next Steps:"
    echo "  1. Test the health endpoint"
    echo "  2. Login to admin portal"
    echo "  3. Create your first auction"
    echo "  4. Share on social media (Open Graph tags included!)"
    echo ""
    echo -e "${YELLOW}Optional: Set environment variables${NC}"
    echo "  npx wrangler pages secret put ENVIRONMENT --project-name auction-platform"
    echo "  (Enter: production)"
    echo ""
else
    echo -e "${YELLOW}Deployment completed but couldn't extract URL${NC}"
    echo "Check your Cloudflare dashboard for the deployment URL"
fi

echo -e "${GREEN}Deployment complete! 🚀${NC}"
