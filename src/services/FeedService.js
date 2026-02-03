/**
 * Feed Service for Knowledge Foyer
 *
 * Handles feed aggregation, timeline generation, and content discovery
 */

const { query, transaction } = require('../config/database');
const Follow = require('../models/Follow');
const Message = require('../models/Message');
const Article = require('../models/Article');

class FeedService {
  /**
   * Generate personalized feed for a user
   */
  static async generatePersonalizedFeed(userId, options = {}) {
    const { limit = 50, offset = 0, includeOwnContent = true } = options;

    // Get users that this user follows
    const following = await Follow.getFollowing(userId);
    const followingIds = following.map(f => f.user_id);

    if (includeOwnContent) {
      followingIds.push(userId);
    }

    if (followingIds.length === 0) {
      // User doesn't follow anyone, return public timeline
      return await this.getPublicFeed({ limit, offset });
    }

    // Get feed items from followed users
    const result = await query(`
      WITH feed_content AS (
        -- Messages from followed users
        SELECT
          'message' as item_type,
          m.id as source_id,
          m.user_id as source_user_id,
          m.created_at,
          m.content as title,
          m.content,
          jsonb_build_object(
            'message_type', m.message_type,
            'visibility', m.visibility,
            'reply_to_id', m.reply_to_id,
            'article_id', m.article_id
          ) as data
        FROM messages m
        WHERE m.user_id = ANY($3)
        AND m.visibility IN ('public', 'followers')
        AND m.created_at > NOW() - INTERVAL '30 days'

        UNION ALL

        -- Published articles from followed users
        SELECT
          'article_published' as item_type,
          a.id as source_id,
          a.user_id as source_user_id,
          a.published_at as created_at,
          a.title,
          a.summary as content,
          jsonb_build_object(
            'slug', a.slug,
            'visibility', a.visibility,
            'version', a.version,
            'view_count', a.view_count
          ) as data
        FROM articles a
        WHERE a.user_id = ANY($3)
        AND a.status = 'published'
        AND a.visibility = 'public'
        AND a.published_at > NOW() - INTERVAL '30 days'
        AND a.published_at IS NOT NULL
      )
      SELECT
        fc.*,
        u.username,
        u.display_name,
        u.avatar_url
      FROM feed_content fc
      LEFT JOIN users u ON fc.source_user_id = u.id
      WHERE u.is_active = true
      ORDER BY fc.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, followingIds]);

    return result.rows.map(item => ({
      ...item,
      author: {
        id: item.source_user_id,
        username: item.username,
        display_name: item.display_name,
        avatar_url: item.avatar_url
      },
      data: typeof item.data === 'string' ? JSON.parse(item.data) : item.data
    }));
  }

  /**
   * Get public feed (trending/recent public content)
   */
  static async getPublicFeed(options = {}) {
    const { limit = 50, offset = 0, timeframe = '7 days' } = options;

    const result = await query(`
      WITH public_content AS (
        -- Recent public messages
        SELECT
          'message' as item_type,
          m.id as source_id,
          m.user_id as source_user_id,
          m.created_at,
          m.content as title,
          m.content,
          jsonb_build_object(
            'message_type', m.message_type,
            'replies_count', (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id)
          ) as data,
          1 as sort_priority -- Messages have lower priority
        FROM messages m
        WHERE m.visibility = 'public'
        AND m.created_at > NOW() - INTERVAL $3

        UNION ALL

        -- Recent published articles
        SELECT
          'article_published' as item_type,
          a.id as source_id,
          a.user_id as source_user_id,
          a.published_at as created_at,
          a.title,
          a.summary as content,
          jsonb_build_object(
            'slug', a.slug,
            'view_count', a.view_count,
            'feedback_count', a.feedback_count,
            'version', a.version
          ) as data,
          2 as sort_priority -- Articles have higher priority
        FROM articles a
        WHERE a.status = 'published'
        AND a.visibility = 'public'
        AND a.published_at > NOW() - INTERVAL $3
        AND a.published_at IS NOT NULL
      )
      SELECT
        pc.*,
        u.username,
        u.display_name,
        u.avatar_url
      FROM public_content pc
      LEFT JOIN users u ON pc.source_user_id = u.id
      WHERE u.is_active = true
      ORDER BY pc.sort_priority DESC, pc.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, timeframe]);

    return result.rows.map(item => ({
      ...item,
      author: {
        id: item.source_user_id,
        username: item.username,
        display_name: item.display_name,
        avatar_url: item.avatar_url
      },
      data: typeof item.data === 'string' ? JSON.parse(item.data) : item.data
    }));
  }

  /**
   * Get trending content based on engagement
   */
  static async getTrendingContent(options = {}) {
    const { limit = 20, offset = 0, timeframe = '7 days', contentType = 'all' } = options;

    let contentFilter = '';
    if (contentType === 'articles') {
      contentFilter = `AND item_type = 'article_published'`;
    } else if (contentType === 'messages') {
      contentFilter = `AND item_type = 'message'`;
    }

    const result = await query(`
      WITH trending_content AS (
        -- Get content with engagement metrics
        SELECT
          source_id,
          item_type,
          source_user_id,
          title,
          content,
          created_at,
          data,
          COUNT(*) as mentions_count,
          -- Calculate engagement score based on mentions and recency
          COUNT(*) * (1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)) as engagement_score
        FROM feed_items
        WHERE created_at > NOW() - INTERVAL $3
        ${contentFilter}
        GROUP BY source_id, item_type, source_user_id, title, content, created_at, data
        HAVING COUNT(*) > 1  -- Only content mentioned by multiple people
      )
      SELECT
        tc.*,
        u.username,
        u.display_name,
        u.avatar_url
      FROM trending_content tc
      LEFT JOIN users u ON tc.source_user_id = u.id
      WHERE u.is_active = true
      ORDER BY tc.engagement_score DESC, tc.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, timeframe]);

    return result.rows.map(item => ({
      ...item,
      author: {
        id: item.source_user_id,
        username: item.username,
        display_name: item.display_name,
        avatar_url: item.avatar_url
      },
      data: typeof item.data === 'string' ? JSON.parse(item.data) : item.data,
      engagement_score: parseFloat(item.engagement_score),
      mentions_count: parseInt(item.mentions_count)
    }));
  }

  /**
   * Create feed items when content is published
   */
  static async createFeedItemsForArticle(article, authorFollowers) {
    if (!Array.isArray(authorFollowers)) {
      return [];
    }

    const feedItems = [];

    // Create feed item for author's own feed
    feedItems.push({
      userId: article.user_id,
      itemType: 'article_published',
      sourceUserId: article.user_id,
      sourceId: article.id,
      title: `Published "${article.title}"`,
      content: article.summary || article.title,
      data: {
        slug: article.slug,
        visibility: article.visibility,
        version: article.version,
        view_count: article.view_count || 0
      },
      createdAt: article.published_at || article.created_at
    });

    // Create feed items for followers
    for (const followerId of authorFollowers) {
      feedItems.push({
        userId: followerId,
        itemType: 'article_published',
        sourceUserId: article.user_id,
        sourceId: article.id,
        title: `Published "${article.title}"`,
        content: article.summary || article.title,
        data: {
          slug: article.slug,
          visibility: article.visibility,
          version: article.version,
          view_count: article.view_count || 0
        },
        createdAt: article.published_at || article.created_at
      });
    }

    return await this.bulkCreateFeedItems(feedItems);
  }

  /**
   * Bulk create feed items
   */
  static async bulkCreateFeedItems(feedItems) {
    if (!Array.isArray(feedItems) || feedItems.length === 0) {
      return [];
    }

    return await transaction(async (client) => {
      const results = [];

      for (const item of feedItems) {
        try {
          const result = await client.query(`
            INSERT INTO feed_items (
              user_id, item_type, source_user_id, source_id,
              title, content, data, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `, [
            item.userId,
            item.itemType,
            item.sourceUserId,
            item.sourceId,
            item.title,
            item.content,
            JSON.stringify(item.data || {}),
            item.createdAt || 'NOW()'
          ]);

          results.push(result.rows[0]);
        } catch (error) {
          console.error('Error creating feed item:', error.message);
        }
      }

      return results;
    });
  }

  /**
   * Get user's activity feed (their own posts and articles)
   */
  static async getUserActivityFeed(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      WITH user_activity AS (
        -- User's messages
        SELECT
          'message' as item_type,
          m.id as source_id,
          m.user_id as source_user_id,
          m.created_at,
          m.content as title,
          m.content,
          jsonb_build_object(
            'message_type', m.message_type,
            'visibility', m.visibility,
            'replies_count', (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id)
          ) as data
        FROM messages m
        WHERE m.user_id = $3

        UNION ALL

        -- User's published articles
        SELECT
          'article_published' as item_type,
          a.id as source_id,
          a.user_id as source_user_id,
          a.published_at as created_at,
          a.title,
          a.summary as content,
          jsonb_build_object(
            'slug', a.slug,
            'visibility', a.visibility,
            'version', a.version,
            'view_count', a.view_count,
            'feedback_count', a.feedback_count
          ) as data
        FROM articles a
        WHERE a.user_id = $3
        AND a.status = 'published'
        AND a.published_at IS NOT NULL
      )
      SELECT
        ua.*,
        u.username,
        u.display_name,
        u.avatar_url
      FROM user_activity ua
      LEFT JOIN users u ON ua.source_user_id = u.id
      ORDER BY ua.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, userId]);

    return result.rows.map(item => ({
      ...item,
      author: {
        id: item.source_user_id,
        username: item.username,
        display_name: item.display_name,
        avatar_url: item.avatar_url
      },
      data: typeof item.data === 'string' ? JSON.parse(item.data) : item.data
    }));
  }

  /**
   * Get feed recommendations for new users
   */
  static async getFeedRecommendations(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    // For new users, show popular content and suggested follows
    const result = await query(`
      WITH recommended_content AS (
        -- Popular recent articles
        SELECT
          'article_published' as item_type,
          a.id as source_id,
          a.user_id as source_user_id,
          a.published_at as created_at,
          a.title,
          a.summary as content,
          jsonb_build_object(
            'slug', a.slug,
            'view_count', a.view_count,
            'feedback_count', a.feedback_count,
            'is_recommendation', true
          ) as data,
          (a.view_count + a.feedback_count * 2) as popularity_score
        FROM articles a
        WHERE a.status = 'published'
        AND a.visibility = 'public'
        AND a.published_at > NOW() - INTERVAL '7 days'
        AND a.user_id != $3  -- Not from the user themselves

        UNION ALL

        -- Popular messages
        SELECT
          'message' as item_type,
          m.id as source_id,
          m.user_id as source_user_id,
          m.created_at,
          m.content as title,
          m.content,
          jsonb_build_object(
            'message_type', m.message_type,
            'replies_count', (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id),
            'is_recommendation', true
          ) as data,
          (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id) as popularity_score
        FROM messages m
        WHERE m.visibility = 'public'
        AND m.created_at > NOW() - INTERVAL '3 days'
        AND m.user_id != $3  -- Not from the user themselves
      )
      SELECT
        rc.*,
        u.username,
        u.display_name,
        u.avatar_url,
        u.followers_count
      FROM recommended_content rc
      LEFT JOIN users u ON rc.source_user_id = u.id
      WHERE u.is_active = true
      ORDER BY rc.popularity_score DESC, rc.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset, userId]);

    return result.rows.map(item => ({
      ...item,
      author: {
        id: item.source_user_id,
        username: item.username,
        display_name: item.display_name,
        avatar_url: item.avatar_url,
        followers_count: item.followers_count
      },
      data: typeof item.data === 'string' ? JSON.parse(item.data) : item.data,
      popularity_score: parseInt(item.popularity_score)
    }));
  }

  /**
   * Clean up old feed items (should be run periodically)
   */
  static async cleanupOldFeedItems(daysToKeep = 30) {
    const result = await query(`
      DELETE FROM feed_items
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
    `);

    return result.rowCount || 0;
  }

  /**
   * Get feed statistics for a user
   */
  static async getFeedStats(userId) {
    const result = await query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN item_type = 'message' THEN 1 END) as message_items,
        COUNT(CASE WHEN item_type = 'article_published' THEN 1 END) as article_items,
        COUNT(DISTINCT source_user_id) as unique_authors,
        MAX(created_at) as latest_item_at,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as items_last_24h
      FROM feed_items
      WHERE user_id = $1
      AND created_at > NOW() - INTERVAL '30 days'
    `, [userId]);

    const row = result.rows[0];
    return {
      total_items: parseInt(row.total_items),
      message_items: parseInt(row.message_items),
      article_items: parseInt(row.article_items),
      unique_authors: parseInt(row.unique_authors),
      latest_item_at: row.latest_item_at,
      items_last_24h: parseInt(row.items_last_24h)
    };
  }
}

module.exports = FeedService;