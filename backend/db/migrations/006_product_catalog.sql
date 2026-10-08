CREATE TABLE products (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 240),
  price_inr_paise INTEGER CHECK (price_inr_paise IS NULL OR price_inr_paise BETWEEN 0 AND 100000000000),
  image_url TEXT,
  buy_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (brand_id, position)
);
CREATE INDEX products_brand_price ON products(brand_id, price_inr_paise, position);
CREATE INDEX products_public_catalog ON products(brand_id, position, created_at);
