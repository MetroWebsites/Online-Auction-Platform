import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderHomePage } from './pages/home'
import { renderBidderApp } from './pages/bidder'
import { renderAuctionPage } from './pages/auction'
import { renderLotPage } from './pages/lot'

// Import routes
import authRoutes from './routes/auth'
import auctionsRoutes from './routes/auctions'
import lotsRoutes from './routes/lots'
import bidsRoutes from './routes/bids'
import biddersRoutes from './routes/bidders'
import invoicesRoutes from './routes/invoices'
import notificationsRoutes from './routes/notifications'
import importRoutes from './routes/import'
import adminRoutes from './routes/admin'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS middleware
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Health check
app.get('/api/health', (c) => {
  return c.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'BB Realty & Auctions API'
  })
})

// API routes
app.route('/api/auth', authRoutes)
app.route('/api/auctions', auctionsRoutes)
app.route('/api/lots', lotsRoutes)
app.route('/api/bids', bidsRoutes)
app.route('/api/bidders', biddersRoutes)
app.route('/api/invoices', invoicesRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/import', importRoutes)
app.route('/api/admin', adminRoutes)

// Server-side rendered pages
app.get('/', renderHomePage)
app.get('/bidder/*', renderBidderApp)
app.get('/auction/:slug', renderAuctionPage)
app.get('/lot/:slug', renderLotPage)

// Admin portal (static HTML)
app.get('/admin/*', (c) => {
  const path = c.req.path.replace('/admin/', '')
  // Serve admin HTML files from public/admin/
  return c.html(renderAdminPage(path))
})

function renderAdminPage(path: string) {
  // Admin pages will be static HTML in public/admin/
  // This is a placeholder - actual HTML files will be served by serveStatic
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Portal - BB Realty & Auctions</title>
</head>
<body>
    <p>Loading admin portal...</p>
</body>
</html>`
}

export default app
