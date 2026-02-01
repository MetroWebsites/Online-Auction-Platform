/**
 * Import Routes
 * 
 * Handles:
 * - CSV lot import
 * - Bulk image upload with filename matching
 * - Manual image assignment
 * - Import batch status
 */

import { Hono } from 'hono';
import type { HonoContext } from '../types';
import { authenticate, requireStaff } from '../middleware/auth';
import { auditLog } from '../middleware/error';
import { ImportService } from '../services/import';
import { executeQuery } from '../utils/db';

const imports = new Hono<HonoContext>();

/**
 * POST /api/imports/lots/:auctionId
 * Import lots from CSV
 */
imports.post('/lots/:auctionId', authenticate, requireStaff, auditLog('import', 'lots'), async (c) => {
  const user = c.get('user')!;
  const auctionId = parseInt(c.req.param('auctionId'));
  
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return c.json({ success: false, error: 'CSV file is required' }, 400);
  }

  const csvContent = await file.text();

  const importService = new ImportService(c.env.DB);
  const result = await importService.importLotsFromCSV(auctionId, csvContent, user.userId);

  return c.json({
    success: result.success,
    message: result.success 
      ? `Successfully imported ${result.successfulItems} lot(s)` 
      : `Import failed with ${result.failedItems} error(s)`,
    data: result,
  });
});

/**
 * POST /api/imports/images/:auctionId
 * Bulk image upload with automatic matching
 */
imports.post('/images/:auctionId', authenticate, requireStaff, auditLog('import', 'images'), async (c) => {
  const user = c.get('user')!;
  const auctionId = parseInt(c.req.param('auctionId'));
  
  const formData = await c.req.formData();
  const files = formData.getAll('files') as File[];

  if (files.length === 0) {
    return c.json({ success: false, error: 'At least one image file is required' }, 400);
  }

  // TODO: Upload images to R2 and get URLs
  // For now, we'll create dummy URLs
  const images = files.map(file => ({
    filename: file.name,
    url: `/images/${file.name}`, // Placeholder URL
  }));

  const importService = new ImportService(c.env.DB);
  const { batchId, results } = await importService.processBulkImages(auctionId, images, user.userId);

  const matched = results.filter(r => r.status === 'matched').length;
  const unmatched = results.filter(r => r.status === 'unmatched').length;

  return c.json({
    success: true,
    message: `Processed ${files.length} image(s): ${matched} matched, ${unmatched} unmatched`,
    data: {
      batchId,
      totalImages: files.length,
      matched,
      unmatched,
      results,
    },
  });
});

/**
 * GET /api/imports/batch/:batchId
 * Get import batch details
 */
imports.get('/batch/:batchId', authenticate, requireStaff, async (c) => {
  const batchId = c.req.param('batchId');

  const importService = new ImportService(c.env.DB);
  const batch = await importService.getImportBatch(batchId);

  if (!batch) {
    return c.json({ success: false, error: 'Import batch not found' }, 404);
  }

  return c.json({
    success: true,
    data: batch,
  });
});

/**
 * GET /api/imports/batch/:batchId/unmatched
 * Get unmatched images for manual assignment
 */
imports.get('/batch/:batchId/unmatched', authenticate, requireStaff, async (c) => {
  const batchId = c.req.param('batchId');

  const importService = new ImportService(c.env.DB);
  const images = await importService.getUnmatchedImages(batchId);

  return c.json({
    success: true,
    data: images,
  });
});

/**
 * POST /api/imports/assign
 * Manually assign image to lot
 */
imports.post('/assign', authenticate, requireStaff, auditLog('assign', 'image'), async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json();
  const { mapping_id, lot_id, display_order } = body;

  if (!mapping_id || !lot_id || display_order === undefined) {
    return c.json({ 
      success: false, 
      error: 'mapping_id, lot_id, and display_order are required' 
    }, 400);
  }

  const importService = new ImportService(c.env.DB);
  await importService.manuallyAssignImage(
    mapping_id,
    lot_id,
    display_order,
    user.userId
  );

  return c.json({
    success: true,
    message: 'Image assigned successfully',
  });
});

/**
 * GET /api/imports/batches
 * List import batches
 */
imports.get('/batches', authenticate, requireStaff, async (c) => {
  const auctionId = c.req.query('auction_id');
  const importType = c.req.query('import_type');

  const conditions: string[] = [];
  const params: any[] = [];

  if (auctionId) {
    conditions.push('auction_id = ?');
    params.push(parseInt(auctionId));
  }

  if (importType) {
    conditions.push('import_type = ?');
    params.push(importType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await executeQuery(
    c.env.DB,
    `SELECT * FROM import_batches ${whereClause} ORDER BY created_at DESC LIMIT 50`,
    params
  );

  return c.json({
    success: true,
    data: result.results || [],
  });
});

/**
 * GET /api/imports/template/csv
 * Download CSV template for lot import
 */
imports.get('/template/csv', async (c) => {
  const template = `lot_number,title,description,category,condition,starting_bid,reserve_price,buy_now_price,quantity,location,shipping_available,tags
1,"Example Item 1","Description for item 1","Furniture","Excellent",100,500,1000,1,"New York",true,"antique,furniture"
2,"Example Item 2","Description for item 2","Art","Good",50,200,,1,"Los Angeles",false,"art,painting"
3,"Example Item 3","Description for item 3","Collectibles","Fair",25,,,2,"Chicago",true,"collectible,vintage"`;

  return new Response(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="lot-import-template.csv"',
    },
  });
});

export default imports;
