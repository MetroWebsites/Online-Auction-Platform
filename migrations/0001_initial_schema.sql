-- BB Realty & Auctions - Initial Database Schema
-- Enhanced auction platform with credit card requirement

-- Users table (admin, clerks, auctioneer)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'clerk', -- admin, clerk, auctioneer
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended, inactive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bidders table (public users who bid)
CREATE TABLE IF NOT EXISTS bidders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  
  -- Credit card requirement
  has_card_on_file INTEGER DEFAULT 0, -- boolean: 1=yes, 0=no
  card_last_four TEXT, -- last 4 digits for display
  card_brand TEXT, -- visa, mastercard, amex, discover
  card_expiry TEXT, -- MM/YY format
  
  -- Payment processor reference (tokenized)
  payment_token TEXT, -- Stripe/payment processor customer ID
  
  -- Account status
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended, banned
  email_verified INTEGER DEFAULT 0,
  verified_at DATETIME,
  
  -- Preferences
  notifications_email INTEGER DEFAULT 1,
  notifications_push INTEGER DEFAULT 1,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Auctions table
CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  
  -- Timing
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  soft_close_enabled INTEGER DEFAULT 1,
  soft_close_extension_minutes INTEGER DEFAULT 5,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, live, ended, archived
  
  -- Settings
  requires_approval INTEGER DEFAULT 0,
  buyer_premium_percent REAL DEFAULT 0,
  
  -- SEO
  slug TEXT UNIQUE,
  cover_image TEXT,
  
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Lots table
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  lot_number INTEGER NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  
  -- Bidding
  starting_bid REAL NOT NULL DEFAULT 0,
  reserve_price REAL,
  bid_increment REAL NOT NULL DEFAULT 10,
  
  -- Current state
  current_bid REAL DEFAULT 0,
  bid_count INTEGER DEFAULT 0,
  leading_bidder_id INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- active, sold, unsold, withdrawn
  
  -- Images (stored as JSON array or separate table)
  -- Photos named: {lot_number}-{photo_order}.jpg (e.g., 1-001.jpg, 1-002.jpg)
  image_count INTEGER DEFAULT 0,
  primary_image TEXT, -- URL to primary image
  
  -- Metadata
  slug TEXT,
  views INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (leading_bidder_id) REFERENCES bidders(id),
  
  UNIQUE(auction_id, lot_number)
);

-- Lot images table (for structured image management)
CREATE TABLE IF NOT EXISTS lot_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL,
  
  -- Image naming: {lot_number}-{photo_order}.jpg
  photo_order INTEGER NOT NULL, -- 1, 2, 3, etc.
  filename TEXT NOT NULL, -- 1-001.jpg, 1-002.jpg
  url TEXT NOT NULL, -- R2 storage URL
  
  is_primary INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
  
  UNIQUE(lot_id, photo_order)
);

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL,
  bidder_id INTEGER NOT NULL,
  
  amount REAL NOT NULL,
  bid_type TEXT NOT NULL DEFAULT 'manual', -- manual, proxy, auto
  
  -- Proxy bidding
  max_bid REAL, -- for proxy bids
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- active, outbid, winning, won, lost
  
  -- IP tracking
  ip_address TEXT,
  user_agent TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
  FOREIGN KEY (bidder_id) REFERENCES bidders(id)
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bidder_id INTEGER NOT NULL,
  lot_id INTEGER NOT NULL,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (bidder_id) REFERENCES bidders(id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
  
  UNIQUE(bidder_id, lot_id)
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bidder_id INTEGER NOT NULL,
  auction_id INTEGER NOT NULL,
  
  invoice_number TEXT UNIQUE NOT NULL,
  
  -- Amounts
  subtotal REAL NOT NULL DEFAULT 0,
  buyer_premium REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  
  -- Payment
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, partial, overdue, cancelled
  payment_method TEXT, -- credit_card, check, wire, cash
  paid_amount REAL DEFAULT 0,
  paid_at DATETIME,
  
  -- Notes
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (bidder_id) REFERENCES bidders(id),
  FOREIGN KEY (auction_id) REFERENCES auctions(id)
);

-- Invoice items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  lot_id INTEGER NOT NULL,
  
  description TEXT NOT NULL,
  winning_bid REAL NOT NULL,
  buyer_premium REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES lots(id)
);

-- Notifications table (outbid, auction reminders, etc.)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bidder_id INTEGER NOT NULL,
  
  type TEXT NOT NULL, -- outbid, auction_ending, auction_won, payment_reminder, etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities
  lot_id INTEGER,
  auction_id INTEGER,
  bid_id INTEGER,
  
  -- Status
  is_read INTEGER DEFAULT 0,
  sent_email INTEGER DEFAULT 0,
  sent_push INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  
  FOREIGN KEY (bidder_id) REFERENCES bidders(id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE SET NULL,
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE SET NULL,
  FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE SET NULL
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  bidder_id INTEGER,
  
  action TEXT NOT NULL, -- login, bid_placed, lot_created, etc.
  entity_type TEXT, -- auction, lot, bid, user
  entity_id INTEGER,
  
  details TEXT, -- JSON details
  ip_address TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (bidder_id) REFERENCES bidders(id) ON DELETE SET NULL
);

-- Settings table (system-wide configuration)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  bidder_id INTEGER NOT NULL,
  
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  
  -- Payment processor details
  processor TEXT, -- stripe, square, etc.
  transaction_id TEXT, -- external transaction ID
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  
  -- Card details (for credit card payments)
  card_last_four TEXT,
  card_brand TEXT,
  
  error_message TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (bidder_id) REFERENCES bidders(id)
);

-- Bidder approvals table (if auction requires approval)
CREATE TABLE IF NOT EXISTS bidder_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bidder_id INTEGER NOT NULL,
  auction_id INTEGER NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  
  approved_by INTEGER,
  approved_at DATETIME,
  rejection_reason TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (bidder_id) REFERENCES bidders(id) ON DELETE CASCADE,
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id),
  
  UNIQUE(bidder_id, auction_id)
);

-- Push subscriptions table (for push notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bidder_id INTEGER NOT NULL,
  
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  
  user_agent TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (bidder_id) REFERENCES bidders(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bidders_email ON bidders(email);
CREATE INDEX IF NOT EXISTS idx_bidders_status ON bidders(status);
CREATE INDEX IF NOT EXISTS idx_bidders_card_on_file ON bidders(has_card_on_file);

CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_start_time ON auctions(start_time);
CREATE INDEX IF NOT EXISTS idx_auctions_end_time ON auctions(end_time);
CREATE INDEX IF NOT EXISTS idx_auctions_slug ON auctions(slug);

CREATE INDEX IF NOT EXISTS idx_lots_auction_id ON lots(auction_id);
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);
CREATE INDEX IF NOT EXISTS idx_lots_leading_bidder ON lots(leading_bidder_id);
CREATE INDEX IF NOT EXISTS idx_lots_slug ON lots(slug);

CREATE INDEX IF NOT EXISTS idx_lot_images_lot_id ON lot_images(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_images_primary ON lot_images(is_primary);

CREATE INDEX IF NOT EXISTS idx_bids_lot_id ON bids(lot_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);

CREATE INDEX IF NOT EXISTS idx_watchlist_bidder_id ON watchlist(bidder_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_lot_id ON watchlist(lot_id);

CREATE INDEX IF NOT EXISTS idx_invoices_bidder_id ON invoices(bidder_id);
CREATE INDEX IF NOT EXISTS idx_invoices_auction_id ON invoices(auction_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE INDEX IF NOT EXISTS idx_notifications_bidder_id ON notifications(bidder_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_bidder_id ON activity_log(bidder_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice_id ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_bidder_id ON payment_transactions(bidder_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
