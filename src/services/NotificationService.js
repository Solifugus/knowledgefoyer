/**
 * Notification Service for Knowledge Foyer
 *
 * Handles notification creation, delivery, and management
 */

const { query, transaction } = require('../config/database');
const Notification = require('../models/Notification');
const Follow = require('../models/Follow');

class NotificationService {
  /**
   * Create and send notification to user
   */
  static async createAndSendNotification(notificationData, realTimeWS = null) {
    try {
      const notification = await Notification.create(notificationData);

      // Send real-time notification if WebSocket server is available
      if (realTimeWS && global.mcpServer) {
        this.sendRealTimeNotification(notification, global.mcpServer);
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error.message);
      throw error;
    }
  }

  /**
   * Send real-time notification via WebSocket
   */
  static sendRealTimeNotification(notification, mcpServer) {
    if (!mcpServer || !mcpServer.clients) return;

    const message = {
      type: 'notification',
      data: notification.toJSON()
    };

    mcpServer.clients.forEach((client) => {
      if (client.readyState === 1 && // WebSocket.OPEN
          client.user &&
          client.user.id === notification.user_id) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('Error sending real-time notification:', error.message);
        }
      }
    });
  }

  /**
   * Handle new follow notification
   */
  static async handleFollowNotification(followerId, followedId) {
    try {
      // Get follower info
      const followerResult = await query(
        'SELECT username, display_name FROM users WHERE id = $1',
        [followerId]
      );

      if (followerResult.rows.length === 0) {
        throw new Error('Follower not found');
      }

      const follower = followerResult.rows[0];

      const notification = await this.createAndSendNotification({
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

      return notification;
    } catch (error) {
      console.error('Error handling follow notification:', error.message);
      return null;
    }
  }

  /**
   * Handle new article notifications for followers
   */
  static async handleArticlePublishedNotifications(article, authorId) {
    try {
      // Get author's followers
      const followers = await Follow.getFollowers(authorId);

      if (followers.length === 0) {
        return [];
      }

      // Get author info
      const authorResult = await query(
        'SELECT username, display_name FROM users WHERE id = $1',
        [authorId]
      );

      if (authorResult.rows.length === 0) {
        throw new Error('Author not found');
      }

      const author = authorResult.rows[0];

      // Create notifications for all followers
      const notifications = [];
      for (const follower of followers) {
        try {
          const notification = await this.createAndSendNotification({
            userId: follower.user_id,
            type: 'new_article',
            title: 'New Article',
            content: `${author.display_name || author.username} published "${article.title}"`,
            data: {
              article_id: article.id,
              article_title: article.title,
              article_slug: article.slug,
              author_id: authorId,
              author_username: author.username,
              author_display_name: author.display_name
            }
          });

          notifications.push(notification);
        } catch (error) {
          console.error(`Error creating article notification for user ${follower.user_id}:`, error.message);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error handling article published notifications:', error.message);
      return [];
    }
  }

  /**
   * Handle article update notifications
   */
  static async handleArticleUpdatedNotifications(article, authorId, versionNumber) {
    try {
      // Get followers who have interacted with this article (given feedback, etc.)
      const interestedUsersResult = await query(`
        SELECT DISTINCT f.follower_id as user_id
        FROM follows f
        WHERE f.followed_id = $1

        UNION

        SELECT DISTINCT fb.user_id
        FROM feedback fb
        WHERE fb.article_id = $2
        AND fb.user_id != $1
      `, [authorId, article.id]);

      if (interestedUsersResult.rows.length === 0) {
        return [];
      }

      // Get author info
      const authorResult = await query(
        'SELECT username, display_name FROM users WHERE id = $1',
        [authorId]
      );

      if (authorResult.rows.length === 0) {
        throw new Error('Author not found');
      }

      const author = authorResult.rows[0];

      // Create notifications for interested users
      const notifications = [];
      for (const user of interestedUsersResult.rows) {
        try {
          const notification = await this.createAndSendNotification({
            userId: user.user_id,
            type: 'article_updated',
            title: 'Article Updated',
            content: `${author.display_name || author.username} updated "${article.title}" (v${versionNumber})`,
            data: {
              article_id: article.id,
              article_title: article.title,
              article_slug: article.slug,
              version_number: versionNumber,
              author_id: authorId,
              author_username: author.username,
              author_display_name: author.display_name
            }
          });

          notifications.push(notification);
        } catch (error) {
          console.error(`Error creating article update notification for user ${user.user_id}:`, error.message);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error handling article updated notifications:', error.message);
      return [];
    }
  }

  /**
   * Handle message reply notifications
   */
  static async handleMessageReplyNotification(originalMessage, replyMessage, replyAuthorId) {
    try {
      // Don't notify if replying to yourself
      if (replyAuthorId === originalMessage.user_id) {
        return null;
      }

      // Get reply author info
      const authorResult = await query(
        'SELECT username, display_name FROM users WHERE id = $1',
        [replyAuthorId]
      );

      if (authorResult.rows.length === 0) {
        throw new Error('Reply author not found');
      }

      const author = authorResult.rows[0];

      const notification = await this.createAndSendNotification({
        userId: originalMessage.user_id,
        type: 'message_reply',
        title: 'New Reply',
        content: `${author.display_name || author.username} replied to your message`,
        data: {
          reply_message_id: replyMessage.id,
          original_message_id: originalMessage.id,
          reply_author_id: replyAuthorId,
          reply_author_username: author.username,
          reply_author_display_name: author.display_name,
          reply_content: replyMessage.content.substring(0, 100)
        }
      });

      return notification;
    } catch (error) {
      console.error('Error handling message reply notification:', error.message);
      return null;
    }
  }

  /**
   * Handle feedback received notifications
   */
  static async handleFeedbackReceivedNotification(feedback, articleAuthorId) {
    try {
      // Don't notify if giving feedback to yourself
      if (feedback.user_id === articleAuthorId) {
        return null;
      }

      // Get feedback author and article info
      const infoResult = await query(`
        SELECT
          u.username, u.display_name,
          a.title as article_title
        FROM users u, articles a
        WHERE u.id = $1 AND a.id = $2
      `, [feedback.user_id, feedback.article_id]);

      if (infoResult.rows.length === 0) {
        throw new Error('Feedback author or article not found');
      }

      const info = infoResult.rows[0];

      const notification = await this.createAndSendNotification({
        userId: articleAuthorId,
        type: 'feedback_received',
        title: 'New Feedback',
        content: `${info.display_name || info.username} left ${feedback.type} feedback on "${info.article_title}"`,
        data: {
          feedback_id: feedback.id,
          article_id: feedback.article_id,
          article_title: info.article_title,
          feedback_type: feedback.type,
          feedback_author_id: feedback.user_id,
          feedback_author_username: info.username,
          feedback_author_display_name: info.display_name
        }
      });

      return notification;
    } catch (error) {
      console.error('Error handling feedback received notification:', error.message);
      return null;
    }
  }

  /**
   * Handle feedback resolution notifications
   */
  static async handleFeedbackResolvedNotification(feedbackResolution, feedbackAuthorId) {
    try {
      // Get resolution info
      const infoResult = await query(`
        SELECT
          a.title as article_title,
          a.user_id as article_author_id,
          u.username as article_author_username,
          u.display_name as article_author_display_name
        FROM articles a, users u
        WHERE a.id = $1 AND u.id = a.user_id
      `, [feedbackResolution.article_id]);

      if (infoResult.rows.length === 0) {
        throw new Error('Article or author not found');
      }

      const info = infoResult.rows[0];

      const notification = await this.createAndSendNotification({
        userId: feedbackAuthorId,
        type: 'feedback_resolved',
        title: 'Feedback Addressed',
        content: `${info.article_author_display_name || info.article_author_username} addressed your feedback on "${info.article_title}"`,
        data: {
          feedback_id: feedbackResolution.feedback_id,
          article_id: feedbackResolution.article_id,
          article_title: info.article_title,
          resolution_type: feedbackResolution.resolution_type,
          resolution_notes: feedbackResolution.resolution_notes,
          to_version: feedbackResolution.to_version,
          article_author_id: info.article_author_id,
          article_author_username: info.article_author_username
        }
      });

      return notification;
    } catch (error) {
      console.error('Error handling feedback resolved notification:', error.message);
      return null;
    }
  }

  /**
   * Send digest notifications (daily/weekly summaries)
   */
  static async sendDigestNotifications(type = 'daily') {
    try {
      const timeframe = type === 'daily' ? '24 hours' : '7 days';

      // Get active users who should receive digests
      const usersResult = await query(`
        SELECT DISTINCT u.id, u.username, u.display_name, u.email
        FROM users u
        WHERE u.is_active = true
        AND u.email_verified = true
        AND EXISTS (
          SELECT 1 FROM follows WHERE follower_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications
          WHERE user_id = u.id
          AND type = $1
          AND created_at > NOW() - INTERVAL $2
        )
      `, [`digest_${type}`, timeframe]);

      const notifications = [];

      for (const user of usersResult.rows) {
        try {
          // Get digest content for this user
          const digestContent = await this.generateDigestContent(user.id, timeframe);

          if (digestContent.totalItems > 0) {
            const notification = await this.createAndSendNotification({
              userId: user.id,
              type: `digest_${type}`,
              title: `Your ${type} digest`,
              content: `${digestContent.totalItems} new items from ${digestContent.uniqueAuthors} authors`,
              data: digestContent,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expire in 7 days
            });

            notifications.push(notification);
          }
        } catch (error) {
          console.error(`Error creating digest for user ${user.id}:`, error.message);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error sending digest notifications:', error.message);
      return [];
    }
  }

  /**
   * Generate digest content for a user
   */
  static async generateDigestContent(userId, timeframe) {
    const result = await query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN item_type = 'message' THEN 1 END) as new_messages,
        COUNT(CASE WHEN item_type = 'article_published' THEN 1 END) as new_articles,
        COUNT(DISTINCT source_user_id) as unique_authors,
        array_agg(DISTINCT source_user_id) as author_ids
      FROM feed_items
      WHERE user_id = $1
      AND created_at > NOW() - INTERVAL $2
    `, [userId, timeframe]);

    const row = result.rows[0];
    return {
      totalItems: parseInt(row.total_items),
      newMessages: parseInt(row.new_messages),
      newArticles: parseInt(row.new_articles),
      uniqueAuthors: parseInt(row.unique_authors),
      authorIds: row.author_ids || []
    };
  }

  /**
   * Cleanup expired and read notifications
   */
  static async cleanupNotifications(options = {}) {
    const { keepReadDays = 7, keepUnreadDays = 30 } = options;

    const result = await transaction(async (client) => {
      // Delete old read notifications
      const readDeleted = await client.query(`
        DELETE FROM notifications
        WHERE is_read = true
        AND created_at < NOW() - INTERVAL '${keepReadDays} days'
      `);

      // Delete old unread notifications
      const unreadDeleted = await client.query(`
        DELETE FROM notifications
        WHERE is_read = false
        AND created_at < NOW() - INTERVAL '${keepUnreadDays} days'
      `);

      // Delete expired notifications
      const expiredDeleted = await client.query(`
        DELETE FROM notifications
        WHERE expires_at IS NOT NULL
        AND expires_at <= NOW()
      `);

      return {
        readDeleted: readDeleted.rowCount || 0,
        unreadDeleted: unreadDeleted.rowCount || 0,
        expiredDeleted: expiredDeleted.rowCount || 0
      };
    });

    return result;
  }

  /**
   * Get notification preferences for a user (placeholder for future implementation)
   */
  static async getNotificationPreferences(userId) {
    // For now, return default preferences
    // In the future, this could be stored in a user_notification_preferences table
    return {
      email_notifications: true,
      push_notifications: true,
      types: {
        new_follower: true,
        new_article: true,
        article_updated: true,
        new_message: false,
        message_reply: true,
        feedback_received: true,
        feedback_resolved: true
      },
      digest: {
        daily: false,
        weekly: true
      }
    };
  }

  /**
   * Check if user should receive notification based on preferences
   */
  static async shouldSendNotification(userId, notificationType) {
    const preferences = await this.getNotificationPreferences(userId);
    return preferences.types[notificationType] !== false;
  }

  /**
   * Get notification statistics for admin dashboard
   */
  static async getNotificationStats(timeframe = '24 hours') {
    const result = await query(`
      SELECT
        type,
        COUNT(*) as total,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read_count,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL $1 THEN 1 END) as recent_count
      FROM notifications
      GROUP BY type
      ORDER BY total DESC
    `, [timeframe]);

    const stats = {};
    let totalNotifications = 0;
    let totalRead = 0;
    let totalRecent = 0;

    for (const row of result.rows) {
      const total = parseInt(row.total);
      const read = parseInt(row.read_count);
      const recent = parseInt(row.recent_count);

      stats[row.type] = {
        total,
        read,
        unread: total - read,
        recent,
        read_rate: total > 0 ? (read / total * 100).toFixed(1) : 0
      };

      totalNotifications += total;
      totalRead += read;
      totalRecent += recent;
    }

    return {
      by_type: stats,
      totals: {
        all_notifications: totalNotifications,
        read: totalRead,
        unread: totalNotifications - totalRead,
        recent: totalRecent,
        overall_read_rate: totalNotifications > 0 ? (totalRead / totalNotifications * 100).toFixed(1) : 0
      }
    };
  }
}

module.exports = NotificationService;