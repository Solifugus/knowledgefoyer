-- Migration: Create exposition tables for custom content curation
-- Phase: 5 (Custom Exposition Pages)

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create expositions table
CREATE TABLE IF NOT EXISTS expositions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique slug per author
  CONSTRAINT unique_author_slug UNIQUE(author_id, slug),

  -- Constraints
  CONSTRAINT exposition_title_length CHECK (LENGTH(title) >= 1 AND LENGTH(title) <= 255),
  CONSTRAINT exposition_slug_format CHECK (slug ~ '^[a-z0-9-]+$' AND LENGTH(slug) >= 1 AND LENGTH(slug) <= 100),
  CONSTRAINT exposition_description_length CHECK (description IS NULL OR LENGTH(description) <= 2000)
);

-- Create exposition_criteria table
CREATE TABLE IF NOT EXISTS exposition_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exposition_id UUID NOT NULL REFERENCES expositions(id) ON DELETE CASCADE,
  criterion_type VARCHAR(20) NOT NULL CHECK (criterion_type IN ('author', 'tag')),
  criterion_value VARCHAR(100) NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique criteria per exposition
  CONSTRAINT unique_exposition_criterion UNIQUE(exposition_id, criterion_type, criterion_value),

  -- Constraints
  CONSTRAINT criterion_value_length CHECK (LENGTH(criterion_value) >= 1 AND LENGTH(criterion_value) <= 100)
);

-- Create indexes for performance
CREATE INDEX idx_expositions_author_id ON expositions(author_id);
CREATE INDEX idx_expositions_status ON expositions(status);
CREATE INDEX idx_expositions_created_at ON expositions(created_at DESC);
CREATE INDEX idx_expositions_author_slug ON expositions(author_id, slug);

CREATE INDEX idx_exposition_criteria_exposition_id ON exposition_criteria(exposition_id);
CREATE INDEX idx_exposition_criteria_type_value ON exposition_criteria(criterion_type, criterion_value);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exposition_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_expositions_updated_at
  BEFORE UPDATE ON expositions
  FOR EACH ROW
  EXECUTE FUNCTION update_exposition_updated_at();

-- Create function to get articles matching exposition criteria (OR logic)
CREATE OR REPLACE FUNCTION get_exposition_articles(exposition_uuid UUID)
RETURNS TABLE(
  article_id UUID,
  article_title VARCHAR,
  article_slug VARCHAR,
  article_summary TEXT,
  article_published_at TIMESTAMP WITH TIME ZONE,
  article_updated_at TIMESTAMP WITH TIME ZONE,
  author_id UUID,
  author_username VARCHAR,
  author_display_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    a.id,
    a.title,
    a.slug,
    a.summary,
    a.published_at,
    a.updated_at,
    a.user_id,
    u.username,
    u.display_name
  FROM articles a
  JOIN users u ON a.user_id = u.id
  WHERE a.status = 'published'
    AND a.visibility = 'public'
    AND (
      -- Match articles by author criteria
      EXISTS (
        SELECT 1 FROM exposition_criteria ec
        WHERE ec.exposition_id = exposition_uuid
          AND ec.criterion_type = 'author'
          AND ec.criterion_value = u.username
      )
      OR
      -- Match articles by tag criteria
      EXISTS (
        SELECT 1 FROM exposition_criteria ec
        JOIN article_tags at ON true
        JOIN tags t ON at.tag_id = t.id
        WHERE ec.exposition_id = exposition_uuid
          AND ec.criterion_type = 'tag'
          AND ec.criterion_value = t.name
          AND at.article_id = a.id
      )
    )
  ORDER BY a.published_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get exposition statistics
CREATE OR REPLACE FUNCTION get_exposition_stats(exposition_uuid UUID)
RETURNS TABLE(
  total_articles INTEGER,
  total_criteria INTEGER,
  author_criteria INTEGER,
  tag_criteria INTEGER,
  latest_article_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM get_exposition_articles(exposition_uuid)),
    (SELECT COUNT(*)::INTEGER FROM exposition_criteria WHERE exposition_id = exposition_uuid),
    (SELECT COUNT(*)::INTEGER FROM exposition_criteria WHERE exposition_id = exposition_uuid AND criterion_type = 'author'),
    (SELECT COUNT(*)::INTEGER FROM exposition_criteria WHERE exposition_id = exposition_uuid AND criterion_type = 'tag'),
    (SELECT MAX(article_published_at) FROM get_exposition_articles(exposition_uuid));
END;
$$ LANGUAGE plpgsql;

-- Create function to check if user can edit exposition
CREATE OR REPLACE FUNCTION can_edit_exposition(exposition_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM expositions
    WHERE id = exposition_uuid
      AND author_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql;

-- Add exposition count to users table (we'll handle this via triggers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'expositions_count'
  ) THEN
    ALTER TABLE users ADD COLUMN expositions_count INTEGER DEFAULT 0;
  END IF;
END$$;

-- Create function to update user exposition count
CREATE OR REPLACE FUNCTION update_user_exposition_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users
    SET expositions_count = expositions_count + 1
    WHERE id = NEW.author_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users
    SET expositions_count = GREATEST(expositions_count - 1, 0)
    WHERE id = OLD.author_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for exposition count
CREATE TRIGGER update_user_exposition_count_insert
  AFTER INSERT ON expositions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_exposition_count();

CREATE TRIGGER update_user_exposition_count_delete
  AFTER DELETE ON expositions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_exposition_count();

-- Initialize existing user exposition counts
UPDATE users SET expositions_count = (
  SELECT COUNT(*) FROM expositions WHERE author_id = users.id
);

-- Add indices for exposition article queries
CREATE INDEX IF NOT EXISTS idx_articles_status_visibility ON articles(status, visibility);
CREATE INDEX IF NOT EXISTS idx_articles_user_published ON articles(user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_tags_article_id ON article_tags(article_id);

COMMENT ON TABLE expositions IS 'Custom exposition pages created by users to curate articles';
COMMENT ON TABLE exposition_criteria IS 'Criteria defining which articles appear on exposition pages';
COMMENT ON FUNCTION get_exposition_articles IS 'Returns all articles matching exposition criteria using OR logic';
COMMENT ON FUNCTION get_exposition_stats IS 'Returns statistics about an exposition';
COMMENT ON FUNCTION can_edit_exposition IS 'Checks if a user has permission to edit an exposition';

-- Migration complete
INSERT INTO schema_migrations (version, applied_at)
VALUES ('004_create_expositions', NOW())
ON CONFLICT (version) DO NOTHING;