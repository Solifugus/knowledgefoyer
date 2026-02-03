/**
 * ExpositionCriteria Model for Knowledge Foyer
 *
 * Manages criteria that define which articles appear on exposition pages
 */

const { query, transaction } = require('../config/database');

class ExpositionCriteria {
  constructor(data = {}) {
    this.id = data.id || null;
    this.exposition_id = data.exposition_id || null;
    this.criterion_type = data.criterion_type || null;
    this.criterion_value = data.criterion_value || null;
    this.added_at = data.added_at || null;
    // For joined queries
    this.exposition = data.exposition || null;
    this.resolved_author = data.resolved_author || null;
    this.resolved_tag = data.resolved_tag || null;
  }

  /**
   * Valid criterion types
   */
  static get CRITERION_TYPES() {
    return ['author', 'tag'];
  }

  /**
   * Maximum criteria per exposition
   */
  static get MAX_CRITERIA_PER_EXPOSITION() {
    return 50;
  }

  /**
   * Add criterion to exposition
   */
  static async create(expositionId, criterionType, criterionValue, userId) {
    // Validation
    if (!ExpositionCriteria.CRITERION_TYPES.includes(criterionType)) {
      throw new Error(`Invalid criterion type: ${criterionType}`);
    }

    if (!criterionValue || criterionValue.trim().length === 0) {
      throw new Error('Criterion value is required');
    }

    if (criterionValue.length > 100) {
      throw new Error('Criterion value cannot exceed 100 characters');
    }

    // Normalize value
    const normalizedValue = criterionValue.trim().toLowerCase();

    return await transaction(async (client) => {
      // Check if user owns the exposition
      const expositionResult = await client.query(
        'SELECT author_id FROM expositions WHERE id = $1',
        [expositionId]
      );

      if (expositionResult.rows.length === 0) {
        throw new Error('Exposition not found');
      }

      if (expositionResult.rows[0].author_id !== userId) {
        throw new Error('Unauthorized to modify this exposition');
      }

      // Check criteria limit
      const countResult = await client.query(
        'SELECT COUNT(*) FROM exposition_criteria WHERE exposition_id = $1',
        [expositionId]
      );

      if (parseInt(countResult.rows[0].count) >= ExpositionCriteria.MAX_CRITERIA_PER_EXPOSITION) {
        throw new Error(`Maximum ${ExpositionCriteria.MAX_CRITERIA_PER_EXPOSITION} criteria per exposition`);
      }

      // Validate criterion value based on type
      if (criterionType === 'author') {
        // Check if user exists
        const userResult = await client.query(
          'SELECT username FROM users WHERE LOWER(username) = $1 AND is_active = true',
          [normalizedValue]
        );

        if (userResult.rows.length === 0) {
          throw new Error(`User '${criterionValue}' not found`);
        }

        // Use actual username casing
        normalizedValue = userResult.rows[0].username;
      } else if (criterionType === 'tag') {
        // Check if tag exists
        const tagResult = await client.query(
          'SELECT name FROM tags WHERE LOWER(name) = $1',
          [normalizedValue]
        );

        if (tagResult.rows.length === 0) {
          throw new Error(`Tag '${criterionValue}' not found`);
        }

        // Use actual tag casing
        normalizedValue = tagResult.rows[0].name;
      }

      // Check for duplicate criterion
      const existingResult = await client.query(`
        SELECT id FROM exposition_criteria
        WHERE exposition_id = $1
          AND criterion_type = $2
          AND LOWER(criterion_value) = $3
      `, [expositionId, criterionType, normalizedValue.toLowerCase()]);

      if (existingResult.rows.length > 0) {
        throw new Error(`Criterion '${criterionValue}' already exists for this ${criterionType}`);
      }

      // Create the criterion
      const result = await client.query(`
        INSERT INTO exposition_criteria (
          exposition_id, criterion_type, criterion_value
        ) VALUES ($1, $2, $3)
        RETURNING *
      `, [expositionId, criterionType, normalizedValue]);

      return new ExpositionCriteria(result.rows[0]);
    });
  }

  /**
   * Find criteria by exposition
   */
  static async findByExposition(expositionId, options = {}) {
    const { includeResolved = false } = options;

    let selectClause = 'ec.*';
    let joinClause = '';

    if (includeResolved) {
      selectClause += ', u.username as resolved_author_username, u.display_name as resolved_author_display, t.name as resolved_tag_name';
      joinClause = `
        LEFT JOIN users u ON ec.criterion_type = 'author' AND LOWER(u.username) = LOWER(ec.criterion_value)
        LEFT JOIN tags t ON ec.criterion_type = 'tag' AND LOWER(t.name) = LOWER(ec.criterion_value)
      `;
    }

    const result = await query(`
      SELECT ${selectClause}
      FROM exposition_criteria ec
      ${joinClause}
      WHERE ec.exposition_id = $1
      ORDER BY ec.criterion_type, ec.criterion_value, ec.added_at
    `, [expositionId]);

    return result.rows.map(row => {
      const criteria = new ExpositionCriteria(row);

      if (includeResolved) {
        if (criteria.criterion_type === 'author') {
          criteria.resolved_author = row.resolved_author_username ? {
            username: row.resolved_author_username,
            display_name: row.resolved_author_display
          } : null;
        } else if (criteria.criterion_type === 'tag') {
          criteria.resolved_tag = row.resolved_tag_name ? {
            name: row.resolved_tag_name
          } : null;
        }
      }

      return criteria;
    });
  }

  /**
   * Find criterion by ID
   */
  static async findById(id) {
    const result = await query(`
      SELECT ec.*
      FROM exposition_criteria ec
      WHERE ec.id = $1
    `, [id]);

    return result.rows.length > 0 ? new ExpositionCriteria(result.rows[0]) : null;
  }

  /**
   * Get criteria grouped by exposition
   */
  static async getByExpositions(expositionIds) {
    if (!Array.isArray(expositionIds) || expositionIds.length === 0) {
      return {};
    }

    const result = await query(`
      SELECT
        ec.*,
        u.username as resolved_author_username,
        u.display_name as resolved_author_display,
        t.name as resolved_tag_name
      FROM exposition_criteria ec
      LEFT JOIN users u ON ec.criterion_type = 'author' AND LOWER(u.username) = LOWER(ec.criterion_value)
      LEFT JOIN tags t ON ec.criterion_type = 'tag' AND LOWER(t.name) = LOWER(ec.criterion_value)
      WHERE ec.exposition_id = ANY($1)
      ORDER BY ec.exposition_id, ec.criterion_type, ec.criterion_value
    `, [expositionIds]);

    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.exposition_id]) {
        grouped[row.exposition_id] = [];
      }

      const criteria = new ExpositionCriteria(row);
      if (criteria.criterion_type === 'author') {
        criteria.resolved_author = row.resolved_author_username ? {
          username: row.resolved_author_username,
          display_name: row.resolved_author_display
        } : null;
      } else if (criteria.criterion_type === 'tag') {
        criteria.resolved_tag = row.resolved_tag_name ? {
          name: row.resolved_tag_name
        } : null;
      }

      grouped[row.exposition_id].push(criteria);
    }

    return grouped;
  }

  /**
   * Get criteria statistics
   */
  static async getStatistics(expositionId) {
    const result = await query(`
      SELECT
        COUNT(*) as total_criteria,
        COUNT(CASE WHEN criterion_type = 'author' THEN 1 END) as author_criteria,
        COUNT(CASE WHEN criterion_type = 'tag' THEN 1 END) as tag_criteria
      FROM exposition_criteria
      WHERE exposition_id = $1
    `, [expositionId]);

    const row = result.rows[0];
    return {
      total_criteria: parseInt(row.total_criteria),
      author_criteria: parseInt(row.author_criteria),
      tag_criteria: parseInt(row.tag_criteria)
    };
  }

  /**
   * Remove criterion from exposition
   */
  async delete(userId) {
    return await transaction(async (client) => {
      // Check if user owns the exposition
      const expositionResult = await client.query(`
        SELECT e.author_id
        FROM expositions e
        JOIN exposition_criteria ec ON e.id = ec.exposition_id
        WHERE ec.id = $1
      `, [this.id]);

      if (expositionResult.rows.length === 0) {
        throw new Error('Criterion not found');
      }

      if (expositionResult.rows[0].author_id !== userId) {
        throw new Error('Unauthorized to modify this exposition');
      }

      const result = await client.query(
        'DELETE FROM exposition_criteria WHERE id = $1 RETURNING *',
        [this.id]
      );

      return result.rows.length > 0;
    });
  }

  /**
   * Bulk create criteria
   */
  static async bulkCreate(expositionId, criteriaList, userId) {
    if (!Array.isArray(criteriaList) || criteriaList.length === 0) {
      return [];
    }

    return await transaction(async (client) => {
      // Check if user owns the exposition
      const expositionResult = await client.query(
        'SELECT author_id FROM expositions WHERE id = $1',
        [expositionId]
      );

      if (expositionResult.rows.length === 0) {
        throw new Error('Exposition not found');
      }

      if (expositionResult.rows[0].author_id !== userId) {
        throw new Error('Unauthorized to modify this exposition');
      }

      const results = [];
      for (const criteria of criteriaList) {
        try {
          const result = await ExpositionCriteria.create(
            expositionId,
            criteria.criterion_type,
            criteria.criterion_value,
            userId
          );
          results.push(result);
        } catch (error) {
          // Skip individual errors but continue processing
          console.error(`Error adding criterion ${criteria.criterion_value}:`, error.message);
        }
      }

      return results;
    });
  }

  /**
   * Remove all criteria for exposition
   */
  static async removeAllForExposition(expositionId, userId) {
    return await transaction(async (client) => {
      // Check if user owns the exposition
      const expositionResult = await client.query(
        'SELECT author_id FROM expositions WHERE id = $1',
        [expositionId]
      );

      if (expositionResult.rows.length === 0) {
        throw new Error('Exposition not found');
      }

      if (expositionResult.rows[0].author_id !== userId) {
        throw new Error('Unauthorized to modify this exposition');
      }

      const result = await client.query(
        'DELETE FROM exposition_criteria WHERE exposition_id = $1',
        [expositionId]
      );

      return result.rowCount;
    });
  }

  /**
   * Get expositions that include a specific author
   */
  static async getExpositionsForAuthor(username) {
    const result = await query(`
      SELECT DISTINCT
        e.*,
        u.username as author_username,
        u.display_name as author_display_name
      FROM expositions e
      JOIN exposition_criteria ec ON e.id = ec.exposition_id
      JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published'
        AND ec.criterion_type = 'author'
        AND LOWER(ec.criterion_value) = LOWER($1)
      ORDER BY e.updated_at DESC
    `, [username]);

    return result.rows.map(row => {
      const exposition = new (require('./Exposition'))(row);
      exposition.author = {
        username: row.author_username,
        display_name: row.author_display_name
      };
      return exposition;
    });
  }

  /**
   * Get expositions that include a specific tag
   */
  static async getExpositionsForTag(tagName) {
    const result = await query(`
      SELECT DISTINCT
        e.*,
        u.username as author_username,
        u.display_name as author_display_name
      FROM expositions e
      JOIN exposition_criteria ec ON e.id = ec.exposition_id
      JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published'
        AND ec.criterion_type = 'tag'
        AND LOWER(ec.criterion_value) = LOWER($1)
      ORDER BY e.updated_at DESC
    `, [tagName]);

    return result.rows.map(row => {
      const exposition = new (require('./Exposition'))(row);
      exposition.author = {
        username: row.author_username,
        display_name: row.author_display_name
      };
      return exposition;
    });
  }

  /**
   * Validate criterion value exists
   */
  static async validateCriterionValue(criterionType, criterionValue) {
    const normalizedValue = criterionValue.trim().toLowerCase();

    if (criterionType === 'author') {
      const result = await query(
        'SELECT username FROM users WHERE LOWER(username) = $1 AND is_active = true',
        [normalizedValue]
      );
      return result.rows.length > 0 ? result.rows[0].username : null;
    } else if (criterionType === 'tag') {
      const result = await query(
        'SELECT name FROM tags WHERE LOWER(name) = $1',
        [normalizedValue]
      );
      return result.rows.length > 0 ? result.rows[0].name : null;
    }

    return null;
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      exposition_id: this.exposition_id,
      criterion_type: this.criterion_type,
      criterion_value: this.criterion_value,
      added_at: this.added_at,
      exposition: this.exposition,
      resolved_author: this.resolved_author,
      resolved_tag: this.resolved_tag
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      criterion_type: this.criterion_type,
      criterion_value: this.criterion_value,
      added_at: this.added_at,
      resolved_author: this.resolved_author,
      resolved_tag: this.resolved_tag
    };
  }
}

module.exports = ExpositionCriteria;