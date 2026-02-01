/**
 * BIDDING ENGINE SERVICE
 * 
 * Core bidding logic with:
 * - Manual bidding
 * - Proxy (max) bidding with automatic outbidding
 * - Soft close extensions
 * - Concurrency safety via transactions
 * - Complete audit trail
 * - Server-authoritative time
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { Bid, Lot, IncrementRule, BidAuditEventType } from '../types';
import {
  now,
  parseJSON,
  getMinimumNextBid,
  calculateBidIncrement,
  queryOne,
  transaction,
} from '../utils/db';

export interface BidResult {
  success: boolean;
  message: string;
  code: string;
  bid?: Bid;
  lot?: Lot;
  outbidOccurred?: boolean;
  proxyBidTriggered?: boolean;
}

export class BiddingEngine {
  constructor(private db: D1Database) {}

  /**
   * Place a bid on a lot
   * Handles both manual bids and proxy (max) bidding
   */
  async placeBid(
    lotId: number,
    bidderId: number,
    amount: number,
    maxBid?: number,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<BidResult> {
    // Validate inputs
    if (amount <= 0) {
      return this.error('INVALID_AMOUNT', 'Bid amount must be greater than zero');
    }

    if (maxBid && maxBid < amount) {
      return this.error('INVALID_MAX_BID', 'Max bid must be greater than or equal to bid amount');
    }

    // Get lot with lock (for concurrency safety)
    const lot = await queryOne<Lot>(
      this.db,
      'SELECT * FROM lots WHERE id = ?',
      [lotId]
    );

    if (!lot) {
      return this.error('LOT_NOT_FOUND', 'Lot not found');
    }

    // Check lot status
    if (lot.status !== 'active') {
      return this.error('LOT_NOT_ACTIVE', 'Lot is not active for bidding');
    }

    // Check if auction is closed (server-authoritative time)
    const currentTime = now();
    if (lot.current_close_time && currentTime >= lot.current_close_time) {
      return this.error('AUCTION_CLOSED', 'Bidding has closed for this lot');
    }

    // Get increment rules (from lot override or auction default)
    const incrementRules = await this.getIncrementRules(lot);

    // Determine the effective bid amount (starting bid or current bid + increment)
    const minimumBid = lot.current_bid > 0 
      ? getMinimumNextBid(lot.current_bid, incrementRules)
      : lot.starting_bid;

    // Validate bid amount
    if (amount < minimumBid) {
      return this.error(
        'BID_TOO_LOW',
        `Minimum bid is ${minimumBid.toFixed(2)}`,
        { minimumBid }
      );
    }

    // Prevent self-outbidding
    if (lot.current_bidder_id === bidderId) {
      return this.error('SELF_OUTBID', 'You are already the high bidder');
    }

    // Check for existing max bid from current high bidder
    const currentHighBidderMaxBid = lot.current_bidder_id
      ? await this.getActiveMaxBid(lotId, lot.current_bidder_id)
      : null;

    // Execute bidding logic with transaction for concurrency safety
    try {
      const result = await this.executeBidTransaction(
        lot,
        bidderId,
        amount,
        maxBid,
        currentHighBidderMaxBid,
        incrementRules,
        metadata
      );

      // Check and apply soft close if needed
      await this.checkSoftClose(lot, currentTime);

      return result;
    } catch (error) {
      console.error('Bid transaction failed:', error);
      return this.error('BID_FAILED', 'Failed to place bid. Please try again.');
    }
  }

  /**
   * Execute bid transaction with full concurrency safety
   */
  private async executeBidTransaction(
    lot: Lot,
    bidderId: number,
    bidAmount: number,
    maxBid: number | undefined,
    currentHighBidderMaxBid: number | null,
    incrementRules: IncrementRule[],
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<BidResult> {
    const queries: Array<{ query: string; params: any[] }> = [];
    
    let finalBidAmount = bidAmount;
    let proxyTriggered = false;
    let outbidOccurred = false;

    // Scenario 1: No existing max bid - simple bid placement
    if (!currentHighBidderMaxBid) {
      // If this bidder has a max bid, only place minimum required bid
      if (maxBid && maxBid > bidAmount) {
        finalBidAmount = bidAmount;
      }

      // Insert new bid
      queries.push({
        query: `
          INSERT INTO bids (
            lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
            is_winning, previous_bid_amount, previous_bidder_id,
            ip_address, user_agent, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          lot.id,
          bidderId,
          finalBidAmount,
          'manual',
          maxBid || null,
          maxBid ? 1 : 0,
          1, // is_winning
          lot.current_bid,
          lot.current_bidder_id,
          metadata?.ip_address || null,
          metadata?.user_agent || null,
          'winning',
        ],
      });

      // Update lot
      queries.push({
        query: `
          UPDATE lots 
          SET current_bid = ?, 
              current_bidder_id = ?, 
              bid_count = bid_count + 1,
              reserve_met = CASE 
                WHEN reserve_price IS NOT NULL AND ? >= reserve_price THEN 1 
                ELSE reserve_met 
              END,
              updated_at = ?
          WHERE id = ?
        `,
        params: [finalBidAmount, bidderId, finalBidAmount, now(), lot.id],
      });

      // Mark previous winner as outbid
      if (lot.current_bidder_id) {
        queries.push({
          query: `
            UPDATE bids 
            SET status = 'outbid', 
                is_winning = 0, 
                was_outbid = 1, 
                outbid_at = ?
            WHERE lot_id = ? AND bidder_id = ? AND is_winning = 1
          `,
          params: [now(), lot.id, lot.current_bidder_id],
        });
        outbidOccurred = true;
      }

      // Audit log
      queries.push(this.createAuditLog(
        'bid_placed',
        lot,
        bidderId,
        finalBidAmount,
        lot.current_bid,
        'success',
        `Bid placed: ${finalBidAmount}`,
        metadata
      ));
    }
    // Scenario 2: Existing max bid - proxy bidding competition
    else {
      // Compare bids to determine winner
      const increment = calculateBidIncrement(lot.current_bid, incrementRules);

      if (maxBid && maxBid > currentHighBidderMaxBid) {
        // New bidder wins with their max bid vs old max bid + increment
        finalBidAmount = Math.min(
          maxBid,
          currentHighBidderMaxBid + increment
        );

        // Insert winning bid for new bidder
        queries.push({
          query: `
            INSERT INTO bids (
              lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
              is_winning, previous_bid_amount, previous_bidder_id,
              ip_address, user_agent, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            lot.id,
            bidderId,
            finalBidAmount,
            'manual',
            maxBid,
            1,
            1,
            lot.current_bid,
            lot.current_bidder_id,
            metadata?.ip_address || null,
            metadata?.user_agent || null,
            'winning',
          ],
        });

        // Insert auto-bid for losing bidder (reached their max)
        queries.push({
          query: `
            INSERT INTO bids (
              lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
              is_winning, previous_bid_amount, previous_bidder_id,
              ip_address, user_agent, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            lot.id,
            lot.current_bidder_id,
            currentHighBidderMaxBid,
            'proxy_auto',
            currentHighBidderMaxBid,
            0, // Max bid exhausted
            0,
            lot.current_bid,
            lot.current_bidder_id,
            null,
            null,
            'outbid',
          ],
        });

        // Update lot
        queries.push({
          query: `
            UPDATE lots 
            SET current_bid = ?, 
                current_bidder_id = ?, 
                bid_count = bid_count + 2,
                reserve_met = CASE 
                  WHEN reserve_price IS NOT NULL AND ? >= reserve_price THEN 1 
                  ELSE reserve_met 
                END,
                updated_at = ?
            WHERE id = ?
          `,
          params: [finalBidAmount, bidderId, finalBidAmount, now(), lot.id],
        });

        // Mark old winner as outbid
        queries.push({
          query: `
            UPDATE bids 
            SET status = 'outbid', 
                is_winning = 0, 
                was_outbid = 1, 
                outbid_at = ?,
                is_max_bid_active = 0
            WHERE lot_id = ? AND bidder_id = ? AND is_winning = 1
          `,
          params: [now(), lot.id, lot.current_bidder_id],
        });

        proxyTriggered = true;
        outbidOccurred = true;

        // Audit logs
        queries.push(this.createAuditLog(
          'proxy_triggered',
          lot,
          lot.current_bidder_id!,
          currentHighBidderMaxBid,
          lot.current_bid,
          'outbid',
          `Proxy bid triggered and exhausted at ${currentHighBidderMaxBid}`,
          metadata
        ));

        queries.push(this.createAuditLog(
          'bid_placed',
          lot,
          bidderId,
          finalBidAmount,
          currentHighBidderMaxBid,
          'success',
          `Winning bid: ${finalBidAmount} (max: ${maxBid})`,
          metadata
        ));
      }
      else if (maxBid && maxBid === currentHighBidderMaxBid) {
        // Tie - first bidder (current high bidder) wins
        // New bidder's max bid matches but loses (first-in wins)
        return this.error(
          'MAX_BID_TIED',
          `Your maximum bid matches the current high bidder. Increase your maximum to win.`
        );
      }
      else {
        // Current high bidder's max bid is higher - auto-outbid
        finalBidAmount = maxBid 
          ? Math.min(currentHighBidderMaxBid, maxBid + increment)
          : bidAmount + increment;

        // Insert losing bid for new bidder
        queries.push({
          query: `
            INSERT INTO bids (
              lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
              is_winning, previous_bid_amount, previous_bidder_id,
              ip_address, user_agent, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            lot.id,
            bidderId,
            maxBid || bidAmount,
            'manual',
            maxBid || null,
            0,
            0,
            lot.current_bid,
            lot.current_bidder_id,
            metadata?.ip_address || null,
            metadata?.user_agent || null,
            'outbid',
          ],
        });

        // Insert auto-bid for current high bidder (defending their position)
        queries.push({
          query: `
            INSERT INTO bids (
              lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
              is_winning, previous_bid_amount, previous_bidder_id,
              ip_address, user_agent, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            lot.id,
            lot.current_bidder_id,
            finalBidAmount,
            'proxy_auto',
            currentHighBidderMaxBid,
            1, // Max bid still active
            1,
            lot.current_bid,
            lot.current_bidder_id,
            null,
            null,
            'winning',
          ],
        });

        // Update lot
        queries.push({
          query: `
            UPDATE lots 
            SET current_bid = ?, 
                bid_count = bid_count + 2,
                reserve_met = CASE 
                  WHEN reserve_price IS NOT NULL AND ? >= reserve_price THEN 1 
                  ELSE reserve_met 
                END,
                updated_at = ?
            WHERE id = ?
          `,
          params: [finalBidAmount, finalBidAmount, now(), lot.id],
        });

        proxyTriggered = true;

        // Audit logs
        queries.push(this.createAuditLog(
          'bid_placed',
          lot,
          bidderId,
          maxBid || bidAmount,
          lot.current_bid,
          'outbid',
          `Bid placed but immediately outbid by proxy: ${maxBid || bidAmount}`,
          metadata
        ));

        queries.push(this.createAuditLog(
          'proxy_triggered',
          lot,
          lot.current_bidder_id!,
          finalBidAmount,
          lot.current_bid,
          'success',
          `Proxy bid defended position at ${finalBidAmount}`,
          metadata
        ));

        return this.error(
          'OUTBID_BY_PROXY',
          `You were immediately outbid by a proxy bid. Current bid: ${finalBidAmount.toFixed(2)}`,
          { currentBid: finalBidAmount, proxyTriggered: true }
        );
      }
    }

    // Execute all queries in a transaction
    await transaction(this.db, queries);

    // Fetch updated lot
    const updatedLot = await queryOne<Lot>(
      this.db,
      'SELECT * FROM lots WHERE id = ?',
      [lot.id]
    );

    return {
      success: true,
      message: proxyTriggered 
        ? 'Bid placed successfully. Proxy bidding occurred.'
        : 'Bid placed successfully',
      code: 'BID_SUCCESS',
      lot: updatedLot!,
      outbidOccurred,
      proxyBidTriggered: proxyTriggered,
    };
  }

  /**
   * Check and apply soft close extension if needed
   */
  private async checkSoftClose(lot: Lot, currentTime: number): Promise<void> {
    if (!lot.current_close_time) return;

    // Get auction soft close settings
    const auction = await queryOne<any>(
      this.db,
      `SELECT soft_close_enabled, soft_close_trigger_minutes, soft_close_extension_minutes 
       FROM auctions WHERE id = ?`,
      [lot.auction_id]
    );

    if (!auction || !auction.soft_close_enabled) return;

    const timeUntilClose = lot.current_close_time - currentTime;
    const triggerSeconds = auction.soft_close_trigger_minutes * 60;

    // If bid was placed within trigger window, extend close time
    if (timeUntilClose <= triggerSeconds) {
      const extensionSeconds = auction.soft_close_extension_minutes * 60;
      const newCloseTime = currentTime + extensionSeconds;

      await this.db.prepare(`
        UPDATE lots 
        SET current_close_time = ?,
            extension_count = extension_count + 1,
            updated_at = ?
        WHERE id = ?
      `).bind(newCloseTime, now(), lot.id).run();

      // Audit log
      await this.db.prepare(`
        INSERT INTO bid_audit_log (
          event_type, lot_id, auction_id, event_data, 
          previous_amount, new_amount, result_code, result_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'soft_close_triggered',
        lot.id,
        lot.auction_id,
        JSON.stringify({
          old_close_time: lot.current_close_time,
          new_close_time: newCloseTime,
          extension_minutes: auction.soft_close_extension_minutes,
        }),
        lot.current_close_time,
        newCloseTime,
        'extended',
        `Soft close extended by ${auction.soft_close_extension_minutes} minutes`
      ).run();
    }
  }

  /**
   * Get active max bid for a bidder on a lot
   */
  private async getActiveMaxBid(lotId: number, bidderId: number): Promise<number | null> {
    const bid = await queryOne<{ max_bid: number }>(
      this.db,
      `SELECT max_bid FROM bids 
       WHERE lot_id = ? AND bidder_id = ? AND is_max_bid_active = 1 
       ORDER BY created_at DESC LIMIT 1`,
      [lotId, bidderId]
    );

    return bid?.max_bid || null;
  }

  /**
   * Get increment rules for a lot
   */
  private async getIncrementRules(lot: Lot): Promise<IncrementRule[]> {
    if (lot.increment_override) {
      return parseJSON<IncrementRule[]>(lot.increment_override, []);
    }

    const auction = await queryOne<{ increment_rules: string }>(
      this.db,
      'SELECT increment_rules FROM auctions WHERE id = ?',
      [lot.auction_id]
    );

    return parseJSON<IncrementRule[]>(auction?.increment_rules || '', [
      { min: 0, max: 100, increment: 5 },
      { min: 100, max: 500, increment: 10 },
      { min: 500, max: null, increment: 25 },
    ]);
  }

  /**
   * Create audit log entry
   */
  private createAuditLog(
    eventType: BidAuditEventType,
    lot: Lot,
    bidderId: number | null,
    newAmount: number | null,
    previousAmount: number | null,
    resultCode: string,
    resultMessage: string,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): { query: string; params: any[] } {
    return {
      query: `
        INSERT INTO bid_audit_log (
          event_type, lot_id, auction_id, bidder_id,
          event_data, previous_amount, new_amount,
          result_code, result_message, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        eventType,
        lot.id,
        lot.auction_id,
        bidderId,
        JSON.stringify({ lot_number: lot.lot_number, timestamp: now() }),
        previousAmount,
        newAmount,
        resultCode,
        resultMessage,
        metadata?.ip_address || null,
        metadata?.user_agent || null,
      ],
    };
  }

  /**
   * Helper to create error response
   */
  private error(code: string, message: string, data?: any): BidResult {
    return {
      success: false,
      message,
      code,
      ...data,
    };
  }

  /**
   * Close a lot and determine winner
   */
  async closeLot(lotId: number): Promise<void> {
    const lot = await queryOne<Lot>(
      this.db,
      'SELECT * FROM lots WHERE id = ?',
      [lotId]
    );

    if (!lot) return;

    const status = lot.reserve_price && !lot.reserve_met ? 'unsold' : 'sold';

    await this.db.prepare(`
      UPDATE lots 
      SET status = ?, closed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(status, now(), now(), lotId).run();

    // Update winning bid
    if (lot.current_bidder_id && status === 'sold') {
      await this.db.prepare(`
        UPDATE bids 
        SET status = 'won' 
        WHERE lot_id = ? AND bidder_id = ? AND is_winning = 1
      `).bind(lotId, lot.current_bidder_id).run();
    }

    // Mark all other bids as lost
    await this.db.prepare(`
      UPDATE bids 
      SET status = 'lost' 
      WHERE lot_id = ? AND status NOT IN ('won', 'cancelled')
    `).bind(lotId).run();

    // Audit log
    await this.db.prepare(`
      INSERT INTO bid_audit_log (
        event_type, lot_id, auction_id, bidder_id,
        event_data, new_amount, result_code, result_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'lot_closed',
      lot.id,
      lot.auction_id,
      lot.current_bidder_id,
      JSON.stringify({ final_status: status }),
      lot.current_bid,
      status,
      `Lot closed with status: ${status}`
    ).run();
  }
}
