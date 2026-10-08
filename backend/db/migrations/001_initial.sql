PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX email_tokens_user_purpose ON email_tokens(user_id, purpose, expires_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user_active ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
INSERT INTO categories(id, name, sort_order) VALUES
  ('home-living', 'Home & Living', 1), ('food-beverage', 'Food & Beverage', 2),
  ('beauty-personal-care', 'Beauty & Personal Care', 3), ('fashion-accessories', 'Fashion & Accessories', 4),
  ('health-wellness', 'Health & Wellness', 5), ('education', 'Education', 6),
  ('technology-software', 'Technology & Software', 7), ('arts-crafts', 'Arts & Crafts', 8),
  ('travel-hospitality', 'Travel & Hospitality', 9), ('professional-services', 'Professional Services', 10),
  ('agriculture-rural', 'Agriculture & Rural', 11), ('retail-consumer-goods', 'Retail & Consumer Goods', 12),
  ('automotive-mobility', 'Automotive & Mobility', 13), ('finance-insurance', 'Finance & Insurance', 14),
  ('community-social', 'Community & Social', 15), ('other', 'Other', 16);

CREATE TABLE founder_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  city TEXT,
  state TEXT,
  role TEXT,
  instagram_url TEXT,
  public_profile INTEGER NOT NULL DEFAULT 0 CHECK (public_profile IN (0, 1)),
  moderation_status TEXT NOT NULL DEFAULT 'active' CHECK (moderation_status IN ('active', 'paused', 'removed')),
  revenue_range TEXT,
  revenue_period TEXT,
  revenue_public INTEGER NOT NULL DEFAULT 0 CHECK (revenue_public IN (0, 1)),
  funding_raised_range TEXT,
  funding_date TEXT,
  funding_type TEXT,
  funding_public INTEGER NOT NULL DEFAULT 0 CHECK (funding_public IN (0, 1)),
  open_to_funding INTEGER CHECK (open_to_funding IN (0, 1)),
  open_to_funding_public INTEGER NOT NULL DEFAULT 0 CHECK (open_to_funding_public IN (0, 1)),
  financial_disclosed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX founder_profiles_slug ON founder_profiles(slug);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('brand-logo', 'launch-carousel', 'founder-avatar')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX media_assets_owner ON media_assets(owner_user_id, created_at);

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  category TEXT REFERENCES categories(id),
  website_url TEXT,
  instagram_url TEXT,
  whatsapp_url TEXT,
  tagline TEXT,
  city TEXT,
  state TEXT,
  founded_year INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived', 'removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX brands_owner_status ON brands(owner_user_id, status, updated_at DESC);
CREATE INDEX brands_public_category ON brands(status, category, name);

CREATE TABLE founder_public_brands (
  founder_profile_id TEXT NOT NULL REFERENCES founder_profiles(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (founder_profile_id, brand_id)
);

CREATE TABLE launches (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  launch_type TEXT CHECK (launch_type IN ('business', 'product', 'service')),
  category TEXT REFERENCES categories(id),
  summary TEXT,
  story TEXT,
  launch_date TEXT,
  availability_note TEXT,
  price_inr_paise INTEGER CHECK (price_inr_paise IS NULL OR price_inr_paise >= 0),
  website_url TEXT,
  instagram_url TEXT,
  whatsapp_url TEXT,
  leaderboard_opt_out INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard_opt_out IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived', 'removed')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX launches_public_feed ON launches(status, published_at DESC);
CREATE INDEX launches_brand_status ON launches(brand_id, status, updated_at DESC);
CREATE INDEX launches_category_status ON launches(category, status, published_at DESC);

CREATE TABLE launch_founders (
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  founder_profile_id TEXT NOT NULL REFERENCES founder_profiles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (launch_id, founder_profile_id)
);

CREATE TABLE launch_images (
  id TEXT PRIMARY KEY,
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES media_assets(id),
  url TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (launch_id, position)
);

CREATE TABLE likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, launch_id)
);
CREATE INDEX likes_launch_date ON likes(launch_id, created_at);

CREATE TABLE saves (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, launch_id)
);
CREATE INDEX saves_launch_date ON saves(launch_id, created_at);

CREATE TABLE engagement_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'detail_view', 'share', 'click_out', 'like', 'save')),
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_key TEXT NOT NULL,
  destination TEXT,
  local_day TEXT NOT NULL,
  qualified INTEGER NOT NULL DEFAULT 0 CHECK (qualified IN (0, 1)),
  created_at TEXT NOT NULL,
  retracted_at TEXT
);
CREATE INDEX engagement_launch_event_date ON engagement_events(launch_id, event_type, created_at);
CREATE INDEX engagement_qualified_date ON engagement_events(event_type, qualified, created_at);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('launch', 'brand', 'founder')),
  subject_id TEXT NOT NULL,
  subject_owner_user_id TEXT NOT NULL REFERENCES users(id),
  reporter_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'misleading', 'intellectual_property', 'unsafe', 'harassment', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'dismissed', 'actioned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX reports_one_active_per_reporter_subject
  ON reports(reporter_user_id, subject_type, subject_id) WHERE status IN ('open', 'under_review');
CREATE INDEX reports_queue ON reports(status, created_at);

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT REFERENCES reports(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('launch', 'brand', 'founder')),
  subject_id TEXT NOT NULL,
  moderator_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('dismiss', 'request_changes', 'pause', 'remove', 'restore', 'hold', 'reinstate')),
  reason TEXT NOT NULL,
  previous_status TEXT,
  resulting_status TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE leaderboard_holds (
  id TEXT PRIMARY KEY,
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('automatic', 'moderator')),
  reason TEXT NOT NULL,
  moderator_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id),
  resolution_reason TEXT
);
CREATE UNIQUE INDEX leaderboard_one_active_hold ON leaderboard_holds(launch_id) WHERE resolved_at IS NULL;
CREATE INDEX leaderboard_holds_active ON leaderboard_holds(resolved_at, created_at);

CREATE TABLE appeals (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('launch', 'brand', 'founder')),
  subject_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'dismissed', 'restored')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX appeals_queue ON appeals(status, created_at);

CREATE TABLE user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX user_notifications_user ON user_notifications(user_id, created_at DESC);
