/**
 * Error handling middleware and utilities
 */

import { createMiddleware } from 'hono/factory';
import type { HonoContext } from '../types';

/**
 * Global error handler
 */
export const errorHandler = createMiddleware<HonoContext>(async (c, next) => {
  try {
    await next();
  } catch (err) {
    console.error('Error:', err);
    
    const error = err as Error;
    
    return c.json({
      success: false,
      error: error.message || 'Internal server error',
      ...(c.env.ENVIRONMENT === 'development' && { stack: error.stack })
    }, 500);
  }
});

/**
 * 404 Not Found handler
 */
export const notFound = (c: any) => {
  return c.json({
    success: false,
    error: 'Not found',
    path: c.req.path,
  }, 404);
};

/**
 * CORS middleware
 */
export const cors = createMiddleware<HonoContext>(async (c, next) => {
  // Get origin from request
  const origin = c.req.header('Origin') || '*';
  
  // Set CORS headers
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
});

/**
 * Request logger
 */
export const logger = createMiddleware<HonoContext>(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  console.log(`${method} ${path} - ${status} (${duration}ms)`);
});

/**
 * Audit log middleware for admin actions
 */
export const auditLog = (actionType: string, resourceType: string) => {
  return createMiddleware<HonoContext>(async (c, next) => {
    await next();
    
    const user = c.get('user');
    if (!user) return;
    
    // Only log if response was successful
    if (c.res.status < 400) {
      const resourceId = c.req.param('id') || null;
      
      try {
        await c.env.DB.prepare(`
          INSERT INTO admin_audit_log (
            user_id, user_email, user_role,
            action_type, resource_type, resource_id,
            action_description, ip_address, user_agent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          user.userId,
          user.email,
          user.role,
          actionType,
          resourceType,
          resourceId,
          `${actionType} ${resourceType}${resourceId ? ` #${resourceId}` : ''}`,
          c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
          c.req.header('User-Agent')
        ).run();
      } catch (err) {
        console.error('Failed to write audit log:', err);
      }
    }
  });
};

/**
 * Rate limiting middleware
 */
export const rateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, number[]>();
  
  return createMiddleware<HonoContext>(async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') || 
               c.req.header('X-Forwarded-For') || 
               'unknown';
    
    const now = Date.now();
    const userRequests = requests.get(ip) || [];
    
    // Filter out old requests
    const recentRequests = userRequests.filter(time => now - time < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      return c.json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      }, 429);
    }
    
    recentRequests.push(now);
    requests.set(ip, recentRequests);
    
    await next();
  });
};

/**
 * Validate request body against schema
 */
export const validateBody = <T>(validator: (body: any) => { valid: boolean; errors?: string[] }) => {
  return createMiddleware<HonoContext>(async (c, next) => {
    const body = await c.req.json();
    const result = validator(body);
    
    if (!result.valid) {
      return c.json({
        success: false,
        error: 'Validation failed',
        errors: result.errors
      }, 400);
    }
    
    await next();
  });
};

/**
 * Ensure request content type is JSON
 */
export const requireJSON = createMiddleware<HonoContext>(async (c, next) => {
  const contentType = c.req.header('Content-Type');
  
  if (!contentType || !contentType.includes('application/json')) {
    return c.json({
      success: false,
      error: 'Content-Type must be application/json'
    }, 400);
  }
  
  await next();
});

/**
 * Security headers middleware
 */
export const securityHeaders = createMiddleware<HonoContext>(async (c, next) => {
  await next();
  
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});
