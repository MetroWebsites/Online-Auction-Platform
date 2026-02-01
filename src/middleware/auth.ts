/**
 * Authentication middleware
 */

import { createMiddleware } from 'hono/factory';
import type { HonoContext, UserRole } from '../types';
import { verifyJWT, extractToken, hasRole } from '../utils/auth';
import { queryOne } from '../utils/db';

/**
 * Authenticate user from JWT token
 */
export const authenticate = createMiddleware<HonoContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = extractToken(authHeader);
  
  if (!token) {
    return c.json({ success: false, error: 'No token provided' }, 401);
  }
  
  const jwtSecret = c.env.JWT_SECRET;
  const payload = await verifyJWT(token, jwtSecret);
  
  if (!payload) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
  
  // Verify user still exists and is active
  const user = await queryOne(
    c.env.DB,
    'SELECT id, email, role, status FROM users WHERE id = ?',
    [payload.userId]
  );
  
  if (!user || user.status !== 'active') {
    return c.json({ success: false, error: 'User not found or inactive' }, 401);
  }
  
  c.set('user', payload);
  await next();
});

/**
 * Require specific role or higher
 */
export const requireRole = (role: UserRole) => {
  return createMiddleware<HonoContext>(async (c, next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json({ success: false, error: 'Not authenticated' }, 401);
    }
    
    if (!hasRole(user.role, role)) {
      return c.json({ success: false, error: 'Insufficient permissions' }, 403);
    }
    
    await next();
  });
};

/**
 * Require admin role
 */
export const requireAdmin = requireRole('admin');

/**
 * Require staff role or higher
 */
export const requireStaff = requireRole('staff');

/**
 * Require bidder role or higher
 */
export const requireBidder = requireRole('bidder');

/**
 * Optional authentication (set user if token present)
 */
export const optionalAuth = createMiddleware<HonoContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = extractToken(authHeader);
  
  if (token) {
    const jwtSecret = c.env.JWT_SECRET;
    const payload = await verifyJWT(token, jwtSecret);
    
    if (payload) {
      const user = await queryOne(
        c.env.DB,
        'SELECT id, email, role, status FROM users WHERE id = ?',
        [payload.userId]
      );
      
      if (user && user.status === 'active') {
        c.set('user', payload);
      }
    }
  }
  
  await next();
});

/**
 * Require email verification
 */
export const requireEmailVerified = createMiddleware<HonoContext>(async (c, next) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }
  
  const dbUser = await queryOne(
    c.env.DB,
    'SELECT email_verified FROM users WHERE id = ?',
    [user.userId]
  );
  
  if (!dbUser || !dbUser.email_verified) {
    return c.json({
      success: false,
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    }, 403);
  }
  
  await next();
});
