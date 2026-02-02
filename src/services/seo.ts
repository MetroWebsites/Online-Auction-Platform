/**
 * SEO and Open Graph Meta Tags Service
 */

import type { Auction, Lot } from '../types';

export interface MetaTags {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: string;
  siteName?: string;
  locale?: string;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  keywords?: string[];
}

/**
 * Generate meta tags for an auction
 */
export function getAuctionMetaTags(auction: Auction, baseUrl: string): MetaTags {
  const url = `${baseUrl}/auction/${auction.id}`;
  const image = auction.cover_image || `${baseUrl}/static/img/auction-default.jpg`;
  
  return {
    title: `${auction.title} | Live Online Auction`,
    description: auction.description || `Bid on quality items in ${auction.title}. Auction starts ${new Date(auction.start_date * 1000).toLocaleDateString()}.`,
    image,
    url,
    type: 'website',
    siteName: 'Auction Platform',
    locale: 'en_US',
    publishedTime: new Date(auction.created_at * 1000).toISOString(),
    modifiedTime: new Date(auction.updated_at * 1000).toISOString(),
    keywords: ['auction', 'bidding', 'online auction', auction.title.toLowerCase()]
  };
}

/**
 * Generate meta tags for a lot
 */
export function getLotMetaTags(lot: Lot, auction: Auction, baseUrl: string): MetaTags {
  const url = `${baseUrl}/lot/${lot.id}`;
  const image = lot.image_urls?.[0] || `${baseUrl}/static/img/lot-default.jpg`;
  
  return {
    title: `${lot.title} - Lot #${lot.lot_number} | ${auction.title}`,
    description: lot.description || `Bid on ${lot.title}. Current bid: $${lot.current_bid || lot.starting_bid}. ${lot.bid_count || 0} bids placed.`,
    image,
    url,
    type: 'product',
    siteName: 'Auction Platform',
    locale: 'en_US',
    publishedTime: new Date(lot.created_at * 1000).toISOString(),
    modifiedTime: new Date(lot.updated_at * 1000).toISOString(),
    keywords: [
      'auction',
      lot.title.toLowerCase(),
      lot.category?.toLowerCase(),
      'bid',
      'online auction'
    ].filter(Boolean) as string[]
  };
}

/**
 * Generate HTML meta tags
 */
export function renderMetaTags(tags: MetaTags): string {
  return `
    <!-- Primary Meta Tags -->
    <title>${escapeHtml(tags.title)}</title>
    <meta name="title" content="${escapeHtml(tags.title)}">
    <meta name="description" content="${escapeHtml(tags.description)}">
    ${tags.keywords ? `<meta name="keywords" content="${tags.keywords.join(', ')}">` : ''}
    ${tags.author ? `<meta name="author" content="${escapeHtml(tags.author)}">` : ''}
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${tags.type || 'website'}">
    <meta property="og:url" content="${tags.url}">
    <meta property="og:title" content="${escapeHtml(tags.title)}">
    <meta property="og:description" content="${escapeHtml(tags.description)}">
    ${tags.image ? `<meta property="og:image" content="${tags.image}">` : ''}
    ${tags.siteName ? `<meta property="og:site_name" content="${escapeHtml(tags.siteName)}">` : ''}
    ${tags.locale ? `<meta property="og:locale" content="${tags.locale}">` : ''}
    ${tags.publishedTime ? `<meta property="article:published_time" content="${tags.publishedTime}">` : ''}
    ${tags.modifiedTime ? `<meta property="article:modified_time" content="${tags.modifiedTime}">` : ''}
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${tags.url}">
    <meta property="twitter:title" content="${escapeHtml(tags.title)}">
    <meta property="twitter:description" content="${escapeHtml(tags.description)}">
    ${tags.image ? `<meta property="twitter:image" content="${tags.image}">` : ''}
    
    <!-- Additional SEO -->
    <link rel="canonical" href="${tags.url}">
    <meta name="robots" content="index, follow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  `;
}

/**
 * Generate JSON-LD structured data for an auction
 */
export function getAuctionStructuredData(auction: Auction, baseUrl: string): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: auction.title,
    description: auction.description,
    startDate: new Date(auction.start_date * 1000).toISOString(),
    endDate: new Date(auction.end_date * 1000).toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: `${baseUrl}/auction/${auction.id}`
    },
    image: auction.cover_image || `${baseUrl}/static/img/auction-default.jpg`,
    organizer: {
      '@type': 'Organization',
      name: 'Auction Platform',
      url: baseUrl
    }
  };
  
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * Generate JSON-LD structured data for a lot
 */
export function getLotStructuredData(lot: Lot, auction: Auction, baseUrl: string): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: lot.title,
    description: lot.description,
    image: lot.image_urls || [],
    offers: {
      '@type': 'Offer',
      price: lot.current_bid || lot.starting_bid,
      priceCurrency: 'USD',
      availability: lot.status === 'active' 
        ? 'https://schema.org/InStock' 
        : 'https://schema.org/OutOfStock',
      url: `${baseUrl}/lot/${lot.id}`,
      seller: {
        '@type': 'Organization',
        name: 'Auction Platform'
      }
    },
    category: lot.category,
    brand: {
      '@type': 'Brand',
      name: auction.title
    }
  };
  
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * Generate sitemap entry
 */
export function generateSitemapEntry(url: string, lastmod: Date, priority: number = 0.5): string {
  return `
    <url>
      <loc>${url}</loc>
      <lastmod>${lastmod.toISOString().split('T')[0]}</lastmod>
      <priority>${priority}</priority>
    </url>
  `;
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Generate robots.txt content
 */
export function generateRobotsTxt(baseUrl: string): string {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;
}

/**
 * Default meta tags for homepage
 */
export function getHomepageMetaTags(baseUrl: string): MetaTags {
  return {
    title: 'Auction Platform | Live Online Auctions',
    description: 'Discover unique items and bid in live online auctions. Browse estate sales, collectibles, art, and more. Join thousands of bidders today!',
    image: `${baseUrl}/static/img/hero.jpg`,
    url: baseUrl,
    type: 'website',
    siteName: 'Auction Platform',
    locale: 'en_US',
    keywords: [
      'online auction',
      'live bidding',
      'estate sale',
      'collectibles',
      'art auction',
      'antiques'
    ]
  };
}
