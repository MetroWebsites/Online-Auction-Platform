/**
 * Bidding Engine Tests
 * Tests for core bidding logic including proxy bidding, concurrency, soft close
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_URL = 'http://localhost:3000/api';
let authToken: string;
let testAuctionId: number;
let testLotId: number;
let bidder1Token: string;
let bidder2Token: string;

beforeAll(async () => {
  // Register admin user
  const adminRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'TestPass123!',
      name: 'Admin User'
    })
  });
  const adminData = await adminRes.json();
  authToken = adminData.token;

  // Create test auction
  const auctionRes = await fetch(`${API_URL}/auctions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      title: 'Test Auction',
      start_date: Math.floor(Date.now() / 1000),
      end_date: Math.floor(Date.now() / 1000) + 3600,
      soft_close_enabled: true,
      soft_close_trigger_minutes: 5,
      soft_close_extension_minutes: 5
    })
  });
  const auctionData = await auctionRes.json();
  testAuctionId = auctionData.data.id;

  // Create test lot
  const lotRes = await fetch(`${API_URL}/lots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      auction_id: testAuctionId,
      lot_number: 'TEST-001',
      title: 'Test Lot',
      starting_bid: 100,
      increment_rules: [
        { min: 0, max: 500, increment: 10 },
        { min: 500, max: null, increment: 25 }
      ]
    })
  });
  const lotData = await lotRes.json();
  testLotId = lotData.data.id;

  // Register two bidders
  const bidder1Res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bidder1@test.com',
      password: 'TestPass123!',
      name: 'Bidder One'
    })
  });
  const bidder1Data = await bidder1Res.json();
  bidder1Token = bidder1Data.token;

  const bidder2Res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bidder2@test.com',
      password: 'TestPass123!',
      name: 'Bidder Two'
    })
  });
  const bidder2Data = await bidder2Res.json();
  bidder2Token = bidder2Data.token;
});

describe('Manual Bidding', () => {
  it('should place a manual bid successfully', async () => {
    const res = await fetch(`${API_URL}/bidding/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder1Token}`
      },
      body: JSON.stringify({
        lot_id: testLotId,
        amount: 110
      })
    });

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.amount).toBe(110);
    expect(data.data.is_winning).toBe(true);
  });

  it('should reject bid lower than current bid', async () => {
    const res = await fetch(`${API_URL}/bidding/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder2Token}`
      },
      body: JSON.stringify({
        lot_id: testLotId,
        amount: 105
      })
    });

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('must be at least');
  });

  it('should enforce increment rules', async () => {
    const res = await fetch(`${API_URL}/bidding/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder2Token}`
      },
      body: JSON.stringify({
        lot_id: testLotId,
        amount: 115 // Increment should be 10
      })
    });

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('increment');
  });
});

describe('Proxy Bidding', () => {
  it('should set maximum bid successfully', async () => {
    const res = await fetch(`${API_URL}/bidding/max-bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder1Token}`
      },
      body: JSON.stringify({
        lot_id: testLotId,
        max_amount: 500
      })
    });

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should auto-bid when another bidder bids', async () => {
    // Bidder 2 places bid
    const bid2Res = await fetch(`${API_URL}/bidding/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder2Token}`
      },
      body: JSON.stringify({
        lot_id: testLotId,
        amount: 120
      })
    });

    const bid2Data = await bid2Res.json();
    expect(bid2Data.success).toBe(true);

    // Check that bidder 1's proxy bid was triggered
    const historyRes = await fetch(`${API_URL}/bidding/history/${testLotId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const historyData = await historyRes.json();

    const proxyBids = historyData.data.filter((bid: any) => bid.is_proxy);
    expect(proxyBids.length).toBeGreaterThan(0);
  });

  it('should not allow self-outbidding with proxy', async () => {
    const res = await fetch(`${API_URL}/bidding/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder1Token}`
      },
      body: JSON.stringify({
        lot_id: testLotId,
        amount: 200
      })
    });

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('already winning');
  });
});

describe('Concurrency Safety', () => {
  it('should handle concurrent bids correctly', async () => {
    // Create new lot for concurrency test
    const lotRes = await fetch(`${API_URL}/lots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        auction_id: testAuctionId,
        lot_number: 'TEST-002',
        title: 'Concurrency Test Lot',
        starting_bid: 100
      })
    });
    const lotData = await lotRes.json();
    const concurrentLotId = lotData.data.id;

    // Place 10 concurrent bids
    const bidPromises = Array.from({ length: 10 }, (_, i) => {
      const token = i % 2 === 0 ? bidder1Token : bidder2Token;
      return fetch(`${API_URL}/bidding/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          lot_id: concurrentLotId,
          amount: 110 + (i * 10)
        })
      });
    });

    const results = await Promise.all(bidPromises);
    const successfulBids = (await Promise.all(
      results.map(r => r.json())
    )).filter(d => d.success);

    // Should have successful bids, but no double-wins
    expect(successfulBids.length).toBeGreaterThan(0);

    // Verify only one winning bid
    const historyRes = await fetch(`${API_URL}/bidding/history/${concurrentLotId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const historyData = await historyRes.json();
    const winningBids = historyData.data.filter((bid: any) => bid.is_winning);
    
    expect(winningBids.length).toBe(1);
  });
});

describe('Soft Close', () => {
  it('should extend auction when bid placed in trigger window', async () => {
    // Create lot ending soon
    const now = Math.floor(Date.now() / 1000);
    const auctionRes = await fetch(`${API_URL}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: 'Soft Close Test Auction',
        start_date: now,
        end_date: now + 240, // Ends in 4 minutes
        soft_close_enabled: true,
        soft_close_trigger_minutes: 5,
        soft_close_extension_minutes: 5
      })
    });
    const auctionData = await auctionRes.json();

    const lotRes = await fetch(`${API_URL}/lots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        auction_id: auctionData.data.id,
        lot_number: 'TEST-003',
        title: 'Soft Close Test Lot',
        starting_bid: 100
      })
    });
    const lotData = await lotRes.json();
    const softCloseLotId = lotData.data.id;

    // Get initial end time
    const lotBefore = await fetch(`${API_URL}/lots/${softCloseLotId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const lotBeforeData = await lotBefore.json();
    const initialEndTime = lotBeforeData.data.end_time;

    // Place bid
    await fetch(`${API_URL}/bidding/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bidder1Token}`
      },
      body: JSON.stringify({
        lot_id: softCloseLotId,
        amount: 110
      })
    });

    // Check end time was extended
    const lotAfter = await fetch(`${API_URL}/lots/${softCloseLotId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const lotAfterData = await lotAfter.json();
    const newEndTime = lotAfterData.data.end_time;

    expect(newEndTime).toBeGreaterThan(initialEndTime);
  });
});

describe('Audit Trail', () => {
  it('should create immutable audit records', async () => {
    const historyRes = await fetch(`${API_URL}/bidding/history/${testLotId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const historyData = await historyRes.json();

    expect(historyData.data.length).toBeGreaterThan(0);
    
    // Verify audit fields
    const bid = historyData.data[0];
    expect(bid).toHaveProperty('created_at');
    expect(bid).toHaveProperty('amount');
    expect(bid).toHaveProperty('user_id');
    expect(bid).toHaveProperty('lot_id');
  });

  it('should track bid metadata', async () => {
    const historyRes = await fetch(`${API_URL}/bidding/history/${testLotId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const historyData = await historyRes.json();

    const bid = historyData.data[0];
    expect(bid).toHaveProperty('is_proxy');
    expect(bid).toHaveProperty('is_winning');
  });
});
