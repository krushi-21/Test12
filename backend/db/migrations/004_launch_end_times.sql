ALTER TABLE launches ADD COLUMN ends_at TEXT;
CREATE INDEX launches_ending_soon ON launches(status, ends_at);
