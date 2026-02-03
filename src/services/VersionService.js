/**
 * Version Service for Knowledge Foyer
 *
 * Handles diff generation, change tracking, and version analysis
 */

const { query, transaction } = require('../config/database');

class VersionService {
  /**
   * Generate diff between two text versions
   * Uses a simple line-based diff algorithm
   */
  static generateLineDiff(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    const changes = [];
    let linesAdded = 0;
    let linesRemoved = 0;
    let linesModified = 0;

    // Simple line-by-line comparison
    // This is a basic implementation - could be enhanced with Myers diff or similar
    const maxLength = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLength; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        // Line added
        changes.push({
          type: 'add',
          line: i + 1,
          content: newLine
        });
        linesAdded++;
      } else if (newLine === undefined) {
        // Line removed
        changes.push({
          type: 'remove',
          line: i + 1,
          content: oldLine
        });
        linesRemoved++;
      } else if (oldLine !== newLine) {
        // Line modified
        changes.push({
          type: 'modify',
          line: i + 1,
          old_content: oldLine,
          new_content: newLine
        });
        linesModified++;
      }
    }

    return {
      changes,
      stats: {
        lines_added: linesAdded,
        lines_removed: linesRemoved,
        lines_modified: linesModified,
        total_changes: changes.length
      }
    };
  }

  /**
   * Generate diff between two versions including title and summary changes
   */
  static generateVersionDiff(oldVersion, newVersion) {
    const diffs = [];

    // Check title changes
    if (oldVersion.title !== newVersion.title) {
      diffs.push({
        change_type: 'title',
        diff_data: {
          old_value: oldVersion.title,
          new_value: newVersion.title
        },
        lines_added: 0,
        lines_removed: 0,
        lines_modified: 1
      });
    }

    // Check summary changes
    if (oldVersion.summary !== newVersion.summary) {
      const summaryDiff = this.generateLineDiff(
        oldVersion.summary || '',
        newVersion.summary || ''
      );

      diffs.push({
        change_type: 'summary',
        diff_data: summaryDiff,
        lines_added: summaryDiff.stats.lines_added,
        lines_removed: summaryDiff.stats.lines_removed,
        lines_modified: summaryDiff.stats.lines_modified
      });
    }

    // Check content changes
    if (oldVersion.content !== newVersion.content) {
      const contentDiff = this.generateLineDiff(oldVersion.content, newVersion.content);

      diffs.push({
        change_type: 'content',
        diff_data: contentDiff,
        lines_added: contentDiff.stats.lines_added,
        lines_removed: contentDiff.stats.lines_removed,
        lines_modified: contentDiff.stats.lines_modified
      });
    }

    // Check tags changes
    const oldTags = Array.isArray(oldVersion.tags) ? oldVersion.tags : JSON.parse(oldVersion.tags || '[]');
    const newTags = Array.isArray(newVersion.tags) ? newVersion.tags : JSON.parse(newVersion.tags || '[]');

    if (JSON.stringify(oldTags.sort()) !== JSON.stringify(newTags.sort())) {
      const addedTags = newTags.filter(tag => !oldTags.includes(tag));
      const removedTags = oldTags.filter(tag => !newTags.includes(tag));

      diffs.push({
        change_type: 'tags',
        diff_data: {
          added_tags: addedTags,
          removed_tags: removedTags,
          old_tags: oldTags,
          new_tags: newTags
        },
        lines_added: addedTags.length,
        lines_removed: removedTags.length,
        lines_modified: 0
      });
    }

    return diffs;
  }

  /**
   * Store article changes in database
   */
  static async storeArticleChanges(articleId, fromVersion, toVersion, changes) {
    return await transaction(async (client) => {
      const storedChanges = [];

      for (const change of changes) {
        const result = await client.query(`
          INSERT INTO article_changes (
            article_id, from_version, to_version, change_type,
            diff_data, lines_added, lines_removed, lines_modified
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (article_id, from_version, to_version, change_type)
          DO UPDATE SET
            diff_data = EXCLUDED.diff_data,
            lines_added = EXCLUDED.lines_added,
            lines_removed = EXCLUDED.lines_removed,
            lines_modified = EXCLUDED.lines_modified
          RETURNING *
        `, [
          articleId,
          fromVersion,
          toVersion,
          change.change_type,
          JSON.stringify(change.diff_data),
          change.lines_added,
          change.lines_removed,
          change.lines_modified
        ]);

        storedChanges.push(result.rows[0]);
      }

      return storedChanges;
    });
  }

  /**
   * Get changes between two versions
   */
  static async getChangesBetweenVersions(articleId, fromVersion, toVersion) {
    const result = await query(`
      SELECT * FROM article_changes
      WHERE article_id = $1 AND from_version = $2 AND to_version = $3
      ORDER BY change_type
    `, [articleId, fromVersion, toVersion]);

    return result.rows.map(row => ({
      ...row,
      diff_data: JSON.parse(row.diff_data)
    }));
  }

  /**
   * Get all changes for an article
   */
  static async getArticleChanges(articleId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const result = await query(`
      SELECT * FROM article_changes
      WHERE article_id = $1
      ORDER BY to_version DESC, change_type
      LIMIT $2 OFFSET $3
    `, [articleId, limit, offset]);

    return result.rows.map(row => ({
      ...row,
      diff_data: JSON.parse(row.diff_data)
    }));
  }

  /**
   * Compare two versions and store changes
   */
  static async compareAndStoreVersions(articleId, oldVersion, newVersion) {
    const changes = this.generateVersionDiff(oldVersion, newVersion);

    if (changes.length > 0) {
      await this.storeArticleChanges(
        articleId,
        oldVersion.version_number,
        newVersion.version_number,
        changes
      );
    }

    return changes;
  }

  /**
   * Get change statistics for an article
   */
  static async getChangeStatistics(articleId) {
    const result = await query(`
      SELECT
        change_type,
        COUNT(*) as change_count,
        SUM(lines_added) as total_lines_added,
        SUM(lines_removed) as total_lines_removed,
        SUM(lines_modified) as total_lines_modified,
        AVG(lines_added + lines_removed + lines_modified) as avg_change_size
      FROM article_changes
      WHERE article_id = $1
      GROUP BY change_type
      ORDER BY change_count DESC
    `, [articleId]);

    const stats = {
      total_changes: 0,
      by_type: {},
      overall: {
        lines_added: 0,
        lines_removed: 0,
        lines_modified: 0
      }
    };

    for (const row of result.rows) {
      const changeCount = parseInt(row.change_count);
      const linesAdded = parseInt(row.total_lines_added) || 0;
      const linesRemoved = parseInt(row.total_lines_removed) || 0;
      const linesModified = parseInt(row.total_lines_modified) || 0;

      stats.by_type[row.change_type] = {
        change_count: changeCount,
        lines_added: linesAdded,
        lines_removed: linesRemoved,
        lines_modified: linesModified,
        avg_change_size: parseFloat(row.avg_change_size) || 0
      };

      stats.total_changes += changeCount;
      stats.overall.lines_added += linesAdded;
      stats.overall.lines_removed += linesRemoved;
      stats.overall.lines_modified += linesModified;
    }

    return stats;
  }

  /**
   * Get version timeline with changes
   */
  static async getVersionTimeline(articleId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT
        av.version_number,
        av.title,
        av.change_summary,
        av.created_at,
        av.created_by,
        u.username,
        u.display_name,
        COALESCE(change_stats.total_changes, 0) as total_changes,
        COALESCE(change_stats.lines_added, 0) as lines_added,
        COALESCE(change_stats.lines_removed, 0) as lines_removed,
        COALESCE(change_stats.lines_modified, 0) as lines_modified
      FROM article_versions av
      LEFT JOIN users u ON av.created_by = u.id
      LEFT JOIN (
        SELECT
          to_version,
          COUNT(*) as total_changes,
          SUM(lines_added) as lines_added,
          SUM(lines_removed) as lines_removed,
          SUM(lines_modified) as lines_modified
        FROM article_changes
        WHERE article_id = $1
        GROUP BY to_version
      ) change_stats ON av.version_number = change_stats.to_version
      WHERE av.article_id = $1
      ORDER BY av.version_number DESC
      LIMIT $2 OFFSET $3
    `, [articleId, limit, offset]);

    return result.rows.map(row => ({
      version_number: row.version_number,
      title: row.title,
      change_summary: row.change_summary,
      created_at: row.created_at,
      author: {
        id: row.created_by,
        username: row.username,
        display_name: row.display_name
      },
      changes: {
        total: parseInt(row.total_changes),
        lines_added: parseInt(row.lines_added),
        lines_removed: parseInt(row.lines_removed),
        lines_modified: parseInt(row.lines_modified)
      }
    }));
  }

  /**
   * Calculate similarity between two text versions
   */
  static calculateTextSimilarity(text1, text2) {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;

    // Simple Jaccard similarity based on words
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Find similar versions based on content
   */
  static async findSimilarVersions(articleId, versionNumber, threshold = 0.8) {
    // Get all versions for comparison
    const ArticleVersion = require('../models/ArticleVersion');
    const versions = await ArticleVersion.getVersionHistory(articleId, { limit: 100 });

    const targetVersion = versions.find(v => v.version_number === versionNumber);
    if (!targetVersion) return [];

    const similarVersions = [];

    for (const version of versions) {
      if (version.version_number === versionNumber) continue;

      const similarity = this.calculateTextSimilarity(targetVersion.content, version.content);
      if (similarity >= threshold) {
        similarVersions.push({
          version_number: version.version_number,
          title: version.title,
          created_at: version.created_at,
          similarity_score: similarity,
          author: version.author
        });
      }
    }

    return similarVersions.sort((a, b) => b.similarity_score - a.similarity_score);
  }

  /**
   * Generate change summary text
   */
  static generateChangeSummaryText(changes) {
    if (!changes || changes.length === 0) {
      return 'No changes detected';
    }

    const summaryParts = [];
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalModified = 0;

    for (const change of changes) {
      totalAdded += change.lines_added || 0;
      totalRemoved += change.lines_removed || 0;
      totalModified += change.lines_modified || 0;

      switch (change.change_type) {
        case 'title':
          summaryParts.push('updated title');
          break;
        case 'summary':
          summaryParts.push('updated summary');
          break;
        case 'content':
          summaryParts.push('modified content');
          break;
        case 'tags':
          summaryParts.push('updated tags');
          break;
      }
    }

    const changeTypes = summaryParts.join(', ');
    const stats = [];

    if (totalAdded > 0) stats.push(`+${totalAdded} lines`);
    if (totalRemoved > 0) stats.push(`-${totalRemoved} lines`);
    if (totalModified > 0) stats.push(`~${totalModified} modified`);

    return `${changeTypes}${stats.length > 0 ? ` (${stats.join(', ')})` : ''}`;
  }
}

module.exports = VersionService;