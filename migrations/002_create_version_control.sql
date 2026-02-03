-- Migration 002: Create Version Control System
-- Created: 2026-01-21T02:00:00.000Z

BEGIN;

-- Article Versions table - stores complete snapshots of each article version
CREATE TABLE article_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    change_summary TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    tags JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    UNIQUE(article_id, version_number)
);

-- Feedback Resolutions table - tracks which feedback was addressed in version changes
CREATE TABLE feedback_resolutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    resolution_type VARCHAR(20) DEFAULT 'addressed' CHECK (resolution_type IN ('addressed', 'incorporated', 'partially_addressed', 'rejected')),
    resolution_notes TEXT,
    confidence_score DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    UNIQUE(feedback_id, to_version)
);

-- Article Changes table - stores diff information between versions
CREATE TABLE article_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    change_type VARCHAR(20) DEFAULT 'content' CHECK (change_type IN ('content', 'title', 'summary', 'tags')),
    diff_data JSONB NOT NULL, -- stores structured diff information
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    lines_modified INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(article_id, from_version, to_version, change_type)
);

-- Add current_version field to articles table
ALTER TABLE articles ADD COLUMN current_version INTEGER DEFAULT 1;

-- Update existing articles to have version 1
UPDATE articles SET current_version = 1 WHERE current_version IS NULL;

-- Create indexes for performance
CREATE INDEX idx_article_versions_article_id ON article_versions(article_id);
CREATE INDEX idx_article_versions_version_number ON article_versions(version_number);
CREATE INDEX idx_article_versions_created_at ON article_versions(created_at);
CREATE INDEX idx_article_versions_content_hash ON article_versions(content_hash);

CREATE INDEX idx_feedback_resolutions_feedback_id ON feedback_resolutions(feedback_id);
CREATE INDEX idx_feedback_resolutions_article_id ON feedback_resolutions(article_id);
CREATE INDEX idx_feedback_resolutions_to_version ON feedback_resolutions(to_version);
CREATE INDEX idx_feedback_resolutions_resolution_type ON feedback_resolutions(resolution_type);

CREATE INDEX idx_article_changes_article_id ON article_changes(article_id);
CREATE INDEX idx_article_changes_versions ON article_changes(from_version, to_version);
CREATE INDEX idx_article_changes_change_type ON article_changes(change_type);

-- Create initial version records for existing articles
INSERT INTO article_versions (
    article_id,
    version_number,
    title,
    content,
    summary,
    change_summary,
    content_hash,
    created_by,
    created_at
)
SELECT
    id,
    1,
    title,
    content,
    summary,
    'Initial version',
    content_hash,
    user_id,
    created_at
FROM articles
WHERE NOT EXISTS (
    SELECT 1 FROM article_versions WHERE article_versions.article_id = articles.id
);

-- Create trigger to automatically update article's current_version
CREATE OR REPLACE FUNCTION update_article_current_version()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE articles
    SET current_version = NEW.version_number,
        updated_at = NOW()
    WHERE id = NEW.article_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_article_current_version_trigger
    AFTER INSERT ON article_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_article_current_version();

-- Create function to get version statistics
CREATE OR REPLACE FUNCTION get_article_version_stats(article_uuid UUID)
RETURNS TABLE(
    total_versions INTEGER,
    total_changes INTEGER,
    lines_added_total INTEGER,
    lines_removed_total INTEGER,
    last_modified TIMESTAMP WITH TIME ZONE,
    resolution_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(av.version_number)::INTEGER as total_versions,
        COUNT(ac.id)::INTEGER as total_changes,
        SUM(ac.lines_added)::INTEGER as lines_added_total,
        SUM(ac.lines_removed)::INTEGER as lines_removed_total,
        MAX(av.created_at) as last_modified,
        COUNT(fr.id)::INTEGER as resolution_count
    FROM article_versions av
    LEFT JOIN article_changes ac ON av.article_id = ac.article_id
    LEFT JOIN feedback_resolutions fr ON av.article_id = fr.article_id
    WHERE av.article_id = article_uuid;
END;
$$ language 'plpgsql';

-- Create function to get version content by version number
CREATE OR REPLACE FUNCTION get_article_version_content(article_uuid UUID, version_num INTEGER)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    content TEXT,
    summary TEXT,
    change_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    author_username VARCHAR(30),
    author_display_name VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        av.id,
        av.title,
        av.content,
        av.summary,
        av.change_summary,
        av.created_at,
        av.created_by,
        u.username,
        u.display_name
    FROM article_versions av
    LEFT JOIN users u ON av.created_by = u.id
    WHERE av.article_id = article_uuid AND av.version_number = version_num;
END;
$$ language 'plpgsql';

COMMIT;