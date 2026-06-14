// Authentication routes
import { Hono } from 'hono'
import { hashPassword, comparePassword, encodeJWT, generateToken } from '../utils/auth'
import { JWT_SECRET_EXPORT } from '../middleware/auth'
import { rateLimitMiddleware } from '../middleware/auth'

type Bindings = {
  DB: D1Database
}

const auth = new Hono<{ Bindings: Bindings }>()

// Apply rate limiting to auth routes
auth.use('/*', rateLimitMiddleware(10, 60000)) // 10 requests per minute

// Admin/User login
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    
    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password required' }, 400)
    }
    
    const db = c.env.DB
    
    // Find user
    const user = await db.prepare(
      'SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first()
    
    if (!user) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }
    
    // Check status
    if (user.status !== 'active') {
      return c.json({ success: false, error: 'Account is not active' }, 403)
    }
    
    // Verify password
    const isValid = await comparePassword(password, user.password_hash as string)
    
    if (!isValid) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }
    
    // Generate JWT
    const token = encodeJWT({
      userId: user.id as number,
      email: user.email as string,
      role: user.role as any,
      type: 'user'
    }, JWT_SECRET_EXPORT)
    
    // Log activity
    await db.prepare(
      'INSERT INTO activity_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).bind(
      user.id,
      'login',
      JSON.stringify({ method: 'password' }),
      c.req.header('CF-Connecting-IP') || 'unknown'
    ).run()
    
    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Bidder login
auth.post('/bidder/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    
    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password required' }, 400)
    }
    
    const db = c.env.DB
    
    // Find bidder
    const bidder = await db.prepare(
      'SELECT id, email, password_hash, full_name, status, has_card_on_file, email_verified FROM bidders WHERE email = ?'
    ).bind(email.toLowerCase()).first()
    
    if (!bidder) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }
    
    // Check status
    if (bidder.status !== 'active') {
      return c.json({ success: false, error: 'Account is not active' }, 403)
    }
    
    // Verify password
    const isValid = await comparePassword(password, bidder.password_hash as string)
    
    if (!isValid) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }
    
    // Generate JWT
    const token = encodeJWT({
      userId: bidder.id as number,
      email: bidder.email as string,
      role: 'bidder',
      type: 'bidder'
    }, JWT_SECRET_EXPORT)
    
    // Log activity
    await db.prepare(
      'INSERT INTO activity_log (bidder_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).bind(
      bidder.id,
      'login',
      JSON.stringify({ method: 'password' }),
      c.req.header('CF-Connecting-IP') || 'unknown'
    ).run()
    
    return c.json({
      success: true,
      token,
      bidder: {
        id: bidder.id,
        email: bidder.email,
        fullName: bidder.full_name,
        hasCardOnFile: bidder.has_card_on_file,
        emailVerified: bidder.email_verified
      }
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Bidder registration
auth.post('/bidder/register', async (c) => {
  try {
    const { email, password, fullName, phone } = await c.req.json()
    
    if (!email || !password || !fullName) {
      return c.json({ success: false, error: 'Email, password, and full name required' }, 400)
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return c.json({ success: false, error: 'Invalid email format' }, 400)
    }
    
    // Validate password strength
    if (password.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400)
    }
    
    const db = c.env.DB
    
    // Check if email already exists
    const existing = await db.prepare(
      'SELECT id FROM bidders WHERE email = ?'
    ).bind(email.toLowerCase()).first()
    
    if (existing) {
      return c.json({ success: false, error: 'Email already registered' }, 409)
    }
    
    // Hash password
    const passwordHash = await hashPassword(password)
    
    // Create bidder
    const result = await db.prepare(
      'INSERT INTO bidders (email, password_hash, full_name, phone, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      email.toLowerCase(),
      passwordHash,
      fullName,
      phone || null,
      'active'
    ).run()
    
    const bidderId = result.meta.last_row_id
    
    // Generate JWT
    const token = encodeJWT({
      userId: bidderId,
      email: email.toLowerCase(),
      role: 'bidder',
      type: 'bidder'
    }, JWT_SECRET_EXPORT)
    
    // Log activity
    await db.prepare(
      'INSERT INTO activity_log (bidder_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
    ).bind(
      bidderId,
      'register',
      JSON.stringify({ method: 'email' }),
      c.req.header('CF-Connecting-IP') || 'unknown'
    ).run()
    
    return c.json({
      success: true,
      token,
      bidder: {
        id: bidderId,
        email: email.toLowerCase(),
        fullName,
        hasCardOnFile: false,
        emailVerified: false
      }
    }, 201)
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Get current user info
auth.get('/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.substring(7)
    const { decodeJWT } = await import('../utils/auth')
    const payload = decodeJWT(token, JWT_SECRET_EXPORT)
    
    if (!payload) {
      return c.json({ success: false, error: 'Invalid token' }, 401)
    }
    
    const db = c.env.DB
    
    if (payload.type === 'user') {
      const user = await db.prepare(
        'SELECT id, email, full_name, role, status FROM users WHERE id = ?'
      ).bind(payload.userId).first()
      
      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404)
      }
      
      return c.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          status: user.status,
          type: 'user'
        }
      })
    } else {
      const bidder = await db.prepare(
        'SELECT id, email, full_name, phone, has_card_on_file, card_last_four, card_brand, status, email_verified FROM bidders WHERE id = ?'
      ).bind(payload.userId).first()
      
      if (!bidder) {
        return c.json({ success: false, error: 'Bidder not found' }, 404)
      }
      
      return c.json({
        success: true,
        user: {
          id: bidder.id,
          email: bidder.email,
          fullName: bidder.full_name,
          phone: bidder.phone,
          hasCardOnFile: bidder.has_card_on_file,
          cardLastFour: bidder.card_last_four,
          cardBrand: bidder.card_brand,
          status: bidder.status,
          emailVerified: bidder.email_verified,
          type: 'bidder'
        }
      })
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

export default auth
