CREATE TABLE business_saves (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, brand_id)
);
CREATE INDEX business_saves_brand ON business_saves(brand_id, created_at DESC);

CREATE TABLE scheduled_publications (
  id TEXT PRIMARY KEY,
  launch_id TEXT NOT NULL UNIQUE REFERENCES launches(id) ON DELETE CASCADE,
  publish_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX scheduled_publications_due ON scheduled_publications(publish_at, launch_id);
