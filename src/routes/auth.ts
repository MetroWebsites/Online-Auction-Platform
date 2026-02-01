/**
 * Authentication Routes
 * 
 * Handles:
 * - User registration
 * - Email verification
 * - Login with JWT
 * - Password reset
 * - MFA (optional)
 * - Profile management
 */

import { Hono } from 'hono';
import type { HonoContext } from '../types';
import {
  createJWT,
  hashPassword,
  verifyPassword,
  generateVerificationToken,
  authRateLimiter,
} from '../utils/auth';
import {
  queryOne,
  executeWrite,
  now,
  addSeconds,
  isValidEmail,
  generateToken,
  hashString,
  isExpired,
} from '../utils/db';
import { authenticate, requireEmailVerified } from '../middleware/auth';

const auth = new Hono<HonoContext>();

/**
 * POST /api/auth/register
 * Register a new user
 */
auth.post('/register', async (c) => {
  const body = await c.req.json();
  const { email, password, first_name, last_name, phone } = body;

  // Validate input
  if (!email || !password) {
    return c.json({ success: false, error: 'Email and password required' }, 400);
  }

  if (!isValidEmail(email)) {
    return c.json({ success: false, error: 'Invalid email format' }, 400);
  }

  if (password.length < 8) {
    return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400);
  }

  // Rate limiting
  if (!authRateLimiter.isAllowed(`register:${email}`)) {
    return c.json({ success: false, error: 'Too many registration attempts' }, 429);
  }

  // Check if user exists
  const existing = await queryOne(
    c.env.DB,
    'SELECT id FROM users WHERE email = ?',
    [email.toLowerCase()]
  );

  if (existing) {
    return c.json({ success: false, error: 'Email already registered' }, 400);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate verification token
  const verificationToken = generateVerificationToken();
  const verificationExpires = addSeconds(86400); // 24 hours

  // Create user
  const result = await executeWrite(
    c.env.DB,
    `INSERT INTO users (
      email, password_hash, role, first_name, last_name, phone,
      email_verification_token, email_verification_expires, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      email.toLowerCase(),
      passwordHash,
      'bidder',
      first_name || null,
      last_name || null,
      phone || null,
      verificationToken,
      verificationExpires,
      'active',
    ]
  );

  const userId = result.meta.last_row_id as number;

  // Create default notification preferences
  await executeWrite(
    c.env.DB,
    'INSERT INTO notification_preferences (user_id) VALUES (?)',
    [userId]
  );

  // TODO: Send verification email
  console.log(`Verification token for ${email}: ${verificationToken}`);

  // Create JWT token
  const token = await createJWT(
    { userId, email: email.toLowerCase(), role: 'bidder' },
    c.env.JWT_SECRET
  );

  return c.json({
    success: true,
    message: 'Registration successful. Please verify your email.',
    data: {
      user: {
        id: userId,
        email: email.toLowerCase(),
        role: 'bidder',
        email_verified: false,
      },
      token,
      verificationRequired: true,
    },
  });
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
auth.post('/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  // Validate input
  if (!email || !password) {
    return c.json({ success: false, error: 'Email and password required' }, 400);
  }

  // Rate limiting
  if (!authRateLimiter.isAllowed(`login:${email}`)) {
    return c.json({ success: false, error: 'Too many login attempts' }, 429);
  }

  // Find user
  const user = await queryOne<any>(
    c.env.DB,
    `SELECT id, email, password_hash, role, status, email_verified, mfa_enabled
     FROM users WHERE email = ?`,
    [email.toLowerCase()]
  );

  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }

  // Check status
  if (user.status !== 'active') {
    return c.json({ success: false, error: 'Account is suspended or banned' }, 403);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }

  // TODO: Handle MFA if enabled
  if (user.mfa_enabled) {
    return c.json({
      success: false,
      error: 'MFA required',
      code: 'MFA_REQUIRED',
      userId: user.id,
    }, 200);
  }

  // Update last login
  await executeWrite(
    c.env.DB,
    'UPDATE users SET last_login_at = ? WHERE id = ?',
    [now(), user.id]
  );

  // Create JWT token
  const token = await createJWT(
    { userId: user.id, email: user.email, role: user.role },
    c.env.JWT_SECRET
  );

  // Store session
  const tokenHash = await hashString(token);
  await executeWrite(
    c.env.DB,
    `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      user.id,
      tokenHash,
      c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      c.req.header('User-Agent'),
      addSeconds(86400), // 24 hours
    ]
  );

  return c.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        email_verified: user.email_verified === 1,
      },
      token,
    },
  });
});

/**
 * POST /api/auth/verify-email
 * Verify email with token
 */
auth.post('/verify-email', async (c) => {
  const body = await c.req.json();
  const { token } = body;

  if (!token) {
    return c.json({ success: false, error: 'Verification token required' }, 400);
  }

  // Find user with token
  const user = await queryOne<any>(
    c.env.DB,
    `SELECT id, email, email_verification_expires 
     FROM users WHERE email_verification_token = ?`,
    [token]
  );

  if (!user) {
    return c.json({ success: false, error: 'Invalid verification token' }, 400);
  }

  // Check expiration
  if (user.email_verification_expires && isExpired(user.email_verification_expires)) {
    return c.json({ success: false, error: 'Verification token expired' }, 400);
  }

  // Mark as verified
  await executeWrite(
    c.env.DB,
    `UPDATE users 
     SET email_verified = 1, 
         email_verification_token = NULL, 
         email_verification_expires = NULL,
         updated_at = ?
     WHERE id = ?`,
    [now(), user.id]
  );

  return c.json({
    success: true,
    message: 'Email verified successfully',
  });
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
auth.post('/resend-verification', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  // Check if already verified
  const dbUser = await queryOne<any>(
    c.env.DB,
    'SELECT email_verified FROM users WHERE id = ?',
    [user.userId]
  );

  if (dbUser?.email_verified) {
    return c.json({ success: false, error: 'Email already verified' }, 400);
  }

  // Generate new token
  const verificationToken = generateVerificationToken();
  const verificationExpires = addSeconds(86400);

  await executeWrite(
    c.env.DB,
    `UPDATE users 
     SET email_verification_token = ?, 
         email_verification_expires = ?,
         updated_at = ?
     WHERE id = ?`,
    [verificationToken, verificationExpires, now(), user.userId]
  );

  // TODO: Send verification email
  console.log(`Verification token for ${user.email}: ${verificationToken}`);

  return c.json({
    success: true,
    message: 'Verification email sent',
  });
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
auth.post('/forgot-password', async (c) => {
  const body = await c.req.json();
  const { email } = body;

  if (!email) {
    return c.json({ success: false, error: 'Email required' }, 400);
  }

  // Rate limiting
  if (!authRateLimiter.isAllowed(`reset:${email}`)) {
    return c.json({ success: false, error: 'Too many reset attempts' }, 429);
  }

  // Find user
  const user = await queryOne<any>(
    c.env.DB,
    'SELECT id FROM users WHERE email = ?',
    [email.toLowerCase()]
  );

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({
      success: true,
      message: 'If an account exists, a password reset link has been sent',
    });
  }

  // Generate reset token
  const resetToken = generateToken();
  const resetExpires = addSeconds(3600); // 1 hour

  await executeWrite(
    c.env.DB,
    `UPDATE users 
     SET password_reset_token = ?, 
         password_reset_expires = ?,
         updated_at = ?
     WHERE id = ?`,
    [resetToken, resetExpires, now(), user.id]
  );

  // TODO: Send reset email
  console.log(`Password reset token for ${email}: ${resetToken}`);

  return c.json({
    success: true,
    message: 'If an account exists, a password reset link has been sent',
  });
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
auth.post('/reset-password', async (c) => {
  const body = await c.req.json();
  const { token, password } = body;

  if (!token || !password) {
    return c.json({ success: false, error: 'Token and password required' }, 400);
  }

  if (password.length < 8) {
    return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400);
  }

  // Find user with token
  const user = await queryOne<any>(
    c.env.DB,
    `SELECT id, password_reset_expires 
     FROM users WHERE password_reset_token = ?`,
    [token]
  );

  if (!user) {
    return c.json({ success: false, error: 'Invalid reset token' }, 400);
  }

  // Check expiration
  if (user.password_reset_expires && isExpired(user.password_reset_expires)) {
    return c.json({ success: false, error: 'Reset token expired' }, 400);
  }

  // Hash new password
  const passwordHash = await hashPassword(password);

  // Update password and clear reset token
  await executeWrite(
    c.env.DB,
    `UPDATE users 
     SET password_hash = ?, 
         password_reset_token = NULL, 
         password_reset_expires = NULL,
         updated_at = ?
     WHERE id = ?`,
    [passwordHash, now(), user.id]
  );

  // Invalidate all sessions
  await executeWrite(
    c.env.DB,
    'DELETE FROM user_sessions WHERE user_id = ?',
    [user.id]
  );

  return c.json({
    success: true,
    message: 'Password reset successfully',
  });
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
auth.get('/me', authenticate, async (c) => {
  const authUser = c.get('user');
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const user = await queryOne<any>(
    c.env.DB,
    `SELECT id, email, role, first_name, last_name, phone,
            address_line1, address_line2, city, state, zip_code, country,
            email_verified, phone_verified, mfa_enabled, status, created_at
     FROM users WHERE id = ?`,
    [authUser.userId]
  );

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...user,
      email_verified: user.email_verified === 1,
      phone_verified: user.phone_verified === 1,
      mfa_enabled: user.mfa_enabled === 1,
    },
  });
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
auth.put('/profile', authenticate, async (c) => {
  const authUser = c.get('user');
  if (!authUser) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json();
  const {
    first_name,
    last_name,
    phone,
    address_line1,
    address_line2,
    city,
    state,
    zip_code,
    country,
  } = body;

  await executeWrite(
    c.env.DB,
    `UPDATE users 
     SET first_name = ?, last_name = ?, phone = ?,
         address_line1 = ?, address_line2 = ?, city = ?,
         state = ?, zip_code = ?, country = ?, updated_at = ?
     WHERE id = ?`,
    [
      first_name || null,
      last_name || null,
      phone || null,
      address_line1 || null,
      address_line2 || null,
      city || null,
      state || null,
      zip_code || null,
      country || 'US',
      now(),
      authUser.userId,
    ]
  );

  return c.json({
    success: true,
    message: 'Profile updated successfully',
  });
});

/**
 * POST /api/auth/logout
 * Logout (invalidate session)
 */
auth.post('/logout', authenticate, async (c) => {
  const authUser = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1];

  if (token) {
    const tokenHash = await hashString(token);
    await executeWrite(
      c.env.DB,
      'DELETE FROM user_sessions WHERE user_id = ? AND token_hash = ?',
      [authUser!.userId, tokenHash]
    );
  }

  return c.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default auth;
