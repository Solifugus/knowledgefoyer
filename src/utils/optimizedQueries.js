/**
 * Optimized Database Queries for Knowledge Foyer
 *
 * Performance-optimized queries for common operations with proper indexing
 */

const { preparedQuery, queryWithMetrics } = require('../config/database');

class OptimizedQueries {
  constructor() {
    // Query names for monitoring and optimization tracking
    this.queryNames = {
      FIND_USER_BY_EMAIL: 'find_user_by_email',
      FIND_USER_BY_USERNAME: 'find_user_by_username',
      GET_USER_ARTICLES: 'get_user_articles',
      GET_ARTICLE_WITH_AUTHOR: 'get_article_with_author',
      GET_ARTICLE_FEEDBACK: 'get_article_feedback',
      SEARCH_ARTICLES: 'search_articles',
      GET_USER_FEED: 'get_user_feed',
      GET_NOTIFICATIONS: 'get_notifications',
      GET_POPULAR_ARTICLES: 'get_popular_articles',
      GET_RECENT_ARTICLES: 'get_recent_articles',
      GET_FOLLOWING_ARTICLES: 'get_following_articles',
      CHECK_FOLLOWING: 'check_following',
      GET_USER_STATS: 'get_user_stats'
    };
  }

  /**
   * Find user by email with optimized query
   * Index: CREATE INDEX CONCURRENTLY idx_users_email_active ON users (email) WHERE is_active = true;
   */
  async findUserByEmail(email) {
    const query = `
      SELECT id, username, email, password_hash, display_name, bio,
             is_active, email_verified, created_at, updated_at
      FROM users
      WHERE email = $1 AND is_active = true
      LIMIT 1
    `;

    const result = await preparedQuery(this.queryNames.FIND_USER_BY_EMAIL, query, [email]);
    return result.rows[0] || null;
  }

  /**
   * Find user by username with optimized query
   * Index: CREATE UNIQUE INDEX idx_users_username_lower ON users (LOWER(username));
   */
  async findUserByUsername(username) {
    const query = `
      SELECT id, username, email, display_name, bio,
             is_active, email_verified, created_at, updated_at
      FROM users
      WHERE LOWER(username) = LOWER($1) AND is_active = true
      LIMIT 1
    `;

    const result = await preparedQuery(this.queryNames.FIND_USER_BY_USERNAME, query, [username]);
    return result.rows[0] || null;
  }

  /**
   * Get user's articles with pagination and filtering
   * Index: CREATE INDEX idx_articles_user_status_published ON articles (user_id, status, published_at DESC) WHERE visibility != 'private';
   */
  async getUserArticles(userId, options = {}) {
    const {
      status = 'published',
      includePrivate = false,
      limit = 20,
      offset = 0,
      orderBy = 'published_at',
      orderDirection = 'DESC'
    } = options;

    let whereClause = 'WHERE a.user_id = $1 AND a.status = $2';
    const params = [userId, status];

    if (!includePrivate) {
      whereClause += ` AND a.visibility != 'private'`;
    }

    const validOrderFields = ['published_at', 'created_at', 'updated_at', 'title', 'view_count'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'published_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT a.id, a.title, a.slug, a.summary, a.status, a.visibility,
             a.published_at, a.created_at, a.updated_at, a.view_count, a.version,
             u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.${orderField} ${direction}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);
    const result = await preparedQuery(this.queryNames.GET_USER_ARTICLES, query, params);
    return result.rows;
  }

  /**
   * Get article with author information
   * Index: CREATE INDEX idx_articles_id_visibility ON articles (id) WHERE visibility != 'private';
   */
  async getArticleWithAuthor(articleId, includePrivate = false) {
    let whereClause = 'WHERE a.id = $1';
    if (!includePrivate) {
      whereClause += ` AND a.visibility != 'private'`;
    }

    const query = `
      SELECT a.id, a.user_id, a.title, a.slug, a.content, a.summary,
             a.version, a.status, a.visibility, a.published_at, a.created_at,
             a.updated_at, a.view_count, a.feedback_count, a.content_hash,
             u.username, u.display_name, u.bio
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
    `;

    const result = await preparedQuery(this.queryNames.GET_ARTICLE_WITH_AUTHOR, query, [articleId]);
    return result.rows[0] || null;
  }

  /**
   * Get article feedback with pagination
   * Index: CREATE INDEX idx_feedback_article_status_created ON feedback (article_id, status, created_at DESC);
   */
  async getArticleFeedback(articleId, options = {}) {
    const {
      status = 'active',
      includePrivate = false,
      limit = 50,
      offset = 0
    } = options;

    let whereClause = 'WHERE f.article_id = $1 AND f.status = $2';
    const params = [articleId, status];

    if (!includePrivate) {
      whereClause += ` AND f.is_public = true`;
    }

    const query = `
      SELECT f.id, f.content, f.is_public, f.status, f.created_at, f.updated_at,
             u.username, u.display_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);
    const result = await preparedQuery(this.queryNames.GET_ARTICLE_FEEDBACK, query, params);
    return result.rows;
  }

  /**
   * Search articles with full-text search and ranking
   * Index: CREATE INDEX idx_articles_fts ON articles USING gin(to_tsvector('english', title || ' ' || COALESCE(summary, '') || ' ' || COALESCE(content, '')));
   */
  async searchArticles(searchTerm, options = {}) {
    const {
      limit = 20,
      offset = 0,
      minRelevance = 0.1
    } = options;

    // Use PostgreSQL full-text search for better performance
    const query = `
      SELECT a.id, a.title, a.slug, a.summary, a.published_at, a.view_count,
             u.username, u.display_name,
             ts_rank(to_tsvector('english', a.title || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.content, '')),
                     plainto_tsquery('english', $1)) as relevance
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.visibility = 'public'
        AND a.status = 'published'
        AND to_tsvector('english', a.title || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.content, ''))
            @@ plainto_tsquery('english', $1)
      HAVING ts_rank(to_tsvector('english', a.title || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.content, '')),
                     plainto_tsquery('english', $1)) >= $4
      ORDER BY relevance DESC, a.published_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await preparedQuery(this.queryNames.SEARCH_ARTICLES, query, [searchTerm, limit, offset, minRelevance]);
    return result.rows;
  }

  /**
   * Get user feed with optimized joins
   * Index: CREATE INDEX idx_feed_items_user_created ON feed_items (user_id, created_at DESC);
   */
  async getUserFeed(userId, limit = 20, offset = 0) {
    const query = `
      SELECT fi.id, fi.item_type, fi.item_id, fi.created_at,
             CASE
               WHEN fi.item_type = 'article' THEN
                 json_build_object(
                   'id', a.id,
                   'title', a.title,
                   'slug', a.slug,
                   'summary', a.summary,
                   'published_at', a.published_at,
                   'author', json_build_object(
                     'username', au.username,
                     'display_name', au.display_name
                   )
                 )
               WHEN fi.item_type = 'follow' THEN
                 json_build_object(
                   'id', fu.id,
                   'username', fu.username,
                   'display_name', fu.display_name
                 )
             END as item_data
      FROM feed_items fi
      LEFT JOIN articles a ON fi.item_type = 'article' AND fi.item_id = a.id
      LEFT JOIN users au ON a.user_id = au.id
      LEFT JOIN users fu ON fi.item_type = 'follow' AND fi.item_id = fu.id
      WHERE fi.user_id = $1
      ORDER BY fi.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await preparedQuery(this.queryNames.GET_USER_FEED, query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Get user notifications with optimized query
   * Index: CREATE INDEX idx_notifications_user_read_created ON notifications (user_id, read, created_at DESC);
   */
  async getUserNotifications(userId, options = {}) {
    const {
      unreadOnly = false,
      limit = 50,
      offset = 0
    } = options;

    let whereClause = 'WHERE n.user_id = $1';
    const params = [userId];

    if (unreadOnly) {
      whereClause += ' AND n.read = false';
    }

    const query = `
      SELECT n.id, n.type, n.title, n.content, n.data, n.read,
             n.created_at, n.updated_at
      FROM notifications n
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);
    const result = await preparedQuery(this.queryNames.GET_NOTIFICATIONS, query, params);
    return result.rows;
  }

  /**
   * Get popular articles with view count optimization
   * Index: CREATE INDEX idx_articles_popular ON articles (status, visibility, view_count DESC) WHERE status = 'published' AND visibility = 'public';
   */
  async getPopularArticles(limit = 20, timeFrame = '7 days') {
    const query = `
      SELECT a.id, a.title, a.slug, a.summary, a.published_at, a.view_count,
             u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.status = 'published'
        AND a.visibility = 'public'
        AND a.published_at > NOW() - INTERVAL $2
      ORDER BY a.view_count DESC, a.published_at DESC
      LIMIT $1
    `;

    const result = await preparedQuery(this.queryNames.GET_POPULAR_ARTICLES, query, [limit, timeFrame]);
    return result.rows;
  }

  /**
   * Get recent articles with optimized ordering
   * Index already exists: published_at DESC is typically well-optimized
   */
  async getRecentArticles(limit = 20, offset = 0) {
    const query = `
      SELECT a.id, a.title, a.slug, a.summary, a.published_at, a.view_count,
             u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.status = 'published' AND a.visibility = 'public'
      ORDER BY a.published_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await preparedQuery(this.queryNames.GET_RECENT_ARTICLES, query, [limit, offset]);
    return result.rows;
  }

  /**
   * Get articles from users being followed
   * Index: CREATE INDEX idx_follows_follower_following ON follows (follower_id, following_id);
   */
  async getFollowingArticles(userId, limit = 20, offset = 0) {
    const query = `
      SELECT a.id, a.title, a.slug, a.summary, a.published_at, a.view_count,
             u.username, u.display_name
      FROM articles a
      JOIN users u ON a.user_id = u.id
      JOIN follows f ON a.user_id = f.following_id
      WHERE f.follower_id = $1
        AND a.status = 'published'
        AND a.visibility = 'public'
      ORDER BY a.published_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await preparedQuery(this.queryNames.GET_FOLLOWING_ARTICLES, query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Check if user is following another user
   * Index: follows table already has proper indexes
   */
  async isFollowing(followerId, followingId) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM follows
        WHERE follower_id = $1 AND following_id = $2
      ) as is_following
    `;

    const result = await preparedQuery(this.queryNames.CHECK_FOLLOWING, query, [followerId, followingId]);
    return result.rows[0].is_following;
  }

  /**
   * Get comprehensive user statistics
   * Multiple optimized queries combined for dashboard stats
   */
  async getUserStats(userId) {
    const query = `
      WITH user_stats AS (
        SELECT
          (SELECT COUNT(*) FROM articles WHERE user_id = $1 AND status = 'published') as published_articles,
          (SELECT COUNT(*) FROM articles WHERE user_id = $1 AND status = 'draft') as draft_articles,
          (SELECT COALESCE(SUM(view_count), 0) FROM articles WHERE user_id = $1 AND status = 'published') as total_views,
          (SELECT COUNT(*) FROM feedback f JOIN articles a ON f.article_id = a.id WHERE a.user_id = $1) as total_feedback,
          (SELECT COUNT(*) FROM follows WHERE following_id = $1) as follower_count,
          (SELECT COUNT(*) FROM follows WHERE follower_id = $1) as following_count
      )
      SELECT * FROM user_stats
    `;

    const result = await preparedQuery(this.queryNames.GET_USER_STATS, query, [userId]);
    return result.rows[0];
  }

  /**
   * Batch query for multiple article IDs (useful for feed generation)
   */
  async getMultipleArticles(articleIds, includePrivate = false) {
    if (!articleIds || articleIds.length === 0) {
      return [];
    }

    let whereClause = 'WHERE a.id = ANY($1)';
    const params = [articleIds];

    if (!includePrivate) {
      whereClause += ` AND a.visibility != 'private'`;
    }

    const query = `
      SELECT a.id, a.title, a.slug, a.summary, a.published_at, a.view_count,
             u.username, u.display_name
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY array_position($1, a.id)
    `;

    const result = await queryWithMetrics(query, params, 'get_multiple_articles');
    return result.rows;
  }

  /**
   * Get database query performance insights for optimization
   */
  async getQueryPerformanceInsights() {
    try {
      // This requires pg_stat_statements extension
      const query = `
        SELECT
          query,
          calls,
          total_time,
          mean_time,
          max_time,
          stddev_time,
          rows as total_rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND calls > 10
        ORDER BY mean_time DESC
        LIMIT 20
      `;

      const result = await preparedQuery('query_performance_insights', query, []);
      return result.rows;
    } catch (error) {
      // pg_stat_statements might not be available
      console.log('Query performance insights not available (pg_stat_statements extension required)');
      return [];
    }
  }
}

// Create singleton instance
const optimizedQueries = new OptimizedQueries();

module.exports = optimizedQueries;