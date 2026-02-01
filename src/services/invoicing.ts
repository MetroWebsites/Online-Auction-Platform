/**
 * Invoice Service
 * 
 * Handles:
 * - Invoice generation after auction close
 * - Buyer's premium calculation
 * - Tax calculation
 * - Line item generation
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { Invoice, InvoiceItem, BuyersPremiumRule } from '../types';
import {
  queryOne,
  executeQuery,
  executeWrite,
  transaction,
  now,
  parseJSON,
  generateInvoiceNumber,
  calculateBuyersPremium,
} from '../utils/db';

export class InvoiceService {
  constructor(private db: D1Database) {}

  /**
   * Generate invoices for all winning bidders in an auction
   */
  async generateInvoicesForAuction(auctionId: number): Promise<number[]> {
    // Get auction details
    const auction = await queryOne<any>(
      this.db,
      `SELECT id, title, buyers_premium_rules, tax_enabled, tax_rate, shipping_available
       FROM auctions WHERE id = ?`,
      [auctionId]
    );

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Get all winning lots grouped by bidder
    const winningLots = await executeQuery<any>(
      this.db,
      `SELECT 
        l.id as lot_id,
        l.lot_number,
        l.title as lot_title,
        l.current_bid,
        l.current_bidder_id as bidder_id,
        l.shipping_available as lot_shipping
       FROM lots l
       WHERE l.auction_id = ? 
         AND l.status = 'sold'
         AND l.current_bidder_id IS NOT NULL
       ORDER BY l.current_bidder_id, l.lot_number`,
      [auctionId]
    );

    if (!winningLots.results || winningLots.results.length === 0) {
      return [];
    }

    // Group lots by bidder
    const lotsByBidder = new Map<number, any[]>();
    for (const lot of winningLots.results) {
      if (!lotsByBidder.has(lot.bidder_id)) {
        lotsByBidder.set(lot.bidder_id, []);
      }
      lotsByBidder.get(lot.bidder_id)!.push(lot);
    }

    const buyersPremiumRules = parseJSON<BuyersPremiumRule[]>(
      auction.buyers_premium_rules,
      [{ min: 0, max: null, rate: 0.15 }]
    );

    // Generate invoice for each bidder
    const invoiceIds: number[] = [];
    for (const [bidderId, lots] of lotsByBidder.entries()) {
      const invoiceId = await this.generateInvoice(
        auctionId,
        bidderId,
        lots,
        buyersPremiumRules,
        auction.tax_enabled === 1,
        auction.tax_rate || 0,
        auction.shipping_available === 1
      );
      invoiceIds.push(invoiceId);
    }

    return invoiceIds;
  }

  /**
   * Generate a single invoice for a bidder
   */
  private async generateInvoice(
    auctionId: number,
    bidderId: number,
    lots: any[],
    buyersPremiumRules: BuyersPremiumRule[],
    taxEnabled: boolean,
    taxRate: number,
    shippingAvailable: boolean
  ): Promise<number> {
    const invoiceNumber = generateInvoiceNumber();

    // Calculate totals
    let subtotal = 0;
    let totalBuyersPremium = 0;
    let totalTax = 0;
    let totalShipping = 0;

    const lineItems: any[] = [];

    for (const lot of lots) {
      const winningBid = lot.current_bid;
      const buyersPremium = calculateBuyersPremium(winningBid, buyersPremiumRules);
      
      // Find the applicable rate
      let buyersPremiumRate = 0;
      for (const rule of buyersPremiumRules) {
        if (winningBid >= rule.min && (rule.max === null || winningBid < rule.max)) {
          buyersPremiumRate = rule.rate;
          break;
        }
      }

      const taxAmount = taxEnabled ? (winningBid + buyersPremium) * taxRate : 0;
      const shippingAmount = lot.lot_shipping && shippingAvailable ? 0 : 0; // TODO: Calculate shipping
      const lineTotal = winningBid + buyersPremium + taxAmount + shippingAmount;

      subtotal += winningBid;
      totalBuyersPremium += buyersPremium;
      totalTax += taxAmount;
      totalShipping += shippingAmount;

      lineItems.push({
        lot_id: lot.lot_id,
        lot_number: lot.lot_number,
        lot_title: lot.lot_title,
        winning_bid: winningBid,
        buyers_premium_rate: buyersPremiumRate,
        buyers_premium_amount: buyersPremium,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        shipping_amount: shippingAmount,
        line_total: lineTotal,
      });
    }

    const total = subtotal + totalBuyersPremium + totalTax + totalShipping;

    // Create invoice and line items in transaction
    const queries: Array<{ query: string; params: any[] }> = [];

    // Insert invoice
    queries.push({
      query: `INSERT INTO invoices (
        auction_id, bidder_id, invoice_number,
        subtotal, buyers_premium, tax, shipping, total,
        payment_status, fulfillment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        auctionId,
        bidderId,
        invoiceNumber,
        subtotal,
        totalBuyersPremium,
        totalTax,
        totalShipping,
        total,
        'unpaid',
        'pending',
      ],
    });

    // Note: We need to get the invoice ID before inserting line items
    // This is a limitation - we'll do it in two steps
    const invoiceResult = await executeWrite(
      this.db,
      `INSERT INTO invoices (
        auction_id, bidder_id, invoice_number,
        subtotal, buyers_premium, tax, shipping, total,
        payment_status, fulfillment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auctionId,
        bidderId,
        invoiceNumber,
        subtotal,
        totalBuyersPremium,
        totalTax,
        totalShipping,
        total,
        'unpaid',
        'pending',
      ]
    );

    const invoiceId = invoiceResult.meta.last_row_id as number;

    // Insert line items
    for (const item of lineItems) {
      await executeWrite(
        this.db,
        `INSERT INTO invoice_items (
          invoice_id, lot_id, lot_number, lot_title,
          winning_bid, buyers_premium_rate, buyers_premium_amount,
          tax_rate, tax_amount, shipping_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.lot_id,
          item.lot_number,
          item.lot_title,
          item.winning_bid,
          item.buyers_premium_rate,
          item.buyers_premium_amount,
          item.tax_rate,
          item.tax_amount,
          item.shipping_amount,
          item.line_total,
        ]
      );
    }

    return invoiceId;
  }

  /**
   * Get invoice with line items
   */
  async getInvoice(invoiceId: number): Promise<any> {
    const invoice = await queryOne<any>(
      this.db,
      `SELECT i.*,
        u.email as bidder_email,
        u.first_name as bidder_first_name,
        u.last_name as bidder_last_name,
        u.phone as bidder_phone,
        u.address_line1,
        u.address_line2,
        u.city,
        u.state,
        u.zip_code,
        u.country,
        a.title as auction_title,
        a.pickup_location,
        a.pickup_instructions,
        a.pickup_start_date,
        a.pickup_end_date
       FROM invoices i
       JOIN users u ON i.bidder_id = u.id
       JOIN auctions a ON i.auction_id = a.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (!invoice) {
      return null;
    }

    const lineItems = await executeQuery<InvoiceItem>(
      this.db,
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY lot_number ASC',
      [invoiceId]
    );

    return {
      ...invoice,
      line_items: lineItems.results || [],
    };
  }

  /**
   * Update invoice payment status
   */
  async updatePaymentStatus(
    invoiceId: number,
    status: string,
    amount: number,
    method: string,
    reference: string
  ): Promise<void> {
    await executeWrite(
      this.db,
      `UPDATE invoices 
       SET payment_status = ?,
           paid_amount = paid_amount + ?,
           payment_method = ?,
           payment_reference = ?,
           paid_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [status, amount, method, reference, now(), now(), invoiceId]
    );

    // Record payment transaction
    await executeWrite(
      this.db,
      `INSERT INTO payment_transactions (
        invoice_id, transaction_type, amount, payment_method,
        status, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, 'payment', amount, method, 'completed', now()]
    );
  }

  /**
   * Update invoice fulfillment status
   */
  async updateFulfillmentStatus(invoiceId: number, status: string): Promise<void> {
    const updates: any = {
      fulfillment_status: status,
      updated_at: now(),
    };

    if (status === 'picked_up') {
      updates.picked_up_at = now();
    } else if (status === 'shipped') {
      updates.shipped_at = now();
    } else if (status === 'delivered') {
      updates.delivered_at = now();
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(invoiceId);

    await executeWrite(
      this.db,
      `UPDATE invoices SET ${fields} WHERE id = ?`,
      values
    );
  }
}
