/**
 * Invoice Routes
 * 
 * Handles:
 * - List invoices (admin and bidder)
 * - Get invoice details
 * - Update payment status
 * - Update fulfillment status
 * - Export invoices
 */

import { Hono } from 'hono';
import type { HonoContext } from '../types';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth';
import { auditLog } from '../middleware/error';
import { InvoiceService } from '../services/invoicing';
import {
  executeQuery,
  executeWrite,
  queryOne,
  buildPagination,
  getPaginationMeta,
} from '../utils/db';

const invoices = new Hono<HonoContext>();

/**
 * GET /api/invoices
 * List invoices (admin sees all, bidders see their own)
 */
invoices.get('/', authenticate, async (c) => {
  const user = c.get('user')!;
  const auctionId = c.req.query('auction_id');
  const paymentStatus = c.req.query('payment_status');
  const fulfillmentStatus = c.req.query('fulfillment_status');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

  const pagination = buildPagination({ page, limit, sort: 'created_at', order: 'desc' });

  const conditions: string[] = [];
  const params: any[] = [];

  // Bidders can only see their own invoices
  if (user.role === 'bidder') {
    conditions.push('i.bidder_id = ?');
    params.push(user.userId);
  }

  if (auctionId) {
    conditions.push('i.auction_id = ?');
    params.push(parseInt(auctionId));
  }

  if (paymentStatus) {
    conditions.push('i.payment_status = ?');
    params.push(paymentStatus);
  }

  if (fulfillmentStatus) {
    conditions.push('i.fulfillment_status = ?');
    params.push(fulfillmentStatus);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await queryOne<{ total: number }>(
    c.env.DB,
    `SELECT COUNT(*) as total FROM invoices i ${whereClause}`,
    params
  );

  const result = await executeQuery<any>(
    c.env.DB,
    `SELECT i.*,
      u.email as bidder_email,
      u.first_name as bidder_first_name,
      u.last_name as bidder_last_name,
      a.title as auction_title
     FROM invoices i
     JOIN users u ON i.bidder_id = u.id
     JOIN auctions a ON i.auction_id = a.id
     ${whereClause}
     ${pagination.sql}`,
    [...params, pagination.limit, pagination.offset]
  );

  return c.json({
    success: true,
    data: result.results || [],
    pagination: getPaginationMeta(countResult?.total || 0, page, limit),
  });
});

/**
 * GET /api/invoices/:id
 * Get invoice details with line items
 */
invoices.get('/:id', authenticate, async (c) => {
  const user = c.get('user')!;
  const id = parseInt(c.req.param('id'));

  const invoiceService = new InvoiceService(c.env.DB);
  const invoice = await invoiceService.getInvoice(id);

  if (!invoice) {
    return c.json({ success: false, error: 'Invoice not found' }, 404);
  }

  // Bidders can only see their own invoices
  if (user.role === 'bidder' && invoice.bidder_id !== user.userId) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }

  return c.json({
    success: true,
    data: invoice,
  });
});

/**
 * POST /api/invoices/generate/:auctionId
 * Generate invoices for all winners in an auction (admin only)
 */
invoices.post('/generate/:auctionId', authenticate, requireAdmin, auditLog('generate', 'invoice'), async (c) => {
  const auctionId = parseInt(c.req.param('auctionId'));

  // Check if invoices already generated
  const existing = await queryOne<{ count: number }>(
    c.env.DB,
    'SELECT COUNT(*) as count FROM invoices WHERE auction_id = ?',
    [auctionId]
  );

  if (existing && existing.count > 0) {
    return c.json({ success: false, error: 'Invoices already generated for this auction' }, 400);
  }

  const invoiceService = new InvoiceService(c.env.DB);
  const invoiceIds = await invoiceService.generateInvoicesForAuction(auctionId);

  return c.json({
    success: true,
    message: `Generated ${invoiceIds.length} invoice(s)`,
    data: { invoiceIds },
  });
});

/**
 * PATCH /api/invoices/:id/payment
 * Update payment status (admin only)
 */
invoices.patch('/:id/payment', authenticate, requireStaff, auditLog('update_payment', 'invoice'), async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { status, amount, method, reference } = body;

  if (!status || !amount || !method) {
    return c.json({ success: false, error: 'status, amount, and method are required' }, 400);
  }

  const invoiceService = new InvoiceService(c.env.DB);
  await invoiceService.updatePaymentStatus(id, status, amount, method, reference || '');

  return c.json({
    success: true,
    message: 'Payment status updated',
  });
});

/**
 * PATCH /api/invoices/:id/fulfillment
 * Update fulfillment status (admin/staff only)
 */
invoices.patch('/:id/fulfillment', authenticate, requireStaff, auditLog('update_fulfillment', 'invoice'), async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { status, tracking_number } = body;

  if (!status) {
    return c.json({ success: false, error: 'status is required' }, 400);
  }

  const invoiceService = new InvoiceService(c.env.DB);
  await invoiceService.updateFulfillmentStatus(id, status);

  if (tracking_number) {
    await executeWrite(
      c.env.DB,
      'UPDATE invoices SET tracking_number = ? WHERE id = ?',
      [tracking_number, id]
    );
  }

  return c.json({
    success: true,
    message: 'Fulfillment status updated',
  });
});

/**
 * GET /api/invoices/export/csv
 * Export invoices to CSV (admin only)
 */
invoices.get('/export/csv', authenticate, requireAdmin, async (c) => {
  const auctionId = c.req.query('auction_id');

  const conditions: string[] = [];
  const params: any[] = [];

  if (auctionId) {
    conditions.push('i.auction_id = ?');
    params.push(parseInt(auctionId));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await executeQuery<any>(
    c.env.DB,
    `SELECT 
      i.invoice_number,
      i.created_at,
      a.title as auction_title,
      u.email as bidder_email,
      u.first_name,
      u.last_name,
      i.subtotal,
      i.buyers_premium,
      i.tax,
      i.shipping,
      i.total,
      i.payment_status,
      i.fulfillment_status
     FROM invoices i
     JOIN users u ON i.bidder_id = u.id
     JOIN auctions a ON i.auction_id = a.id
     ${whereClause}
     ORDER BY i.created_at DESC`,
    params
  );

  // Generate CSV
  const rows = result.results || [];
  const headers = [
    'Invoice Number',
    'Date',
    'Auction',
    'Bidder Email',
    'First Name',
    'Last Name',
    'Subtotal',
    'Buyer\'s Premium',
    'Tax',
    'Shipping',
    'Total',
    'Payment Status',
    'Fulfillment Status',
  ];

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += [
      row.invoice_number,
      new Date(row.created_at * 1000).toISOString(),
      `"${row.auction_title}"`,
      row.bidder_email,
      row.first_name || '',
      row.last_name || '',
      row.subtotal,
      row.buyers_premium,
      row.tax,
      row.shipping,
      row.total,
      row.payment_status,
      row.fulfillment_status,
    ].join(',') + '\n';
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="invoices-${Date.now()}.csv"`,
    },
  });
});

export default invoices;
