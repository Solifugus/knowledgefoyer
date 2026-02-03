/**
 * FeedbackResolution Model
 *
 * Tracks which feedback was addressed in version changes
 */

const { query, transaction } = require('../config/database');

class FeedbackResolution {
  constructor(data = {}) {
    this.id = data.id || null;
    this.feedback_id = data.feedback_id || null;
    this.article_id = data.article_id || null;
    this.from_version = data.from_version || null;
    this.to_version = data.to_version || null;
    this.resolution_type = data.resolution_type || 'addressed';
    this.resolution_notes = data.resolution_notes || null;
    this.confidence_score = data.confidence_score || 1.0;
    this.created_at = data.created_at || null;
    this.created_by = data.created_by || null;
    // For joined queries
    this.feedback = data.feedback || null;
    this.resolver = data.resolver || null;
  }

  /**
   * Valid resolution types
   */
  static get RESOLUTION_TYPES() {
    return ['addressed', 'incorporated', 'partially_addressed', 'rejected'];
  }

  /**
   * Create a new feedback resolution
   */
  static async create(resolutionData) {
    const {
      feedbackId,
      articleId,
      fromVersion,
      toVersion,
      resolutionType = 'addressed',
      resolutionNotes = null,
      confidenceScore = 1.0,
      createdBy
    } = resolutionData;

    // Validate resolution type
    if (!this.RESOLUTION_TYPES.includes(resolutionType)) {
      throw new Error(`Invalid resolution type: ${resolutionType}`);
    }

    // Validate confidence score
    if (confidenceScore < 0.0 || confidenceScore > 1.0) {
      throw new Error('Confidence score must be between 0.0 and 1.0');
    }

    const result = await query(`
      INSERT INTO feedback_resolutions (
        feedback_id, article_id, from_version, to_version,
        resolution_type, resolution_notes, confidence_score, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      feedbackId, articleId, fromVersion, toVersion,
      resolutionType, resolutionNotes, confidenceScore, createdBy
    ]);

    return new FeedbackResolution(result.rows[0]);
  }

  /**
   * Get all resolutions for a feedback item
   */
  static async getByFeedbackId(feedbackId) {
    const result = await query(`
      SELECT fr.*, u.username as resolver_username, u.display_name as resolver_name
      FROM feedback_resolutions fr
      LEFT JOIN users u ON fr.created_by = u.id
      WHERE fr.feedback_id = $1
      ORDER BY fr.created_at DESC
    `, [feedbackId]);

    return result.rows.map(row => {
      const resolution = new FeedbackResolution(row);
      resolution.resolver = {
        username: row.resolver_username,
        display_name: row.resolver_name
      };
      return resolution;
    });
  }

  /**
   * Get all resolutions for an article
   */
  static async getByArticleId(articleId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT fr.*, f.content as feedback_content, f.type as feedback_type,
             fu.username as feedback_author, u.username as resolver_username,
             u.display_name as resolver_name
      FROM feedback_resolutions fr
      LEFT JOIN feedback f ON fr.feedback_id = f.id
      LEFT JOIN users fu ON f.user_id = fu.id
      LEFT JOIN users u ON fr.created_by = u.id
      WHERE fr.article_id = $1
      ORDER BY fr.created_at DESC
      LIMIT $2 OFFSET $3
    `, [articleId, limit, offset]);

    return result.rows.map(row => {
      const resolution = new FeedbackResolution(row);
      resolution.feedback = {
        content: row.feedback_content,
        type: row.feedback_type,
        author: row.feedback_author
      };
      resolution.resolver = {
        username: row.resolver_username,
        display_name: row.resolver_name
      };
      return resolution;
    });
  }

  /**
   * Get resolutions for a specific version
   */
  static async getByVersion(articleId, versionNumber) {
    const result = await query(`
      SELECT fr.*, f.content as feedback_content, f.type as feedback_type,
             fu.username as feedback_author, u.username as resolver_username,
             u.display_name as resolver_name
      FROM feedback_resolutions fr
      LEFT JOIN feedback f ON fr.feedback_id = f.id
      LEFT JOIN users fu ON f.user_id = fu.id
      LEFT JOIN users u ON fr.created_by = u.id
      WHERE fr.article_id = $1 AND fr.to_version = $2
      ORDER BY fr.created_at DESC
    `, [articleId, versionNumber]);

    return result.rows.map(row => {
      const resolution = new FeedbackResolution(row);
      resolution.feedback = {
        content: row.feedback_content,
        type: row.feedback_type,
        author: row.feedback_author
      };
      resolution.resolver = {
        username: row.resolver_username,
        display_name: row.resolver_name
      };
      return resolution;
    });
  }

  /**
   * Get resolutions between versions
   */
  static async getByVersionRange(articleId, fromVersion, toVersion) {
    const result = await query(`
      SELECT fr.*, f.content as feedback_content, f.type as feedback_type,
             fu.username as feedback_author, u.username as resolver_username,
             u.display_name as resolver_name
      FROM feedback_resolutions fr
      LEFT JOIN feedback f ON fr.feedback_id = f.id
      LEFT JOIN users fu ON f.user_id = fu.id
      LEFT JOIN users u ON fr.created_by = u.id
      WHERE fr.article_id = $1
        AND fr.from_version >= $2
        AND fr.to_version <= $3
      ORDER BY fr.to_version ASC, fr.created_at DESC
    `, [articleId, fromVersion, toVersion]);

    return result.rows.map(row => {
      const resolution = new FeedbackResolution(row);
      resolution.feedback = {
        content: row.feedback_content,
        type: row.feedback_type,
        author: row.feedback_author
      };
      resolution.resolver = {
        username: row.resolver_username,
        display_name: row.resolver_name
      };
      return resolution;
    });
  }

  /**
   * Update resolution details
   */
  async update(updates) {
    const allowedFields = [
      'resolution_type', 'resolution_notes', 'confidence_score'
    ];

    const setClause = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'resolution_type' && !FeedbackResolution.RESOLUTION_TYPES.includes(value)) {
          throw new Error(`Invalid resolution type: ${value}`);
        }
        if (key === 'confidence_score' && (value < 0.0 || value > 1.0)) {
          throw new Error('Confidence score must be between 0.0 and 1.0');
        }

        setClause.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
        this[key] = value;
      }
    }

    if (setClause.length === 0) {
      return this;
    }

    values.push(this.id);
    const sql = `
      UPDATE feedback_resolutions
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query(sql, values);
    return new FeedbackResolution(result.rows[0]);
  }

  /**
   * Delete a resolution
   */
  async delete() {
    await query('DELETE FROM feedback_resolutions WHERE id = $1', [this.id]);
    return true;
  }

  /**
   * Get resolution statistics for an article
   */
  static async getResolutionStats(articleId) {
    const result = await query(`
      SELECT
        resolution_type,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM feedback_resolutions
      WHERE article_id = $1
      GROUP BY resolution_type
      ORDER BY count DESC
    `, [articleId]);

    const stats = {
      total: 0,
      by_type: {},
      overall_confidence: 0
    };

    let totalConfidence = 0;
    let totalCount = 0;

    for (const row of result.rows) {
      const count = parseInt(row.count);
      const avgConfidence = parseFloat(row.avg_confidence);

      stats.by_type[row.resolution_type] = {
        count,
        avg_confidence: avgConfidence
      };

      totalCount += count;
      totalConfidence += avgConfidence * count;
    }

    stats.total = totalCount;
    stats.overall_confidence = totalCount > 0 ? totalConfidence / totalCount : 0;

    return stats;
  }

  /**
   * Check if feedback is already resolved in a version
   */
  static async isResolved(feedbackId, toVersion) {
    const result = await query(`
      SELECT id FROM feedback_resolutions
      WHERE feedback_id = $1 AND to_version = $2
      LIMIT 1
    `, [feedbackId, toVersion]);

    return result.rows.length > 0;
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      feedback_id: this.feedback_id,
      article_id: this.article_id,
      from_version: this.from_version,
      to_version: this.to_version,
      resolution_type: this.resolution_type,
      resolution_notes: this.resolution_notes,
      confidence_score: parseFloat(this.confidence_score),
      created_at: this.created_at,
      created_by: this.created_by,
      feedback: this.feedback,
      resolver: this.resolver
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      resolution_type: this.resolution_type,
      resolution_notes: this.resolution_notes,
      confidence_score: parseFloat(this.confidence_score),
      from_version: this.from_version,
      to_version: this.to_version,
      created_at: this.created_at,
      resolver: this.resolver
    };
  }
}

module.exports = FeedbackResolution;