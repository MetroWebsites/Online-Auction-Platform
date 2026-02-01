/**
 * Bidding Routes
 * 
 * Handles:
 * - Placing bids (manual and proxy/max bidding)
 * - Getting bid history
 * - Real-time updates via SSE
 * - Watchlist management
 */

import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { HonoContext } from '../types';
import { authenticate, requireEmailVerified } from '../middleware/auth';
import { BiddingEngine } from '../services/bidding';
import { queryOne, executeQuery, executeWrite, now } from '../utils/db';
import { bidRateLimiter } from '../utils/auth';

const bidding = new Hono<HonoContext>();

/**
 * POST /api/bids/:lotId
 * Place a bid on a lot
 */
bidding.post('/:lotId', authenticate, requireEmailVerified, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const lotId = parseInt(c.req.param('lotId'));
  const body = await c.req.json();
  const { amount, maxBid } = body;

  // Rate limiting
  if (!bidRateLimiter.isAllowed(`bid:${user.userId}`)) {
    return c.json({ success: false, error: 'Too many bids. Please slow down.' }, 429);
  }

  // Validate input
  if (!amount || amount <= 0) {
    return c.json({ success: false, error: 'Valid bid amount required' }, 400);
  }

  if (maxBid && maxBid < amount) {
    return c.json({ success: false, error: 'Max bid must be greater than or equal to bid amount' }, 400);
  }

  // Place bid using bidding engine
  const engine = new BiddingEngine(c.env.DB);
  const result = await engine.placeBid(
    lotId,
    user.userId,
    amount,
    maxBid,
    {
      ip_address: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      user_agent: c.req.header('User-Agent'),
    }
  );

  if (!result.success) {
    return c.json(result, 400);
  }

  // TODO: Send notifications to outbid users
  if (result.outbidOccurred) {
    console.log('TODO: Send outbid notification');
  }

  // TODO: Trigger SSE update for lot
  console.log('TODO: Trigger real-time update for lot', lotId);

  return c.json(result);
});

/**
 * GET /api/bids/lot/:lotId
 * Get bid history for a lot
 */
bidding.get('/lot/:lotId', async (c) => {
  const lotId = parseInt(c.req.param('lotId'));
  const user = c.get('user'); // Optional auth

  // Get public bid history (masked bidder info for non-admin)
  const isAdmin = user?.role === 'admin' || user?.role === 'staff';

  const bids = await executeQuery<any>(
    c.env.DB,
    `SELECT 
      b.id, b.amount, b.bid_type, b.status, b.created_at,
      ${isAdmin ? 'b.bidder_id, u.email, u.first_name, u.last_name' : 'NULL as bidder_id, NULL as email, NULL as first_name, NULL as last_name'},
      CASE 
        WHEN b.bidder_id = ? THEN 1 
        ELSE 0 
      END as is_own_bid
    FROM bids b
    LEFT JOIN users u ON b.bidder_id = u.id
    WHERE b.lot_id = ?
    ORDER BY b.created_at DESC
    LIMIT 50`,
    [user?.userId || 0, lotId]
  );

  return c.json({
    success: true,
    data: bids.results?.map(bid => ({
      ...bid,
      bidder_display: isAdmin 
        ? `${bid.first_name} ${bid.last_name} (${bid.email})`
        : bid.is_own_bid 
          ? 'You'
          : `Bidder ${bid.bidder_id || '***'}`,
    })) || [],
  });
});

/**
 * GET /api/bids/my-bids
 * Get current user's bids
 */
bidding.get('/my-bids', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  const bids = await executeQuery<any>(
    c.env.DB,
    `SELECT 
      b.id, b.lot_id, b.amount, b.max_bid, b.bid_type, b.status, 
      b.is_winning, b.created_at,
      l.lot_number, l.title as lot_title, l.current_bid, l.status as lot_status,
      a.id as auction_id, a.title as auction_title
    FROM bids b
    JOIN lots l ON b.lot_id = l.id
    JOIN auctions a ON l.auction_id = a.id
    WHERE b.bidder_id = ?
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?`,
    [user.userId, limit, offset]
  );

  const countResult = await queryOne<{ total: number }>(
    c.env.DB,
    'SELECT COUNT(*) as total FROM bids WHERE bidder_id = ?',
    [user.userId]
  );

  return c.json({
    success: true,
    data: bids.results || [],
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
});

/**
 * GET /api/bids/my-wins
 * Get current user's winning lots
 */
bidding.get('/my-wins', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const wins = await executeQuery<any>(
    c.env.DB,
    `SELECT 
      l.id, l.lot_number, l.title, l.current_bid, l.status, l.closed_at,
      a.id as auction_id, a.title as auction_title,
      b.id as bid_id, b.amount as winning_bid,
      i.id as invoice_id, i.invoice_number, i.payment_status, i.fulfillment_status
    FROM lots l
    JOIN auctions a ON l.auction_id = a.id
    JOIN bids b ON l.id = b.lot_id AND b.bidder_id = ? AND b.status = 'won'
    LEFT JOIN invoices i ON i.auction_id = a.id AND i.bidder_id = ?
    WHERE l.status IN ('closed', 'sold')
    ORDER BY l.closed_at DESC`,
    [user.userId, user.userId]
  );

  return c.json({
    success: true,
    data: wins.results || [],
  });
});

/**
 * GET /api/bids/lot/:lotId/stream
 * Server-Sent Events stream for real-time bid updates
 */
bidding.get('/lot/:lotId/stream', async (c) => {
  const lotId = parseInt(c.req.param('lotId'));

  return stream(c, async (stream) => {
    // Send initial lot state
    const lot = await queryOne<any>(
      c.env.DB,
      `SELECT id, lot_number, title, current_bid, bid_count, status,
              current_close_time, extension_count
       FROM lots WHERE id = ?`,
      [lotId]
    );

    if (lot) {
      await stream.writeln(`data: ${JSON.stringify({ type: 'init', lot })}\n`);
    }

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeln(`: heartbeat\n`);
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // Every 30 seconds

    // Poll for updates every 2 seconds
    const updateInterval = setInterval(async () => {
      try {
        const updatedLot = await queryOne<any>(
          c.env.DB,
          `SELECT id, lot_number, title, current_bid, bid_count, status,
                  current_close_time, extension_count
           FROM lots WHERE id = ?`,
          [lotId]
        );

        if (updatedLot) {
          await stream.writeln(`data: ${JSON.stringify({ type: 'update', lot: updatedLot })}\n`);
        }
      } catch (error) {
        clearInterval(updateInterval);
        clearInterval(heartbeatInterval);
      }
    }, 2000); // Every 2 seconds

    // Clean up on close
    stream.onAbort(() => {
      clearInterval(updateInterval);
      clearInterval(heartbeatInterval);
    });

    // Keep stream open
    await stream.sleep(3600000); // 1 hour max
  });
});

/**
 * POST /api/watchlist/:lotId
 * Add lot to watchlist
 */
bidding.post('/watchlist/:lotId', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const lotId = parseInt(c.req.param('lotId'));

  // Check if lot exists
  const lot = await queryOne(
    c.env.DB,
    'SELECT id FROM lots WHERE id = ?',
    [lotId]
  );

  if (!lot) {
    return c.json({ success: false, error: 'Lot not found' }, 404);
  }

  // Add to watchlist (ignore if already exists)
  try {
    await executeWrite(
      c.env.DB,
      'INSERT INTO watchlist (user_id, lot_id) VALUES (?, ?)',
      [user.userId, lotId]
    );
  } catch (error) {
    // Already exists - that's fine
  }

  return c.json({
    success: true,
    message: 'Added to watchlist',
  });
});

/**
 * DELETE /api/watchlist/:lotId
 * Remove lot from watchlist
 */
bidding.delete('/watchlist/:lotId', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const lotId = parseInt(c.req.param('lotId'));

  await executeWrite(
    c.env.DB,
    'DELETE FROM watchlist WHERE user_id = ? AND lot_id = ?',
    [user.userId, lotId]
  );

  return c.json({
    success: true,
    message: 'Removed from watchlist',
  });
});

/**
 * GET /api/watchlist
 * Get user's watchlist
 */
bidding.get('/watchlist', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const watchlist = await executeQuery<any>(
    c.env.DB,
    `SELECT 
      l.id, l.lot_number, l.title, l.current_bid, l.bid_count, 
      l.status, l.current_close_time,
      a.id as auction_id, a.title as auction_title,
      w.created_at as watched_at,
      CASE 
        WHEN l.current_bidder_id = ? THEN 1 
        ELSE 0 
      END as is_winning
    FROM watchlist w
    JOIN lots l ON w.lot_id = l.id
    JOIN auctions a ON l.auction_id = a.id
    WHERE w.user_id = ?
    ORDER BY l.current_close_time ASC`,
    [user.userId, user.userId]
  );

  return c.json({
    success: true,
    data: watchlist.results || [],
  });
});

export default bidding;
