-- Migration: Create AI features and vector embeddings support
-- Phase: 6 (AI-Powered Features)

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table for tracking OpenAI API usage and costs
CREATE TABLE IF NOT EXISTS openai_usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usage_date DATE NOT NULL,
  cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('embedding', 'completion')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for usage tracking
CREATE INDEX idx_openai_usage_date ON openai_usage_tracking(usage_date);
CREATE INDEX idx_openai_usage_type ON openai_usage_tracking(request_type);
CREATE INDEX idx_openai_usage_created_at ON openai_usage_tracking(created_at DESC);

-- Add embedding column to feedback table for similarity search
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ai_similarity_score DECIMAL(4,3);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(50);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMP WITH TIME ZONE;

-- Create HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_feedback_embedding_hnsw
  ON feedback USING hnsw (embedding vector_cosine_ops);

-- Create index for filtering embeddings by article
CREATE INDEX IF NOT EXISTS idx_feedback_article_embedding
  ON feedback(article_id) WHERE embedding IS NOT NULL;

-- Create table for feedback similarity analysis
CREATE TABLE IF NOT EXISTS feedback_similarity_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  similar_feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  similarity_score DECIMAL(4,3) NOT NULL,
  analysis_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure we don't store duplicate similarity pairs
  CONSTRAINT unique_similarity_pair UNIQUE(feedback_id, similar_feedback_id),

  -- Ensure valid similarity score range
  CONSTRAINT valid_similarity_score CHECK (similarity_score >= 0 AND similarity_score <= 1)
);

-- Create indexes for similarity analysis
CREATE INDEX idx_similarity_feedback_id ON feedback_similarity_analysis(feedback_id);
CREATE INDEX idx_similarity_similar_feedback_id ON feedback_similarity_analysis(similar_feedback_id);
CREATE INDEX idx_similarity_score ON feedback_similarity_analysis(similarity_score DESC);

-- Create table for feedback resolution analysis (GPT-4 analysis of addressed feedback)
CREATE TABLE IF NOT EXISTS feedback_resolution_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  article_version INTEGER NOT NULL,
  addressed BOOLEAN NOT NULL,
  confidence_score DECIMAL(4,3) NOT NULL,
  explanation TEXT NOT NULL,
  old_content_hash VARCHAR(64),
  new_content_hash VARCHAR(64),
  analysis_model VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure valid confidence score range
  CONSTRAINT valid_confidence_score CHECK (confidence_score >= 0 AND confidence_score <= 1)
);

-- Create indexes for resolution analysis
CREATE INDEX idx_resolution_feedback_id ON feedback_resolution_analysis(feedback_id);
CREATE INDEX idx_resolution_version ON feedback_resolution_analysis(article_version);
CREATE INDEX idx_resolution_addressed ON feedback_resolution_analysis(addressed);
CREATE INDEX idx_resolution_confidence ON feedback_resolution_analysis(confidence_score DESC);

-- Create function to find similar feedback using vector similarity
CREATE OR REPLACE FUNCTION find_similar_feedback(
  target_embedding vector(1536),
  target_article_id UUID,
  similarity_threshold DECIMAL DEFAULT 0.85,
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
  feedback_id UUID,
  similarity_score DECIMAL,
  content TEXT,
  author_username VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    (1 - (f.embedding <=> target_embedding))::DECIMAL(4,3),
    f.content,
    u.username,
    f.created_at
  FROM feedback f
  JOIN users u ON f.user_id = u.id
  WHERE f.article_id = target_article_id
    AND f.embedding IS NOT NULL
    AND f.status = 'active'
    AND (1 - (f.embedding <=> target_embedding)) >= similarity_threshold
  ORDER BY f.embedding <=> target_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Create function to get feedback embedding statistics
CREATE OR REPLACE FUNCTION get_feedback_embedding_stats()
RETURNS TABLE(
  total_feedback INTEGER,
  with_embeddings INTEGER,
  embedding_percentage DECIMAL,
  avg_similarity_checks INTEGER,
  last_embedding_generated TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_feedback,
    COUNT(embedding)::INTEGER as with_embeddings,
    (COUNT(embedding)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::DECIMAL(5,2) as embedding_percentage,
    (SELECT COUNT(*)::INTEGER FROM feedback_similarity_analysis) as avg_similarity_checks,
    MAX(embedding_generated_at) as last_embedding_generated
  FROM feedback
  WHERE status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old usage tracking data (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_usage_tracking()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM openai_usage_tracking
  WHERE usage_date < CURRENT_DATE - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get daily OpenAI usage summary
CREATE OR REPLACE FUNCTION get_daily_openai_usage(target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
  usage_date DATE,
  total_cost DECIMAL,
  total_requests INTEGER,
  total_tokens INTEGER,
  embedding_requests INTEGER,
  completion_requests INTEGER,
  embedding_cost DECIMAL,
  completion_cost DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    target_date,
    COALESCE(SUM(cost), 0)::DECIMAL(10,6),
    COALESCE(SUM(requests), 0)::INTEGER,
    COALESCE(SUM(tokens), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN request_type = 'embedding' THEN requests ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN request_type = 'completion' THEN requests ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN request_type = 'embedding' THEN cost ELSE 0 END), 0)::DECIMAL(10,6),
    COALESCE(SUM(CASE WHEN request_type = 'completion' THEN cost ELSE 0 END), 0)::DECIMAL(10,6)
  FROM openai_usage_tracking
  WHERE usage_date = target_date;
END;
$$ LANGUAGE plpgsql;

-- Create function to automatically generate embeddings for new feedback
CREATE OR REPLACE FUNCTION queue_feedback_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- Note: The actual embedding generation will be handled by the application
  -- This trigger just ensures the feedback is marked for processing
  NEW.embedding_generated_at = NULL;
  NEW.embedding_model = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to queue embedding generation for new feedback
CREATE TRIGGER queue_feedback_embedding_trigger
  BEFORE INSERT ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION queue_feedback_embedding();

-- Update feedback table constraints for AI features
ALTER TABLE feedback ADD CONSTRAINT valid_ai_similarity_score
  CHECK (ai_similarity_score IS NULL OR (ai_similarity_score >= 0 AND ai_similarity_score <= 1));

-- Add AI-related columns to existing feedback_resolution table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feedback_resolution' AND column_name = 'ai_analyzed'
  ) THEN
    ALTER TABLE feedback_resolution ADD COLUMN ai_analyzed BOOLEAN DEFAULT FALSE;
    ALTER TABLE feedback_resolution ADD COLUMN ai_confidence DECIMAL(4,3);
    ALTER TABLE feedback_resolution ADD COLUMN ai_explanation TEXT;
  END IF;
END$$;

-- Create indexes for AI analysis in feedback_resolution
CREATE INDEX IF NOT EXISTS idx_feedback_resolution_ai_analyzed
  ON feedback_resolution(ai_analyzed);

COMMENT ON TABLE openai_usage_tracking IS 'Tracks OpenAI API usage and costs for budget control';
COMMENT ON TABLE feedback_similarity_analysis IS 'Stores similarity analysis between feedback items';
COMMENT ON TABLE feedback_resolution_analysis IS 'Stores GPT-4 analysis of feedback resolution';
COMMENT ON FUNCTION find_similar_feedback IS 'Finds similar feedback using vector similarity search';
COMMENT ON FUNCTION get_feedback_embedding_stats IS 'Returns statistics about feedback embeddings';
COMMENT ON FUNCTION get_daily_openai_usage IS 'Returns OpenAI usage summary for a specific date';

-- Migration complete
INSERT INTO schema_migrations (version, applied_at)
VALUES ('005_create_ai_features', NOW())
ON CONFLICT (version) DO NOTHING;