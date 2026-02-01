// ============================================================================
// ENVIRONMENT BINDINGS
// ============================================================================

export type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  CACHE: KVNamespace;
  
  // Environment variables
  ENVIRONMENT: string;
  JWT_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

// ============================================================================
// USER TYPES
// ============================================================================

export type UserRole = 'guest' | 'bidder' | 'staff' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  
  email_verified: number;
  email_verification_token: string | null;
  email_verification_expires: number | null;
  phone_verified: number;
  phone_verification_code: string | null;
  phone_verification_expires: number | null;
  
  password_reset_token: string | null;
  password_reset_expires: number | null;
  
  mfa_enabled: number;
  mfa_secret: string | null;
  
  status: UserStatus;
  banned_reason: string | null;
  banned_at: number | null;
  banned_by: number | null;
  
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface UserSession {
  id: number;
  user_id: number;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: number;
  created_at: number;
}

export interface PushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  device_type: string | null;
  created_at: number;
}

// ============================================================================
// AUCTION TYPES
// ============================================================================

export type AuctionStatus = 'draft' | 'published' | 'active' | 'closed' | 'archived';

export interface IncrementRule {
  min: number;
  max: number | null;
  increment: number;
}

export interface BuyersPremiumRule {
  min: number;
  max: number | null;
  rate: number; // Decimal (0.15 = 15%)
}

export interface Auction {
  id: number;
  
  title: string;
  description: string | null;
  featured_image: string | null;
  
  start_date: number;
  end_date: number;
  
  soft_close_enabled: number;
  soft_close_trigger_minutes: number;
  soft_close_extension_minutes: number;
  
  increment_rules: string; // JSON of IncrementRule[]
  buyers_premium_rules: string; // JSON of BuyersPremiumRule[]
  
  tax_enabled: number;
  tax_rate: number;
  
  pickup_location: string | null;
  pickup_instructions: string | null;
  pickup_start_date: number | null;
  pickup_end_date: number | null;
  shipping_available: number;
  shipping_notes: string | null;
  
  status: AuctionStatus;
  
  created_by: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  closed_at: number | null;
}

// ============================================================================
// LOT TYPES
// ============================================================================

export type LotStatus = 'pending' | 'active' | 'closed' | 'sold' | 'unsold' | 'withdrawn';

export interface Lot {
  id: number;
  auction_id: number;
  
  lot_number: number;
  title: string;
  description: string | null;
  
  category: string | null;
  condition: string | null;
  tags: string | null; // JSON array
  
  location: string | null;
  pickup_info: string | null;
  shipping_available: number;
  shipping_notes: string | null;
  
  starting_bid: number;
  reserve_price: number | null;
  reserve_met: number;
  show_reserve_status: number;
  buy_now_price: number | null;
  
  increment_override: string | null; // JSON of IncrementRule[]
  
  quantity: number;
  
  current_bid: number;
  current_bidder_id: number | null;
  bid_count: number;
  
  original_close_time: number | null;
  current_close_time: number | null;
  extension_count: number;
  
  status: LotStatus;
  
  is_featured: number;
  featured_order: number | null;
  
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}

export interface LotImage {
  id: number;
  lot_id: number;
  
  filename: string;
  original_url: string;
  thumbnail_url: string | null;
  medium_url: string | null;
  large_url: string | null;
  
  file_size: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  
  display_order: number;
  is_primary: number;
  
  import_batch_id: string | null;
  matched_by: string | null;
  
  uploaded_at: number;
}

// ============================================================================
// BIDDING TYPES
// ============================================================================

export type BidType = 'manual' | 'proxy_auto';
export type BidStatus = 'active' | 'outbid' | 'winning' | 'won' | 'lost' | 'cancelled';

export interface Bid {
  id: number;
  lot_id: number;
  bidder_id: number;
  
  amount: number;
  bid_type: BidType;
  
  max_bid: number | null;
  is_max_bid_active: number;
  
  is_winning: number;
  was_outbid: number;
  outbid_at: number | null;
  
  previous_bid_amount: number | null;
  previous_bidder_id: number | null;
  
  ip_address: string | null;
  user_agent: string | null;
  
  status: BidStatus;
  validation_notes: string | null;
  
  created_at: number;
}

export type BidAuditEventType = 
  | 'bid_placed'
  | 'bid_rejected'
  | 'proxy_triggered'
  | 'outbid_occurred'
  | 'soft_close_triggered'
  | 'lot_closed'
  | 'bid_cancelled'
  | 'reserve_met'
  | 'buy_now_executed';

export interface BidAuditLog {
  id: number;
  
  event_type: BidAuditEventType;
  
  lot_id: number;
  auction_id: number;
  bidder_id: number | null;
  bid_id: number | null;
  
  event_data: string; // JSON
  
  previous_amount: number | null;
  new_amount: number | null;
  
  result_code: string | null;
  result_message: string | null;
  
  ip_address: string | null;
  user_agent: string | null;
  
  created_at: number;
}

export interface Watchlist {
  id: number;
  user_id: number;
  lot_id: number;
  created_at: number;
}

// ============================================================================
// INVOICE TYPES
// ============================================================================

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded' | 'cancelled';
export type FulfillmentStatus = 'pending' | 'ready' | 'picked_up' | 'shipped' | 'delivered' | 'cancelled';

export interface Invoice {
  id: number;
  auction_id: number;
  bidder_id: number;
  
  invoice_number: string;
  
  subtotal: number;
  buyers_premium: number;
  tax: number;
  shipping: number;
  total: number;
  
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  paid_amount: number;
  paid_at: number | null;
  
  fulfillment_status: FulfillmentStatus;
  pickup_scheduled_date: number | null;
  picked_up_at: number | null;
  shipped_at: number | null;
  tracking_number: string | null;
  delivered_at: number | null;
  
  admin_notes: string | null;
  bidder_notes: string | null;
  
  created_at: number;
  updated_at: number;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  lot_id: number;
  
  lot_number: number;
  lot_title: string;
  winning_bid: number;
  buyers_premium_rate: number;
  buyers_premium_amount: number;
  tax_rate: number;
  tax_amount: number;
  shipping_amount: number;
  line_total: number;
}

export type TransactionType = 'payment' | 'refund' | 'adjustment';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface PaymentTransaction {
  id: number;
  invoice_id: number;
  
  transaction_type: TransactionType;
  amount: number;
  payment_method: string | null;
  
  gateway_transaction_id: string | null;
  gateway_response: string | null; // JSON
  
  status: TransactionStatus;
  
  processed_by: number | null;
  notes: string | null;
  
  created_at: number;
  completed_at: number | null;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface NotificationPreferences {
  id: number;
  user_id: number;
  
  outbid_email: number;
  outbid_push: number;
  
  winning_email: number;
  winning_push: number;
  
  watchlist_ending_email: number;
  watchlist_ending_push: number;
  
  auction_starting_email: number;
  auction_starting_push: number;
  
  invoice_ready_email: number;
  invoice_ready_push: number;
  
  payment_received_email: number;
  payment_received_push: number;
  
  pickup_reminder_email: number;
  pickup_reminder_push: number;
  
  announcement_email: number;
  announcement_push: number;
  
  created_at: number;
  updated_at: number;
}

export type NotificationType = 
  | 'outbid'
  | 'winning'
  | 'watchlist_ending'
  | 'auction_starting'
  | 'invoice_ready'
  | 'payment_received'
  | 'pickup_reminder'
  | 'announcement';

export interface Notification {
  id: number;
  user_id: number;
  
  type: NotificationType;
  title: string;
  message: string;
  
  link_url: string | null;
  link_type: string | null;
  link_id: number | null;
  
  read: number;
  read_at: number | null;
  
  sent_email: number;
  sent_email_at: number | null;
  sent_push: number;
  sent_push_at: number | null;
  
  created_at: number;
  expires_at: number | null;
}

export interface NotificationTemplate {
  id: number;
  
  template_key: string;
  template_name: string;
  
  email_subject: string | null;
  email_body: string | null;
  
  push_title: string | null;
  push_body: string | null;
  
  available_variables: string | null; // JSON array
  
  active: number;
  
  created_at: number;
  updated_at: number;
}

export type AnnouncementTargetType = 'all' | 'auction_bidders' | 'watchers' | 'winners' | 'unpaid';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'sending' | 'sent';

export interface Announcement {
  id: number;
  
  title: string;
  message: string;
  
  target_type: AnnouncementTargetType;
  target_auction_id: number | null;
  
  send_email: number;
  send_push: number;
  
  status: AnnouncementStatus;
  scheduled_for: number | null;
  
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  
  created_by: number;
  created_at: number;
  sent_at: number | null;
}

// ============================================================================
// IMPORT TYPES
// ============================================================================

export type ImportType = 'lots_csv' | 'images_bulk';
export type ImportStatus = 'processing' | 'completed' | 'failed' | 'partial';

export interface ImportBatch {
  id: string; // UUID
  auction_id: number;
  
  import_type: ImportType;
  
  filename: string | null;
  file_size: number | null;
  
  status: ImportStatus;
  
  total_items: number;
  successful_items: number;
  failed_items: number;
  
  errors: string | null; // JSON
  warnings: string | null; // JSON
  
  created_by: number;
  created_at: number;
  completed_at: number | null;
}

export type MatchStatus = 'matched' | 'unmatched' | 'conflict' | 'manual';

export interface ImageMapping {
  id: number;
  import_batch_id: string;
  
  filename: string;
  file_url: string;
  
  parsed_lot_number: number | null;
  parsed_photo_order: number | null;
  
  match_status: MatchStatus;
  match_confidence: number | null;
  
  assigned_lot_id: number | null;
  assigned_order: number | null;
  assigned_by: number | null;
  assigned_at: number | null;
  
  conflict_reason: string | null;
  duplicate_of: number | null;
  
  created_at: number;
}

// ============================================================================
// CONTENT TYPES
// ============================================================================

export type ContentStatus = 'draft' | 'published';
export type ContentFormat = 'html' | 'markdown';

export interface ContentPage {
  id: number;
  
  slug: string;
  title: string;
  
  content: string;
  content_format: ContentFormat;
  
  meta_description: string | null;
  meta_keywords: string | null;
  
  status: ContentStatus;
  
  created_by: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

// ============================================================================
// SYSTEM TYPES
// ============================================================================

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

export interface SystemSetting {
  key: string;
  value: string;
  value_type: SettingValueType;
  description: string | null;
  category: string | null;
  updated_at: number;
  updated_by: number | null;
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export interface AdminAuditLog {
  id: number;
  
  user_id: number;
  user_email: string;
  user_role: string;
  
  action_type: string;
  resource_type: string;
  resource_id: number | null;
  
  action_description: string | null;
  changes: string | null; // JSON
  
  ip_address: string | null;
  user_agent: string | null;
  
  created_at: number;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface AuthPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BidRequest {
  amount: number;
  maxBid?: number;
}

export interface LotFilters {
  auction_id?: number;
  category?: string;
  status?: LotStatus;
  min_price?: number;
  max_price?: number;
  shipping_available?: boolean;
  search?: string;
  ending_soon?: boolean;
  featured?: boolean;
}

export interface CSVLotImport {
  lot_number: number;
  title: string;
  description?: string;
  category?: string;
  condition?: string;
  starting_bid: number;
  reserve_price?: number;
  buy_now_price?: number;
  quantity?: number;
  location?: string;
  shipping_available?: boolean;
  tags?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type Variables = {
  user?: AuthPayload;
};

export type HonoContext = {
  Bindings: Bindings;
  Variables: Variables;
};
