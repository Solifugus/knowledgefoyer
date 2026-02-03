/**
 * Article Model for Knowledge Foyer
 *
 * Represents published articles with version control and metadata
 */

const { query, transaction } = require('../config/database');
const validator = require('validator');

class Article {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.title = data.title;
    this.slug = data.slug;
    this.content = data.content;
    this.summary = data.summary;
    this.version = data.version;
    this.status = data.status;
    this.visibility = data.visibility;
    this.published_at = data.published_at;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.view_count = data.view_count;
    this.feedback_count = data.feedback_count;
    this.content_hash = data.content_hash;

    // Related data (populated via joins)
    this.author = data.author;
    this.tags = data.tags || [];
  }

  /**
   * Create a new article
   */
  static async create(userId, articleData) {
    const { title, content, summary, visibility = 'public' } = articleData;

    // Validation
    if (!title || !content) {
      throw new Error('Title and content are required');
    }

    if (!validator.isLength(title, { min: 1, max: 255 })) {
      throw new Error('Title must be 1-255 characters');
    }

    if (!validator.isLength(content, { min: 10 })) {
      throw new Error('Content must be at least 10 characters');
    }

    if (!['public', 'private', 'unlisted'].includes(visibility)) {
      throw new Error('Visibility must be public, private, or unlisted');
    }

    // Generate slug from title
    const slug = await Article.generateUniqueSlug(userId, title);

    // Generate content hash for duplicate detection
    const crypto = require('crypto');
    const content_hash = crypto.createHash('sha256').update(content).digest('hex');

    // Use transaction to create article and initial version
    return await transaction(async (client) => {
      // Create the article first
      const result = await client.query(`
        INSERT INTO articles (
          user_id, title, slug, content, summary, visibility, content_hash, current_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
        RETURNING *
      `, [userId, title, slug, content, summary, visibility, content_hash]);

      const article = new Article(result.rows[0]);

      // Create initial version within the same transaction
      await client.query(`
        INSERT INTO article_versions (
          article_id, version_number, title, content, summary,
          change_summary, content_hash, tags, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        article.id, 1, title, content, summary,
        'Initial version', content_hash, JSON.stringify([]), userId
      ]);

      return article;
    });
  }

  /**
   * Generate unique slug for user
   */
  static async generateUniqueSlug(userId, title) {
    let baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .slice(0, 50);

    if (!baseSlug) {
      baseSlug = 'untitled';
    }

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await query(
        'SELECT id FROM articles WHERE user_id = $1 AND slug = $2',
        [userId, slug]
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
   * Find article by ID
   */
  static async findById(id, includePrivate = false) {
    let whereClause = 'WHERE a.id = $1';
    if (!includePrivate) {
      whereClause += ` AND a.visibility != 'private'`;
    }

    const result = await query(`
      SELECT a.*, u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const article = new Article(result.rows[0]);
    article.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name
    };

    return article;
  }

  /**
   * Find article by user and slug
   */
  static async findByUserAndSlug(username, slug, includePrivate = false) {
    let whereClause = 'WHERE u.username = $1 AND a.slug = $2';
    if (!includePrivate) {
      whereClause += ` AND a.visibility != 'private'`;
    }

    const result = await query(`
      SELECT a.*, u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
    `, [username.toLowerCase(), slug]);

    if (result.rows.length === 0) {
      return null;
    }

    const article = new Article(result.rows[0]);
    article.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name
    };

    return article;
  }

  /**
   * Find articles by user
   */
  static async findByUser(username, options = {}) {
    const {
      includePrivate = false,
      status = 'published',
      limit = 50,
      offset = 0,
      orderBy = 'published_at',
      orderDirection = 'DESC'
    } = options;

    let whereClause = 'WHERE u.username = $1 AND a.status = $2';
    const params = [username.toLowerCase(), status];

    if (!includePrivate) {
      whereClause += ` AND a.visibility != 'private'`;
    }

    const validOrderFields = ['created_at', 'updated_at', 'published_at', 'title', 'view_count'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'published_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await query(`
      SELECT a.*, u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.${orderField} ${direction}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => {
      const article = new Article(row);
      article.author = {
        username: row.username,
        display_name: row.display_name
      };
      return article;
    });
  }

  /**
   * Search articles
   */
  static async search(searchTerm, options = {}) {
    const {
      limit = 50,
      offset = 0,
      orderBy = 'relevance',
      minRelevance = 0.1
    } = options;

    // Basic text search for now - can be enhanced with full-text search later
    const searchQuery = `%${searchTerm.toLowerCase()}%`;

    const result = await query(`
      SELECT a.*, u.username, u.display_name,
             CASE
               WHEN LOWER(a.title) LIKE $1 THEN 1.0
               WHEN LOWER(a.summary) LIKE $1 THEN 0.8
               WHEN LOWER(a.content) LIKE $1 THEN 0.6
               ELSE 0.0
             END as relevance
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.visibility = 'public'
        AND a.status = 'published'
        AND (
          LOWER(a.title) LIKE $1 OR
          LOWER(a.summary) LIKE $1 OR
          LOWER(a.content) LIKE $1
        )
      HAVING relevance >= $4
      ORDER BY relevance DESC, a.published_at DESC
      LIMIT $2 OFFSET $3
    `, [searchQuery, limit, offset, minRelevance]);

    return result.rows.map(row => {
      const article = new Article(row);
      article.author = {
        username: row.username,
        display_name: row.display_name
      };
      article.relevance = row.relevance;
      return article;
    });
  }

  /**
   * Update article with version control
   */
  async update(updates, userId, changeSummary = null) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to update this article');
    }

    const allowedFields = ['title', 'content', 'summary', 'visibility'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    // Store original content for AI analysis
    const originalContent = this.content;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Use transaction to update article and create version
    const updatedArticle = await transaction(async (client) => {
      // If content is being updated, generate new hash and increment version
      if (updates.content || updates.title || updates.summary) {
        const crypto = require('crypto');
        const content_hash = crypto.createHash('sha256')
          .update(updates.content || this.content)
          .digest('hex');
        updateFields.push(`content_hash = $${paramCount}`, `version = version + 1`);
        values.push(content_hash);
        paramCount++;

        // Create version snapshot before updating
        const ArticleVersion = require('./ArticleVersion');
        const newVersion = await ArticleVersion.createVersion(this.id, {
          title: updates.title || this.title,
          content: updates.content || this.content,
          summary: updates.summary || this.summary,
          changeSummary: changeSummary || 'Content updated',
          tags: this.tags || []
        }, userId);

        // Trigger update notifications if article is published
        if (this.status === 'published') {
          try {
            const NotificationService = require('../services/NotificationService');
            await NotificationService.handleArticleUpdatedNotifications(this, userId, newVersion.version_number);
          } catch (error) {
            console.error('Error creating article update notifications:', error.message);
          }
        }

        // Trigger AI analysis of feedback resolution (only if content changed)
        if (updates.content && updates.content !== originalContent) {
          try {
            const FeedbackResolutionService = require('../services/FeedbackResolutionService');
            setImmediate(async () => {
              try {
                await FeedbackResolutionService.analyzeArticleUpdate(
                  this.id,
                  originalContent, // old content
                  updates.content, // new content
                  changeSummary
                );
              } catch (analysisError) {
                console.error('Error analyzing feedback resolution:', analysisError.message);
              }
            });
          } catch (error) {
            console.error('Error queuing feedback resolution analysis:', error.message);
          }
        }
      }

      // Update the main article
      values.push(this.id);
      const result = await client.query(`
        UPDATE articles
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('Article not found');
      }

      return result.rows[0];
    });

    Object.assign(this, updatedArticle);
    return this;
  }

  /**
   * Publish article
   */
  async publish(userId) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to publish this article');
    }

    if (this.status === 'published') {
      throw new Error('Article is already published');
    }

    return await transaction(async (client) => {
      const result = await client.query(`
        UPDATE articles
        SET status = 'published',
            published_at = COALESCE(published_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [this.id]);

      Object.assign(this, result.rows[0]);

      // Trigger notifications and feed items for followers
      try {
        const NotificationService = require('../services/NotificationService');
        const FeedService = require('../services/FeedService');
        const Follow = require('./Follow');

        // Get followers
        const followers = await Follow.getFollowers(userId);
        const followerIds = followers.map(f => f.user_id);

        // Create notifications for followers
        await NotificationService.handleArticlePublishedNotifications(this, userId);

        // Create feed items for followers
        await FeedService.createFeedItemsForArticle(this, followerIds);

        console.log(`Created notifications and feed items for ${followerIds.length} followers`);
      } catch (error) {
        console.error('Error creating article publication notifications:', error.message);
        // Don't fail the whole operation if notifications fail
      }

      return this;
    });
  }

  /**
   * Unpublish article
   */
  async unpublish(userId) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to unpublish this article');
    }

    const result = await query(`
      UPDATE articles
      SET status = 'draft', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Delete article
   */
  async delete(userId) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to delete this article');
    }

    await transaction(async (client) => {
      // Delete related data first
      await client.query('DELETE FROM feedback WHERE article_id = $1', [this.id]);
      await client.query('DELETE FROM article_tags WHERE article_id = $1', [this.id]);
      await client.query('DELETE FROM articles WHERE id = $1', [this.id]);
    });

    return true;
  }

  /**
   * Increment view count
   */
  async incrementViews() {
    await query('UPDATE articles SET view_count = view_count + 1 WHERE id = $1', [this.id]);
    this.view_count = (this.view_count || 0) + 1;
    return this;
  }

  /**
   * Check for similar content (duplicate detection)
   */
  static async findSimilarContent(contentHash, excludeId = null) {
    let whereClause = 'WHERE content_hash = $1';
    const params = [contentHash];

    if (excludeId) {
      whereClause += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await query(`
      SELECT a.*, u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
    `, params);

    return result.rows.map(row => {
      const article = new Article(row);
      article.author = {
        username: row.username,
        display_name: row.display_name
      };
      return article;
    });
  }

  /**
   * Get public article data
   */
  toPublicJSON() {
    return {
      id: this.id,
      title: this.title,
      slug: this.slug,
      content: this.content,
      summary: this.summary,
      version: this.version,
      status: this.status,
      visibility: this.visibility,
      published_at: this.published_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
      view_count: this.view_count,
      feedback_count: this.feedback_count,
      author: this.author,
      tags: this.tags
    };
  }

  /**
   * Get article data for owner (includes private info)
   */
  toOwnerJSON() {
    return {
      ...this.toPublicJSON(),
      content_hash: this.content_hash
    };
  }

  /**
   * Get version history for this article
   */
  async getVersionHistory(options = {}) {
    const ArticleVersion = require('./ArticleVersion');
    return await ArticleVersion.getVersionHistory(this.id, options);
  }

  /**
   * Get a specific version of this article
   */
  async getVersion(versionNumber) {
    const ArticleVersion = require('./ArticleVersion');
    return await ArticleVersion.getVersion(this.id, versionNumber);
  }

  /**
   * Get version statistics for this article
   */
  async getVersionStats() {
    const ArticleVersion = require('./ArticleVersion');
    return await ArticleVersion.getVersionStats(this.id);
  }

  /**
   * Get feedback resolutions for this article
   */
  async getFeedbackResolutions(options = {}) {
    const FeedbackResolution = require('./FeedbackResolution');
    return await FeedbackResolution.getByArticleId(this.id, options);
  }

  /**
   * Get feedback resolutions for a specific version
   */
  async getFeedbackResolutionsForVersion(versionNumber) {
    const FeedbackResolution = require('./FeedbackResolution');
    return await FeedbackResolution.getByVersion(this.id, versionNumber);
  }

  /**
   * Create initial version when article is first created
   */
  async createInitialVersion(userId) {
    const ArticleVersion = require('./ArticleVersion');
    return await ArticleVersion.createVersion(this.id, {
      title: this.title,
      content: this.content,
      summary: this.summary,
      changeSummary: 'Initial version',
      tags: this.tags || []
    }, userId);
  }
}

module.exports = Article;