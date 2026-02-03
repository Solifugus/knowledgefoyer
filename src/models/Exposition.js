/**
 * Exposition Model for Knowledge Foyer
 *
 * Manages custom exposition pages for curating articles by criteria
 */

const { query, transaction } = require('../config/database');
const validator = require('validator');

class Exposition {
  constructor(data = {}) {
    this.id = data.id || null;
    this.author_id = data.author_id || null;
    this.title = data.title || '';
    this.slug = data.slug || '';
    this.description = data.description || null;
    this.status = data.status || 'draft';
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    // For joined queries
    this.author = data.author || null;
    this.criteria = data.criteria || [];
    this.article_count = data.article_count || 0;
  }

  /**
   * Valid exposition statuses
   */
  static get STATUS_OPTIONS() {
    return ['draft', 'published', 'archived'];
  }

  /**
   * Create a new exposition
   */
  static async create(authorId, expositionData) {
    const {
      title,
      slug = null,
      description = null
    } = expositionData;

    // Validation
    if (!title || title.trim().length === 0) {
      throw new Error('Title is required');
    }

    if (title.length > 255) {
      throw new Error('Title cannot exceed 255 characters');
    }

    if (description && description.length > 2000) {
      throw new Error('Description cannot exceed 2000 characters');
    }

    // Generate slug from title if not provided
    const finalSlug = slug || await this.generateUniqueSlug(authorId, title);

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(finalSlug)) {
      throw new Error('Slug can only contain lowercase letters, numbers, and hyphens');
    }

    if (finalSlug.length > 100) {
      throw new Error('Slug cannot exceed 100 characters');
    }

    return await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO expositions (
          author_id, title, slug, description, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [authorId, title.trim(), finalSlug, description?.trim() || null, 'draft']);

      return new Exposition(result.rows[0]);
    });
  }

  /**
   * Generate unique slug for author
   */
  static async generateUniqueSlug(authorId, title) {
    let baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90); // Leave room for counter

    if (!baseSlug) {
      baseSlug = 'untitled';
    }

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await query(
        'SELECT id FROM expositions WHERE author_id = $1 AND slug = $2',
        [authorId, slug]
      );

      if (existing.rows.length === 0) {
        break;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Find exposition by ID
   */
  static async findById(id, includePrivate = false) {
    let whereClause = 'WHERE e.id = $1';
    if (!includePrivate) {
      whereClause += ` AND e.status = 'published'`;
    }

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      ${whereClause}
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const exposition = new Exposition(result.rows[0]);
    exposition.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name
    };
    exposition.article_count = parseInt(result.rows[0].article_count);

    return exposition;
  }

  /**
   * Find exposition by author and slug
   */
  static async findByAuthorAndSlug(username, slug, includePrivate = false) {
    let whereClause = 'WHERE u.username = $1 AND e.slug = $2';
    if (!includePrivate) {
      whereClause += ` AND e.status = 'published'`;
    }

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      ${whereClause}
    `, [username.toLowerCase(), slug]);

    if (result.rows.length === 0) {
      return null;
    }

    const exposition = new Exposition(result.rows[0]);
    exposition.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name
    };
    exposition.article_count = parseInt(result.rows[0].article_count);

    return exposition;
  }

  /**
   * Find expositions by author
   */
  static async findByAuthor(username, options = {}) {
    const {
      includePrivate = false,
      status = null,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    let whereClause = 'WHERE u.username = $1';
    const params = [username.toLowerCase()];
    let paramCount = 1;

    if (!includePrivate) {
      whereClause += ` AND e.status = 'published'`;
    }

    if (status) {
      paramCount++;
      whereClause += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    const validOrderFields = ['created_at', 'updated_at', 'title'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'created_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      ${whereClause}
      ORDER BY e.${orderField} ${direction}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => {
      const exposition = new Exposition(row);
      exposition.author = {
        username: row.username,
        display_name: row.display_name
      };
      exposition.article_count = parseInt(row.article_count);
      return exposition;
    });
  }

  /**
   * Search expositions
   */
  static async search(searchTerm, options = {}) {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'relevance'
    } = options;

    const searchQuery = `%${searchTerm.toLowerCase()}%`;

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count,
        CASE
          WHEN LOWER(e.title) LIKE $1 THEN 1.0
          WHEN LOWER(e.description) LIKE $1 THEN 0.8
          ELSE 0.0
        END as relevance
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published'
        AND (
          LOWER(e.title) LIKE $1 OR
          LOWER(e.description) LIKE $1
        )
      HAVING relevance > 0
      ORDER BY relevance DESC, e.updated_at DESC
      LIMIT $2 OFFSET $3
    `, [searchQuery, limit, offset]);

    return result.rows.map(row => {
      const exposition = new Exposition(row);
      exposition.author = {
        username: row.username,
        display_name: row.display_name
      };
      exposition.article_count = parseInt(row.article_count);
      exposition.relevance = row.relevance;
      return exposition;
    });
  }

  /**
   * Get all public expositions (for discovery)
   */
  static async getPublicExpositions(options = {}) {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'updated_at',
      orderDirection = 'DESC'
    } = options;

    const validOrderFields = ['created_at', 'updated_at', 'title'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'updated_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published'
        AND u.is_active = true
      ORDER BY e.${orderField} ${direction}
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return result.rows.map(row => {
      const exposition = new Exposition(row);
      exposition.author = {
        username: row.username,
        display_name: row.display_name
      };
      exposition.article_count = parseInt(row.article_count);
      return exposition;
    });
  }

  /**
   * Update exposition
   */
  async update(updates, userId) {
    if (this.author_id !== userId) {
      throw new Error('Unauthorized to update this exposition');
    }

    const allowedFields = ['title', 'description', 'slug'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'title') {
          if (!value || value.trim().length === 0) {
            throw new Error('Title is required');
          }
          if (value.length > 255) {
            throw new Error('Title cannot exceed 255 characters');
          }
        }

        if (key === 'description' && value && value.length > 2000) {
          throw new Error('Description cannot exceed 2000 characters');
        }

        if (key === 'slug') {
          if (!/^[a-z0-9-]+$/.test(value)) {
            throw new Error('Slug can only contain lowercase letters, numbers, and hyphens');
          }
          if (value.length > 100) {
            throw new Error('Slug cannot exceed 100 characters');
          }

          // Check slug uniqueness for this author
          const existing = await query(
            'SELECT id FROM expositions WHERE author_id = $1 AND slug = $2 AND id != $3',
            [this.author_id, value, this.id]
          );

          if (existing.rows.length > 0) {
            throw new Error('Slug already exists for this author');
          }
        }

        updateFields.push(`${key} = $${paramCount}`);
        values.push(key === 'title' || key === 'description' ? value?.trim() : value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(this.id);
    const result = await query(`
      UPDATE expositions
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Exposition not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Change exposition status
   */
  async updateStatus(newStatus, userId) {
    if (this.author_id !== userId) {
      throw new Error('Unauthorized to modify this exposition');
    }

    if (!Exposition.STATUS_OPTIONS.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const result = await query(`
      UPDATE expositions
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [newStatus, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Publish exposition
   */
  async publish(userId) {
    return await this.updateStatus('published', userId);
  }

  /**
   * Unpublish exposition
   */
  async unpublish(userId) {
    return await this.updateStatus('draft', userId);
  }

  /**
   * Archive exposition
   */
  async archive(userId) {
    return await this.updateStatus('archived', userId);
  }

  /**
   * Delete exposition
   */
  async delete(userId) {
    if (this.author_id !== userId) {
      throw new Error('Unauthorized to delete this exposition');
    }

    await transaction(async (client) => {
      // Delete criteria first (cascaded automatically)
      await client.query('DELETE FROM exposition_criteria WHERE exposition_id = $1', [this.id]);
      // Delete exposition
      await client.query('DELETE FROM expositions WHERE id = $1', [this.id]);
    });

    return true;
  }

  /**
   * Get criteria for this exposition
   */
  async getCriteria() {
    const ExpositionCriteria = require('./ExpositionCriteria');
    return await ExpositionCriteria.findByExposition(this.id);
  }

  /**
   * Get articles matching this exposition's criteria
   */
  async getMatchingArticles(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT * FROM get_exposition_articles($1)
      ORDER BY article_published_at DESC
      LIMIT $2 OFFSET $3
    `, [this.id, limit, offset]);

    return result.rows;
  }

  /**
   * Get exposition statistics
   */
  async getStats() {
    const result = await query(`
      SELECT * FROM get_exposition_stats($1)
    `, [this.id]);

    return result.rows[0] || {
      total_articles: 0,
      total_criteria: 0,
      author_criteria: 0,
      tag_criteria: 0,
      latest_article_at: null
    };
  }

  /**
   * Check if user can edit this exposition
   */
  canEdit(userId) {
    return this.author_id === userId;
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      author_id: this.author_id,
      title: this.title,
      slug: this.slug,
      description: this.description,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      author: this.author,
      criteria: this.criteria,
      article_count: this.article_count
    };
  }

  /**
   * Convert to public JSON (excludes private data)
   */
  toPublicJSON() {
    return {
      id: this.id,
      title: this.title,
      slug: this.slug,
      description: this.description,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      author: this.author ? {
        username: this.author.username,
        display_name: this.author.display_name
      } : null,
      article_count: this.article_count
    };
  }
}

module.exports = Exposition;