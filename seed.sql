-- BB Realty & Auctions - Seed Data

-- Insert default admin user
-- Password: Admin123! (hashed with bcrypt)
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, role, status) VALUES 
  (1, 'admin@bbrealtyauctions.com', '$2a$10$YourHashedPasswordHere', 'BB Admin', 'admin', 'active');

-- Insert system settings
INSERT OR IGNORE INTO settings (key, value, description) VALUES 
  ('site_name', 'BB Realty & Auctions', 'Website name'),
  ('site_tagline', 'Premier Real Estate & Asset Auctions', 'Website tagline'),
  ('primary_color', '#DAA520', 'Primary brand color (gold)'),
  ('secondary_color', '#000000', 'Secondary brand color (black)'),
  ('default_bid_increment', '10', 'Default bid increment amount'),
  ('default_soft_close_minutes', '5', 'Default soft close extension in minutes'),
  ('default_buyer_premium_percent', '10', 'Default buyer premium percentage'),
  ('require_card_on_file', '1', 'Require credit card before bidding (1=yes, 0=no)'),
  ('enable_email_notifications', '1', 'Enable email notifications'),
  ('enable_push_notifications', '1', 'Enable push notifications'),
  ('smtp_host', '', 'SMTP server host'),
  ('smtp_port', '587', 'SMTP server port'),
  ('smtp_user', '', 'SMTP username'),
  ('smtp_from_email', 'noreply@bbrealtyauctions.com', 'From email address'),
  ('smtp_from_name', 'BB Realty & Auctions', 'From name'),
  ('payment_processor', 'stripe', 'Payment processor (stripe, square)'),
  ('stripe_publishable_key', '', 'Stripe publishable key'),
  ('contact_email', 'info@bbrealtyauctions.com', 'Contact email'),
  ('contact_phone', '', 'Contact phone number'),
  ('company_address', '', 'Company address'),
  ('terms_of_service_url', '', 'Terms of service URL'),
  ('privacy_policy_url', '', 'Privacy policy URL');

-- Insert demo bidder (for testing)
-- Password: Bidder123! (hashed with bcrypt)
INSERT OR IGNORE INTO bidders (id, email, password_hash, full_name, phone, has_card_on_file, card_last_four, card_brand, card_expiry, status, email_verified) VALUES 
  (1, 'demo@example.com', '$2a$10$YourHashedPasswordHere', 'Demo Bidder', '555-0100', 1, '4242', 'visa', '12/25', 'active', 1);
