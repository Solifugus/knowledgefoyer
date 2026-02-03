/**
 * Follow Model for Knowledge Foyer
 *
 * Manages user following relationships and social connections
 */

const { query, transaction } = require('../config/database');

class Follow {
  constructor(data = {}) {
    this.id = data.id || null;
    this.follower_id = data.follower_id || null;
    this.followed_id = data.followed_id || null;
    this.created_at = data.created_at || null;
    // For joined queries
    this.follower = data.follower || null;
    this.followed = data.followed || null;
  }

  /**
   * Create a follow relationship
   */
  static async create(followerId, followedId) {
    if (followerId === followedId) {
      throw new Error('Users cannot follow themselves');
    }

    // Check if relationship already exists
    const existing = await this.findRelationship(followerId, followedId);
    if (existing) {
      throw new Error('Already following this user');
    }

    return await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO follows (follower_id, followed_id)
        VALUES ($1, $2)
        RETURNING *
      `, [followerId, followedId]);

      const follow = new Follow(result.rows[0]);

      // Trigger follow notification
      try {
        const NotificationService = require('../services/NotificationService');
        await NotificationService.handleFollowNotification(followerId, followedId);
      } catch (error) {
        console.error('Error creating follow notification:', error.message);
      }

      return follow;
    });
  }

  /**
   * Remove a follow relationship
   */
  static async remove(followerId, followedId) {
    const result = await query(`
      DELETE FROM follows
      WHERE follower_id = $1 AND followed_id = $2
      RETURNING *
    `, [followerId, followedId]);

    if (result.rows.length === 0) {
      throw new Error('Follow relationship not found');
    }

    return new Follow(result.rows[0]);
  }

  /**
   * Find specific follow relationship
   */
  static async findRelationship(followerId, followedId) {
    const result = await query(`
      SELECT * FROM follows
      WHERE follower_id = $1 AND followed_id = $2
    `, [followerId, followedId]);

    return result.rows.length > 0 ? new Follow(result.rows[0]) : null;
  }

  /**
   * Check if user A follows user B
   */
  static async isFollowing(followerId, followedId) {
    const result = await query(
      'SELECT is_following($1, $2) as following',
      [followerId, followedId]
    );

    return result.rows[0].following;
  }

  /**
   * Get user's followers
   */
  static async getFollowers(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(
      'SELECT * FROM get_user_followers($1, $2, $3)',
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get users that a user is following
   */
  static async getFollowing(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(
      'SELECT * FROM get_user_following($1, $2, $3)',
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get follow suggestions for a user
   */
  static async getFollowSuggestions(userId, options = {}) {
    const { limit = 10, offset = 0 } = options;

    // Get users followed by people you follow, but you don't follow yet
    // This is a simple collaborative filtering approach
    const result = await query(`
      SELECT DISTINCT
        u.id,
        u.username,
        u.display_name,
        u.bio,
        u.followers_count,
        u.created_at,
        COUNT(f2.follower_id) as mutual_followers
      FROM users u
      JOIN follows f2 ON u.id = f2.followed_id
      WHERE f2.follower_id IN (
        -- People you follow
        SELECT followed_id FROM follows WHERE follower_id = $1
      )
      AND u.id != $1  -- Not yourself
      AND u.id NOT IN (
        -- Users you already follow
        SELECT followed_id FROM follows WHERE follower_id = $1
      )
      AND u.is_active = true
      GROUP BY u.id, u.username, u.display_name, u.bio, u.followers_count, u.created_at
      ORDER BY mutual_followers DESC, u.followers_count DESC, u.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    return result.rows;
  }

  /**
   * Get popular users (most followers)
   */
  static async getPopularUsers(options = {}) {
    const { limit = 20, offset = 0 } = options;

    const result = await query(`
      SELECT
        id,
        username,
        display_name,
        bio,
        followers_count,
        following_count,
        messages_count,
        created_at
      FROM users
      WHERE is_active = true
      AND followers_count > 0
      ORDER BY followers_count DESC, created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return result.rows;
  }

  /**
   * Get user's social stats
   */
  static async getUserSocialStats(userId) {
    const result = await query(`
      SELECT
        followers_count,
        following_count,
        messages_count,
        (SELECT COUNT(*) FROM articles WHERE user_id = $1 AND status = 'published') as published_articles,
        (SELECT COUNT(*) FROM feedback WHERE user_id = $1) as feedback_given
      FROM users
      WHERE id = $1
    `, [userId]);

    return result.rows[0] || {
      followers_count: 0,
      following_count: 0,
      messages_count: 0,
      published_articles: 0,
      feedback_given: 0
    };
  }

  /**
   * Get mutual followers between two users
   */
  static async getMutualFollowers(userId1, userId2, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT DISTINCT
        u.id,
        u.username,
        u.display_name,
        f1.created_at as followed_user1_at,
        f2.created_at as followed_user2_at
      FROM users u
      JOIN follows f1 ON u.id = f1.follower_id AND f1.followed_id = $1
      JOIN follows f2 ON u.id = f2.follower_id AND f2.followed_id = $2
      WHERE u.is_active = true
      ORDER BY f1.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId1, userId2, limit, offset]);

    return result.rows;
  }

  /**
   * Get follow activity for a user (recent follows)
   */
  static async getFollowActivity(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const result = await query(`
      SELECT
        f.created_at,
        'follow' as activity_type,
        u.id as target_user_id,
        u.username as target_username,
        u.display_name as target_display_name
      FROM follows f
      JOIN users u ON f.followed_id = u.id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    return result.rows;
  }

  /**
   * Bulk follow multiple users
   */
  static async bulkFollow(followerId, userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }

    // Filter out self and duplicates
    const filteredIds = [...new Set(userIds)].filter(id => id !== followerId);

    if (filteredIds.length === 0) {
      return [];
    }

    return await transaction(async (client) => {
      const results = [];

      for (const userId of filteredIds) {
        try {
          // Check if already following
          const existing = await client.query(
            'SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2',
            [followerId, userId]
          );

          if (existing.rows.length === 0) {
            const result = await client.query(`
              INSERT INTO follows (follower_id, followed_id)
              VALUES ($1, $2)
              RETURNING *
            `, [followerId, userId]);

            results.push(new Follow(result.rows[0]));
          }
        } catch (error) {
          // Skip individual errors to continue processing
          console.error(`Error following user ${userId}:`, error.message);
        }
      }

      return results;
    });
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      follower_id: this.follower_id,
      followed_id: this.followed_id,
      created_at: this.created_at,
      follower: this.follower,
      followed: this.followed
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      created_at: this.created_at,
      follower: this.follower ? {
        username: this.follower.username,
        display_name: this.follower.display_name
      } : null,
      followed: this.followed ? {
        username: this.followed.username,
        display_name: this.followed.display_name
      } : null
    };
  }
}

module.exports = Follow;