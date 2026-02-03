/**
 * Feedback Model for Knowledge Foyer
 *
 * Manages user feedback on articles with AI-powered similarity detection
 */

const { query, transaction } = require('../config/database');
const validator = require('validator');

class Feedback {
  constructor(data = {}) {
    this.id = data.id || null;
    this.article_id = data.article_id || null;
    this.user_id = data.user_id || null;
    this.content = data.content || '';
    this.is_public = data.is_public !== undefined ? data.is_public : true;
    this.status = data.status || 'active';
    this.embedding = data.embedding || null;
    this.ai_similarity_score = data.ai_similarity_score || null;
    this.embedding_model = data.embedding_model || null;
    this.embedding_generated_at = data.embedding_generated_at || null;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    // For joined queries
    this.author = data.author || null;
    this.article = data.article || null;
    this.ranking = data.ranking || null;
  }

  /**
   * Valid feedback statuses
   */
  static get STATUS_OPTIONS() {
    return ['active', 'addressed', 'ignored_by_ai', 'manually_restored'];
  }

  /**
   * Create new feedback
   */
  static async create(feedbackData) {
    const {
      articleId,
      userId,
      content,
      isPublic = true
    } = feedbackData;

    // Validation
    if (!content || content.trim().length === 0) {
      throw new Error('Feedback content is required');
    }

    if (content.length > 2000) {
      throw new Error('Feedback content cannot exceed 2000 characters');
    }

    if (!validator.isUUID(articleId)) {
      throw new Error('Invalid article ID');
    }

    if (!validator.isUUID(userId)) {
      throw new Error('Invalid user ID');
    }

    return await transaction(async (client) => {
      // Check if article exists and user is not the author
      const articleResult = await client.query(
        'SELECT user_id FROM articles WHERE id = $1',
        [articleId]
      );

      if (articleResult.rows.length === 0) {
        throw new Error('Article not found');
      }

      if (articleResult.rows[0].user_id === userId) {
        throw new Error('Authors cannot provide feedback on their own articles');
      }

      // Create feedback
      const result = await client.query(`
        INSERT INTO feedback (
          article_id, user_id, content, is_public, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [articleId, userId, content.trim(), isPublic, 'active']);

      const feedback = new Feedback(result.rows[0]);

      // Queue for embedding generation (handled by background service)
      try {
        const openAIService = require('../services/OpenAIService');
        if (openAIService.isEnabled) {
          // Generate embedding asynchronously
          setImmediate(async () => {
            try {
              await feedback.generateEmbedding();
            } catch (error) {
              console.error('Error generating feedback embedding:', error.message);
            }
          });
        }
      } catch (error) {
        console.error('Error queuing embedding generation:', error.message);
      }

      return feedback;
    });
  }

  /**
   * Find feedback by ID
   */
  static async findById(id, includeAuthor = false) {
    let selectClause = 'f.*';
    let joinClause = '';

    if (includeAuthor) {
      selectClause += ', u.username, u.display_name, u.avatar_url';
      joinClause = 'LEFT JOIN users u ON f.user_id = u.id';
    }

    const result = await query(`
      SELECT ${selectClause}
      FROM feedback f
      ${joinClause}
      WHERE f.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const feedback = new Feedback(result.rows[0]);

    if (includeAuthor) {
      feedback.author = {
        username: result.rows[0].username,
        display_name: result.rows[0].display_name,
        avatar_url: result.rows[0].avatar_url
      };
    }

    return feedback;
  }

  /**
   * Get feedback for article
   */
  static async findByArticle(articleId, options = {}) {
    const {
      includePrivate = false,
      status = 'active',
      includeAuthor = true,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    let whereClause = 'WHERE f.article_id = $1';
    const params = [articleId];
    let paramCount = 1;

    if (!includePrivate) {
      whereClause += ' AND f.is_public = true';
    }

    if (status) {
      paramCount++;
      whereClause += ` AND f.status = $${paramCount}`;
      params.push(status);
    }

    const validOrderFields = ['created_at', 'updated_at'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'created_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let selectClause = 'f.*';
    let joinClause = '';

    if (includeAuthor) {
      selectClause += ', u.username, u.display_name, u.avatar_url';
      joinClause = 'LEFT JOIN users u ON f.user_id = u.id';
    }

    const result = await query(`
      SELECT ${selectClause}
      FROM feedback f
      ${joinClause}
      ${whereClause}
      ORDER BY f.${orderField} ${direction}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => {
      const feedback = new Feedback(row);

      if (includeAuthor) {
        feedback.author = {
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url
        };
      }

      return feedback;
    });
  }

  /**
   * Find feedback by user
   */
  static async findByUser(userId, options = {}) {
    const {
      includePrivate = true,
      status = 'active',
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    let whereClause = 'WHERE f.user_id = $1';
    const params = [userId];
    let paramCount = 1;

    if (!includePrivate) {
      whereClause += ' AND f.is_public = true';
    }

    if (status) {
      paramCount++;
      whereClause += ` AND f.status = $${paramCount}`;
      params.push(status);
    }

    const validOrderFields = ['created_at', 'updated_at'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'created_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await query(`
      SELECT
        f.*,
        a.title as article_title,
        a.slug as article_slug,
        au.username as article_author_username
      FROM feedback f
      LEFT JOIN articles a ON f.article_id = a.id
      LEFT JOIN users au ON a.user_id = au.id
      ${whereClause}
      ORDER BY f.${orderField} ${direction}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => {
      const feedback = new Feedback(row);
      feedback.article = {
        title: row.article_title,
        slug: row.article_slug,
        author_username: row.article_author_username
      };
      return feedback;
    });
  }

  /**
   * Generate embedding for this feedback
   */
  async generateEmbedding() {
    if (!this.content || this.content.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty content');
    }

    if (this.embedding) {
      console.log(`Feedback ${this.id} already has embedding`);
      return this;
    }

    const openAIService = require('../services/OpenAIService');

    if (!openAIService.isEnabled) {
      throw new Error('OpenAI service not available for embedding generation');
    }

    try {
      const result = await openAIService.generateEmbedding(this.content);

      // Update database with embedding
      const updateResult = await query(`
        UPDATE feedback
        SET embedding = $1,
            embedding_model = $2,
            embedding_generated_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [JSON.stringify(result.embedding), result.model, this.id]);

      Object.assign(this, updateResult.rows[0]);

      console.log(`✅ Generated embedding for feedback ${this.id}`);
      return this;
    } catch (error) {
      console.error(`❌ Failed to generate embedding for feedback ${this.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Find similar feedback using vector search
   */
  async findSimilar(threshold = 0.85, maxResults = 10) {
    if (!this.embedding) {
      throw new Error('Feedback must have embedding to find similar items');
    }

    const result = await query(`
      SELECT * FROM find_similar_feedback($1, $2, $3, $4)
    `, [JSON.stringify(this.embedding), this.article_id, threshold, maxResults]);

    return result.rows.map(row => ({
      feedback_id: row.feedback_id,
      similarity_score: parseFloat(row.similarity_score),
      content: row.content,
      author_username: row.author_username,
      created_at: row.created_at
    }));
  }

  /**
   * Check for similar feedback before creation (static method)
   */
  static async checkSimilarity(articleId, content, threshold = 0.85) {
    const openAIService = require('../services/OpenAIService');

    if (!openAIService.isEnabled) {
      return { hasSimilar: false, similarFeedback: [], analysis: null };
    }

    try {
      // Generate embedding for the new content
      const embeddingResult = await openAIService.generateEmbedding(content);

      // Search for similar feedback
      const result = await query(`
        SELECT * FROM find_similar_feedback($1, $2, $3, 10)
      `, [JSON.stringify(embeddingResult.embedding), articleId, threshold]);

      const similarFeedback = result.rows.map(row => ({
        feedback_id: row.feedback_id,
        similarity_score: parseFloat(row.similarity_score),
        content: row.content,
        author_username: row.author_username,
        created_at: row.created_at
      }));

      let analysis = null;

      // Generate analysis if similar feedback found
      if (similarFeedback.length > 0) {
        try {
          const mostSimilar = similarFeedback[0];
          const analysisPrompt = `
Compare these two feedback items and explain the key differences:

Original feedback: "${mostSimilar.content}"

New feedback: "${content}"

Provide a brief analysis of what the new feedback adds that the original doesn't cover.
          `.trim();

          const systemPrompt = "You are an expert at analyzing feedback similarity. Provide concise, helpful analysis about what makes feedback unique or redundant.";

          const completionResult = await openAIService.generateCompletion(analysisPrompt, systemPrompt);
          analysis = completionResult.content;
        } catch (error) {
          console.error('Error generating similarity analysis:', error.message);
          analysis = 'Unable to generate detailed analysis at this time.';
        }
      }

      return {
        hasSimilar: similarFeedback.length > 0,
        similarFeedback,
        analysis,
        threshold
      };
    } catch (error) {
      console.error('Error checking feedback similarity:', error.message);
      return { hasSimilar: false, similarFeedback: [], analysis: null, error: error.message };
    }
  }

  /**
   * Update feedback status
   */
  async updateStatus(newStatus, userId = null) {
    if (!Feedback.STATUS_OPTIONS.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    // Check permissions if userId provided
    if (userId && this.user_id !== userId) {
      // Allow article authors to mark feedback as addressed
      const articleResult = await query(
        'SELECT user_id FROM articles WHERE id = $1',
        [this.article_id]
      );

      if (articleResult.rows.length === 0 || articleResult.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to update feedback status');
      }
    }

    const result = await query(`
      UPDATE feedback
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [newStatus, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Delete feedback
   */
  async delete(userId) {
    // Only feedback author or article author can delete
    if (this.user_id !== userId) {
      const articleResult = await query(
        'SELECT user_id FROM articles WHERE id = $1',
        [this.article_id]
      );

      if (articleResult.rows.length === 0 || articleResult.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to delete feedback');
      }
    }

    await transaction(async (client) => {
      // Delete related data
      await client.query('DELETE FROM feedback_similarity_analysis WHERE feedback_id = $1 OR similar_feedback_id = $1', [this.id]);
      await client.query('DELETE FROM feedback_resolution_analysis WHERE feedback_id = $1', [this.id]);
      await client.query('DELETE FROM feedback_ranking WHERE feedback_id = $1', [this.id]);
      await client.query('DELETE FROM feedback WHERE id = $1', [this.id]);
    });

    return true;
  }

  /**
   * Get feedback statistics
   */
  static async getStatistics() {
    const result = await query(`
      SELECT * FROM get_feedback_embedding_stats()
    `);

    const stats = result.rows[0];

    // Get additional stats
    const additionalStats = await query(`
      SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_feedback,
        COUNT(CASE WHEN status = 'addressed' THEN 1 END) as addressed_feedback,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_feedback,
        COUNT(CASE WHEN is_public = false THEN 1 END) as private_feedback
      FROM feedback
    `);

    return {
      ...stats,
      ...additionalStats.rows[0],
      total_feedback: parseInt(stats.total_feedback),
      with_embeddings: parseInt(stats.with_embeddings),
      embedding_percentage: parseFloat(stats.embedding_percentage),
      avg_similarity_checks: parseInt(stats.avg_similarity_checks),
      active_feedback: parseInt(additionalStats.rows[0].active_feedback),
      addressed_feedback: parseInt(additionalStats.rows[0].addressed_feedback),
      public_feedback: parseInt(additionalStats.rows[0].public_feedback),
      private_feedback: parseInt(additionalStats.rows[0].private_feedback)
    };
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      article_id: this.article_id,
      user_id: this.user_id,
      content: this.content,
      is_public: this.is_public,
      status: this.status,
      ai_similarity_score: this.ai_similarity_score,
      embedding_model: this.embedding_model,
      embedding_generated_at: this.embedding_generated_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
      author: this.author,
      article: this.article,
      ranking: this.ranking
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      id: this.id,
      content: this.content,
      is_public: this.is_public,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      author: this.author ? {
        username: this.author.username,
        display_name: this.author.display_name
      } : null,
      ranking: this.ranking
    };
  }
}

module.exports = Feedback;