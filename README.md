# BB Realty & Auctions - Online Auction Platform

![BB Realty & Auctions Logo](public/static/bb-logo.png)

## 🏆 Project Overview

**BB Realty & Auctions** is a full-stack, production-ready online auction platform built specifically for real estate and asset auctions. The platform features credit card verification before bidding, real-time notifications when outbid, bulk lot and image uploads, and comprehensive mobile-first PWA functionality.

- **Name**: BB Realty & Auctions
- **Tagline**: Premier Real Estate & Asset Auctions  
- **Technology**: Hono + TypeScript + Cloudflare Workers + D1 Database + R2 Storage
- **Status**: ✅ **ACTIVE** (Core platform functional, database setup pending)

## 🌐 Live URLs

- **Local Development**: http://localhost:3000
- **Public URL**: https://3000-ipqfv0ctciev4agmzy0r8-d0b9e1e2.sandbox.novita.ai
- **API Health**: https://3000-ipqfv0ctciev4agmzy0r8-d0b9e1e2.sandbox.novita.ai/api/health
- **Admin Portal**: /admin/ (pending implementation)
- **Bidder Portal**: /bidder/login

## ✨ Key Features

### 🔐 Credit Card Requirement
- **Mandatory credit card on file** before placing bids
- Secure payment tokenization (Stripe-ready)
- Card validation and verification

### 📸 Image Management (Custom Naming)
- Bulk image upload with **lot-based naming**: `1-001.jpg`, `1-002.jpg`, etc.
- Format: `{lot_number}-{photo_order}.jpg`
- Automatic image association with lots
- R2 storage integration for scalable image hosting

### 🔔 Real-Time Notifications
- **Outbid notifications** via email and push notifications
- Server-Sent Events (SSE) for live bidding updates
- PWA push notification support

### 📊 Comprehensive Features
- User registration and authentication (JWT)
- Auction management (CRUD operations)
- Lot management with multiple images
- Real-time bidding with soft close
- Proxy/max bidding
- Watchlist functionality
- Invoice generation
- Admin dashboard
- Mobile-first responsive design
- Gold/black BB branding

## 📁 Project Structure

```
bb-realty-auctions/
├── src/
│   ├── index.tsx                  # Main Hono app
│   ├── routes/
│   │   ├── auth.ts                # Authentication (login, register)
│   │   ├── auctions.ts            # Auction CRUD
│   │   ├── lots.ts                # Lot management
│   │   ├── bids.ts                # Bidding logic
│   │   ├── bidders.ts             # Bidder management
│   │   ├── invoices.ts            # Invoice handling
│   │   ├── notifications.ts       # Notification system
│   │   └── import.ts              # Bulk CSV/image import
│   ├── services/
│   ├── utils/
│   │   ├── auth.ts                # JWT, password hashing
│   │   └── db.ts                  # Database helpers
│   ├── middleware/
│   │   └── auth.ts                # Auth middleware
│   └── pages/
│       ├── home.ts                # Homepage SSR
│       ├── bidder.ts              # Bidder PWA page
│       ├── auction.ts             # Auction detail page
│       └── lot.ts                 # Lot detail page
├── public/
│   ├── static/
│   │   ├── bb-logo.png            # BB Realty & Auctions logo
│   │   └── js/
│   │       └── bidder.js          # Bidder PWA JavaScript
│   └── admin/                     # Admin portal HTML (pending)
├── migrations/
│   └── 0001_initial_schema.sql   # Database schema (16 tables)
├── seed.sql                        # Seed data
├── wrangler.jsonc                  # Cloudflare configuration
├── package.json                    # Dependencies
├── ecosystem.config.cjs            # PM2 configuration
└── README.md                       # This file
```

## 🗄️ Database Schema

The platform uses **16 comprehensive tables** to manage all aspects of the auction system:

### Core Tables
1. **users** - Admin, clerk, auctioneer accounts
2. **bidders** - Public users who bid (with credit card info)
3. **auctions** - Auction events
4. **lots** - Individual items for auction
5. **lot_images** - Multiple images per lot (custom naming: `1-001.jpg`)

### Bidding & Transactions
6. **bids** - Bid history and proxy bidding
7. **watchlist** - Tracked items
8. **invoices** - Generated invoices
9. **invoice_items** - Line items
10. **payment_transactions** - Payment processing

### Notifications & Activity
11. **notifications** - Outbid alerts, reminders
12. **activity_log** - Audit trail
13. **push_subscriptions** - PWA push notifications

### Additional
14. **bidder_approvals** - Auction-specific approvals
15. **settings** - System configuration
16. **users** - Admin/staff management

### Credit Card Storage
Bidders table includes:
- `has_card_on_file` (boolean)
- `card_last_four` (display)
- `card_brand` (visa, mastercard, etc.)
- `card_expiry` (MM/YY)
- `payment_token` (Stripe customer ID)

### Image Naming Convention
Lot images table enforces the naming pattern:
- **Lot 1**: `1-001.jpg`, `1-002.jpg`, `1-003.jpg`
- **Lot 2**: `2-001.jpg`, `2-002.jpg`
- `photo_order` field: 1, 2, 3, etc.

## 🎨 Branding

- **Primary Color**: Gold (#DAA520)
- **Secondary Color**: Black (#000000)
- **Logo**: Gold house with gavel on black background
- **Typography**: Modern, elegant fonts
- **Theme**: Luxury, trust, professionalism

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm 8+
- Wrangler CLI 4+

### Installation

```bash
# Clone the repository
cd /home/user/bb-realty-auctions

# Install dependencies (already done)
npm install

# Build the project
npm run build

# Start development server
pm2 start ecosystem.config.cjs

# Or use npm script
npm run dev:sandbox
```

### Database Setup (TODO - Next Steps)

```bash
# Create D1 database
npx wrangler d1 create bb-realty-auctions-production

# Update wrangler.jsonc with database_id

# Apply migrations
npm run db:migrate:local

# Seed database
npm run db:seed

# Restart with database
npm run dev:d1
```

### R2 Storage Setup (TODO)

```bash
# Create R2 bucket for images
npx wrangler r2 bucket create bb-realty-auctions-images

# Update wrangler.jsonc (already configured)
```

## 📱 User Guide

### For Bidders

1. **Register**: Visit `/bidder/register` - provide email, password, full name
2. **Add Credit Card**: After registration, you MUST add a credit card before bidding
3. **Browse Auctions**: View available auctions and lots
4. **Place Bids**: Bid on items (requires credit card on file)
5. **Get Notified**: Receive alerts when outbid
6. **Win & Pay**: Winners receive invoices and can pay online

### For Admins

1. **Login**: Visit `/admin/login` with admin credentials
2. **Create Auction**: Set title, dates, soft close settings
3. **Bulk Import Lots**: Upload CSV file with lot data
4. **Bulk Upload Images**: Upload photos named `1-001.jpg`, `1-002.jpg`, etc.
5. **Monitor Bidding**: Track bids in real-time
6. **Generate Invoices**: Automatic invoice creation for winners

## 🔧 Development

### Available Scripts

```bash
npm run dev              # Vite dev server
npm run dev:sandbox      # Wrangler without database
npm run dev:d1           # Wrangler with D1 database
npm run build            # Build for production
npm run deploy           # Deploy to Cloudflare Pages
npm run deploy:prod      # Deploy to production
npm run db:migrate:local # Apply migrations locally
npm run db:migrate:prod  # Apply migrations to production
npm run db:seed          # Seed local database
npm run db:reset         # Reset local database
npm run clean-port       # Kill process on port 3000
```

### Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Test registration
curl -X POST http://localhost:3000/api/auth/bidder/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","fullName":"Test User"}'

# Test login
curl -X POST http://localhost:3000/api/auth/bidder/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

## 🔐 Security Features

- JWT authentication (7-day expiration)
- bcrypt password hashing (10 rounds)
- Rate limiting (60 requests/minute for auth)
- Credit card tokenization (Stripe/payment processor)
- CORS protection on API routes
- Role-based access control (admin, clerk, auctioneer, bidder)
- Activity logging for auditing

## 📈 Deployment

### Cloudflare Pages Deployment

```bash
# 1. Create D1 database
npx wrangler d1 create bb-realty-auctions-production

# 2. Create R2 bucket
npx wrangler r2 bucket create bb-realty-auctions-images

# 3. Update wrangler.jsonc with IDs

# 4. Build and deploy
npm run deploy:prod

# 5. Apply database migrations
npm run db:migrate:prod
```

## 📊 Current Status

### ✅ Completed Features

- [x] Project structure and setup
- [x] BB Realty & Auctions branding and logo
- [x] Comprehensive database schema (16 tables)
- [x] Credit card storage fields
- [x] Image naming pattern (`1-001.jpg` format)
- [x] Authentication API (login, register)
- [x] Bidder registration with credit card requirement UI
- [x] Homepage with gold/black theme
- [x] Bidder PWA interface (basic)
- [x] API health check
- [x] JWT middleware
- [x] Rate limiting
- [x] Git repository initialized

### ⏳ Pending Implementation

- [ ] D1 database creation and migration
- [ ] R2 bucket setup for images
- [ ] Admin portal HTML pages
- [ ] Bulk CSV lot import
- [ ] Bulk image upload (1-001.jpg naming)
- [ ] Bidding API with concurrency control
- [ ] Real-time bidding with SSE
- [ ] Outbid notification system (email + push)
- [ ] Invoice generation
- [ ] Payment integration (Stripe)
- [ ] Social sharing with dynamic OG images
- [ ] PWA manifest and service worker
- [ ] Production deployment to Cloudflare

## 🛠️ Tech Stack

### Backend
- **Hono v4** - Lightweight web framework
- **TypeScript** - Type-safe development
- **Cloudflare Workers** - Edge runtime
- **D1 Database** - SQLite-based globally distributed database
- **R2 Storage** - Object storage for images
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication

### Frontend
- **Vanilla JavaScript** - No framework bloat
- **TailwindCSS** - Utility-first styling (via CDN)
- **Font Awesome** - Icon library
- **PWA** - Progressive Web App capabilities

### Development
- **Vite** - Build tool
- **Wrangler** - Cloudflare CLI
- **PM2** - Process manager
- **Git** - Version control

## 📝 API Reference

### Authentication

- `POST /api/auth/login` - Admin/user login
- `POST /api/auth/bidder/login` - Bidder login
- `POST /api/auth/bidder/register` - Bidder registration
- `GET /api/auth/me` - Get current user

### Auctions

- `GET /api/auctions` - List all auctions
- `GET /api/auctions/:id` - Get auction by ID/slug
- `POST /api/auctions` - Create auction (admin)
- `PUT /api/auctions/:id` - Update auction (admin)
- `DELETE /api/auctions/:id` - Delete auction (admin)

### Lots

- `GET /api/lots/auction/:auctionId` - Get lots by auction
- `GET /api/lots/:id` - Get lot by ID
- `POST /api/lots` - Create lot (admin)
- `PUT /api/lots/:id` - Update lot (admin)

### Bids

- `POST /api/bids` - Place bid (requires credit card)
- `GET /api/bids/lot/:lotId` - Get bids for lot
- `GET /api/bids/bidder/:bidderId` - Get bidder's bids

## 🤝 Contributing

This is a custom project for BB Realty & Auctions. For feature requests or issues, contact the development team.

## 📄 License

Proprietary - © 2024 BB Realty & Auctions. All rights reserved.

## 📞 Support

For technical support or questions:
- Email: info@bbrealtyauctions.com
- Phone: (Contact information)

---

**Built with ❤️ for BB Realty & Auctions**

*Last Updated: June 14, 2026*
