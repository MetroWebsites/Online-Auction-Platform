#!/bin/bash

# Simple Deployment Steps - Execute one by one
# Copy your Cloudflare API token and paste it in the first command

echo "🚀 Auction Platform - Manual Deployment"
echo ""
echo "STEP 1: Set your API token (get it from GenSpark Deploy tab)"
echo "=========================================="
echo "Run this command with YOUR token:"
echo ""
echo "  export CLOUDFLARE_API_TOKEN='paste-your-token-here'"
echo ""
echo "After setting the token, continue with Step 2"
echo ""
echo "---"
echo ""
echo "STEP 2: Verify authentication"
echo "=========================================="
echo "Run: npx wrangler whoami"
echo ""
echo "You should see your Cloudflare account email"
echo ""
echo "---"
echo ""
echo "STEP 3: Create D1 database"
echo "=========================================="
echo "Run: npx wrangler d1 create auction-db"
echo ""
echo "⚠️  IMPORTANT: Copy the database_id from the output!"
echo ""
echo "---"
echo ""
echo "STEP 4: Update wrangler.jsonc"
echo "=========================================="
echo "Edit wrangler.jsonc and add your database_id:"
echo ""
cat << 'EOF'
{
  "name": "auction-platform",
  "compatibility_date": "2024-01-01",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "auction-db",
      "database_id": "YOUR_DATABASE_ID_HERE"
    }
  ]
}
EOF
echo ""
echo "---"
echo ""
echo "STEP 5: Apply migrations"
echo "=========================================="
echo "Run: npx wrangler d1 migrations apply auction-db --remote"
echo ""
echo "---"
echo ""
echo "STEP 6: Build application"
echo "=========================================="
echo "Run: npm run build"
echo ""
echo "---"
echo ""
echo "STEP 7: Create Pages project"
echo "=========================================="
echo "Run: npx wrangler pages project create auction-platform --production-branch main"
echo ""
echo "---"
echo ""
echo "STEP 8: Deploy to production"
echo "=========================================="
echo "Run: npx wrangler pages deploy dist --project-name auction-platform"
echo ""
echo "This will give you your live URL! 🎉"
echo ""
echo "=========================================="
echo ""
echo "📖 For detailed help, see:"
echo "  - AUTHENTICATION_HELP.md"
echo "  - DEPLOYMENT_GUIDE.md"
