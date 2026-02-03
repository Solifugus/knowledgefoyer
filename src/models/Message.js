/**
 * Message Model for Knowledge Foyer
 *
 * Manages user messages, posts, and announcements
 */

const { query, transaction } = require('../config/database');

class Message {
  constructor(data = {}) {
    this.id = data.id || null;
    this.user_id = data.user_id || null;
    this.content = data.content || '';
    this.message_type = data.message_type || 'post';
    this.visibility = data.visibility || 'public';
    this.reply_to_id = data.reply_to_id || null;
    this.article_id = data.article_id || null;
    this.metadata = data.metadata || {};
    this.is_pinned = data.is_pinned || false;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    // For joined queries
    this.author = data.author || null;
    this.reply_to = data.reply_to || null;
    this.article = data.article || null;
    this.replies_count = data.replies_count || 0;
  }

  /**
   * Valid message types
   */
  static get MESSAGE_TYPES() {
    return ['post', 'announcement', 'system'];
  }

  /**
   * Valid visibility options
   */
  static get VISIBILITY_OPTIONS() {
    return ['public', 'followers', 'private'];
  }

  /**
   * Create a new message
   */
  static async create(messageData) {
    const {
      userId,
      content,
      messageType = 'post',
      visibility = 'public',
      replyToId = null,
      articleId = null,
      metadata = {}
    } = messageData;

    // Validation
    if (!content || content.trim().length === 0) {
      throw new Error('Message content is required');
    }

    if (content.length > 2000) {
      throw new Error('Message content cannot exceed 2000 characters');
    }

    if (!this.MESSAGE_TYPES.includes(messageType)) {
      throw new Error(`Invalid message type: ${messageType}`);
    }

    if (!this.VISIBILITY_OPTIONS.includes(visibility)) {
      throw new Error(`Invalid visibility: ${visibility}`);
    }

    return await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO messages (
          user_id, content, message_type, visibility,
          reply_to_id, article_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userId, content.trim(), messageType, visibility,
        replyToId, articleId, JSON.stringify(metadata)
      ]);

      const message = new Message(result.rows[0]);

      // Handle reply notifications
      if (replyToId) {
        try {
          const originalMessage = await Message.findById(replyToId, true);
          if (originalMessage && originalMessage.user_id !== userId) {
            const NotificationService = require('../services/NotificationService');
            await NotificationService.handleMessageReplyNotification(originalMessage, message, userId);
          }
        } catch (error) {
          console.error('Error creating reply notification:', error.message);
        }
      }

      return message;
    });
  }

  /**
   * Find message by ID
   */
  static async findById(id, includePrivate = false) {
    let whereClause = 'WHERE m.id = $1';
    if (!includePrivate) {
      whereClause += ` AND m.visibility != 'private'`;
    }

    const result = await query(`
      SELECT
        m.*,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id) as replies_count
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const message = new Message(result.rows[0]);
    message.author = {
      username: result.rows[0].username,
      display_name: result.rows[0].display_name,
      avatar_url: result.rows[0].avatar_url
    };
    message.replies_count = parseInt(result.rows[0].replies_count);

    return message;
  }

  /**
   * Get messages by user
   */
  static async findByUser(userId, options = {}) {
    const {
      includePrivate = false,
      messageType = null,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options;

    let whereClause = 'WHERE m.user_id = $1';
    const params = [userId];
    let paramCount = 1;

    if (!includePrivate) {
      whereClause += ` AND m.visibility != 'private'`;
    }

    if (messageType) {
      paramCount++;
      whereClause += ` AND m.message_type = $${paramCount}`;
      params.push(messageType);
    }

    const validOrderFields = ['created_at', 'updated_at', 'content'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'created_at';
    const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const result = await query(`
      SELECT
        m.*,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id) as replies_count
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
      ORDER BY m.${orderField} ${direction}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => {
      const message = new Message(row);
      message.author = {
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      };
      message.replies_count = parseInt(row.replies_count);
      return message;
    });
  }

  /**
   * Get public timeline (recent public messages)
   */
  static async getPublicTimeline(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT
        m.*,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id) as replies_count
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.visibility = 'public'
      AND u.is_active = true
      ORDER BY m.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return result.rows.map(row => {
      const message = new Message(row);
      message.author = {
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      };
      message.replies_count = parseInt(row.replies_count);
      return message;
    });
  }

  /**
   * Get user's personalized feed
   */
  static async getUserFeed(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(
      'SELECT * FROM get_user_feed($1, $2, $3)',
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get replies to a message
   */
  static async getReplies(messageId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT
        m.*,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id) as replies_count
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.reply_to_id = $1
      AND m.visibility IN ('public', 'followers')
      AND u.is_active = true
      ORDER BY m.created_at ASC
      LIMIT $2 OFFSET $3
    `, [messageId, limit, offset]);

    return result.rows.map(row => {
      const message = new Message(row);
      message.author = {
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      };
      message.replies_count = parseInt(row.replies_count);
      return message;
    });
  }

  /**
   * Get article announcements
   */
  static async getArticleAnnouncements(articleId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const result = await query(`
      SELECT
        m.*,
        u.username, u.display_name, u.avatar_url
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.article_id = $1
      AND m.message_type = 'announcement'
      AND m.visibility IN ('public', 'followers')
      AND u.is_active = true
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [articleId, limit, offset]);

    return result.rows.map(row => {
      const message = new Message(row);
      message.author = {
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      };
      return message;
    });
  }

  /**
   * Create article announcement automatically
   */
  static async createArticleAnnouncement(userId, article, changeType = 'published') {
    const actionText = changeType === 'published' ? 'published' : 'updated';
    const content = `I ${actionText} a new article: "${article.title}"`;

    const metadata = {
      article_id: article.id,
      article_title: article.title,
      article_slug: article.slug,
      change_type: changeType,
      version: article.version || 1
    };

    return await this.create({
      userId,
      content,
      messageType: 'announcement',
      visibility: 'public',
      articleId: article.id,
      metadata
    });
  }

  /**
   * Search messages
   */
  static async search(searchQuery, options = {}) {
    const { limit = 50, offset = 0, userId = null } = options;

    const searchTerm = `%${searchQuery.toLowerCase()}%`;
    let whereClause = `WHERE m.visibility = 'public' AND LOWER(m.content) LIKE $1`;
    const params = [searchTerm];

    if (userId) {
      whereClause += ` OR (m.user_id = $2 AND m.visibility IN ('public', 'followers', 'private'))`;
      params.push(userId);
    }

    const result = await query(`
      SELECT
        m.*,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*) FROM messages WHERE reply_to_id = m.id) as replies_count
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClause}
      AND u.is_active = true
      ORDER BY m.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return result.rows.map(row => {
      const message = new Message(row);
      message.author = {
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url
      };
      message.replies_count = parseInt(row.replies_count);
      return message;
    });
  }

  /**
   * Update message
   */
  async update(updates, userId) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to update this message');
    }

    const allowedFields = ['content', 'visibility', 'is_pinned'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'content' && (!value || value.trim().length === 0)) {
          throw new Error('Message content cannot be empty');
        }
        if (key === 'content' && value.length > 2000) {
          throw new Error('Message content cannot exceed 2000 characters');
        }
        if (key === 'visibility' && !Message.VISIBILITY_OPTIONS.includes(value)) {
          throw new Error(`Invalid visibility: ${value}`);
        }

        updateFields.push(`${key} = $${paramCount}`);
        values.push(key === 'content' ? value.trim() : value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(this.id);
    const result = await query(`
      UPDATE messages
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Message not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Delete message
   */
  async delete(userId) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to delete this message');
    }

    await transaction(async (client) => {
      // Delete replies first
      await client.query('DELETE FROM messages WHERE reply_to_id = $1', [this.id]);
      // Delete the message
      await client.query('DELETE FROM messages WHERE id = $1', [this.id]);
      // Clean up related feed items
      await client.query('DELETE FROM feed_items WHERE source_id = $1 AND item_type = $2', [this.id, 'message']);
    });

    return true;
  }

  /**
   * Pin/unpin message
   */
  async togglePin(userId) {
    if (this.user_id !== userId) {
      throw new Error('Unauthorized to pin this message');
    }

    const result = await query(`
      UPDATE messages
      SET is_pinned = NOT is_pinned, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  /**
   * Get message statistics for a user
   */
  static async getUserMessageStats(userId) {
    const result = await query(`
      SELECT
        COUNT(*) as total_messages,
        COUNT(CASE WHEN message_type = 'post' THEN 1 END) as posts_count,
        COUNT(CASE WHEN message_type = 'announcement' THEN 1 END) as announcements_count,
        COUNT(CASE WHEN reply_to_id IS NOT NULL THEN 1 END) as replies_count,
        COUNT(CASE WHEN visibility = 'public' THEN 1 END) as public_messages,
        COUNT(CASE WHEN is_pinned = true THEN 1 END) as pinned_messages,
        MAX(created_at) as latest_message_at
      FROM messages
      WHERE user_id = $1
    `, [userId]);

    const row = result.rows[0];
    return {
      total_messages: parseInt(row.total_messages),
      posts_count: parseInt(row.posts_count),
      announcements_count: parseInt(row.announcements_count),
      replies_count: parseInt(row.replies_count),
      public_messages: parseInt(row.public_messages),
      pinned_messages: parseInt(row.pinned_messages),
      latest_message_at: row.latest_message_at
    };
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      content: this.content,
      message_type: this.message_type,
      visibility: this.visibility,
      reply_to_id: this.reply_to_id,
      article_id: this.article_id,
      metadata: typeof this.metadata === 'string' ? JSON.parse(this.metadata) : this.metadata,
      is_pinned: this.is_pinned,
      created_at: this.created_at,
      updated_at: this.updated_at,
      author: this.author,
      reply_to: this.reply_to,
      article: this.article,
      replies_count: this.replies_count
    };
  }

  /**
   * Convert to public JSON (excludes sensitive data)
   */
  toPublicJSON() {
    return {
      id: this.id,
      content: this.content,
      message_type: this.message_type,
      is_pinned: this.is_pinned,
      created_at: this.created_at,
      updated_at: this.updated_at,
      author: this.author ? {
        username: this.author.username,
        display_name: this.author.display_name
      } : null,
      replies_count: this.replies_count,
      metadata: typeof this.metadata === 'string' ? JSON.parse(this.metadata) : this.metadata
    };
  }
}

module.exports = Message;