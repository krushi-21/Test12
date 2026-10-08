CREATE TABLE business_events_new (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_view', 'website_click', 'whatsapp_click', 'call_click', 'email_click', 'directions_click', 'quote_click', 'demo_click', 'store_visit_click', 'product_click', 'business_save')),
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  launch_id TEXT REFERENCES launches(id) ON DELETE SET NULL,
  product_id TEXT,
  actor_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direct',
  local_day TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO business_events_new (id, event_type, brand_id, launch_id, product_id, actor_key, source, local_day, created_at)
SELECT id, event_type, brand_id, launch_id, product_id, actor_key, source, local_day, created_at
FROM business_events;

DROP TABLE business_events;
ALTER TABLE business_events_new RENAME TO business_events;

CREATE INDEX business_events_brand_day ON business_events(brand_id, local_day, event_type);
CREATE INDEX business_events_launch_day ON business_events(launch_id, local_day, event_type);
CREATE INDEX business_events_product ON business_events(product_id, event_type, local_day);
