/**
 * Lot Routes
 * 
 * Handles:
 * - Create/update/delete lots (admin only)
 * - List lots with advanced filters
 * - Get lot details with images
 * - Bulk lot operations
 */

import { Hono } from 'hono';
import type { HonoContext, Lot, LotStatus, LotFilters } from '../types';
import { authenticate, requireStaff } from '../middleware/auth';
import { auditLog } from '../middleware/error';
import {
  queryOne,
  executeQuery,
  executeWrite,
  transaction,
  now,
  buildPagination,
  getPaginationMeta,
} from '../utils/db';

const lots = new Hono<HonoContext>();

/**
 * GET /api/lots
 * List lots with advanced filters
 */
lots.get('/', async (c) => {
  const auctionId = c.req.query('auction_id');
  const category = c.req.query('category');
  const status = c.req.query('status') as LotStatus | undefined;
  const minPrice = c.req.query('min_price');
  const maxPrice = c.req.query('max_price');
  const shippingAvailable = c.req.query('shipping_available');
  const search = c.req.query('search');
  const endingSoon = c.req.query('ending_soon');
  const featured = c.req.query('featured');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const sort = c.req.query('sort') || 'lot_number';
  const order = c.req.query('order') || 'asc';

  const pagination = buildPagination({ page, limit, sort, order: order as 'asc' | 'desc' });

  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];

  if (auctionId) {
    conditions.push('l.auction_id = ?');
    params.push(parseInt(auctionId));
  }

  if (category) {
    conditions.push('l.category = ?');
    params.push(category);
  }

  if (status) {
    conditions.push('l.status = ?');
    params.push(status);
  }

  if (minPrice) {
    conditions.push('l.current_bid >= ?');
    params.push(parseFloat(minPrice));
  }

  if (maxPrice) {
    conditions.push('l.current_bid <= ?');
    params.push(parseFloat(maxPrice));
  }

  if (shippingAvailable === 'true') {
    conditions.push('l.shipping_available = 1');
  }

  if (featured === 'true') {
    conditions.push('l.is_featured = 1');
  }

  if (search) {
    conditions.push('(l.title LIKE ? OR l.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (endingSoon === 'true') {
    const oneDayFromNow = now() + (24 * 60 * 60);
    conditions.push('l.current_close_time <= ? AND l.current_close_time > ?');
    params.push(oneDayFromNow, now());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await queryOne<{ total: number }>(
    c.env.DB,
    `SELECT COUNT(*) as total FROM lots l ${whereClause}`,
    params
  );

  // Get lots with images
  const result = await executeQuery<any>(
    c.env.DB,
    `SELECT l.*,
      a.title as auction_title,
      a.status as auction_status,
      (SELECT filename FROM lot_images WHERE lot_id = l.id AND is_primary = 1 LIMIT 1) as primary_image,
      (SELECT COUNT(*) FROM lot_images WHERE lot_id = l.id) as image_count
     FROM lots l
     JOIN auctions a ON l.auction_id = a.id
     ${whereClause}
     ORDER BY l.${sort} ${order}
     LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );

  return c.json({
    success: true,
    data: result.results || [],
    pagination: getPaginationMeta(countResult?.total || 0, page, limit),
  });
});

/**
 * GET /api/lots/:id
 * Get lot details with images
 */
lots.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = c.get('user');

  const lot = await queryOne<any>(
    c.env.DB,
    `SELECT l.*,
      a.title as auction_title,
      a.status as auction_status,
      a.soft_close_enabled,
      a.soft_close_trigger_minutes,
      a.soft_close_extension_minutes,
      a.increment_rules,
      a.buyers_premium_rules,
      a.tax_enabled,
      a.tax_rate,
      a.pickup_location,
      a.pickup_instructions,
      a.shipping_available as auction_shipping_available,
      a.shipping_notes as auction_shipping_notes
     FROM lots l
     JOIN auctions a ON l.auction_id = a.id
     WHERE l.id = ?`,
    [id]
  );

  if (!lot) {
    return c.json({ success: false, error: 'Lot not found' }, 404);
  }

  // Get images
  const images = await executeQuery<any>(
    c.env.DB,
    `SELECT * FROM lot_images 
     WHERE lot_id = ? 
     ORDER BY display_order ASC, id ASC`,
    [id]
  );

  // Check if user is watching
  let isWatching = false;
  if (user) {
    const watchResult = await queryOne(
      c.env.DB,
      'SELECT id FROM watchlist WHERE user_id = ? AND lot_id = ?',
      [user.userId, id]
    );
    isWatching = !!watchResult;
  }

  // Check if user is current high bidder
  let isHighBidder = false;
  if (user && lot.current_bidder_id === user.userId) {
    isHighBidder = true;
  }

  return c.json({
    success: true,
    data: {
      ...lot,
      images: images.results || [],
      isWatching,
      isHighBidder,
    },
  });
});

/**
 * POST /api/lots
 * Create new lot (admin/staff only)
 */
lots.post('/', authenticate, requireStaff, auditLog('create', 'lot'), async (c) => {
  const body = await c.req.json();

  const {
    auction_id,
    lot_number,
    title,
    description,
    category,
    condition,
    tags,
    location,
    pickup_info,
    shipping_available,
    shipping_notes,
    starting_bid,
    reserve_price,
    buy_now_price,
    increment_override,
    quantity,
    is_featured,
  } = body;

  // Validation
  if (!auction_id || !lot_number || !title || starting_bid === undefined) {
    return c.json({ 
      success: false, 
      error: 'auction_id, lot_number, title, and starting_bid are required' 
    }, 400);
  }

  // Check if auction exists
  const auction = await queryOne(
    c.env.DB,
    'SELECT id, status FROM auctions WHERE id = ?',
    [auction_id]
  );

  if (!auction) {
    return c.json({ success: false, error: 'Auction not found' }, 404);
  }

  // Check for duplicate lot number
  const existing = await queryOne(
    c.env.DB,
    'SELECT id FROM lots WHERE auction_id = ? AND lot_number = ?',
    [auction_id, lot_number]
  );

  if (existing) {
    return c.json({ 
      success: false, 
      error: 'Lot number already exists in this auction' 
    }, 400);
  }

  // Create lot
  const result = await executeWrite(
    c.env.DB,
    `INSERT INTO lots (
      auction_id, lot_number, title, description,
      category, condition, tags,
      location, pickup_info, shipping_available, shipping_notes,
      starting_bid, reserve_price, buy_now_price,
      increment_override, quantity,
      is_featured, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      auction_id,
      lot_number,
      title,
      description || null,
      category || null,
      condition || null,
      tags ? JSON.stringify(tags) : null,
      location || null,
      pickup_info || null,
      shipping_available ? 1 : 0,
      shipping_notes || null,
      starting_bid,
      reserve_price || null,
      buy_now_price || null,
      increment_override ? JSON.stringify(increment_override) : null,
      quantity || 1,
      is_featured ? 1 : 0,
      auction.status === 'draft' ? 'pending' : 'active',
    ]
  );

  const lotId = result.meta.last_row_id as number;

  return c.json({
    success: true,
    message: 'Lot created successfully',
    data: { id: lotId },
  }, 201);
});

/**
 * PUT /api/lots/:id
 * Update lot (admin/staff only)
 */
lots.put('/:id', authenticate, requireStaff, auditLog('update', 'lot'), async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  // Check if lot exists
  const existing = await queryOne<Lot>(c.env.DB, 'SELECT * FROM lots WHERE id = ?', [id]);
  if (!existing) {
    return c.json({ success: false, error: 'Lot not found' }, 404);
  }

  // Don't allow editing active lots with bids
  if (existing.bid_count > 0) {
    return c.json({ 
      success: false, 
      error: 'Cannot edit lot with active bids' 
    }, 400);
  }

  // Build update query
  const updates: string[] = [];
  const params: any[] = [];

  const allowedFields = [
    'lot_number', 'title', 'description',
    'category', 'condition', 'tags',
    'location', 'pickup_info', 'shipping_available', 'shipping_notes',
    'starting_bid', 'reserve_price', 'buy_now_price',
    'increment_override', 'quantity', 'is_featured',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      
      // Handle JSON fields
      if (field === 'tags' || field === 'increment_override') {
        params.push(body[field] ? JSON.stringify(body[field]) : null);
      }
      // Handle boolean fields
      else if (field === 'shipping_available' || field === 'is_featured') {
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
    `UPDATE lots SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  return c.json({
    success: true,
    message: 'Lot updated successfully',
  });
});

/**
 * PATCH /api/lots/bulk
 * Bulk update lots (admin/staff only)
 */
lots.patch('/bulk', authenticate, requireStaff, auditLog('bulk_update', 'lot'), async (c) => {
  const body = await c.req.json();
  const { lot_ids, updates } = body;

  if (!lot_ids || !Array.isArray(lot_ids) || lot_ids.length === 0) {
    return c.json({ success: false, error: 'lot_ids array is required' }, 400);
  }

  if (!updates || typeof updates !== 'object') {
    return c.json({ success: false, error: 'updates object is required' }, 400);
  }

  // Build update query
  const updateFields: string[] = [];
  const params: any[] = [];

  const allowedFields = ['category', 'condition', 'shipping_available', 'is_featured'];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      
      if (field === 'shipping_available' || field === 'is_featured') {
        params.push(updates[field] ? 1 : 0);
      } else {
        params.push(updates[field]);
      }
    }
  }

  if (updateFields.length === 0) {
    return c.json({ success: false, error: 'No valid fields to update' }, 400);
  }

  updateFields.push('updated_at = ?');
  params.push(now());

  // Add lot_ids to params
  const placeholders = lot_ids.map(() => '?').join(',');
  params.push(...lot_ids);

  await executeWrite(
    c.env.DB,
    `UPDATE lots SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`,
    params
  );

  return c.json({
    success: true,
    message: `${lot_ids.length} lot(s) updated successfully`,
  });
});

/**
 * DELETE /api/lots/:id
 * Delete lot (admin only, only if no bids)
 */
lots.delete('/:id', authenticate, requireStaff, auditLog('delete', 'lot'), async (c) => {
  const id = parseInt(c.req.param('id'));

  const lot = await queryOne<Lot>(c.env.DB, 'SELECT bid_count FROM lots WHERE id = ?', [id]);
  if (!lot) {
    return c.json({ success: false, error: 'Lot not found' }, 404);
  }

  if (lot.bid_count > 0) {
    return c.json({ success: false, error: 'Cannot delete lot with bids' }, 400);
  }

  // Delete images first (cascade handled by FK, but we could delete from R2 here)
  await executeWrite(c.env.DB, 'DELETE FROM lot_images WHERE lot_id = ?', [id]);

  // Delete lot
  await executeWrite(c.env.DB, 'DELETE FROM lots WHERE id = ?', [id]);

  return c.json({
    success: true,
    message: 'Lot deleted successfully',
  });
});

/**
 * GET /api/lots/:id/images
 * Get lot images
 */
lots.get('/:id/images', async (c) => {
  const id = parseInt(c.req.param('id'));

  const images = await executeQuery<any>(
    c.env.DB,
    'SELECT * FROM lot_images WHERE lot_id = ? ORDER BY display_order ASC, id ASC',
    [id]
  );

  return c.json({
    success: true,
    data: images.results || [],
  });
});

/**
 * GET /api/lots/categories
 * Get all unique categories
 */
lots.get('/categories/list', async (c) => {
  const categories = await executeQuery<{ category: string }>(
    c.env.DB,
    `SELECT DISTINCT category 
     FROM lots 
     WHERE category IS NOT NULL 
     ORDER BY category ASC`,
    []
  );

  return c.json({
    success: true,
    data: (categories.results || []).map(r => r.category),
  });
});

export default lots;
