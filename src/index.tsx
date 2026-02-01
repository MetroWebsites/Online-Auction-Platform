/**
 * AUCTION PLATFORM - Main Application
 * 
 * Production-ready online auction platform with:
 * - Real-time bidding with proxy/max bidding
 * - Soft close extensions
 * - Bulk CSV lot import + image mapping
 * - Admin portal
 * - PWA bidder interface
 * - Server-authoritative time
 * - Concurrency-safe transactions
 * - Complete audit trail
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import type { HonoContext } from './types';

// Middleware
import { errorHandler, logger, securityHeaders } from './middleware/error';
import { optionalAuth } from './middleware/auth';

// Routes
import authRoutes from './routes/auth';
import biddingRoutes from './routes/bidding';
import auctionRoutes from './routes/auctions';
import lotRoutes from './routes/lots';
import invoiceRoutes from './routes/invoices';
import importRoutes from './routes/imports';

// Initialize app
const app = new Hono<HonoContext>();

// ============================================================================
// GLOBAL MIDDLEWARE
// ============================================================================

// Security headers
app.use('*', securityHeaders);

// Request logger
app.use('*', logger);

// Error handler
app.use('*', errorHandler);

// CORS for API routes
app.use('/api/*', cors({
  origin: (origin) => origin, // Allow all origins in dev, restrict in prod
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Optional auth for public routes (sets user context if authenticated)
app.use('*', optionalAuth);

// ============================================================================
// API ROUTES
// ============================================================================

app.route('/api/auth', authRoutes);
app.route('/api/bids', biddingRoutes);
app.route('/api/auctions', auctionRoutes);
app.route('/api/lots', lotRoutes);
app.route('/api/invoices', invoiceRoutes);
app.route('/api/imports', importRoutes);

// TODO: Add remaining routes
// app.route('/api/notifications', notificationRoutes);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', (c) => {
  return c.json({
    success: true,
    status: 'healthy',
    environment: c.env.ENVIRONMENT || 'unknown',
    timestamp: Math.floor(Date.now() / 1000),
  });
});

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

// Serve static assets from /static/*
app.use('/static/*', serveStatic({ root: './public' }));

// ============================================================================
// FRONTEND ROUTES (HTML Pages)
// ============================================================================

/**
 * Admin Portal Home
 */
app.get('/admin', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Portal - Auction Platform</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50">
  <div class="min-h-screen">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-gray-900">
            <i class="fas fa-gavel mr-2 text-indigo-600"></i>
            Auction Admin
          </h1>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600" id="admin-user">Loading...</span>
            <button onclick="logout()" class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
              <i class="fas fa-sign-out-alt mr-2"></i>Logout
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Active Auctions</p>
              <p class="text-2xl font-bold text-gray-900">--</p>
            </div>
            <div class="p-3 bg-blue-100 rounded-full">
              <i class="fas fa-gavel text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total Lots</p>
              <p class="text-2xl font-bold text-gray-900">--</p>
            </div>
            <div class="p-3 bg-green-100 rounded-full">
              <i class="fas fa-box text-green-600 text-xl"></i>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Active Bidders</p>
              <p class="text-2xl font-bold text-gray-900">--</p>
            </div>
            <div class="p-3 bg-purple-100 rounded-full">
              <i class="fas fa-users text-purple-600 text-xl"></i>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Unpaid Invoices</p>
              <p class="text-2xl font-bold text-gray-900">--</p>
            </div>
            <div class="p-3 bg-yellow-100 rounded-full">
              <i class="fas fa-file-invoice text-yellow-600 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Navigation -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <a href="/admin/auctions" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-blue-100 rounded-lg">
              <i class="fas fa-calendar-alt text-blue-600 text-2xl"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-1">Auctions</h3>
              <p class="text-sm text-gray-600">Create and manage auction events</p>
            </div>
          </div>
        </a>

        <a href="/admin/lots" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-green-100 rounded-lg">
              <i class="fas fa-box text-green-600 text-2xl"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-1">Lots</h3>
              <p class="text-sm text-gray-600">Manage auction lots and items</p>
            </div>
          </div>
        </a>

        <a href="/admin/imports" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-purple-100 rounded-lg">
              <i class="fas fa-upload text-purple-600 text-2xl"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-1">Import Center</h3>
              <p class="text-sm text-gray-600">Bulk CSV & image uploads</p>
            </div>
          </div>
        </a>

        <a href="/admin/bidders" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-indigo-100 rounded-lg">
              <i class="fas fa-users text-indigo-600 text-2xl"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-1">Bidders</h3>
              <p class="text-sm text-gray-600">Manage bidder accounts</p>
            </div>
          </div>
        </a>

        <a href="/admin/invoices" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-yellow-100 rounded-lg">
              <i class="fas fa-file-invoice text-yellow-600 text-2xl"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-1">Invoices</h3>
              <p class="text-sm text-gray-600">Payment and fulfillment</p>
            </div>
          </div>
        </a>

        <a href="/admin/reports" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
          <div class="flex items-start gap-4">
            <div class="p-3 bg-pink-100 rounded-lg">
              <i class="fas fa-chart-bar text-pink-600 text-2xl"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-1">Reports</h3>
              <p class="text-sm text-gray-600">Analytics and exports</p>
            </div>
          </div>
        </a>
      </div>
    </div>
  </div>

  <script>
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/admin/login';
    }

    // Load user info
    fetch('/api/auth/me', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        document.getElementById('admin-user').textContent = data.data.email;
      } else {
        window.location.href = '/admin/login';
      }
    });

    function logout() {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      }).then(() => {
        localStorage.removeItem('token');
        window.location.href = '/admin/login';
      });
    }
  </script>
</body>
</html>
  `);
});

/**
 * Public Bidder App Home
 */
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Auction Platform - Online Auctions</title>
  <meta name="description" content="Browse and bid on online auctions">
  <meta name="theme-color" content="#4F46E5">
  
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json">
  
  <!-- Icons -->
  <link rel="icon" type="image/png" sizes="192x192" href="/static/img/icon-192.png">
  <link rel="apple-touch-icon" href="/static/img/icon-192.png">
  
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  
  <style>
    /* Mobile-first styles */
    * { -webkit-tap-highlight-color: transparent; }
    body { -webkit-font-smoothing: antialiased; }
  </style>
</head>
<body class="bg-gray-50">
  <!-- Header -->
  <header class="bg-indigo-600 text-white sticky top-0 z-50 shadow-lg">
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold">
          <i class="fas fa-gavel mr-2"></i>
          Auction Platform
        </h1>
        <div class="flex items-center gap-3">
          <a href="/search" class="p-2 hover:bg-indigo-700 rounded">
            <i class="fas fa-search"></i>
          </a>
          <a href="/watchlist" class="p-2 hover:bg-indigo-700 rounded">
            <i class="fas fa-heart"></i>
          </a>
          <a href="/account" class="p-2 hover:bg-indigo-700 rounded">
            <i class="fas fa-user"></i>
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 py-6">
    <!-- Hero Section -->
    <div class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-8 text-white mb-6">
      <h2 class="text-3xl font-bold mb-2">Welcome to Auction Platform</h2>
      <p class="text-lg mb-4">Browse live auctions and start bidding today</p>
      <button class="bg-white text-indigo-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100">
        <i class="fas fa-gavel mr-2"></i>View Auctions
      </button>
    </div>

    <!-- Quick Links -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <a href="/auctions" class="bg-white rounded-lg shadow p-4 text-center hover:shadow-md">
        <i class="fas fa-calendar-alt text-3xl text-indigo-600 mb-2"></i>
        <p class="font-semibold">All Auctions</p>
      </a>
      <a href="/ending-soon" class="bg-white rounded-lg shadow p-4 text-center hover:shadow-md">
        <i class="fas fa-clock text-3xl text-red-600 mb-2"></i>
        <p class="font-semibold">Ending Soon</p>
      </a>
      <a href="/my-bids" class="bg-white rounded-lg shadow p-4 text-center hover:shadow-md">
        <i class="fas fa-hand-point-up text-3xl text-green-600 mb-2"></i>
        <p class="font-semibold">My Bids</p>
      </a>
      <a href="/my-wins" class="bg-white rounded-lg shadow p-4 text-center hover:shadow-md">
        <i class="fas fa-trophy text-3xl text-yellow-600 mb-2"></i>
        <p class="font-semibold">My Wins</p>
      </a>
    </div>

    <!-- Active Auctions -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-xl font-bold mb-4">Active Auctions</h3>
      <div id="auctions-list" class="space-y-4">
        <p class="text-gray-500 text-center py-8">Loading auctions...</p>
      </div>
    </div>
  </main>

  <!-- Bottom Navigation (Mobile) -->
  <nav class="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg md:hidden">
    <div class="flex justify-around py-3">
      <a href="/" class="flex flex-col items-center text-indigo-600">
        <i class="fas fa-home text-xl mb-1"></i>
        <span class="text-xs">Home</span>
      </a>
      <a href="/auctions" class="flex flex-col items-center text-gray-600">
        <i class="fas fa-gavel text-xl mb-1"></i>
        <span class="text-xs">Auctions</span>
      </a>
      <a href="/watchlist" class="flex flex-col items-center text-gray-600">
        <i class="fas fa-heart text-xl mb-1"></i>
        <span class="text-xs">Watchlist</span>
      </a>
      <a href="/account" class="flex flex-col items-center text-gray-600">
        <i class="fas fa-user text-xl mb-1"></i>
        <span class="text-xs">Account</span>
      </a>
    </div>
  </nav>

  <script>
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }

    // Load auctions
    fetch('/api/auctions?status=active')
      .then(r => r.json())
      .then(data => {
        // TODO: Render auctions
        console.log('Auctions loaded:', data);
      });
  </script>
</body>
</html>
  `);
});

// ============================================================================
// 404 NOT FOUND
// ============================================================================

app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not found',
    path: c.req.path,
  }, 404);
});

// ============================================================================
// EXPORT
// ============================================================================

export default app;
