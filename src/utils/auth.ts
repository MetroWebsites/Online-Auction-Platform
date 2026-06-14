// Authentication utilities for BB Realty & Auctions

export interface JWTPayload {
  userId: number
  email: string
  role: 'admin' | 'clerk' | 'auctioneer' | 'bidder'
  type: 'user' | 'bidder'
  iat?: number
  exp?: number
}

// Simple JWT encoding (for Cloudflare Workers environment)
// Note: In production, use a proper JWT library or Web Crypto API
export function encodeJWT(payload: JWTPayload, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  
  const encodedHeader = base64urlEncode(JSON.stringify(header))
  const encodedPayload = base64urlEncode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  }))
  
  const signature = base64urlEncode(
    hmacSHA256(`${encodedHeader}.${encodedPayload}`, secret)
  )
  
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function decodeJWT(token: string, secret: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    
    const [encodedHeader, encodedPayload, signature] = parts
    
    // Verify signature
    const expectedSignature = base64urlEncode(
      hmacSHA256(`${encodedHeader}.${encodedPayload}`, secret)
    )
    
    if (signature !== expectedSignature) return null
    
    const payload = JSON.parse(base64urlDecode(encodedPayload))
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    
    return payload
  } catch {
    return null
  }
}

// Base64 URL encoding
function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) {
    str += '='
  }
  return atob(str)
}

// Simple HMAC SHA256 (using Web Crypto API)
function hmacSHA256(data: string, secret: string): string {
  // This is a simplified version
  // In production, use Web Crypto API: crypto.subtle.sign()
  let hash = 0
  const combined = data + secret
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

// Password hashing with bcrypt
// Note: bcryptjs works in Node.js environment
// For Cloudflare Workers, we'll need a compatible implementation
export async function hashPassword(password: string): Promise<string> {
  // Placeholder - will implement with bcryptjs in Node.js build
  const bcrypt = await import('bcryptjs')
  return bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  // Placeholder - will implement with bcryptjs in Node.js build
  const bcrypt = await import('bcryptjs')
  return bcrypt.compare(password, hash)
}

// Generate random token
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

// Generate slug from text
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
