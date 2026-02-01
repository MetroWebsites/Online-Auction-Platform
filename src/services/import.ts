/**
 * Import Service
 * 
 * Handles:
 * - CSV lot import with validation
 * - Bulk image upload with filename parsing
 * - Image-to-lot matching (LOT-PHOTOORDER pattern)
 * - Conflict detection and resolution
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { CSVLotImport } from '../types';
import { executeWrite, executeQuery, queryOne, generateId, now } from '../utils/db';

export interface ImportResult {
  success: boolean;
  batchId: string;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; field: string; message: string }>;
}

export interface ImageMatchResult {
  filename: string;
  lotNumber: number | null;
  photoOrder: number | null;
  status: 'matched' | 'unmatched' | 'conflict';
  reason?: string;
}

export class ImportService {
  constructor(private db: D1Database) {}

  /**
   * Parse CSV content and import lots
   */
  async importLotsFromCSV(
    auctionId: number,
    csvContent: string,
    createdBy: number
  ): Promise<ImportResult> {
    const batchId = generateId();
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const warnings: Array<{ row: number; field: string; message: string }> = [];

    // Parse CSV
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = this.parseCSVRow(lines[0]);
    const rows: CSVLotImport[] = [];

    // Validate required columns
    const requiredFields = ['lot_number', 'title', 'starting_bid'];
    for (const field of requiredFields) {
      if (!headers.includes(field)) {
        throw new Error(`Missing required column: ${field}`);
      }
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVRow(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue; // Skip empty rows

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      // Validate row
      const rowErrors = this.validateLotRow(row, i + 1);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        rows.push(this.mapCSVRowToLot(row));
      }
    }

    // Check for duplicate lot numbers in CSV
    const lotNumbers = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
      if (lotNumbers.has(rows[i].lot_number)) {
        errors.push({
          row: i + 2,
          field: 'lot_number',
          message: `Duplicate lot number ${rows[i].lot_number} in CSV`,
        });
      }
      lotNumbers.add(rows[i].lot_number);
    }

    // Check for existing lot numbers in database
    if (rows.length > 0) {
      const existingLots = await executeQuery<{ lot_number: number }>(
        this.db,
        `SELECT lot_number FROM lots WHERE auction_id = ? AND lot_number IN (${rows.map(() => '?').join(',')})`,
        [auctionId, ...rows.map(r => r.lot_number)]
      );

      for (const existing of existingLots.results || []) {
        errors.push({
          row: 0,
          field: 'lot_number',
          message: `Lot number ${existing.lot_number} already exists in this auction`,
        });
      }
    }

    let successfulItems = 0;
    let failedItems = errors.length;

    // Insert lots if no errors
    if (errors.length === 0) {
      for (const lot of rows) {
        try {
          await executeWrite(
            this.db,
            `INSERT INTO lots (
              auction_id, lot_number, title, description,
              category, condition, tags,
              starting_bid, reserve_price, buy_now_price,
              quantity, shipping_available, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              auctionId,
              lot.lot_number,
              lot.title,
              lot.description || null,
              lot.category || null,
              lot.condition || null,
              lot.tags ? JSON.stringify(lot.tags.split(',').map(t => t.trim())) : null,
              lot.starting_bid,
              lot.reserve_price || null,
              lot.buy_now_price || null,
              lot.quantity || 1,
              lot.shipping_available ? 1 : 0,
              'pending',
            ]
          );
          successfulItems++;
        } catch (error) {
          errors.push({
            row: rows.indexOf(lot) + 2,
            field: 'all',
            message: `Failed to insert: ${error}`,
          });
          failedItems++;
        }
      }
    }

    // Create import batch record
    await executeWrite(
      this.db,
      `INSERT INTO import_batches (
        id, auction_id, import_type, filename,
        status, total_items, successful_items, failed_items,
        errors, warnings, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchId,
        auctionId,
        'lots_csv',
        'import.csv',
        errors.length > 0 ? 'failed' : 'completed',
        rows.length,
        successfulItems,
        failedItems,
        JSON.stringify(errors),
        JSON.stringify(warnings),
        createdBy,
      ]
    );

    return {
      success: errors.length === 0,
      batchId,
      totalItems: rows.length,
      successfulItems,
      failedItems,
      errors,
      warnings,
    };
  }

  /**
   * Process bulk image upload and match to lots
   */
  async processBulkImages(
    auctionId: number,
    images: Array<{ filename: string; url: string }>,
    createdBy: number
  ): Promise<{ batchId: string; results: ImageMatchResult[] }> {
    const batchId = generateId();
    const results: ImageMatchResult[] = [];

    // Get all lot numbers for this auction
    const lots = await executeQuery<{ id: number; lot_number: number }>(
      this.db,
      'SELECT id, lot_number FROM lots WHERE auction_id = ?',
      [auctionId]
    );

    const lotMap = new Map<number, number>();
    for (const lot of lots.results || []) {
      lotMap.set(lot.lot_number, lot.id);
    }

    // Process each image
    for (const image of images) {
      const parsed = this.parseImageFilename(image.filename);
      
      let status: 'matched' | 'unmatched' | 'conflict' = 'unmatched';
      let reason: string | undefined;

      if (parsed.lotNumber !== null) {
        const lotId = lotMap.get(parsed.lotNumber);
        
        if (lotId) {
          status = 'matched';
          
          // Create image mapping record
          await executeWrite(
            this.db,
            `INSERT INTO image_mappings (
              import_batch_id, filename, file_url,
              parsed_lot_number, parsed_photo_order,
              match_status, match_confidence,
              assigned_lot_id, assigned_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              batchId,
              image.filename,
              image.url,
              parsed.lotNumber,
              parsed.photoOrder,
              'matched',
              1.0,
              lotId,
              parsed.photoOrder,
            ]
          );
        } else {
          status = 'unmatched';
          reason = `No lot found with number ${parsed.lotNumber}`;
          
          await executeWrite(
            this.db,
            `INSERT INTO image_mappings (
              import_batch_id, filename, file_url,
              parsed_lot_number, parsed_photo_order,
              match_status, conflict_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              batchId,
              image.filename,
              image.url,
              parsed.lotNumber,
              parsed.photoOrder,
              'unmatched',
              reason,
            ]
          );
        }
      } else {
        status = 'unmatched';
        reason = 'Could not parse lot number from filename';
        
        await executeWrite(
          this.db,
          `INSERT INTO image_mappings (
            import_batch_id, filename, file_url,
            match_status, conflict_reason
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            batchId,
            image.filename,
            image.url,
            'unmatched',
            reason,
          ]
        );
      }

      results.push({
        filename: image.filename,
        lotNumber: parsed.lotNumber,
        photoOrder: parsed.photoOrder,
        status,
        reason,
      });
    }

    // Create import batch record
    const matched = results.filter(r => r.status === 'matched').length;
    const unmatched = results.filter(r => r.status === 'unmatched').length;

    await executeWrite(
      this.db,
      `INSERT INTO import_batches (
        id, auction_id, import_type,
        status, total_items, successful_items, failed_items,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchId,
        auctionId,
        'images_bulk',
        unmatched > 0 ? 'partial' : 'completed',
        images.length,
        matched,
        unmatched,
        createdBy,
      ]
    );

    return { batchId, results };
  }

  /**
   * Parse image filename to extract lot number and photo order
   * Patterns: "LOT-ORDER" like "12-1", "12-2", "lot12-1", "lot_12_1", etc.
   */
  private parseImageFilename(filename: string): { lotNumber: number | null; photoOrder: number | null } {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|gif|webp|heic)$/i, '');
    
    // Try various patterns
    const patterns = [
      /^(\d+)-(\d+)$/,           // 12-1
      /^lot[_-]?(\d+)[_-](\d+)$/i, // lot12-1, lot_12_1, lot-12-1
      /^(\d+)_(\d+)$/,           // 12_1
      /^(\d+)\.(\d+)$/,          // 12.1
    ];

    for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) {
        return {
          lotNumber: parseInt(match[1]),
          photoOrder: parseInt(match[2]),
        };
      }
    }

    return { lotNumber: null, photoOrder: null };
  }

  /**
   * Parse CSV row handling quoted values
   */
  private parseCSVRow(row: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    values.push(currentValue.trim());
    return values;
  }

  /**
   * Validate a lot row from CSV
   */
  private validateLotRow(row: any, rowNumber: number): Array<{ row: number; field: string; message: string }> {
    const errors: Array<{ row: number; field: string; message: string }> = [];

    // lot_number
    if (!row.lot_number || isNaN(parseInt(row.lot_number))) {
      errors.push({ row: rowNumber, field: 'lot_number', message: 'Invalid or missing lot number' });
    }

    // title
    if (!row.title || row.title.trim().length === 0) {
      errors.push({ row: rowNumber, field: 'title', message: 'Title is required' });
    }

    // starting_bid
    if (!row.starting_bid || isNaN(parseFloat(row.starting_bid))) {
      errors.push({ row: rowNumber, field: 'starting_bid', message: 'Invalid or missing starting bid' });
    } else if (parseFloat(row.starting_bid) < 0) {
      errors.push({ row: rowNumber, field: 'starting_bid', message: 'Starting bid cannot be negative' });
    }

    // reserve_price (optional)
    if (row.reserve_price && isNaN(parseFloat(row.reserve_price))) {
      errors.push({ row: rowNumber, field: 'reserve_price', message: 'Invalid reserve price' });
    }

    // buy_now_price (optional)
    if (row.buy_now_price && isNaN(parseFloat(row.buy_now_price))) {
      errors.push({ row: rowNumber, field: 'buy_now_price', message: 'Invalid buy now price' });
    }

    return errors;
  }

  /**
   * Map CSV row to lot object
   */
  private mapCSVRowToLot(row: any): CSVLotImport {
    return {
      lot_number: parseInt(row.lot_number),
      title: row.title.trim(),
      description: row.description || undefined,
      category: row.category || undefined,
      condition: row.condition || undefined,
      starting_bid: parseFloat(row.starting_bid),
      reserve_price: row.reserve_price ? parseFloat(row.reserve_price) : undefined,
      buy_now_price: row.buy_now_price ? parseFloat(row.buy_now_price) : undefined,
      quantity: row.quantity ? parseInt(row.quantity) : undefined,
      location: row.location || undefined,
      shipping_available: row.shipping_available === 'true' || row.shipping_available === '1',
      tags: row.tags || undefined,
    };
  }

  /**
   * Get import batch details
   */
  async getImportBatch(batchId: string): Promise<any> {
    const batch = await queryOne(
      this.db,
      `SELECT * FROM import_batches WHERE id = ?`,
      [batchId]
    );

    return batch;
  }

  /**
   * Get unmatched images for manual assignment
   */
  async getUnmatchedImages(batchId: string): Promise<any[]> {
    const result = await executeQuery(
      this.db,
      `SELECT * FROM image_mappings 
       WHERE import_batch_id = ? AND match_status = 'unmatched'
       ORDER BY filename ASC`,
      [batchId]
    );

    return result.results || [];
  }

  /**
   * Manually assign image to lot
   */
  async manuallyAssignImage(
    mappingId: number,
    lotId: number,
    displayOrder: number,
    assignedBy: number
  ): Promise<void> {
    await executeWrite(
      this.db,
      `UPDATE image_mappings 
       SET assigned_lot_id = ?,
           assigned_order = ?,
           assigned_by = ?,
           assigned_at = ?,
           match_status = 'manual'
       WHERE id = ?`,
      [lotId, displayOrder, assignedBy, now(), mappingId]
    );
  }
}
