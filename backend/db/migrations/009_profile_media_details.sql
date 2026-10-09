ALTER TABLE founder_profiles ADD COLUMN pronouns TEXT;
ALTER TABLE founder_profiles ADD COLUMN interests_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE brands ADD COLUMN cover_image_url TEXT;
ALTER TABLE brands ADD COLUMN gallery_image_urls TEXT NOT NULL DEFAULT '[]';
