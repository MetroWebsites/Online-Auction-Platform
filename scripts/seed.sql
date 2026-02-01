-- ============================================================================
-- SEED DATA FOR TESTING
-- ============================================================================

-- Create admin user (password: Admin123!)
INSERT INTO users (
  id, email, password_hash, role, first_name, last_name, 
  email_verified, status, created_at
) VALUES (
  1,
  'admin@auction.com',
  -- This is a hashed version of 'Admin123!' (10 rounds of SHA-256)
  'hash_placeholder_change_on_first_login',
  'admin',
  'Admin',
  'User',
  1,
  'active',
  unixepoch()
);

-- Create test bidders
INSERT INTO users (
  id, email, password_hash, role, first_name, last_name,
  email_verified, phone, address_line1, city, state, zip_code,
  status, created_at
) VALUES 
(2, 'bidder1@test.com', 'hash_placeholder', 'bidder', 'John', 'Doe', 1, '555-0001', '123 Main St', 'New York', 'NY', '10001', 'active', unixepoch()),
(3, 'bidder2@test.com', 'hash_placeholder', 'bidder', 'Jane', 'Smith', 1, '555-0002', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'active', unixepoch()),
(4, 'bidder3@test.com', 'hash_placeholder', 'bidder', 'Bob', 'Johnson', 1, '555-0003', '789 Pine Rd', 'Chicago', 'IL', '60601', 'active', unixepoch());

-- Create notification preferences for all users
INSERT INTO notification_preferences (user_id) VALUES (1), (2), (3), (4);

-- Create test auction (starts now, ends in 7 days)
INSERT INTO auctions (
  id, title, description, status,
  start_date, end_date,
  soft_close_enabled, soft_close_trigger_minutes, soft_close_extension_minutes,
  increment_rules, buyers_premium_rules,
  pickup_location, pickup_instructions, shipping_available,
  created_by, created_at, published_at
) VALUES (
  1,
  'Spring Estate Auction 2026',
  'Quality estate items including furniture, art, collectibles, and more!',
  'active',
  unixepoch(),
  unixepoch() + (7 * 24 * 60 * 60), -- 7 days from now
  1, -- soft close enabled
  5, -- trigger in last 5 minutes
  5, -- extend by 5 minutes
  '[{"min":0,"max":100,"increment":5},{"min":100,"max":500,"increment":10},{"min":500,"max":null,"increment":25}]',
  '[{"min":0,"max":null,"rate":0.15}]',
  '123 Auction House Lane, New York, NY 10001',
  'Pickup available Saturday and Sunday 10am-4pm. Please bring photo ID.',
  1,
  1,
  unixepoch(),
  unixepoch()
);

-- Create test lots
INSERT INTO lots (
  id, auction_id, lot_number, title, description,
  category, condition, tags,
  starting_bid, reserve_price, buy_now_price,
  quantity, status, is_featured,
  original_close_time, current_close_time,
  shipping_available, shipping_notes,
  created_at
) VALUES 
-- Featured lots
(1, 1, 1, 'Antique Oak Dining Table', 'Beautiful solid oak dining table from the 1920s. Seats 8 comfortably. Excellent condition with minor wear.', 'Furniture', 'Excellent', '["antique","furniture","oak","dining"]', 100.00, 500.00, 1200.00, 1, 'active', 1, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 0, 'Pickup only - too large to ship', unixepoch()),

(2, 1, 2, 'Original Oil Painting - Landscape', 'Signed oil painting on canvas, 24x36 inches. Artist: M. Thompson, circa 1965.', 'Art', 'Good', '["art","painting","landscape","vintage"]', 150.00, 300.00, NULL, 1, 'active', 1, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 1, 'Will ship via FedEx, buyer pays shipping', unixepoch()),

(3, 1, 3, 'Sterling Silver Tea Service Set', 'Complete 5-piece sterling silver tea service. Hallmarked. Total weight approximately 80oz.', 'Collectibles', 'Excellent', '["silver","collectibles","tea","sterling"]', 200.00, 800.00, NULL, 1, 'active', 1, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 1, 'Fully insured shipping available', unixepoch()),

-- Regular lots
(4, 1, 4, 'Box of Vintage Books', 'Collection of 20+ vintage hardcover books from 1940s-1960s. Various authors and genres.', 'Books', 'Good', '["books","vintage","collectibles"]', 25.00, NULL, NULL, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 1, 'Media mail shipping available', unixepoch()),

(5, 1, 5, 'Crystal Chandelier', '8-light crystal chandelier, 30 inches diameter. All crystals intact.', 'Lighting', 'Good', '["lighting","crystal","chandelier"]', 75.00, NULL, 350.00, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 0, 'Pickup only', unixepoch()),

(6, 1, 6, 'Vintage Brass Telescope', 'Working brass telescope with wooden tripod. Great conversation piece!', 'Collectibles', 'Good', '["vintage","brass","telescope","nautical"]', 50.00, NULL, NULL, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 1, 'Shipping available', unixepoch()),

(7, 1, 7, 'Set of 6 Antique Dining Chairs', 'Matching set of 6 oak dining chairs with cane seats. 1930s era.', 'Furniture', 'Fair', '["furniture","chairs","oak","antique"]', 120.00, 400.00, NULL, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 0, 'Pickup only', unixepoch()),

(8, 1, 8, 'Oriental Area Rug 8x10', 'Hand-knotted wool oriental rug, 8x10 feet. Traditional pattern in red and navy.', 'Home Decor', 'Good', '["rug","oriental","decor"]', 150.00, 500.00, NULL, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 1, 'Rolled and shipped', unixepoch()),

(9, 1, 9, 'Vintage Typewriter - Royal', 'Working Royal typewriter from 1950s. Black finish with original case.', 'Collectibles', 'Good', '["vintage","typewriter","collectibles"]', 40.00, NULL, 150.00, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 1, 'Carefully packaged shipping', unixepoch()),

(10, 1, 10, 'Lot of Garden Tools', 'Assorted quality garden tools including spades, rakes, hoe, and more. Some rust.', 'Tools', 'Fair', '["tools","garden","outdoor"]', 15.00, NULL, NULL, 1, 'active', 0, unixepoch() + (7 * 24 * 60 * 60), unixepoch() + (7 * 24 * 60 * 60), 0, 'Pickup only', unixepoch());

-- Add some test bids (Lot 1: Oak Table has active bidding)
INSERT INTO bids (
  lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
  is_winning, previous_bid_amount, previous_bidder_id,
  status, created_at
) VALUES
-- Lot 1 bidding history
(1, 2, 100.00, 'manual', 250.00, 1, 0, NULL, NULL, 'outbid', unixepoch() - 3600),
(1, 3, 105.00, 'proxy_auto', 250.00, 0, 0, 100.00, 2, 'outbid', unixepoch() - 3500),
(1, 2, 200.00, 'manual', 250.00, 1, 0, 105.00, 3, 'outbid', unixepoch() - 3400),
(1, 4, 205.00, 'proxy_auto', 300.00, 1, 1, 200.00, 2, 'winning', unixepoch() - 3300);

-- Update lot 1 with current bid info
UPDATE lots SET 
  current_bid = 205.00,
  current_bidder_id = 4,
  bid_count = 4
WHERE id = 1;

-- Lot 2 bidding
INSERT INTO bids (
  lot_id, bidder_id, amount, bid_type, max_bid, is_max_bid_active,
  is_winning, previous_bid_amount, previous_bidder_id,
  status, created_at
) VALUES
(2, 3, 150.00, 'manual', NULL, 0, 1, NULL, NULL, 'winning', unixepoch() - 7200);

UPDATE lots SET 
  current_bid = 150.00,
  current_bidder_id = 3,
  bid_count = 1
WHERE id = 2;

-- Add watchlist entries
INSERT INTO watchlist (user_id, lot_id, created_at) VALUES
(2, 1, unixepoch() - 86400),
(2, 3, unixepoch() - 86400),
(3, 1, unixepoch() - 43200),
(3, 2, unixepoch() - 43200),
(4, 5, unixepoch() - 21600);

-- Add some bid audit log entries
INSERT INTO bid_audit_log (
  event_type, lot_id, auction_id, bidder_id,
  event_data, previous_amount, new_amount,
  result_code, result_message, created_at
) VALUES
('bid_placed', 1, 1, 2, '{"lot_number":1,"timestamp":' || (unixepoch() - 3600) || '}', NULL, 100.00, 'success', 'Initial bid placed', unixepoch() - 3600),
('proxy_triggered', 1, 1, 2, '{"lot_number":1,"timestamp":' || (unixepoch() - 3500) || '}', 100.00, 105.00, 'success', 'Proxy bid defended position', unixepoch() - 3500),
('bid_placed', 1, 1, 2, '{"lot_number":1,"timestamp":' || (unixepoch() - 3400) || '}', 105.00, 200.00, 'success', 'New bid placed', unixepoch() - 3400),
('proxy_triggered', 1, 1, 4, '{"lot_number":1,"timestamp":' || (unixepoch() - 3300) || '}', 200.00, 205.00, 'success', 'Proxy bid won', unixepoch() - 3300);

-- Add content pages
INSERT INTO content_pages (
  slug, title, content, content_format, status,
  meta_description, created_by, created_at, published_at
) VALUES
('terms', 'Terms & Conditions', '<h1>Terms and Conditions</h1><p>Coming soon...</p>', 'html', 'published', 'Terms and conditions for using the auction platform', 1, unixepoch(), unixepoch()),
('privacy', 'Privacy Policy', '<h1>Privacy Policy</h1><p>Coming soon...</p>', 'html', 'published', 'Privacy policy for the auction platform', 1, unixepoch(), unixepoch()),
('how-to-bid', 'How to Bid', '<h1>How to Bid</h1><p>Coming soon...</p>', 'html', 'published', 'Guide on how to place bids and use the platform', 1, unixepoch(), unixepoch());

-- Add system settings (extending defaults from migration)
INSERT OR REPLACE INTO system_settings (key, value, value_type, description, category, updated_at) VALUES
('auction_ending_soon_hours', '24', 'number', 'Hours before close to show "ending soon" badge', 'display', unixepoch()),
('max_lots_per_import', '10000', 'number', 'Maximum lots allowed in single CSV import', 'import', unixepoch()),
('max_images_per_import', '50000', 'number', 'Maximum images allowed in single bulk upload', 'import', unixepoch());

VACUUM;
