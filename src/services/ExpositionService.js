/**
 * Exposition Service for Knowledge Foyer
 *
 * Manages exposition pages and article aggregation based on criteria
 */

const { query, transaction } = require('../config/database');
const Exposition = require('../models/Exposition');
const ExpositionCriteria = require('../models/ExpositionCriteria');

class ExpositionService {
  /**
   * Create a new exposition with initial criteria
   */
  static async createExposition(userId, expositionData, initialCriteria = []) {
    const { title, slug, description } = expositionData;

    return await transaction(async (client) => {
      // Create the exposition
      const exposition = await Exposition.create(userId, {
        title,
        slug,
        description
      });

      // Add initial criteria if provided
      if (initialCriteria && initialCriteria.length > 0) {
        for (const criterion of initialCriteria) {
          try {
            await ExpositionCriteria.create(
              exposition.id,
              criterion.type,
              criterion.value,
              userId
            );
          } catch (error) {
            console.error(`Error adding initial criterion ${criterion.value}:`, error.message);
          }
        }
      }

      return exposition;
    });
  }

  /**
   * Get exposition with criteria and articles
   */
  static async getExpositionWithContent(expositionId, options = {}) {
    const {
      includePrivate = false,
      articleLimit = 50,
      articleOffset = 0,
      includeCriteria = true,
      includeStats = false
    } = options;

    // Get the exposition
    const exposition = await Exposition.findById(expositionId, includePrivate);
    if (!exposition) {
      return null;
    }

    const result = {
      exposition,
      articles: [],
      criteria: [],
      stats: null
    };

    // Get criteria if requested
    if (includeCriteria) {
      result.criteria = await ExpositionCriteria.findByExposition(expositionId, {
        includeResolved: true
      });
    }

    // Get matching articles
    result.articles = await exposition.getMatchingArticles({
      limit: articleLimit,
      offset: articleOffset
    });

    // Get statistics if requested
    if (includeStats) {
      result.stats = await exposition.getStats();
    }

    return result;
  }

  /**
   * Get exposition by author and slug with content
   */
  static async getExpositionBySlugWithContent(username, slug, options = {}) {
    const exposition = await Exposition.findByAuthorAndSlug(username, slug, options.includePrivate);
    if (!exposition) {
      return null;
    }

    return await this.getExpositionWithContent(exposition.id, options);
  }

  /**
   * Add criterion to exposition with validation
   */
  static async addCriterion(expositionId, criterionType, criterionValue, userId) {
    // Validate criterion value exists
    const validatedValue = await ExpositionCriteria.validateCriterionValue(
      criterionType,
      criterionValue
    );

    if (!validatedValue) {
      if (criterionType === 'author') {
        throw new Error(`User '${criterionValue}' not found`);
      } else if (criterionType === 'tag') {
        throw new Error(`Tag '${criterionValue}' not found`);
      }
    }

    // Create the criterion
    const criterion = await ExpositionCriteria.create(
      expositionId,
      criterionType,
      validatedValue,
      userId
    );

    // Return updated article count
    const exposition = await Exposition.findById(expositionId, true);
    const stats = await exposition.getStats();

    return {
      criterion,
      article_count: stats.total_articles
    };
  }

  /**
   * Remove criterion from exposition
   */
  static async removeCriterion(criterionId, userId) {
    const criterion = await ExpositionCriteria.findById(criterionId);
    if (!criterion) {
      throw new Error('Criterion not found');
    }

    await criterion.delete(userId);

    // Return updated article count
    const exposition = await Exposition.findById(criterion.exposition_id, true);
    const stats = await exposition.getStats();

    return {
      removed: true,
      article_count: stats.total_articles
    };
  }

  /**
   * Get popular expositions (by article count or views)
   */
  static async getPopularExpositions(options = {}) {
    const {
      limit = 20,
      offset = 0,
      minArticles = 1
    } = options;

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published'
        AND u.is_active = true
      HAVING (SELECT COUNT(*) FROM get_exposition_articles(e.id)) >= $3
      ORDER BY article_count DESC, e.updated_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, minArticles]);

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
   * Get recently updated expositions
   */
  static async getRecentExpositions(options = {}) {
    const {
      limit = 20,
      offset = 0,
      daysBack = 30
    } = options;

    const result = await query(`
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published'
        AND u.is_active = true
        AND e.updated_at >= NOW() - INTERVAL '%s days'
      ORDER BY e.updated_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset], daysBack);

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
   * Search expositions by title and description
   */
  static async searchExpositions(searchTerm, options = {}) {
    const {
      limit = 50,
      offset = 0,
      includeStats = false
    } = options;

    // Use the Exposition model's search method
    const expositions = await Exposition.search(searchTerm, { limit, offset });

    if (includeStats) {
      // Add detailed stats for each exposition
      for (const exposition of expositions) {
        exposition.stats = await exposition.getStats();
      }
    }

    return expositions;
  }

  /**
   * Get expositions that might interest a user based on their activity
   */
  static async getRecommendedExpositions(userId, options = {}) {
    const {
      limit = 10,
      offset = 0
    } = options;

    // Get expositions based on tags and authors the user has engaged with
    const result = await query(`
      WITH user_interests AS (
        -- Tags from articles user has given feedback on
        SELECT DISTINCT t.name as interest_value, 'tag' as interest_type
        FROM feedback f
        JOIN articles a ON f.article_id = a.id
        JOIN article_tags at ON a.id = at.article_id
        JOIN tags t ON at.tag_id = t.id
        WHERE f.user_id = $1

        UNION

        -- Authors user follows
        SELECT DISTINCT u.username as interest_value, 'author' as interest_type
        FROM follows fo
        JOIN users u ON fo.followed_id = u.id
        WHERE fo.follower_id = $1

        UNION

        -- Tags from articles user has written
        SELECT DISTINCT t.name as interest_value, 'tag' as interest_type
        FROM articles a
        JOIN article_tags at ON a.id = at.article_id
        JOIN tags t ON at.tag_id = t.id
        WHERE a.user_id = $1
      )
      SELECT DISTINCT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count,
        COUNT(ui.interest_value) as relevance_score
      FROM expositions e
      LEFT JOIN users u ON e.author_id = u.id
      LEFT JOIN exposition_criteria ec ON e.id = ec.exposition_id
      LEFT JOIN user_interests ui ON (
        (ec.criterion_type = ui.interest_type AND LOWER(ec.criterion_value) = LOWER(ui.interest_value))
      )
      WHERE e.status = 'published'
        AND u.is_active = true
        AND e.author_id != $1  -- Don't recommend user's own expositions
      GROUP BY e.id, u.username, u.display_name
      HAVING COUNT(ui.interest_value) > 0
      ORDER BY relevance_score DESC, e.updated_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    return result.rows.map(row => {
      const exposition = new Exposition(row);
      exposition.author = {
        username: row.username,
        display_name: row.display_name
      };
      exposition.article_count = parseInt(row.article_count);
      exposition.relevance_score = parseInt(row.relevance_score);
      return exposition;
    });
  }

  /**
   * Get related expositions (similar criteria)
   */
  static async getRelatedExpositions(expositionId, options = {}) {
    const {
      limit = 5,
      excludeOwn = true
    } = options;

    const result = await query(`
      WITH current_criteria AS (
        SELECT ec.criterion_type, ec.criterion_value
        FROM exposition_criteria ec
        WHERE ec.exposition_id = $1
      ),
      exposition_scores AS (
        SELECT
          e.id,
          e.author_id,
          COUNT(cc.criterion_value) as shared_criteria
        FROM expositions e
        JOIN exposition_criteria ec ON e.id = ec.exposition_id
        JOIN current_criteria cc ON (
          ec.criterion_type = cc.criterion_type
          AND LOWER(ec.criterion_value) = LOWER(cc.criterion_value)
        )
        WHERE e.id != $1
          AND e.status = 'published'
          ${excludeOwn ? 'AND e.author_id != (SELECT author_id FROM expositions WHERE id = $1)' : ''}
        GROUP BY e.id, e.author_id
        HAVING COUNT(cc.criterion_value) > 0
      )
      SELECT
        e.*,
        u.username, u.display_name,
        (SELECT COUNT(*) FROM get_exposition_articles(e.id)) as article_count,
        es.shared_criteria
      FROM exposition_scores es
      JOIN expositions e ON es.id = e.id
      LEFT JOIN users u ON e.author_id = u.id
      WHERE u.is_active = true
      ORDER BY es.shared_criteria DESC, e.updated_at DESC
      LIMIT $2
    `, [expositionId, limit]);

    return result.rows.map(row => {
      const exposition = new Exposition(row);
      exposition.author = {
        username: row.username,
        display_name: row.display_name
      };
      exposition.article_count = parseInt(row.article_count);
      exposition.shared_criteria = parseInt(row.shared_criteria);
      return exposition;
    });
  }

  /**
   * Get exposition analytics
   */
  static async getExpositionAnalytics(expositionId, userId) {
    const exposition = await Exposition.findById(expositionId, true);
    if (!exposition || exposition.author_id !== userId) {
      throw new Error('Exposition not found or unauthorized');
    }

    const [stats, criteria, articles] = await Promise.all([
      exposition.getStats(),
      ExpositionCriteria.findByExposition(expositionId, { includeResolved: true }),
      exposition.getMatchingArticles({ limit: 1000 }) // Get all articles for analytics
    ]);

    // Group articles by month for trend analysis
    const articlesByMonth = {};
    articles.forEach(article => {
      const month = new Date(article.article_published_at).toISOString().substr(0, 7); // YYYY-MM
      articlesByMonth[month] = (articlesByMonth[month] || 0) + 1;
    });

    // Group criteria by type
    const criteriaByType = {
      author: criteria.filter(c => c.criterion_type === 'author'),
      tag: criteria.filter(c => c.criterion_type === 'tag')
    };

    // Calculate author contribution percentages
    const authorStats = {};
    articles.forEach(article => {
      const author = article.author_username;
      authorStats[author] = (authorStats[author] || 0) + 1;
    });

    const authorContributions = Object.entries(authorStats)
      .map(([author, count]) => ({
        author,
        article_count: count,
        percentage: (count / articles.length * 100).toFixed(1)
      }))
      .sort((a, b) => b.article_count - a.article_count);

    return {
      exposition: exposition.toJSON(),
      stats,
      criteria_breakdown: criteriaByType,
      articles_by_month: articlesByMonth,
      author_contributions: authorContributions,
      total_articles: articles.length,
      created_at: exposition.created_at,
      updated_at: exposition.updated_at
    };
  }

  /**
   * Bulk operations for exposition management
   */
  static async bulkAddCriteria(expositionId, criteriaList, userId) {
    return await ExpositionCriteria.bulkCreate(expositionId, criteriaList, userId);
  }

  /**
   * Clone exposition (create copy with same criteria)
   */
  static async cloneExposition(expositionId, newTitle, userId, newSlug = null) {
    return await transaction(async (client) => {
      // Get original exposition and criteria
      const original = await Exposition.findById(expositionId, true);
      if (!original) {
        throw new Error('Original exposition not found');
      }

      const criteria = await ExpositionCriteria.findByExposition(expositionId);

      // Create new exposition
      const cloned = await Exposition.create(userId, {
        title: newTitle,
        slug: newSlug,
        description: original.description ? `${original.description} (copied from ${original.author.username})` : null
      });

      // Copy all criteria
      for (const criterion of criteria) {
        try {
          await ExpositionCriteria.create(
            cloned.id,
            criterion.criterion_type,
            criterion.criterion_value,
            userId
          );
        } catch (error) {
          console.error(`Error copying criterion ${criterion.criterion_value}:`, error.message);
        }
      }

      return cloned;
    });
  }

  /**
   * Get exposition statistics for admin/analytics
   */
  static async getGlobalStats() {
    const result = await query(`
      SELECT
        COUNT(*) as total_expositions,
        COUNT(CASE WHEN status = 'published' THEN 1 END) as published_expositions,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_expositions,
        AVG(
          (SELECT COUNT(*) FROM exposition_criteria WHERE exposition_id = expositions.id)
        ) as avg_criteria_per_exposition,
        AVG(
          (SELECT COUNT(*) FROM get_exposition_articles(expositions.id))
        ) as avg_articles_per_exposition
      FROM expositions
    `);

    const criteriaStats = await query(`
      SELECT
        criterion_type,
        COUNT(*) as count
      FROM exposition_criteria
      GROUP BY criterion_type
    `);

    return {
      ...result.rows[0],
      criteria_by_type: criteriaStats.rows.reduce((acc, row) => {
        acc[row.criterion_type] = parseInt(row.count);
        return acc;
      }, {})
    };
  }
}

module.exports = ExpositionService;