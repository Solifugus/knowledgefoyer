/**
 * Notification Model for Knowledge Foyer
 *
 * Manages system notifications for users
 */

const { query, transaction } = require('../config/database');

class Notification {
  constructor(data = {}) {
    this.id = data.id || null;
    this.user_id = data.user_id || null;
    this.type = data.type || null;
    this.title = data.title || '';
    this.content = data.content || null;
    this.data = data.data || {};
    this.is_read = data.is_read || false;
    this.created_at = data.created_at || null;
    this.expires_at = data.expires_at || null;
  }

  /**
   * Valid notification types
   */
  static get NOTIFICATION_TYPES() {
    return [
      'new_follower',
      'new_article',
      'article_updated',
      'new_message',
      'message_reply',
      'feedback_received',
      'feedback_resolved'
    ];
  }

  /**
   * Create a new notification
   */
  static async create(notificationData) {
    const {
      userId,
      type,
      title,
      content = null,
      data = {},
      expiresAt = null
    } = notificationData;

    // Validation
    if (!this.NOTIFICATION_TYPES.includes(type)) {
      throw new Error(`Invalid notification type: ${type}`);
    }

    if (!title || title.trim().length === 0) {
      throw new Error('Notification title is required');
    }

    const result = await query(`
      INSERT INTO notifications (
        user_id, type, title, content, data, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      userId, type, title.trim(), content,
      JSON.stringify(data), expiresAt
    ]);

    return new Notification(result.rows[0]);
  }

  /**
   * Find notification by ID
   */
  static async findById(id, userId = null) {
    let whereClause = 'WHERE id = $1';
    const params = [id];

    if (userId) {
      whereClause += ' AND user_id = $2';
      params.push(userId);
    }

    const result = await query(`
      SELECT * FROM notifications
      ${whereClause}
      AND (expires_at IS NULL OR expires_at > NOW())
    `, params);

    return result.rows.length > 0 ? new Notification(result.rows[0]) : null;
  }

  /**
   * Get notifications for a user
   */
  static async getUserNotifications(userId, options = {}) {
    const {
      unreadOnly = false,
      type = null,
      limit = 50,
      offset = 0
    } = options;

    let whereClause = 'WHERE user_id = $1';
    const params = [userId];
    let paramCount = 1;

    if (unreadOnly) {
      whereClause += ' AND is_read = false';
    }

    if (type) {
      paramCount++;
      whereClause += ` AND type = $${paramCount}`;
      params.push(type);
    }

    // Only include non-expired notifications
    whereClause += ' AND (expires_at IS NULL OR expires_at > NOW())';

    const result = await query(`
      SELECT * FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => new Notification(row));
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userId) {
    const result = await query(
      'SELECT get_unread_notifications_count($1) as count',
      [userId]
    );

    return result.rows[0].count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead() {
    const result = await query(`
      UPDATE notifications
      SET is_read = true
      WHERE id = $1
      RETURNING *
    `, [this.id]);

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId, type = null) {
    let whereClause = 'WHERE user_id = $1 AND is_read = false';
    const params = [userId];

    if (type) {
      whereClause += ' AND type = $2';
      params.push(type);
    }

    const result = await query(`
      UPDATE notifications
      SET is_read = true
      ${whereClause}
      RETURNING *
    `, params);

    return result.rows.map(row => new Notification(row));
  }

  /**
   * Delete notification
   */
  async delete(userId = null) {
    if (userId && this.user_id !== userId) {
      throw new Error('Unauthorized to delete this notification');
    }

    await query('DELETE FROM notifications WHERE id = $1', [this.id]);
    return true;
  }

  /**
   * Delete all notifications for a user
   */
  static async deleteAllForUser(userId, type = null) {
    let whereClause = 'WHERE user_id = $1';
    const params = [userId];

    if (type) {
      whereClause += ' AND type = $2';
      params.push(type);
    }

    const result = await query(`
      DELETE FROM notifications
      ${whereClause}
      RETURNING id
    `, params);

    return result.rows.length;
  }

  /**
   * Create notification for new follower
   */
  static async createFollowNotification(followerId, followedId) {
    // Get follower info
    const followerResult = await query(
      'SELECT username, display_name FROM users WHERE id = $1',
      [followerId]
    );

    if (followerResult.rows.length === 0) {
      throw new Error('Follower not found');
    }

    const follower = followerResult.rows[0];

    return await this.create({
      userId: followedId,
      type: 'new_follower',
      title: 'New Follower',
      content: `${follower.display_name || follower.username} started following you`,
      data: {
        follower_id: followerId,
        follower_username: follower.username,
        follower_display_name: follower.display_name
      }
    });
  }

  /**
   * Create notification for new article
   */
  static async createArticleNotification(authorId, article, followers) {
    if (!Array.isArray(followers) || followers.length === 0) {
      return [];
    }

    const notifications = [];

    for (const followerId of followers) {
      try {
        const notification = await this.create({
          userId: followerId,
          type: 'new_article',
          title: 'New Article',
          content: `${article.author?.display_name || article.author?.username || 'Someone'} published "${article.title}"`,
          data: {
            article_id: article.id,
            article_title: article.title,
            article_slug: article.slug,
            author_id: authorId,
            author_username: article.author?.username
          }
        });

        notifications.push(notification);
      } catch (error) {
        console.error(`Error creating article notification for user ${followerId}:`, error.message);
      }
    }

    return notifications;
  }

  /**
   * Create notification for message reply
   */
  static async createMessageReplyNotification(replyUserId, originalMessage, replyMessage) {
    // Don't notify if replying to yourself
    if (replyUserId === originalMessage.user_id) {
      return null;
    }

    // Get reply author info
    const authorResult = await query(
      'SELECT username, display_name FROM users WHERE id = $1',
      [replyUserId]
    );

    if (authorResult.rows.length === 0) {
      throw new Error('Reply author not found');
    }

    const author = authorResult.rows[0];

    return await this.create({
      userId: originalMessage.user_id,
      type: 'message_reply',
      title: 'New Reply',
      content: `${author.display_name || author.username} replied to your message`,
      data: {
        reply_message_id: replyMessage.id,
        original_message_id: originalMessage.id,
        reply_author_id: replyUserId,
        reply_author_username: author.username,
        reply_content: replyMessage.content.substring(0, 100) // First 100 chars
      }
    });
  }

  /**
   * Create notification for feedback received
   */
  static async createFeedbackNotification(feedbackData) {
    const {
      articleAuthorId,
      feedbackAuthorId,
      articleTitle,
      feedbackType,
      feedbackId,
      articleId
    } = feedbackData;

    // Don't notify if giving feedback to yourself
    if (feedbackAuthorId === articleAuthorId) {
      return null;
    }

    // Get feedback author info
    const authorResult = await query(
      'SELECT username, display_name FROM users WHERE id = $1',
      [feedbackAuthorId]
    );

    if (authorResult.rows.length === 0) {
      throw new Error('Feedback author not found');
    }

    const author = authorResult.rows[0];

    return await this.create({
      userId: articleAuthorId,
      type: 'feedback_received',
      title: 'New Feedback',
      content: `${author.display_name || author.username} left ${feedbackType} feedback on "${articleTitle}"`,
      data: {
        feedback_id: feedbackId,
        article_id: articleId,
        article_title: articleTitle,
        feedback_type: feedbackType,
        feedback_author_id: feedbackAuthorId,
        feedback_author_username: author.username
      }
    });
  }

  /**
   * Clean up expired notifications
   */
  static async cleanupExpired() {
    const result = await query('SELECT cleanup_expired_notifications() as deleted_count');
    return result.rows[0].deleted_count;
  }

  /**
   * Get notification summary by type
   */
  static async getNotificationSummary(userId) {
    const result = await query(`
      SELECT
        type,
        COUNT(*) as total,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
        MAX(created_at) as latest
      FROM notifications
      WHERE user_id = $1
      AND (expires_at IS NULL OR expires_at > NOW())
      GROUP BY type
      ORDER BY unread DESC, total DESC
    `, [userId]);

    const summary = {};
    for (const row of result.rows) {
      summary[row.type] = {
        total: parseInt(row.total),
        unread: parseInt(row.unread),
        latest: row.latest
      };
    }

    return summary;
  }

  /**
   * Bulk create notifications
   */
  static async bulkCreate(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return [];
    }

    return await transaction(async (client) => {
      const results = [];

      for (const notifData of notifications) {
        try {
          const result = await client.query(`
            INSERT INTO notifications (
              user_id, type, title, content, data, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
          `, [
            notifData.userId,
            notifData.type,
            notifData.title,
            notifData.content || null,
            JSON.stringify(notifData.data || {}),
            notifData.expiresAt || null
          ]);

          results.push(new Notification(result.rows[0]));
        } catch (error) {
          console.error('Error creating notification:', error.message);
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
      user_id: this.user_id,
      type: this.type,
      title: this.title,
      content: this.content,
      data: typeof this.data === 'string' ? JSON.parse(this.data) : this.data,
      is_read: this.is_read,
      created_at: this.created_at,
      expires_at: this.expires_at
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      content: this.content,
      data: typeof this.data === 'string' ? JSON.parse(this.data) : this.data,
      is_read: this.is_read,
      created_at: this.created_at
    };
  }
}

module.exports = Notification;