/**
 * Database utility functions for common operations
 */

import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type { ApiResponse, PaginationParams } from '../types';

/**
 * Execute a database query with error handling
 */
export async function executeQuery<T = any>(
  db: D1Database,
  query: string,
  params: any[] = []
): Promise<D1Result<T>> {
  try {
    const stmt = db.prepare(query);
    return await stmt.bind(...params).all();
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error('Database operation failed');
  }
}

/**
 * Execute a single row query
 */
export async function queryOne<T = any>(
  db: D1Database,
  query: string,
  params: any[] = []
): Promise<T | null> {
  try {
    const stmt = db.prepare(query);
    const result = await stmt.bind(...params).first<T>();
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error('Database operation failed');
  }
}

/**
 * Execute a write operation (INSERT, UPDATE, DELETE)
 */
export async function executeWrite(
  db: D1Database,
  query: string,
  params: any[] = []
): Promise<D1Result> {
  try {
    const stmt = db.prepare(query);
    return await stmt.bind(...params).run();
  } catch (error) {
    console.error('Database write error:', error);
    throw new Error('Database operation failed');
  }
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction(
  db: D1Database,
  queries: Array<{ query: string; params: any[] }>
): Promise<D1Result[]> {
  try {
    const statements = queries.map(({ query, params }) =>
      db.prepare(query).bind(...params)
    );
    return await db.batch(statements);
  } catch (error) {
    console.error('Transaction error:', error);
    throw new Error('Transaction failed');
  }
}

/**
 * Build pagination SQL and metadata
 */
export function buildPagination(params: PaginationParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;
  
  const orderBy = params.sort || 'id';
  const order = params.order === 'desc' ? 'DESC' : 'ASC';
  
  return {
    limit,
    offset,
    page,
    orderBy,
    order,
    sql: `ORDER BY ${orderBy} ${order} LIMIT ${limit} OFFSET ${offset}`,
  };
}

/**
 * Calculate total pages for pagination
 */
export function getPaginationMeta(
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
  };
}

/**
 * Generate a unique ID (simple UUID v4)
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current Unix timestamp
 */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Format Unix timestamp to ISO string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Parse JSON safely
 */
export function parseJSON<T = any>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Create success API response
 */
export function success<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * Create error API response
 */
export function error(message: string, statusCode?: number): ApiResponse {
  return {
    success: false,
    error: message,
  };
}

/**
 * Sanitize user input (prevent SQL injection, XSS)
 */
export function sanitize(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .substring(0, 1000); // Limit length
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Hash a string (for token storage)
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random token
 */
export function generateToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Sleep for testing/delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if timestamp is expired
 */
export function isExpired(timestamp: number): boolean {
  return now() > timestamp;
}

/**
 * Add seconds to current timestamp
 */
export function addSeconds(seconds: number): number {
  return now() + seconds;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Calculate buyer's premium based on rules
 */
export function calculateBuyersPremium(
  amount: number,
  rules: Array<{ min: number; max: number | null; rate: number }>
): number {
  for (const rule of rules) {
    if (amount >= rule.min && (rule.max === null || amount < rule.max)) {
      return amount * rule.rate;
    }
  }
  return 0;
}

/**
 * Calculate bid increment based on rules
 */
export function calculateBidIncrement(
  currentBid: number,
  rules: Array<{ min: number; max: number | null; increment: number }>
): number {
  for (const rule of rules) {
    if (currentBid >= rule.min && (rule.max === null || currentBid < rule.max)) {
      return rule.increment;
    }
  }
  return 1; // Default minimum increment
}

/**
 * Get minimum next bid
 */
export function getMinimumNextBid(
  currentBid: number,
  incrementRules: Array<{ min: number; max: number | null; increment: number }>
): number {
  const increment = calculateBidIncrement(currentBid, incrementRules);
  return currentBid + increment;
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Generate invoice number
 */
export function generateInvoiceNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `INV-${dateStr}-${random}`;
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const group = String(item[key]);
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Deep clone object
 */
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
