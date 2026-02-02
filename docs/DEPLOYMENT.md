# Production Deployment Guide

## Overview
This guide covers deploying the Auction Platform to Cloudflare Pages and Workers with proper environment configuration.

## Prerequisites

1. **Cloudflare Account**
   - Sign up at https://dash.cloudflare.com/sign-up
   - Add a payment method (for D1 and R2 usage beyond free tier)

2. **Wrangler CLI**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

3. **GitHub Repository** (Optional but recommended)
   - Push code to GitHub for automatic deployments

## Deployment Steps

### 1. Create Cloudflare D1 Database

```bash
# Create production database
npx wrangler d1 create auction-db

# Copy the database_id from output and update wrangler.jsonc
# Example output:
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Update `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "auction-db",
      "database_id": "YOUR-DATABASE-ID-HERE",
      "migrations_dir": "migrations"
    }
  ]
}
```

### 2. Run Database Migrations

```bash
# Apply migrations to production database
npx wrangler d1 migrations apply auction-db --remote
```

### 3. Create R2 Bucket for Images

```bash
# Create R2 bucket
npx wrangler r2 bucket create auction-images

# Bucket will be automatically bound via wrangler.jsonc
```

### 4. Set Production Environment Variables

```bash
# Set JWT secret (generate a strong random string)
npx wrangler pages secret put JWT_SECRET --project-name auction-platform

# Set VAPID keys for push notifications (optional)
# Generate keys at: https://web-push-codelab.glitch.me/
npx wrangler pages secret put VAPID_PUBLIC_KEY --project-name auction-platform
npx wrangler pages secret put VAPID_PRIVATE_KEY --project-name auction-platform
```

### 5. Build the Application

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

This creates the `dist/` directory with:
- `_worker.js` - Your compiled Hono application
- `_routes.json` - Routing configuration
- Static assets from `public/`

### 6. Deploy to Cloudflare Pages

#### Option A: Using Wrangler CLI

```bash
# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name auction-platform

# You'll receive:
# - Production URL: https://auction-platform.pages.dev
# - Branch URL: https://main.auction-platform.pages.dev
```

#### Option B: Connect GitHub Repository

1. Go to Cloudflare Dashboard → Pages
2. Click "Connect to Git"
3. Select your repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. Add environment variables (same as step 4)
6. Deploy

### 7. Configure Custom Domain (Optional)

```bash
# Add custom domain
npx wrangler pages domain add yourdomain.com --project-name auction-platform

# Add DNS records as instructed
# Cloudflare will provision SSL certificate automatically
```

### 8. Seed Initial Data (Optional)

```bash
# Execute seed file
npx wrangler d1 execute auction-db --remote --file=./scripts/seed.sql

# Or create admin user via API
curl -X POST https://auction-platform.pages.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "SecurePassword123!",
    "name": "Admin User",
    "role": "admin"
  }'
```

## Environment Configuration

### Development (.dev.vars)

Create `.dev.vars` for local development:
```bash
ENVIRONMENT=development
JWT_SECRET=dev-secret-change-me
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
```

### Staging (Optional)

Create a separate Pages project for staging:
```bash
npx wrangler pages project create auction-platform-staging

# Deploy to staging
npx wrangler pages deploy dist --project-name auction-platform-staging
```

### Production

Production secrets are set via `wrangler pages secret put` (see step 4).

## Post-Deployment Checklist

- [ ] Database migrations applied
- [ ] R2 bucket created and accessible
- [ ] Environment variables configured
- [ ] Admin user created
- [ ] Test all core functions:
  - [ ] User registration/login
  - [ ] Create auction
  - [ ] Create lot
  - [ ] Place bid
  - [ ] Proxy bidding
  - [ ] Image upload
  - [ ] CSV import
  - [ ] Invoice generation
  - [ ] Real-time updates (SSE)
- [ ] Configure custom domain (if applicable)
- [ ] Set up monitoring/alerts
- [ ] Configure backups

## Monitoring & Maintenance

### View Logs

```bash
# View real-time logs
npx wrangler pages deployment tail --project-name auction-platform

# View D1 database info
npx wrangler d1 info auction-db

# View R2 bucket info
npx wrangler r2 bucket info auction-images
```

### Database Backups

```bash
# Export database
npx wrangler d1 export auction-db --remote --output=backup.sql

# Import database
npx wrangler d1 import auction-db --remote --file=backup.sql
```

### Rollback Deployment

```bash
# List deployments
npx wrangler pages deployment list --project-name auction-platform

# Rollback to specific deployment
npx wrangler pages deployment rollback DEPLOYMENT_ID --project-name auction-platform
```

## Performance Optimization

### 1. Enable Caching

Cloudflare Pages automatically caches static assets. For API responses:

```typescript
// In your routes, add cache headers
app.get('/api/auctions', async (c) => {
  const data = await getAuctions();
  
  c.header('Cache-Control', 'public, max-age=60'); // Cache for 60 seconds
  return c.json(data);
});
```

### 2. Image Optimization

Use Cloudflare Images for automatic optimization:
- Resize on-the-fly
- WebP conversion
- Responsive images

### 3. Database Optimization

- Use indexes for frequently queried fields
- Batch operations where possible
- Monitor query performance

## Security Hardening

1. **Change Default Secrets**
   - Generate strong JWT_SECRET
   - Rotate secrets periodically

2. **Rate Limiting**
   - Already implemented in middleware
   - Adjust limits based on traffic

3. **CORS Configuration**
   - Update allowed origins in production
   - Remove wildcard (*) for specific domains

4. **Content Security Policy**
   ```typescript
   c.header('Content-Security-Policy', "default-src 'self'; ...");
   ```

## Scaling Considerations

Cloudflare Pages/Workers automatically scale, but consider:

1. **D1 Database Limits**
   - Free tier: 5 GB storage
   - Paid tier: 25 million reads/day

2. **R2 Storage Limits**
   - Free tier: 10 GB storage
   - No egress fees

3. **Worker Limits**
   - CPU time: 30ms per request
   - Memory: 128 MB per request

## Troubleshooting

### Common Issues

**Build Failures**
- Check Node.js version compatibility
- Verify all dependencies installed
- Check wrangler.jsonc syntax

**Database Connection Errors**
- Verify database_id in wrangler.jsonc
- Check migrations applied
- Verify binding name matches code

**Image Upload Failures**
- Check R2 bucket exists
- Verify bucket binding
- Check CORS configuration

**Authentication Errors**
- Verify JWT_SECRET is set
- Check token expiration
- Verify user roles

## Support & Resources

- **Cloudflare Docs**: https://developers.cloudflare.com
- **Hono Docs**: https://hono.dev
- **Project README**: See README.md
- **GitHub Issues**: Report bugs on GitHub

## Cost Estimation

### Free Tier (sufficient for testing)
- Cloudflare Pages: Free
- D1: 5 GB storage, 5M reads/day
- R2: 10 GB storage, 1M reads/month
- Workers: 100K requests/day

### Paid Tier (production)
- Workers: $5/month (10M requests)
- D1: $5/month (25M reads)
- R2: $0.015/GB storage + requests
- Estimated: $15-30/month for moderate traffic

## Continuous Deployment

### GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist --project-name auction-platform
```

Add `CLOUDFLARE_API_TOKEN` to GitHub secrets.

---

**Ready to deploy!** Follow the steps above and your auction platform will be live on Cloudflare's global edge network.
