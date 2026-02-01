-- ============================================================================
-- AUCTION PLATFORM DATABASE SCHEMA
-- ============================================================================
-- This migration creates the complete database schema for the auction platform
-- including users, auctions, lots, bids, invoices, notifications, and audit logs

-- ============================================================================
-- USERS AND AUTHENTICATION
-- ============================================================================

-- Users table: stores all user accounts (bidders, admin, staff)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'bidder' CHECK(role IN ('guest', 'bidder', 'staff', 'admin')),
  
  -- Profile information
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  
  -- Verification status
  email_verified INTEGER DEFAULT 0,
  email_verification_token TEXT,
  email_verification_expires INTEGER,
  phone_verified INTEGER DEFAULT 0,
  phone_verification_code TEXT,
  phone_verification_expires INTEGER,
  
  -- Password reset
  password_reset_token TEXT,
  password_reset_expires INTEGER,
  
  -- MFA (Multi-Factor Authentication)
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  
  -- Account status
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
  banned_reason TEXT,
  banned_at INTEGER,
  banned_by INTEGER,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  last_login_at INTEGER,
  
  FOREIGN KEY (banned_by) REFERENCES users(id)
);

-- User sessions table: tracks active JWT tokens
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  device_type TEXT, -- 'web', 'ios', 'android'
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- AUCTIONS
-- ============================================================================

-- Auctions table: main auction events
CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic information
  title TEXT NOT NULL,
  description TEXT,
  featured_image TEXT,
  
  -- Timing
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  
  -- Soft close settings
  soft_close_enabled INTEGER DEFAULT 1,
  soft_close_trigger_minutes INTEGER DEFAULT 5,
  soft_close_extension_minutes INTEGER DEFAULT 5,
  
  -- Increment rules (JSON: [{min: 0, max: 100, increment: 5}, ...])
  increment_rules TEXT DEFAULT '[{"min":0,"max":100,"increment":5},{"min":100,"max":500,"increment":10},{"min":500,"max":null,"increment":25}]',
  
  -- Buyer's premium rules (JSON: [{min: 0, max: 1000, rate: 0.15}, ...])
  buyers_premium_rules TEXT DEFAULT '[{"min":0,"max":null,"rate":0.15}]',
  
  -- Tax settings
  tax_enabled INTEGER DEFAULT 0,
  tax_rate REAL DEFAULT 0.0,
  
  -- Pickup and shipping
  pickup_location TEXT,
  pickup_instructions TEXT,
  pickup_start_date INTEGER,
  pickup_end_date INTEGER,
  shipping_available INTEGER DEFAULT 0,
  shipping_notes TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'active', 'closed', 'archived')),
  
  -- Metadata
  created_by INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  published_at INTEGER,
  closed_at INTEGER,
  
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================================================
-- LOTS
-- ============================================================================

-- Lots table: individual items in auctions
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  
  -- Identification
  lot_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Categorization
  category TEXT,
  condition TEXT,
  tags TEXT, -- JSON array: ["tag1", "tag2"]
  
  -- Location and shipping
  location TEXT,
  pickup_info TEXT,
  shipping_available INTEGER DEFAULT 0,
  shipping_notes TEXT,
  
  -- Bidding parameters
  starting_bid REAL NOT NULL DEFAULT 0.0,
  reserve_price REAL,
  reserve_met INTEGER DEFAULT 0,
  show_reserve_status INTEGER DEFAULT 1,
  buy_now_price REAL,
  
  -- Increment override (if different from auction default)
  increment_override TEXT, -- JSON: same format as auction increment_rules
  
  -- Quantity
  quantity INTEGER DEFAULT 1,
  
  -- Current bidding state
  current_bid REAL DEFAULT 0.0,
  current_bidder_id INTEGER,
  bid_count INTEGER DEFAULT 0,
  
  -- Soft close tracking
  original_close_time INTEGER, -- Set when auction starts
  current_close_time INTEGER, -- Updated by soft close extensions
  extension_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'closed', 'sold', 'unsold', 'withdrawn')),
  
  -- Featured/promoted
  is_featured INTEGER DEFAULT 0,
  featured_order INTEGER,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  closed_at INTEGER,
  
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (current_bidder_id) REFERENCES users(id),
  
  UNIQUE(auction_id, lot_number)
);

-- Lot images table
CREATE TABLE IF NOT EXISTS lot_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL,
  
  -- Image data
  filename TEXT NOT NULL,
  original_url TEXT NOT NULL,
  thumbnail_url TEXT,
  medium_url TEXT,
  large_url TEXT,
  
  -- Image metadata
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  mime_type TEXT,
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  is_primary INTEGER DEFAULT 0,
  
  -- Import tracking
  import_batch_id TEXT,
  matched_by TEXT, -- 'filename', 'manual', 'bulk'
  
  -- Timestamps
  uploaded_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);

-- ============================================================================
-- BIDDING SYSTEM
-- ============================================================================

-- Bids table: ALL bids (manual and proxy auto-bids)
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL,
  bidder_id INTEGER NOT NULL,
  
  -- Bid details
  amount REAL NOT NULL,
  bid_type TEXT NOT NULL CHECK(bid_type IN ('manual', 'proxy_auto')),
  
  -- Max bid tracking (for proxy bidding)
  max_bid REAL, -- Only set for manual bids that include max bid
  is_max_bid_active INTEGER DEFAULT 0, -- Whether this max bid is still in effect
  
  -- Bid state
  is_winning INTEGER DEFAULT 0,
  was_outbid INTEGER DEFAULT 0,
  outbid_at INTEGER,
  
  -- Previous state (for audit trail)
  previous_bid_amount REAL,
  previous_bidder_id INTEGER,
  
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  
  -- Status and validation
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'outbid', 'winning', 'won', 'lost', 'cancelled')),
  validation_notes TEXT,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
  FOREIGN KEY (bidder_id) REFERENCES users(id),
  FOREIGN KEY (previous_bidder_id) REFERENCES users(id)
);

-- Bid audit log: immutable record of all bidding activity
CREATE TABLE IF NOT EXISTS bid_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Event identification
  event_type TEXT NOT NULL CHECK(event_type IN (
    'bid_placed', 'bid_rejected', 'proxy_triggered', 
    'outbid_occurred', 'soft_close_triggered', 'lot_closed', 
    'bid_cancelled', 'reserve_met', 'buy_now_executed'
  )),
  
  -- References
  lot_id INTEGER NOT NULL,
  auction_id INTEGER NOT NULL,
  bidder_id INTEGER,
  bid_id INTEGER,
  
  -- Event data (immutable snapshot)
  event_data TEXT NOT NULL, -- JSON with complete state
  
  -- Previous state
  previous_amount REAL,
  new_amount REAL,
  
  -- Result codes
  result_code TEXT, -- 'success', 'rejected_low_bid', 'rejected_too_late', etc.
  result_message TEXT,
  
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamp (immutable, server-authoritative)
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (lot_id) REFERENCES lots(id),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (bidder_id) REFERENCES users(id),
  FOREIGN KEY (bid_id) REFERENCES bids(id)
);

-- ============================================================================
-- USER INTERACTIONS
-- ============================================================================

-- Watchlist: lots that users are watching
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  lot_id INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
  
  UNIQUE(user_id, lot_id)
);

-- ============================================================================
-- INVOICING AND PAYMENTS
-- ============================================================================

-- Invoices: generated after auction closes for winning bidders
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  bidder_id INTEGER NOT NULL,
  
  -- Invoice number (formatted: INV-YYYYMMDD-XXXXX)
  invoice_number TEXT UNIQUE NOT NULL,
  
  -- Financial breakdown
  subtotal REAL NOT NULL DEFAULT 0.0, -- Sum of winning bids
  buyers_premium REAL NOT NULL DEFAULT 0.0,
  tax REAL NOT NULL DEFAULT 0.0,
  shipping REAL NOT NULL DEFAULT 0.0,
  total REAL NOT NULL DEFAULT 0.0,
  
  -- Payment tracking
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'partial', 'paid', 'refunded', 'cancelled')),
  payment_method TEXT, -- 'card', 'cash', 'check', 'wire', etc.
  payment_reference TEXT,
  paid_amount REAL DEFAULT 0.0,
  paid_at INTEGER,
  
  -- Fulfillment tracking
  fulfillment_status TEXT DEFAULT 'pending' CHECK(fulfillment_status IN ('pending', 'ready', 'picked_up', 'shipped', 'delivered', 'cancelled')),
  pickup_scheduled_date INTEGER,
  picked_up_at INTEGER,
  shipped_at INTEGER,
  tracking_number TEXT,
  delivered_at INTEGER,
  
  -- Notes
  admin_notes TEXT,
  bidder_notes TEXT,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (bidder_id) REFERENCES users(id)
);

-- Invoice line items: individual lots in an invoice
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  lot_id INTEGER NOT NULL,
  
  -- Item details (snapshot at time of invoice)
  lot_number INTEGER NOT NULL,
  lot_title TEXT NOT NULL,
  winning_bid REAL NOT NULL,
  buyers_premium_rate REAL NOT NULL,
  buyers_premium_amount REAL NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0.0,
  tax_amount REAL NOT NULL DEFAULT 0.0,
  shipping_amount REAL NOT NULL DEFAULT 0.0,
  line_total REAL NOT NULL,
  
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES lots(id)
);

-- Payment transactions: detailed payment history
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  
  -- Transaction details
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('payment', 'refund', 'adjustment')),
  amount REAL NOT NULL,
  payment_method TEXT,
  
  -- Payment gateway data
  gateway_transaction_id TEXT,
  gateway_response TEXT, -- JSON
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')),
  
  -- Metadata
  processed_by INTEGER, -- admin user who processed
  notes TEXT,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

-- Notification preferences: user settings for each notification type
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  
  -- Notification types with email/push toggles
  outbid_email INTEGER DEFAULT 1,
  outbid_push INTEGER DEFAULT 1,
  
  winning_email INTEGER DEFAULT 1,
  winning_push INTEGER DEFAULT 1,
  
  watchlist_ending_email INTEGER DEFAULT 1,
  watchlist_ending_push INTEGER DEFAULT 1,
  
  auction_starting_email INTEGER DEFAULT 1,
  auction_starting_push INTEGER DEFAULT 0,
  
  invoice_ready_email INTEGER DEFAULT 1,
  invoice_ready_push INTEGER DEFAULT 1,
  
  payment_received_email INTEGER DEFAULT 1,
  payment_received_push INTEGER DEFAULT 0,
  
  pickup_reminder_email INTEGER DEFAULT 1,
  pickup_reminder_push INTEGER DEFAULT 1,
  
  announcement_email INTEGER DEFAULT 1,
  announcement_push INTEGER DEFAULT 0,
  
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id)
);

-- Notifications: in-app notification center
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  
  -- Notification details
  type TEXT NOT NULL, -- 'outbid', 'winning', 'invoice_ready', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Links
  link_url TEXT,
  link_type TEXT, -- 'lot', 'auction', 'invoice', etc.
  link_id INTEGER,
  
  -- Status
  read INTEGER DEFAULT 0,
  read_at INTEGER,
  
  -- Delivery tracking
  sent_email INTEGER DEFAULT 0,
  sent_email_at INTEGER,
  sent_push INTEGER DEFAULT 0,
  sent_push_at INTEGER,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER, -- Optional expiration
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notification templates: admin-configurable message templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Template identification
  template_key TEXT UNIQUE NOT NULL, -- 'outbid_alert', 'invoice_ready', etc.
  template_name TEXT NOT NULL,
  
  -- Email template
  email_subject TEXT,
  email_body TEXT,
  
  -- Push notification template
  push_title TEXT,
  push_body TEXT,
  
  -- Template variables (JSON array of available variables)
  available_variables TEXT,
  
  -- Status
  active INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Announcement broadcasts: admin-sent announcements
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Announcement details
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Targeting
  target_type TEXT NOT NULL CHECK(target_type IN ('all', 'auction_bidders', 'watchers', 'winners', 'unpaid')),
  target_auction_id INTEGER,
  
  -- Delivery
  send_email INTEGER DEFAULT 1,
  send_push INTEGER DEFAULT 1,
  
  -- Scheduling
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sending', 'sent')),
  scheduled_for INTEGER,
  
  -- Results
  recipients_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  sent_at INTEGER,
  
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (target_auction_id) REFERENCES auctions(id)
);

-- ============================================================================
-- IMPORT AND BULK OPERATIONS
-- ============================================================================

-- Import batches: track CSV lot imports and bulk image uploads
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY, -- UUID
  auction_id INTEGER NOT NULL,
  
  -- Import type
  import_type TEXT NOT NULL CHECK(import_type IN ('lots_csv', 'images_bulk')),
  
  -- File information
  filename TEXT,
  file_size INTEGER,
  
  -- Status
  status TEXT DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'failed', 'partial')),
  
  -- Results
  total_items INTEGER DEFAULT 0,
  successful_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  
  -- Error log (JSON array of error objects)
  errors TEXT,
  warnings TEXT,
  
  -- Metadata
  created_by INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Image mapping: track unmatched images and manual assignments
CREATE TABLE IF NOT EXISTS image_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id TEXT NOT NULL,
  
  -- Image file
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  
  -- Parsing results
  parsed_lot_number INTEGER,
  parsed_photo_order INTEGER,
  
  -- Matching status
  match_status TEXT DEFAULT 'unmatched' CHECK(match_status IN ('matched', 'unmatched', 'conflict', 'manual')),
  match_confidence REAL, -- 0.0 to 1.0
  
  -- Assignment
  assigned_lot_id INTEGER,
  assigned_order INTEGER,
  assigned_by INTEGER, -- User who manually assigned
  assigned_at INTEGER,
  
  -- Conflict tracking
  conflict_reason TEXT,
  duplicate_of INTEGER, -- If duplicate filename
  
  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (import_batch_id) REFERENCES import_batches(id),
  FOREIGN KEY (assigned_lot_id) REFERENCES lots(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  FOREIGN KEY (duplicate_of) REFERENCES image_mappings(id)
);

-- ============================================================================
-- CONTENT MANAGEMENT
-- ============================================================================

-- Content pages: Terms, Privacy, Help, etc.
CREATE TABLE IF NOT EXISTS content_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Page identification
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  
  -- Content
  content TEXT NOT NULL,
  content_format TEXT DEFAULT 'html' CHECK(content_format IN ('html', 'markdown')),
  
  -- SEO
  meta_description TEXT,
  meta_keywords TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
  
  -- Timestamps
  created_by INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  published_at INTEGER,
  
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================================================
-- SYSTEM CONFIGURATION
-- ============================================================================

-- System settings: key-value store for global configuration
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT DEFAULT 'string' CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  category TEXT, -- 'general', 'bidding', 'payments', 'notifications', etc.
  updated_at INTEGER DEFAULT (unixepoch()),
  updated_by INTEGER,
  
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- ============================================================================
-- AUDIT AND LOGGING
-- ============================================================================

-- Admin audit log: track all admin/staff actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Actor
  user_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  
  -- Action
  action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'import', 'export', etc.
  resource_type TEXT NOT NULL, -- 'auction', 'lot', 'user', 'invoice', etc.
  resource_id INTEGER,
  
  -- Details
  action_description TEXT,
  changes TEXT, -- JSON with before/after values
  
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamp (immutable)
  created_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Auction indexes
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_start_date ON auctions(start_date);
CREATE INDEX IF NOT EXISTS idx_auctions_end_date ON auctions(end_date);
CREATE INDEX IF NOT EXISTS idx_auctions_created_by ON auctions(created_by);

-- Lot indexes
CREATE INDEX IF NOT EXISTS idx_lots_auction_id ON lots(auction_id);
CREATE INDEX IF NOT EXISTS idx_lots_lot_number ON lots(lot_number);
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);
CREATE INDEX IF NOT EXISTS idx_lots_current_close_time ON lots(current_close_time);
CREATE INDEX IF NOT EXISTS idx_lots_is_featured ON lots(is_featured);
CREATE INDEX IF NOT EXISTS idx_lots_category ON lots(category);
CREATE INDEX IF NOT EXISTS idx_lots_current_bidder_id ON lots(current_bidder_id);

-- Lot image indexes
CREATE INDEX IF NOT EXISTS idx_lot_images_lot_id ON lot_images(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_images_display_order ON lot_images(display_order);
CREATE INDEX IF NOT EXISTS idx_lot_images_import_batch ON lot_images(import_batch_id);

-- Bid indexes
CREATE INDEX IF NOT EXISTS idx_bids_lot_id ON bids(lot_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);
CREATE INDEX IF NOT EXISTS idx_bids_is_winning ON bids(is_winning);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at);

-- Bid audit log indexes
CREATE INDEX IF NOT EXISTS idx_bid_audit_lot_id ON bid_audit_log(lot_id);
CREATE INDEX IF NOT EXISTS idx_bid_audit_auction_id ON bid_audit_log(auction_id);
CREATE INDEX IF NOT EXISTS idx_bid_audit_bidder_id ON bid_audit_log(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bid_audit_event_type ON bid_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_bid_audit_created_at ON bid_audit_log(created_at);

-- Watchlist indexes
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_lot_id ON watchlist(lot_id);

-- Invoice indexes
CREATE INDEX IF NOT EXISTS idx_invoices_auction_id ON invoices(auction_id);
CREATE INDEX IF NOT EXISTS idx_invoices_bidder_id ON invoices(bidder_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_fulfillment_status ON invoices(fulfillment_status);

-- Invoice item indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_lot_id ON invoice_items(lot_id);

-- Payment transaction indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice_id ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Import batch indexes
CREATE INDEX IF NOT EXISTS idx_import_batches_auction_id ON import_batches(auction_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by ON import_batches(created_by);

-- Image mapping indexes
CREATE INDEX IF NOT EXISTS idx_image_mappings_batch_id ON image_mappings(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_image_mappings_match_status ON image_mappings(match_status);
CREATE INDEX IF NOT EXISTS idx_image_mappings_assigned_lot_id ON image_mappings(assigned_lot_id);

-- Content page indexes
CREATE INDEX IF NOT EXISTS idx_content_pages_slug ON content_pages(slug);
CREATE INDEX IF NOT EXISTS idx_content_pages_status ON content_pages(status);

-- Admin audit log indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_user_id ON admin_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_type ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource_type ON admin_audit_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at);

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default notification preferences for existing users (will be created via trigger for new users)

-- Insert default notification templates
INSERT OR IGNORE INTO notification_templates (template_key, template_name, email_subject, email_body, push_title, push_body, available_variables) VALUES
('outbid_alert', 'Outbid Alert', 
 'You have been outbid on {{lot_title}}', 
 'Hello {{bidder_name}},\n\nYou have been outbid on Lot #{{lot_number}}: {{lot_title}}.\n\nYour bid: ${{your_bid}}\nCurrent bid: ${{current_bid}}\n\nPlace a new bid: {{lot_url}}',
 'You''ve been outbid!',
 'Your bid on {{lot_title}} has been beaten. Current bid: ${{current_bid}}',
 '["bidder_name", "lot_number", "lot_title", "your_bid", "current_bid", "lot_url"]'),

('winning_status', 'Winning Status', 
 'You are winning {{lot_title}}', 
 'Hello {{bidder_name}},\n\nYou are currently winning Lot #{{lot_number}}: {{lot_title}}.\n\nYour bid: ${{your_bid}}\nTime remaining: {{time_remaining}}\n\nView lot: {{lot_url}}',
 'You''re winning!',
 'You are winning {{lot_title}}. Time remaining: {{time_remaining}}',
 '["bidder_name", "lot_number", "lot_title", "your_bid", "time_remaining", "lot_url"]'),

('invoice_ready', 'Invoice Ready', 
 'Your invoice #{{invoice_number}} is ready', 
 'Hello {{bidder_name}},\n\nCongratulations on your winning bids! Your invoice is ready.\n\nInvoice: #{{invoice_number}}\nTotal: ${{total}}\n\nView invoice: {{invoice_url}}',
 'Invoice ready',
 'Your auction invoice is ready. Total: ${{total}}',
 '["bidder_name", "invoice_number", "total", "invoice_url"]'),

('payment_received', 'Payment Received', 
 'Payment received for invoice #{{invoice_number}}', 
 'Hello {{bidder_name}},\n\nWe have received your payment for invoice #{{invoice_number}}.\n\nAmount: ${{amount}}\n\nPickup instructions: {{pickup_instructions}}',
 'Payment received',
 'Your payment has been received. Amount: ${{amount}}',
 '["bidder_name", "invoice_number", "amount", "pickup_instructions"]'),

('pickup_reminder', 'Pickup Reminder', 
 'Reminder: Pickup for invoice #{{invoice_number}}', 
 'Hello {{bidder_name}},\n\nThis is a reminder to pick up your items.\n\nPickup window: {{pickup_window}}\nLocation: {{pickup_location}}\n\nView details: {{invoice_url}}',
 'Pickup reminder',
 'Don''t forget to pick up your items. Window: {{pickup_window}}',
 '["bidder_name", "invoice_number", "pickup_window", "pickup_location", "invoice_url"]');

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (key, value, value_type, description, category) VALUES
('site_name', 'Auction Platform', 'string', 'Name of the auction platform', 'general'),
('site_url', 'https://auction-platform.pages.dev', 'string', 'Base URL of the platform', 'general'),
('admin_email', 'admin@example.com', 'string', 'Admin contact email', 'general'),
('default_soft_close_trigger', '5', 'number', 'Default soft close trigger in minutes', 'bidding'),
('default_soft_close_extension', '5', 'number', 'Default soft close extension in minutes', 'bidding'),
('bid_rate_limit', '10', 'number', 'Maximum bids per minute per user', 'bidding'),
('require_email_verification', 'true', 'boolean', 'Require email verification to bid', 'auth'),
('payment_mode', 'mode_b', 'string', 'Payment mode: mode_a (card on file), mode_b (pay after), mode_c (hybrid)', 'payments'),
('payment_card_threshold', '1000', 'number', 'Threshold for requiring card on file (mode_c)', 'payments'),
('default_buyers_premium', '0.15', 'number', 'Default buyer''s premium rate (15%)', 'payments'),
('enable_reserve_prices', 'true', 'boolean', 'Allow reserve prices on lots', 'bidding'),
('show_reserve_status', 'true', 'boolean', 'Show reserve met/not met status', 'bidding'),
('enable_buy_now', 'true', 'boolean', 'Enable Buy Now feature', 'bidding'),
('max_image_size_mb', '10', 'number', 'Maximum image upload size in MB', 'media'),
('enable_web_push', 'true', 'boolean', 'Enable web push notifications', 'notifications');
