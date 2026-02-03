/**
 * ArticleVersion Model
 *
 * Manages article version history and snapshots
 */

const { query, transaction } = require('../config/database');
const crypto = require('crypto');
const VersionService = require('../services/VersionService');

class ArticleVersion {
  constructor(data = {}) {
    this.id = data.id || null;
    this.article_id = data.article_id || null;
    this.version_number = data.version_number || null;
    this.title = data.title || '';
    this.content = data.content || '';
    this.summary = data.summary || null;
    this.change_summary = data.change_summary || '';
    this.content_hash = data.content_hash || null;
    this.tags = data.tags || [];
    this.created_at = data.created_at || null;
    this.created_by = data.created_by || null;
    this.author = data.author || null; // For joined queries
  }

  /**
   * Create a new version for an article
   */
  static async createVersion(articleId, versionData, userId) {
    const { title, content, summary, changeSummary, tags = [] } = versionData;

    // Generate content hash
    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    return await transaction(async (client) => {
      // Get current highest version number and previous version
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
         FROM article_versions WHERE article_id = $1`,
        [articleId]
      );

      const nextVersion = versionResult.rows[0].next_version;

      // Get previous version for diff generation
      let previousVersion = null;
      if (nextVersion > 1) {
        const prevResult = await client.query(
          `SELECT * FROM article_versions
           WHERE article_id = $1 AND version_number = $2`,
          [articleId, nextVersion - 1]
        );
        previousVersion = prevResult.rows[0];
      }

      // Insert new version
      const result = await client.query(`
        INSERT INTO article_versions (
          article_id, version_number, title, content, summary,
          change_summary, content_hash, tags, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        articleId, nextVersion, title, content, summary,
        changeSummary, contentHash, JSON.stringify(tags), userId
      ]);

      const newVersion = new ArticleVersion(result.rows[0]);

      // Generate and store changes if there's a previous version
      if (previousVersion) {
        const changes = VersionService.generateVersionDiff(previousVersion, {
          title,
          content,
          summary,
          tags,
          version_number: nextVersion
        });

        if (changes.length > 0) {
          await VersionService.storeArticleChanges(
            articleId,
            previousVersion.version_number,
            nextVersion,
            changes
          );
        }
      }

      return newVersion;
    });
  }

  /**
   * Get all versions for an article
   */
  static async getVersionHistory(articleId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT av.*, u.username, u.display_name
      FROM article_versions av
      LEFT JOIN users u ON av.created_by = u.id
      WHERE av.article_id = $1
      ORDER BY av.version_number DESC
      LIMIT $2 OFFSET $3
    `, [articleId, limit, offset]);

    return result.rows.map(row => {
      const version = new ArticleVersion(row);
      version.author = {
        username: row.username,
        display_name: row.display_name
      };
      return version;
    });
  }

  /**
   * Get a specific version by version number
   */
  static async getVersion(articleId, versionNumber) {
    const result = await query(`
      SELECT av.*, u.username, u.display_name
      FROM article_versions av
      LEFT JOIN users u ON av.created_by = u.id
      WHERE av.article_id = $1 AND av.version_number = $2
    `, [articleId, versionNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    const version = new ArticleVersion(result.rows[0]);
    version.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name
    };
    return version;
  }

  /**
   * Get latest version for an article
   */
  static async getLatestVersion(articleId) {
    const result = await query(`
      SELECT av.*, u.username, u.display_name
      FROM article_versions av
      LEFT JOIN users u ON av.created_by = u.id
      WHERE av.article_id = $1
      ORDER BY av.version_number DESC
      LIMIT 1
    `, [articleId]);

    if (result.rows.length === 0) {
      return null;
    }

    const version = new ArticleVersion(result.rows[0]);
    version.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name
    };
    return version;
  }

  /**
   * Get version statistics using the database function
   */
  static async getVersionStats(articleId) {
    const result = await query(
      'SELECT * FROM get_article_version_stats($1)',
      [articleId]
    );

    return result.rows[0] || {
      total_versions: 0,
      total_changes: 0,
      lines_added_total: 0,
      lines_removed_total: 0,
      last_modified: null,
      resolution_count: 0
    };
  }

  /**
   * Check if content already exists (duplicate check)
   */
  static async findByContentHash(articleId, contentHash) {
    const result = await query(`
      SELECT * FROM article_versions
      WHERE article_id = $1 AND content_hash = $2
      ORDER BY version_number DESC
      LIMIT 1
    `, [articleId, contentHash]);

    return result.rows.length > 0 ? new ArticleVersion(result.rows[0]) : null;
  }

  /**
   * Get versions in a range
   */
  static async getVersionRange(articleId, fromVersion, toVersion) {
    const result = await query(`
      SELECT av.*, u.username, u.display_name
      FROM article_versions av
      LEFT JOIN users u ON av.created_by = u.id
      WHERE av.article_id = $1
        AND av.version_number BETWEEN $2 AND $3
      ORDER BY av.version_number ASC
    `, [articleId, fromVersion, toVersion]);

    return result.rows.map(row => {
      const version = new ArticleVersion(row);
      version.author = {
        username: row.username,
        display_name: row.display_name
      };
      return version;
    });
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      article_id: this.article_id,
      version_number: this.version_number,
      title: this.title,
      content: this.content,
      summary: this.summary,
      change_summary: this.change_summary,
      content_hash: this.content_hash,
      tags: Array.isArray(this.tags) ? this.tags : JSON.parse(this.tags || '[]'),
      created_at: this.created_at,
      created_by: this.created_by,
      author: this.author
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      version_number: this.version_number,
      title: this.title,
      summary: this.summary,
      change_summary: this.change_summary,
      tags: Array.isArray(this.tags) ? this.tags : JSON.parse(this.tags || '[]'),
      created_at: this.created_at,
      author: this.author
    };
  }

  /**
   * Get changes between this version and another
   */
  static async getChangesBetweenVersions(articleId, fromVersion, toVersion) {
    return await VersionService.getChangesBetweenVersions(articleId, fromVersion, toVersion);
  }

  /**
   * Get all changes for an article
   */
  static async getArticleChanges(articleId, options = {}) {
    return await VersionService.getArticleChanges(articleId, options);
  }

  /**
   * Get change statistics for an article
   */
  static async getChangeStatistics(articleId) {
    return await VersionService.getChangeStatistics(articleId);
  }

  /**
   * Get version timeline with change data
   */
  static async getVersionTimeline(articleId, options = {}) {
    return await VersionService.getVersionTimeline(articleId, options);
  }

  /**
   * Find similar versions based on content
   */
  static async findSimilarVersions(articleId, versionNumber, threshold = 0.8) {
    return await VersionService.findSimilarVersions(articleId, versionNumber, threshold);
  }

  /**
   * Compare with another version
   */
  async compareWith(otherVersion) {
    return VersionService.generateVersionDiff(this, otherVersion);
  }

  /**
   * Calculate similarity with another version
   */
  calculateSimilarityWith(otherVersion) {
    return VersionService.calculateTextSimilarity(this.content, otherVersion.content);
  }
}

module.exports = ArticleVersion;