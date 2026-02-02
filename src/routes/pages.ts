/**
 * Public Pages Routes
 * SEO-optimized pages with Open Graph meta tags for social sharing
 */

import { Hono } from 'hono';
import { html } from 'hono/html';
import type { CloudflareBindings } from '../types';
import { queryOne } from '../utils/db';
import { 
  getAuctionMetaTags, 
  getLotMetaTags, 
  getHomepageMetaTags,
  renderMetaTags,
  getAuctionStructuredData,
  getLotStructuredData
} from '../services/seo';

const app = new Hono<{ Bindings: CloudflareBindings }>();

/**
 * Homepage with SEO
 */
app.get('/', async (c) => {
  const baseUrl = new URL(c.req.url).origin;
  const meta = getHomepageMetaTags(baseUrl);
  
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${html.raw(renderMetaTags(meta))}
      
      <!-- PWA -->
      <link rel="manifest" href="/manifest.json">
      <meta name="theme-color" content="#2563eb">
      <link rel="apple-touch-icon" href="/static/img/icon-192.png">
      
      <!-- Styles -->
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <!-- Hero Section -->
        <div class="container mx-auto px-4 py-16 text-center">
          <div class="max-w-4xl mx-auto">
            <i class="fas fa-gavel text-6xl text-blue-600 mb-6"></i>
            <h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Live Online Auctions
            </h1>
            <p class="text-xl text-gray-700 mb-8">
              Discover unique items and bid in real-time. Browse estate sales, collectibles, art, and more.
            </p>
            
            <div class="flex gap-4 justify-center flex-wrap">
              <a href="/bidder/" 
                 class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-colors">
                <i class="fas fa-search mr-2"></i>
                Browse Auctions
              </a>
              <a href="/admin/login.html" 
                 class="bg-white hover:bg-gray-50 text-blue-600 border-2 border-blue-600 px-8 py-4 rounded-lg text-lg font-semibold transition-colors">
                <i class="fas fa-user-shield mr-2"></i>
                Admin Login
              </a>
            </div>
          </div>
        </div>
        
        <!-- Features -->
        <div class="container mx-auto px-4 py-16">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div class="bg-white rounded-lg shadow-lg p-8 text-center">
              <i class="fas fa-clock text-4xl text-blue-600 mb-4"></i>
              <h3 class="text-xl font-bold text-gray-900 mb-3">Real-Time Bidding</h3>
              <p class="text-gray-600">
                Live updates and instant notifications when you're outbid
              </p>
            </div>
            
            <div class="bg-white rounded-lg shadow-lg p-8 text-center">
              <i class="fas fa-shield-alt text-4xl text-green-600 mb-4"></i>
              <h3 class="text-xl font-bold text-gray-900 mb-3">Secure Platform</h3>
              <p class="text-gray-600">
                Safe and secure bidding with verified sellers
              </p>
            </div>
            
            <div class="bg-white rounded-lg shadow-lg p-8 text-center">
              <i class="fas fa-mobile-alt text-4xl text-purple-600 mb-4"></i>
              <h3 class="text-xl font-bold text-gray-900 mb-3">Mobile Ready</h3>
              <p class="text-gray-600">
                Bid anywhere with our mobile-optimized platform
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Register Service Worker -->
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('Service Worker registered:', reg);
          }).catch(err => {
            console.error('Service Worker registration failed:', err);
          });
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Auction detail page with SEO
 */
app.get('/auction/:id', async (c) => {
  const { env } = c;
  const id = parseInt(c.req.param('id'));
  const baseUrl = new URL(c.req.url).origin;
  
  try {
    const auction = await queryOne(env.DB, 
      'SELECT * FROM auctions WHERE id = ?', 
      [id]
    );
    
    if (!auction) {
      return c.redirect('/bidder/');
    }
    
    const meta = getAuctionMetaTags(auction, baseUrl);
    const structuredData = getAuctionStructuredData(auction, baseUrl);
    
    return c.html(html`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${html.raw(renderMetaTags(meta))}
        ${html.raw(structuredData)}
        
        <!-- PWA -->
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#2563eb">
        
        <!-- Redirect to app -->
        <meta http-equiv="refresh" content="0; url=/bidder/#auction-${id}">
        
        <!-- Styles -->
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div class="min-h-screen flex items-center justify-center bg-gray-100">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading auction...</p>
            <p class="text-sm text-gray-500 mt-2">
              <a href="/bidder/#auction-${id}" class="text-blue-600 hover:underline">
                Click here if not redirected
              </a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error loading auction:', error);
    return c.redirect('/bidder/');
  }
});

/**
 * Lot detail page with SEO
 */
app.get('/lot/:id', async (c) => {
  const { env } = c;
  const id = parseInt(c.req.param('id'));
  const baseUrl = new URL(c.req.url).origin;
  
  try {
    const lot = await queryOne(env.DB, 
      'SELECT * FROM lots WHERE id = ?', 
      [id]
    );
    
    if (!lot) {
      return c.redirect('/bidder/');
    }
    
    const auction = await queryOne(env.DB,
      'SELECT * FROM auctions WHERE id = ?',
      [lot.auction_id]
    );
    
    const meta = getLotMetaTags(lot, auction, baseUrl);
    const structuredData = getLotStructuredData(lot, auction, baseUrl);
    
    return c.html(html`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${html.raw(renderMetaTags(meta))}
        ${html.raw(structuredData)}
        
        <!-- PWA -->
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#2563eb">
        
        <!-- Redirect to app -->
        <meta http-equiv="refresh" content="0; url=/bidder/#lot-${id}">
        
        <!-- Styles -->
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div class="min-h-screen flex items-center justify-center bg-gray-100">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p class="text-gray-600">Loading lot details...</p>
            <p class="text-sm text-gray-500 mt-2">
              <a href="/bidder/#lot-${id}" class="text-blue-600 hover:underline">
                Click here if not redirected
              </a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error loading lot:', error);
    return c.redirect('/bidder/');
  }
});

/**
 * Robots.txt
 */
app.get('/robots.txt', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  
  return c.text(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`);
});

/**
 * Sitemap.xml
 */
app.get('/sitemap.xml', async (c) => {
  const { env } = c;
  const baseUrl = new URL(c.req.url).origin;
  
  try {
    const auctions = await env.DB.prepare(
      'SELECT id, updated_at FROM auctions WHERE status IN (?, ?) ORDER BY updated_at DESC LIMIT 1000'
    ).bind('active', 'published').all();
    
    const lots = await env.DB.prepare(
      'SELECT id, updated_at FROM lots WHERE status = ? ORDER BY updated_at DESC LIMIT 5000'
    ).bind('active').all();
    
    const urls = [
      `<url><loc>${baseUrl}/</loc><priority>1.0</priority></url>`,
      `<url><loc>${baseUrl}/bidder/</loc><priority>0.9</priority></url>`,
      ...auctions.results.map((a: any) => 
        `<url><loc>${baseUrl}/auction/${a.id}</loc><lastmod>${new Date(a.updated_at * 1000).toISOString().split('T')[0]}</lastmod><priority>0.8</priority></url>`
      ),
      ...lots.results.map((l: any) => 
        `<url><loc>${baseUrl}/lot/${l.id}</loc><lastmod>${new Date(l.updated_at * 1000).toISOString().split('T')[0]}</lastmod><priority>0.7</priority></url>`
      )
    ];
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join('\n  ')}
</urlset>`;
    
    return c.text(sitemap, 200, {
      'Content-Type': 'application/xml'
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return c.text('Error generating sitemap', 500);
  }
});

export default app;
