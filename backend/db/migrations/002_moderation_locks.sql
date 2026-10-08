ALTER TABLE brands ADD COLUMN moderation_locked INTEGER NOT NULL DEFAULT 0 CHECK (moderation_locked IN (0, 1));
ALTER TABLE launches ADD COLUMN moderation_locked INTEGER NOT NULL DEFAULT 0 CHECK (moderation_locked IN (0, 1));
