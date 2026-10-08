ALTER TABLE brands ADD COLUMN area TEXT;
ALTER TABLE brands ADD COLUMN address TEXT;
ALTER TABLE brands ADD COLUMN latitude REAL CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
ALTER TABLE brands ADD COLUMN longitude REAL CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
ALTER TABLE brands ADD COLUMN opening_hours TEXT NOT NULL DEFAULT '{}';
ALTER TABLE brands ADD COLUMN contact_phone TEXT;
ALTER TABLE brands ADD COLUMN contact_email TEXT;
ALTER TABLE brands ADD COLUMN quote_url TEXT;
ALTER TABLE brands ADD COLUMN demo_url TEXT;
ALTER TABLE brands ADD COLUMN store_url TEXT;
ALTER TABLE brands ADD COLUMN business_mode TEXT NOT NULL DEFAULT 'online' CHECK (business_mode IN ('online', 'physical', 'hybrid'));
ALTER TABLE launches ADD COLUMN launch_at TEXT;
ALTER TABLE user_notifications ADD COLUMN dedupe_key TEXT;
CREATE UNIQUE INDEX notifications_dedupe ON user_notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX brands_location ON brands(status, city, area, category);
CREATE INDEX launches_scheduled ON launches(status, launch_at);

CREATE TABLE follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('founder', 'brand', 'category')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX follows_target ON follows(target_type, target_id, created_at);

CREATE TABLE launch_alert_subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  notified_at TEXT,
  PRIMARY KEY (user_id, launch_id)
);
CREATE INDEX launch_alerts_pending ON launch_alert_subscriptions(launch_id, notified_at);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
  share_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX collections_owner ON collections(owner_user_id, updated_at DESC);
CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, launch_id)
);
CREATE INDEX collection_items_launch ON collection_items(launch_id);

CREATE TABLE business_reviews (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  quality_rating INTEGER NOT NULL CHECK (quality_rating BETWEEN 1 AND 5),
  value_rating INTEGER NOT NULL CHECK (value_rating BETWEEN 1 AND 5),
  experience_rating INTEGER NOT NULL CHECK (experience_rating BETWEEN 1 AND 5),
  would_recommend INTEGER NOT NULL CHECK (would_recommend IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (brand_id, reviewer_user_id)
);
CREATE INDEX business_reviews_public ON business_reviews(brand_id, status, created_at DESC);
CREATE TABLE business_review_reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES business_reviews(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('misleading', 'conflict_of_interest', 'abuse', 'other')),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  UNIQUE (review_id, reporter_user_id)
);
CREATE INDEX review_reports_queue ON business_review_reports(status, created_at);

CREATE TABLE business_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_view', 'website_click', 'whatsapp_click', 'call_click', 'email_click', 'directions_click', 'quote_click', 'demo_click', 'store_visit_click', 'product_click')),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  launch_id TEXT REFERENCES launches(id) ON DELETE SET NULL,
  product_id TEXT,
  actor_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direct',
  local_day TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX business_events_brand_day ON business_events(brand_id, local_day, event_type);
CREATE INDEX business_events_launch_day ON business_events(launch_id, local_day, event_type);
CREATE INDEX business_events_product ON business_events(product_id, event_type, local_day);
