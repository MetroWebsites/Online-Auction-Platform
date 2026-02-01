/**
 * Auction Routes
 * 
 * Handles:
 * - Create/update/delete auctions (admin only)
 * - List auctions with filters
 * - Get auction details
 * - Publish/close auctions
 */

import { Hono } from 'hono';
import type { HonoContext, Auction, AuctionStatus } from '../types';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth';
import { auditLog } from '../middleware/error';
import {
  queryOne,
  executeQuery,
  executeWrite,
  now,
  buildPagination,
  getPaginationMeta,
  parseJSON,
} from '../utils/db';

const auctions = new Hono<HonoContext>();

/**
 * GET /api/auctions
 * List auctions with filters
 */
auctions.get('/', async (c) => {
  const status = c.req.query('status') as AuctionStatus | undefined;
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

  const pagination = buildPagination({ page, limit, sort: 'start_date', order: 'desc' });

  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(title LIKE ? OR description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await queryOne<{ total: number }>(
    c.env.DB,
    `SELECT COUNT(*) as total FROM auctions ${whereClause}`,
    params
  );

  // Get auctions
  const result = await executeQuery<Auction>(
    c.env.DB,
    `SELECT * FROM auctions ${whereClause} ORDER BY start_date DESC LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );

  return c.json({
    success: true,
    data: result.results || [],
    pagination: getPaginationMeta(countResult?.total || 0, page, limit),
  });
});

/**
 * GET /api/auctions/:id
 * Get auction details
 */
auctions.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const auction = await queryOne<Auction>(
    c.env.DB,
    'SELECT * FROM auctions WHERE id = ?',
    [id]
  );

  if (!auction) {
    return c.json({ success: false, error: 'Auction not found' }, 404);
  }

  // Get lot count and stats
  const stats = await queryOne<any>(
    c.env.DB,
    `SELECT 
      COUNT(*) as lot_count,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_lots,
      SUM(bid_count) as total_bids,
      COUNT(DISTINCT current_bidder_id) as unique_bidders
    FROM lots WHERE auction_id = ?`,
    [id]
  );

  return c.json({
    success: true,
    data: {
      ...auction,
      stats: stats || { lot_count: 0, active_lots: 0, total_bids: 0, unique_bidders: 0 },
    },
  });
});

/**
 * POST /api/auctions
 * Create new auction (admin/staff only)
 */
auctions.post('/', authenticate, requireStaff, auditLog('create', 'auction'), async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json();

  const {
    title,
    description,
    featured_image,
    start_date,
    end_date,
    soft_close_enabled,
    soft_close_trigger_minutes,
    soft_close_extension_minutes,
    increment_rules,
    buyers_premium_rules,
    tax_enabled,
    tax_rate,
    pickup_location,
    pickup_instructions,
    pickup_start_date,
    pickup_end_date,
    shipping_available,
    shipping_notes,
  } = body;

  // Validation
  if (!title || !start_date || !end_date) {
    return c.json({ success: false, error: 'Title, start_date, and end_date are required' }, 400);
  }

  if (end_date <= start_date) {
    return c.json({ success: false, error: 'End date must be after start date' }, 400);
  }

  // Create auction
  const result = await executeWrite(
    c.env.DB,
    `INSERT INTO auctions (
      title, description, featured_image,
      start_date, end_date,
      soft_close_enabled, soft_close_trigger_minutes, soft_close_extension_minutes,
      increment_rules, buyers_premium_rules,
      tax_enabled, tax_rate,
      pickup_location, pickup_instructions, pickup_start_date, pickup_end_date,
      shipping_available, shipping_notes,
      status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      description || null,
      featured_image || null,
      start_date,
      end_date,
      soft_close_enabled !== undefined ? (soft_close_enabled ? 1 : 0) : 1,
      soft_close_trigger_minutes || 5,
      soft_close_extension_minutes || 5,
      increment_rules ? JSON.stringify(increment_rules) : null,
      buyers_premium_rules ? JSON.stringify(buyers_premium_rules) : null,
      tax_enabled ? 1 : 0,
      tax_rate || 0,
      pickup_location || null,
      pickup_instructions || null,
      pickup_start_date || null,
      pickup_end_date || null,
      shipping_available ? 1 : 0,
      shipping_notes || null,
      'draft',
      user.userId,
    ]
  );

  const auctionId = result.meta.last_row_id as number;

  return c.json({
    success: true,
    message: 'Auction created successfully',
    data: { id: auctionId },
  }, 201);
});

/**
 * PUT /api/auctions/:id
 * Update auction (admin/staff only)
 */
auctions.put('/:id', authenticate, requireStaff, auditLog('update', 'auction'), async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  // Check if auction exists
  const existing = await queryOne(c.env.DB, 'SELECT id, status FROM auctions WHERE id = ?', [id]);
  if (!existing) {
    return c.json({ success: false, error: 'Auction not found' }, 404);
  }

  // Build update query dynamically
  const updates: string[] = [];
  const params: any[] = [];

  const allowedFields = [
    'title', 'description', 'featured_image',
    'start_date', 'end_date',
    'soft_close_enabled', 'soft_close_trigger_minutes', 'soft_close_extension_minutes',
    'increment_rules', 'buyers_premium_rules',
    'tax_enabled', 'tax_rate',
    'pickup_location', 'pickup_instructions', 'pickup_start_date', 'pickup_end_date',
    'shipping_available', 'shipping_notes',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      
      // Handle JSON fields
      if (field === 'increment_rules' || field === 'buyers_premium_rules') {
        params.push(JSON.stringify(body[field]));
      }
      // Handle boolean fields
      else if (field === 'soft_close_enabled' || field === 'tax_enabled' || field === 'shipping_available') {
        params.push(body[field] ? 1 : 0);
      }
      else {
        params.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  updates.push('updated_at = ?');
  params.push(now());
  params.push(id);

  await executeWrite(
    c.env.DB,
    `UPDATE auctions SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  return c.json({
    success: true,
    message: 'Auction updated successfully',
  });
});

/**
 * POST /api/auctions/:id/publish
 * Publish auction (admin/staff only)
 */
auctions.post('/:id/publish', authenticate, requireStaff, auditLog('publish', 'auction'), async (c) => {
  const id = parseInt(c.req.param('id'));

  const auction = await queryOne<Auction>(c.env.DB, 'SELECT * FROM auctions WHERE id = ?', [id]);
  if (!auction) {
    return c.json({ success: false, error: 'Auction not found' }, 404);
  }

  if (auction.status !== 'draft') {
    return c.json({ success: false, error: 'Only draft auctions can be published' }, 400);
  }

  // Check if auction has lots
  const lotCount = await queryOne<{ count: number }>(
    c.env.DB,
    'SELECT COUNT(*) as count FROM lots WHERE auction_id = ?',
    [id]
  );

  if (!lotCount || lotCount.count === 0) {
    return c.json({ success: false, error: 'Cannot publish auction with no lots' }, 400);
  }

  // Update auction status
  await executeWrite(
    c.env.DB,
    'UPDATE auctions SET status = ?, published_at = ?, updated_at = ? WHERE id = ?',
    ['published', now(), now(), id]
  );

  // Activate lots with close times
  await executeWrite(
    c.env.DB,
    `UPDATE lots 
     SET status = 'active',
         original_close_time = ?,
         current_close_time = ?,
         updated_at = ?
     WHERE auction_id = ? AND status = 'pending'`,
    [auction.end_date, auction.end_date, now(), id]
  );

  return c.json({
    success: true,
    message: 'Auction published successfully',
  });
});

/**
 * POST /api/auctions/:id/close
 * Close auction and finalize all lots (admin only)
 */
auctions.post('/:id/close', authenticate, requireAdmin, auditLog('close', 'auction'), async (c) => {
  const id = parseInt(c.req.param('id'));

  const auction = await queryOne<Auction>(c.env.DB, 'SELECT * FROM auctions WHERE id = ?', [id]);
  if (!auction) {
    return c.json({ success: false, error: 'Auction not found' }, 404);
  }

  // Close auction
  await executeWrite(
    c.env.DB,
    'UPDATE auctions SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?',
    ['closed', now(), now(), id]
  );

  // Close all lots and determine winners
  const lots = await executeQuery<any>(
    c.env.DB,
    `SELECT id, reserve_price, reserve_met, current_bidder_id 
     FROM lots WHERE auction_id = ? AND status = 'active'`,
    [id]
  );

  for (const lot of lots.results || []) {
    const status = lot.reserve_price && !lot.reserve_met ? 'unsold' : 'sold';
    
    await executeWrite(
      c.env.DB,
      'UPDATE lots SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?',
      [status, now(), now(), lot.id]
    );

    // Update winning bids
    if (lot.current_bidder_id && status === 'sold') {
      await executeWrite(
        c.env.DB,
        'UPDATE bids SET status = ? WHERE lot_id = ? AND bidder_id = ? AND is_winning = 1',
        ['won', lot.id, lot.current_bidder_id]
      );
    }

    // Mark all other bids as lost
    await executeWrite(
      c.env.DB,
      'UPDATE bids SET status = ? WHERE lot_id = ? AND status NOT IN (?, ?)',
      ['lost', lot.id, 'won', 'cancelled']
    );
  }

  return c.json({
    success: true,
    message: 'Auction closed successfully',
  });
});

/**
 * DELETE /api/auctions/:id
 * Delete auction (admin only, only if draft)
 */
auctions.delete('/:id', authenticate, requireAdmin, auditLog('delete', 'auction'), async (c) => {
  const id = parseInt(c.req.param('id'));

  const auction = await queryOne<Auction>(c.env.DB, 'SELECT status FROM auctions WHERE id = ?', [id]);
  if (!auction) {
    return c.json({ success: false, error: 'Auction not found' }, 404);
  }

  if (auction.status !== 'draft') {
    return c.json({ success: false, error: 'Only draft auctions can be deleted' }, 400);
  }

  // Check if auction has bids
  const bidCount = await queryOne<{ count: number }>(
    c.env.DB,
    `SELECT COUNT(*) as count FROM bids b
     JOIN lots l ON b.lot_id = l.id
     WHERE l.auction_id = ?`,
    [id]
  );

  if (bidCount && bidCount.count > 0) {
    return c.json({ success: false, error: 'Cannot delete auction with bids' }, 400);
  }

  // Delete lots first (cascade will handle images)
  await executeWrite(c.env.DB, 'DELETE FROM lots WHERE auction_id = ?', [id]);

  // Delete auction
  await executeWrite(c.env.DB, 'DELETE FROM auctions WHERE id = ?', [id]);

  return c.json({
    success: true,
    message: 'Auction deleted successfully',
  });
});

/**
 * GET /api/auctions/:id/lots
 * Get all lots for an auction
 */
auctions.get('/:id/lots', async (c) => {
  const id = parseInt(c.req.param('id'));
  const status = c.req.query('status');

  const conditions = ['auction_id = ?'];
  const params: any[] = [id];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const lots = await executeQuery<any>(
    c.env.DB,
    `SELECT l.*,
      (SELECT COUNT(*) FROM lot_images WHERE lot_id = l.id) as image_count
     FROM lots l
     WHERE ${conditions.join(' AND ')}
     ORDER BY lot_number ASC`,
    params
  );

  return c.json({
    success: true,
    data: lots.results || [],
  });
});

export default auctions;
