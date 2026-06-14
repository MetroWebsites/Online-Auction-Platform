// Authentication middleware for protected routes
import { Context, Next } from 'hono'
import { decodeJWT, JWTPayload } from '../utils/auth'

const JWT_SECRET = 'your-secret-key-change-in-production' // Move to environment variable

export interface AuthContext {
  auth: JWTPayload
}

// Authenticate user (admin/clerk/auctioneer)
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized - No token provided' }, 401)
  }
  
  const token = authHeader.substring(7)
  const payload = decodeJWT(token, JWT_SECRET)
  
  if (!payload || payload.type !== 'user') {
    return c.json({ success: false, error: 'Unauthorized - Invalid token' }, 401)
  }
  
  // Attach auth payload to context
  c.set('auth', payload)
  
  await next()
}

// Authenticate bidder
export async function bidderAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized - No token provided' }, 401)
  }
  
  const token = authHeader.substring(7)
  const payload = decodeJWT(token, JWT_SECRET)
  
  if (!payload || payload.type !== 'bidder') {
    return c.json({ success: false, error: 'Unauthorized - Invalid bidder token' }, 401)
  }
  
  // Attach auth payload to context
  c.set('auth', payload)
  
  await next()
}

// Admin-only middleware
export async function adminMiddleware(c: Context, next: Next) {
  const auth = c.get('auth') as JWTPayload
  
  if (!auth || auth.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden - Admin access required' }, 403)
  }
  
  await next()
}

// Check if bidder has credit card on file
export async function requireCreditCardMiddleware(c: Context, next: Next) {
  const auth = c.get('auth') as JWTPayload
  const db = c.env.DB as D1Database
  
  // Get bidder info
  const bidder = await db.prepare(
    'SELECT has_card_on_file FROM bidders WHERE id = ?'
  ).bind(auth.userId).first()
  
  if (!bidder || !bidder.has_card_on_file) {
    return c.json({
      success: false,
      error: 'Credit card required',
      message: 'You must add a credit card before placing bids',
      code: 'CARD_REQUIRED'
    }, 403)
  }
  
  await next()
}

// Rate limiting middleware (simple in-memory version)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimitMiddleware(maxRequests: number = 60, windowMs: number = 60000) {
  return async (c: Context, next: Next) => {
    const key = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown'
    const now = Date.now()
    
    const record = rateLimitMap.get(key)
    
    if (record && record.resetAt > now) {
      if (record.count >= maxRequests) {
        return c.json({
          success: false,
          error: 'Too many requests',
          retryAfter: Math.ceil((record.resetAt - now) / 1000)
        }, 429)
      }
      record.count++
    } else {
      rateLimitMap.set(key, {
        count: 1,
        resetAt: now + windowMs
      })
    }
    
    await next()
  }
}

export const JWT_SECRET_EXPORT = JWT_SECRET
