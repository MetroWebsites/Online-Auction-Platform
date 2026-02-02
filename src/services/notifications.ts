/**
 * Notification Service
 * Handles email, push, and in-app notifications
 */

import type { User, Lot, Auction, Bid } from '../types';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, any>;
}

/**
 * Send email notification
 * Note: Requires email service integration (e.g., SendGrid, Mailgun, Resend)
 */
export async function sendEmail(
  to: string,
  template: EmailTemplate,
  env: any
): Promise<void> {
  // Example using Resend API (requires RESEND_API_KEY in env)
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping email');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'noreply@auction-platform.com',
        to: to,
        subject: template.subject,
        html: template.html,
        text: template.text
      })
    });

    if (!response.ok) {
      throw new Error(`Email send failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

/**
 * Send push notification
 * Note: Requires web push subscription and VAPID keys
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload,
  env: any
): Promise<void> {
  // Implement Web Push Protocol
  // Requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
  console.log('Push notification:', payload);
  // Implementation would use web-push library or Cloudflare's Push API
}

/**
 * Email Templates
 */

export function getWelcomeEmail(user: User): EmailTemplate {
  return {
    subject: 'Welcome to Auction Platform!',
    html: `
      <h1>Welcome ${user.name}!</h1>
      <p>Thank you for joining our auction platform.</p>
      <p>You can now browse auctions and start bidding on items.</p>
      <p><a href="${getBaseUrl()}/bidder/">Start Browsing Auctions</a></p>
    `,
    text: `Welcome ${user.name}! Thank you for joining our auction platform.`
  };
}

export function getEmailVerificationEmail(user: User, token: string): EmailTemplate {
  const verifyUrl = `${getBaseUrl()}/verify-email?token=${token}`;
  
  return {
    subject: 'Verify Your Email Address',
    html: `
      <h1>Verify Your Email</h1>
      <p>Hi ${user.name},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link will expire in 24 hours.</p>
    `,
    text: `Hi ${user.name}, please verify your email: ${verifyUrl}`
  };
}

export function getPasswordResetEmail(user: User, token: string): EmailTemplate {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;
  
  return {
    subject: 'Reset Your Password',
    html: `
      <h1>Reset Your Password</h1>
      <p>Hi ${user.name},</p>
      <p>You requested to reset your password. Click the link below:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text: `Hi ${user.name}, reset your password: ${resetUrl}`
  };
}

export function getBidNotificationEmail(user: User, lot: Lot, bid: Bid): EmailTemplate {
  return {
    subject: `New Bid on ${lot.title}`,
    html: `
      <h1>New Bid Placed</h1>
      <p>Hi ${user.name},</p>
      <p>A new bid of $${bid.amount} has been placed on:</p>
      <h2>${lot.title}</h2>
      <p>Current bid: $${lot.current_bid}</p>
      <p><a href="${getBaseUrl()}/bidder/#lot-${lot.id}">View Lot</a></p>
    `,
    text: `New bid of $${bid.amount} placed on ${lot.title}`
  };
}

export function getOutbidNotificationEmail(user: User, lot: Lot): EmailTemplate {
  return {
    subject: `You've Been Outbid on ${lot.title}`,
    html: `
      <h1>You've Been Outbid!</h1>
      <p>Hi ${user.name},</p>
      <p>Someone has placed a higher bid on:</p>
      <h2>${lot.title}</h2>
      <p>Current bid: $${lot.current_bid}</p>
      <p><a href="${getBaseUrl()}/bidder/#lot-${lot.id}">Place a New Bid</a></p>
    `,
    text: `You've been outbid on ${lot.title}. Current bid: $${lot.current_bid}`
  };
}

export function getWinNotificationEmail(user: User, lot: Lot, auction: Auction): EmailTemplate {
  return {
    subject: `Congratulations! You Won ${lot.title}`,
    html: `
      <h1>Congratulations!</h1>
      <p>Hi ${user.name},</p>
      <p>You are the winning bidder for:</p>
      <h2>${lot.title}</h2>
      <p>Winning bid: $${lot.current_bid}</p>
      <p>Your invoice will be ready shortly.</p>
      <h3>Pickup Information:</h3>
      <p>${auction.pickup_location}</p>
      <p>${auction.pickup_instructions}</p>
      <p><a href="${getBaseUrl()}/bidder/#invoices">View Invoices</a></p>
    `,
    text: `Congratulations! You won ${lot.title} with a bid of $${lot.current_bid}`
  };
}

export function getInvoiceReadyEmail(user: User, invoiceNumber: string): EmailTemplate {
  return {
    subject: `Invoice #${invoiceNumber} Ready`,
    html: `
      <h1>Your Invoice is Ready</h1>
      <p>Hi ${user.name},</p>
      <p>Your invoice #${invoiceNumber} is now ready for payment.</p>
      <p><a href="${getBaseUrl()}/bidder/#invoices">View Invoice</a></p>
    `,
    text: `Your invoice #${invoiceNumber} is ready`
  };
}

export function getAuctionStartingSoonEmail(user: User, auction: Auction): EmailTemplate {
  return {
    subject: `Auction Starting Soon: ${auction.title}`,
    html: `
      <h1>Auction Starting Soon</h1>
      <p>Hi ${user.name},</p>
      <p>The auction you're watching is starting soon:</p>
      <h2>${auction.title}</h2>
      <p>Start time: ${new Date(auction.start_date * 1000).toLocaleString()}</p>
      <p><a href="${getBaseUrl()}/bidder/#auction-${auction.id}">View Auction</a></p>
    `,
    text: `Auction starting soon: ${auction.title}`
  };
}

export function getAuctionEndingSoonEmail(user: User, auction: Auction): EmailTemplate {
  return {
    subject: `Auction Ending Soon: ${auction.title}`,
    html: `
      <h1>Auction Ending Soon!</h1>
      <p>Hi ${user.name},</p>
      <p>The auction is ending in 1 hour:</p>
      <h2>${auction.title}</h2>
      <p>Don't miss your chance to bid!</p>
      <p><a href="${getBaseUrl()}/bidder/#auction-${auction.id}">View Auction</a></p>
    `,
    text: `Auction ending soon: ${auction.title}`
  };
}

/**
 * Push Notification Payloads
 */

export function getBidNotificationPayload(lot: Lot, bid: Bid): NotificationPayload {
  return {
    title: 'New Bid Placed',
    body: `$${bid.amount} bid on ${lot.title}`,
    url: `/bidder/#lot-${lot.id}`
  };
}

export function getOutbidNotificationPayload(lot: Lot): NotificationPayload {
  return {
    title: 'You\'ve Been Outbid!',
    body: `Someone outbid you on ${lot.title}`,
    url: `/bidder/#lot-${lot.id}`
  };
}

export function getWinNotificationPayload(lot: Lot): NotificationPayload {
  return {
    title: 'Congratulations!',
    body: `You won ${lot.title}!`,
    url: `/bidder/#invoices`
  };
}

/**
 * Notification Preferences
 */

export interface NotificationPreferences {
  email_outbid: boolean;
  email_won: boolean;
  email_invoice: boolean;
  email_auction_ending: boolean;
  push_outbid: boolean;
  push_won: boolean;
  push_lot_ending: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_outbid: true,
  email_won: true,
  email_invoice: true,
  email_auction_ending: true,
  push_outbid: true,
  push_won: true,
  push_lot_ending: true
};

/**
 * Helper to get base URL
 */
function getBaseUrl(): string {
  // In production, this would come from environment
  return typeof window !== 'undefined' 
    ? window.location.origin 
    : 'https://auction-platform.pages.dev';
}
