ALTER TABLE engagement_events ADD COLUMN source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'search', 'following', 'collection', 'trending', 'nearby', 'external', 'unknown'));
CREATE INDEX engagement_source_day ON engagement_events(source, local_day, event_type);
