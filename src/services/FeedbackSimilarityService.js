/**
 * Feedback Similarity Service for Knowledge Foyer
 *
 * AI-powered feedback similarity detection and analysis using vector embeddings
 */

const { query, transaction } = require('../config/database');
const openAIService = require('./OpenAIService');
const Feedback = require('../models/Feedback');

class FeedbackSimilarityService {
  constructor() {
    this.defaultThreshold = parseFloat(process.env.OPENAI_SIMILARITY_THRESHOLD) || 0.85;
    this.maxSimilarResults = 10;
    this.batchSize = 20; // For batch processing embeddings
  }

  /**
   * Check if new feedback content is similar to existing feedback
   */
  async checkSimilarity(articleId, content, options = {}) {
    const {
      threshold = this.defaultThreshold,
      maxResults = this.maxSimilarResults,
      generateAnalysis = true
    } = options;

    if (!openAIService.isEnabled) {
      return {
        hasSimilar: false,
        similarFeedback: [],
        analysis: null,
        threshold,
        aiEnabled: false,
        message: 'AI similarity detection is currently unavailable'
      };
    }

    try {
      // Generate embedding for the new content
      console.log(`🔍 Checking similarity for feedback on article ${articleId}`);

      const embeddingResult = await openAIService.generateEmbedding(content);

      // Search for similar feedback using vector similarity
      const similarResults = await query(`
        SELECT * FROM find_similar_feedback($1, $2, $3, $4)
      `, [JSON.stringify(embeddingResult.embedding), articleId, threshold, maxResults]);

      const similarFeedback = similarResults.rows.map(row => ({
        feedback_id: row.feedback_id,
        similarity_score: parseFloat(row.similarity_score),
        content: row.content,
        author_username: row.author_username,
        created_at: row.created_at
      }));

      let analysis = null;

      // Generate detailed analysis if similar feedback found and requested
      if (similarFeedback.length > 0 && generateAnalysis) {
        try {
          analysis = await this.generateSimilarityAnalysis(content, similarFeedback);
        } catch (analysisError) {
          console.error('Error generating similarity analysis:', analysisError.message);
          analysis = 'Similar feedback detected, but detailed analysis is temporarily unavailable.';
        }
      }

      console.log(`🔍 Found ${similarFeedback.length} similar feedback items (threshold: ${threshold})`);

      return {
        hasSimilar: similarFeedback.length > 0,
        similarFeedback,
        analysis,
        threshold,
        aiEnabled: true,
        embedding: {
          model: embeddingResult.model,
          tokens: embeddingResult.tokens,
          cost: embeddingResult.cost
        }
      };
    } catch (error) {
      console.error('Error in similarity check:', error.message);

      // Return graceful degradation
      return {
        hasSimilar: false,
        similarFeedback: [],
        analysis: null,
        threshold,
        aiEnabled: false,
        error: error.message,
        message: 'AI similarity detection temporarily unavailable'
      };
    }
  }

  /**
   * Generate detailed analysis comparing new feedback to similar existing feedback
   */
  async generateSimilarityAnalysis(newContent, similarFeedback) {
    if (!openAIService.isEnabled || similarFeedback.length === 0) {
      return null;
    }

    try {
      const mostSimilar = similarFeedback[0]; // Highest similarity score
      const otherSimilar = similarFeedback.slice(1, 3); // Up to 2 more for context

      let analysisPrompt = `
Compare this new feedback submission with existing similar feedback and analyze what makes it unique or redundant.

NEW FEEDBACK:
"${newContent}"

MOST SIMILAR EXISTING FEEDBACK (${(mostSimilar.similarity_score * 100).toFixed(1)}% similar):
"${mostSimilar.content}"
- Author: ${mostSimilar.author_username}
- Posted: ${new Date(mostSimilar.created_at).toLocaleDateString()}
      `.trim();

      // Add additional similar feedback for context if available
      if (otherSimilar.length > 0) {
        analysisPrompt += "\n\nOTHER SIMILAR FEEDBACK:";
        otherSimilar.forEach((feedback, index) => {
          analysisPrompt += `\n\n${index + 2}. (${(feedback.similarity_score * 100).toFixed(1)}% similar):
"${feedback.content}"
- Author: ${feedback.author_username}`;
        });
      }

      analysisPrompt += `

Please provide:
1. A brief summary of what the new feedback adds that's not already covered
2. Whether the new feedback provides significant additional value
3. Key differences or unique perspectives in the new submission

Keep the response concise and actionable.`;

      const systemPrompt = `You are an expert at analyzing feedback quality and similarity. Your role is to help users understand whether their feedback adds value to the conversation or if it's redundant with existing feedback. Be fair, constructive, and specific in your analysis.`;

      const completionResult = await openAIService.generateCompletion(analysisPrompt, systemPrompt);

      return completionResult.content;
    } catch (error) {
      console.error('Error generating detailed similarity analysis:', error.message);
      throw error;
    }
  }

  /**
   * Store similarity analysis in database for future reference
   */
  async storeSimilarityAnalysis(feedbackId, similarFeedbackId, similarityScore, analysisText = null) {
    try {
      await query(`
        INSERT INTO feedback_similarity_analysis (
          feedback_id, similar_feedback_id, similarity_score, analysis_text
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (feedback_id, similar_feedback_id)
        DO UPDATE SET
          similarity_score = EXCLUDED.similarity_score,
          analysis_text = EXCLUDED.analysis_text
      `, [feedbackId, similarFeedbackId, similarityScore, analysisText]);

      return true;
    } catch (error) {
      console.error('Error storing similarity analysis:', error.message);
      return false;
    }
  }

  /**
   * Get similarity analysis history for a feedback item
   */
  async getSimilarityHistory(feedbackId) {
    const result = await query(`
      SELECT
        fsa.*,
        f.content as similar_content,
        u.username as similar_author_username
      FROM feedback_similarity_analysis fsa
      JOIN feedback f ON fsa.similar_feedback_id = f.id
      JOIN users u ON f.user_id = u.id
      WHERE fsa.feedback_id = $1
      ORDER BY fsa.similarity_score DESC
    `, [feedbackId]);

    return result.rows.map(row => ({
      similar_feedback_id: row.similar_feedback_id,
      similarity_score: parseFloat(row.similarity_score),
      analysis_text: row.analysis_text,
      created_at: row.created_at,
      similar_content: row.similar_content,
      similar_author_username: row.similar_author_username
    }));
  }

  /**
   * Generate embeddings for existing feedback that doesn't have them (batch processing)
   */
  async generateMissingEmbeddings(limit = 50) {
    if (!openAIService.isEnabled) {
      console.log('🤖 OpenAI service not available for embedding generation');
      return { processed: 0, errors: 0, cost: 0 };
    }

    try {
      // Find feedback without embeddings
      const result = await query(`
        SELECT id, content
        FROM feedback
        WHERE embedding IS NULL
          AND status = 'active'
          AND LENGTH(TRIM(content)) > 0
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      const feedbackItems = result.rows;
      let processed = 0;
      let errors = 0;
      let totalCost = 0;

      console.log(`🤖 Generating embeddings for ${feedbackItems.length} feedback items`);

      for (const item of feedbackItems) {
        try {
          const embeddingResult = await openAIService.generateEmbedding(item.content);

          // Update feedback with embedding
          await query(`
            UPDATE feedback
            SET embedding = $1,
                embedding_model = $2,
                embedding_generated_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
          `, [JSON.stringify(embeddingResult.embedding), embeddingResult.model, item.id]);

          processed++;
          totalCost += embeddingResult.cost;

          // Add small delay to avoid rate limits
          if (processed % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Error generating embedding for feedback ${item.id}:`, error.message);
          errors++;

          // Stop if we hit API limits
          if (error.message.includes('quota') || error.message.includes('rate limit')) {
            console.log('🤖 Stopping batch processing due to API limits');
            break;
          }
        }
      }

      console.log(`🤖 Batch embedding generation complete: ${processed} processed, ${errors} errors, $${totalCost.toFixed(6)} cost`);

      return {
        processed,
        errors,
        cost: totalCost,
        remaining: Math.max(0, feedbackItems.length - processed - errors)
      };
    } catch (error) {
      console.error('Error in batch embedding generation:', error.message);
      throw error;
    }
  }

  /**
   * Find all similar feedback pairs above threshold (for analytics)
   */
  async findAllSimilarPairs(articleId = null, threshold = null) {
    threshold = threshold || this.defaultThreshold;

    let whereClause = '';
    const params = [threshold];

    if (articleId) {
      whereClause = 'AND f1.article_id = $2';
      params.push(articleId);
    }

    const result = await query(`
      SELECT
        f1.id as feedback1_id,
        f2.id as feedback2_id,
        f1.content as content1,
        f2.content as content2,
        f1.article_id,
        u1.username as author1,
        u2.username as author2,
        (1 - (f1.embedding <=> f2.embedding))::DECIMAL(4,3) as similarity_score
      FROM feedback f1
      JOIN feedback f2 ON f1.article_id = f2.article_id AND f1.id < f2.id
      JOIN users u1 ON f1.user_id = u1.id
      JOIN users u2 ON f2.user_id = u2.id
      WHERE f1.embedding IS NOT NULL
        AND f2.embedding IS NOT NULL
        AND f1.status = 'active'
        AND f2.status = 'active'
        AND (1 - (f1.embedding <=> f2.embedding)) >= $1
        ${whereClause}
      ORDER BY similarity_score DESC
    `, params);

    return result.rows.map(row => ({
      feedback1_id: row.feedback1_id,
      feedback2_id: row.feedback2_id,
      content1: row.content1,
      content2: row.content2,
      article_id: row.article_id,
      author1: row.author1,
      author2: row.author2,
      similarity_score: parseFloat(row.similarity_score)
    }));
  }

  /**
   * Get similarity detection statistics
   */
  async getStatistics() {
    try {
      const [embeddingStats, similarityStats, usageStats] = await Promise.all([
        // Embedding statistics
        query(`SELECT * FROM get_feedback_embedding_stats()`),

        // Similarity analysis statistics
        query(`
          SELECT
            COUNT(*) as total_analyses,
            AVG(similarity_score) as avg_similarity_score,
            COUNT(CASE WHEN similarity_score >= 0.9 THEN 1 END) as high_similarity_count,
            COUNT(CASE WHEN similarity_score BETWEEN 0.8 AND 0.9 THEN 1 END) as medium_similarity_count,
            MAX(created_at) as last_analysis_at
          FROM feedback_similarity_analysis
        `),

        // OpenAI usage statistics
        openAIService.getUsageStats()
      ]);

      return {
        embeddings: embeddingStats.rows[0],
        similarity_analyses: {
          ...similarityStats.rows[0],
          total_analyses: parseInt(similarityStats.rows[0].total_analyses),
          avg_similarity_score: parseFloat(similarityStats.rows[0].avg_similarity_score),
          high_similarity_count: parseInt(similarityStats.rows[0].high_similarity_count),
          medium_similarity_count: parseInt(similarityStats.rows[0].medium_similarity_count)
        },
        openai_usage: usageStats,
        threshold: this.defaultThreshold,
        max_results: this.maxSimilarResults
      };
    } catch (error) {
      console.error('Error getting similarity statistics:', error.message);
      return {
        embeddings: null,
        similarity_analyses: null,
        openai_usage: null,
        error: error.message
      };
    }
  }

  /**
   * Update similarity threshold
   */
  setThreshold(newThreshold) {
    if (newThreshold < 0 || newThreshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }

    this.defaultThreshold = newThreshold;
    console.log(`🔍 Similarity threshold updated to ${newThreshold}`);
  }

  /**
   * Test similarity detection with sample feedback
   */
  async testSimilarityDetection(articleId, testContent) {
    try {
      const startTime = Date.now();
      const result = await this.checkSimilarity(articleId, testContent);
      const endTime = Date.now();

      return {
        ...result,
        performance: {
          duration_ms: endTime - startTime,
          success: true
        }
      };
    } catch (error) {
      return {
        hasSimilar: false,
        similarFeedback: [],
        analysis: null,
        aiEnabled: false,
        error: error.message,
        performance: {
          success: false,
          error: error.message
        }
      };
    }
  }
}

// Create singleton instance
const feedbackSimilarityService = new FeedbackSimilarityService();

module.exports = feedbackSimilarityService;