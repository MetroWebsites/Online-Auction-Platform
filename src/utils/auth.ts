/**
 * JWT and authentication utilities
 */

import type { AuthPayload, UserRole } from '../types';
import { now, addSeconds, hashString } from './db';

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };

/**
 * Create a JWT token
 */
export async function createJWT(
  payload: AuthPayload,
  secret: string,
  expiresIn: number = 86400 // 24 hours default
): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const claims = {
    ...payload,
    iat: now(),
    exp: addSeconds(expiresIn),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  
  const signature = await sign(`${encodedHeader}.${encodedPayload}`, secret);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(
  token: string,
  secret: string
): Promise<AuthPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const expectedSignature = await sign(`${encodedHeader}.${encodedPayload}`, secret);
    if (signature !== expectedSignature) {
      return null;
    }

    // Decode and verify payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    
    // Check expiration
    if (payload.exp && now() > payload.exp) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * Sign a string with HMAC-SHA256
 */
async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    ALGORITHM,
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    ALGORITHM.name,
    key,
    encoder.encode(data)
  );

  return base64UrlEncode(signature);
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(input: string | ArrayBuffer): string {
  let base64: string;
  
  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    base64 = btoa(binary);
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(input: string): string {
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(base64 + padding);
}

/**
 * Hash password using bcrypt-like approach (simplified for Workers)
 */
export async function hashPassword(password: string): Promise<string> {
  // In production, use a proper password hashing library
  // For now, we'll use multiple rounds of SHA-256
  let hash = password;
  for (let i = 0; i < 10; i++) {
    hash = await hashString(hash + password);
  }
  return hash;
}

/**
 * Verify password against hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

/**
 * Generate secure random password
 */
export function generatePassword(length: number = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    guest: 0,
    bidder: 1,
    staff: 2,
    admin: 3,
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Generate email verification token
 */
export function generateVerificationToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate MFA secret (base32 encoded)
 */
export function generateMFASecret(): string {
  const array = new Uint8Array(20);
  crypto.getRandomValues(array);
  return base32Encode(array);
}

/**
 * Base32 encode (for MFA secrets)
 */
function base32Encode(buffer: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Rate limiting helper - check if action is allowed
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  
  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}
  
  isAllowed(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Filter out old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    
    return true;
  }
  
  reset(key: string): void {
    this.attempts.delete(key);
  }
}

/**
 * Create a rate limiter for bidding
 */
export const bidRateLimiter = new RateLimiter(10, 60000); // 10 bids per minute

/**
 * Create a rate limiter for authentication
 */
export const authRateLimiter = new RateLimiter(5, 300000); // 5 attempts per 5 minutes
