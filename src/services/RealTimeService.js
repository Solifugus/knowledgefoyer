/**
 * Real-Time Service for Knowledge Foyer
 *
 * Manages WebSocket connections and real-time event broadcasting for social features
 */

class RealTimeService {
  constructor() {
    this.connections = new Map(); // userId -> Set of WebSocket connections
    this.connectionMeta = new Map(); // connection id -> metadata
  }

  /**
   * Register a WebSocket connection for a user
   */
  registerConnection(ws, user) {
    if (!this.connections.has(user.id)) {
      this.connections.set(user.id, new Set());
    }

    this.connections.get(user.id).add(ws);

    // Store metadata for the connection
    const connectionId = this.generateConnectionId();
    ws.connectionId = connectionId;
    ws.user = user;

    this.connectionMeta.set(connectionId, {
      userId: user.id,
      username: user.username,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    console.log(`📡 Real-time connection registered: ${user.username} (${connectionId})`);

    // Send connection confirmation
    this.sendToConnection(ws, {
      type: 'connection_confirmed',
      data: {
        user_id: user.id,
        connection_id: connectionId,
        server_time: new Date().toISOString()
      }
    });

    // Set up connection cleanup on close
    ws.on('close', () => this.unregisterConnection(ws));
    ws.on('error', () => this.unregisterConnection(ws));

    return connectionId;
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(ws) {
    if (!ws.user || !ws.connectionId) return;

    const userId = ws.user.id;
    const connectionId = ws.connectionId;

    if (this.connections.has(userId)) {
      this.connections.get(userId).delete(ws);

      // Remove user entry if no more connections
      if (this.connections.get(userId).size === 0) {
        this.connections.delete(userId);
      }
    }

    this.connectionMeta.delete(connectionId);
    console.log(`📡 Real-time connection unregistered: ${ws.user.username} (${connectionId})`);
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify(message));

        // Update last activity
        if (ws.connectionId && this.connectionMeta.has(ws.connectionId)) {
          this.connectionMeta.get(ws.connectionId).lastActivity = new Date();
        }

        return true;
      } catch (error) {
        console.error('Error sending message to WebSocket:', error.message);
        this.unregisterConnection(ws);
        return false;
      }
    }
    return false;
  }

  /**
   * Send message to all connections of a specific user
   */
  sendToUser(userId, message) {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return 0;

    let successCount = 0;
    for (const ws of userConnections) {
      if (this.sendToConnection(ws, message)) {
        successCount++;
      }
    }

    return successCount;
  }

  /**
   * Send message to multiple users
   */
  sendToUsers(userIds, message) {
    let totalSent = 0;
    for (const userId of userIds) {
      totalSent += this.sendToUser(userId, message);
    }
    return totalSent;
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(message, excludeUserId = null) {
    let totalSent = 0;

    for (const [userId, connections] of this.connections) {
      if (excludeUserId && userId === excludeUserId) continue;

      for (const ws of connections) {
        if (this.sendToConnection(ws, message)) {
          totalSent++;
        }
      }
    }

    return totalSent;
  }

  /**
   * Send follow notification in real-time
   */
  async sendFollowNotification(followerId, followedId) {
    const message = {
      type: 'user_followed',
      data: {
        follower_id: followerId,
        followed_id: followedId,
        timestamp: new Date().toISOString()
      }
    };

    // Send to the followed user
    const sentCount = this.sendToUser(followedId, message);

    // Also send follower count update
    try {
      const Follow = require('../models/Follow');
      const stats = await Follow.getUserSocialStats(followedId);

      this.sendToUser(followedId, {
        type: 'social_stats_updated',
        data: {
          user_id: followedId,
          stats
        }
      });
    } catch (error) {
      console.error('Error sending social stats update:', error.message);
    }

    return sentCount;
  }

  /**
   * Send unfollow notification in real-time
   */
  async sendUnfollowNotification(followerId, followedId) {
    const message = {
      type: 'user_unfollowed',
      data: {
        follower_id: followerId,
        followed_id: followedId,
        timestamp: new Date().toISOString()
      }
    };

    // Send to the unfollowed user
    const sentCount = this.sendToUser(followedId, message);

    // Also send updated follower count
    try {
      const Follow = require('../models/Follow');
      const stats = await Follow.getUserSocialStats(followedId);

      this.sendToUser(followedId, {
        type: 'social_stats_updated',
        data: {
          user_id: followedId,
          stats
        }
      });
    } catch (error) {
      console.error('Error sending social stats update:', error.message);
    }

    return sentCount;
  }

  /**
   * Send new message notification to followers
   */
  async sendMessageNotification(message) {
    try {
      // Get followers if message is public or followers-only
      if (message.visibility === 'private') return 0;

      const Follow = require('../models/Follow');
      const followers = await Follow.getFollowers(message.user_id);

      const notification = {
        type: 'new_message',
        data: {
          message_id: message.id,
          author_id: message.user_id,
          author_username: message.author?.username,
          content: message.content,
          message_type: message.message_type,
          created_at: message.created_at,
          visibility: message.visibility
        }
      };

      // Send to followers
      const followerIds = followers.map(f => f.user_id);
      const sentCount = this.sendToUsers(followerIds, notification);

      return sentCount;
    } catch (error) {
      console.error('Error sending message notification:', error.message);
      return 0;
    }
  }

  /**
   * Send article publication notification to followers
   */
  async sendArticlePublishedNotification(article, authorId) {
    try {
      const Follow = require('../models/Follow');
      const followers = await Follow.getFollowers(authorId);

      const notification = {
        type: 'article_published',
        data: {
          article_id: article.id,
          title: article.title,
          slug: article.slug,
          author_id: authorId,
          author_username: article.author?.username,
          published_at: article.published_at,
          summary: article.summary
        }
      };

      // Send to followers
      const followerIds = followers.map(f => f.user_id);
      const sentCount = this.sendToUsers(followerIds, notification);

      return sentCount;
    } catch (error) {
      console.error('Error sending article published notification:', error.message);
      return 0;
    }
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator(userId, targetUserId, isTyping = true) {
    const message = {
      type: 'typing_indicator',
      data: {
        user_id: userId,
        is_typing: isTyping,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendToUser(targetUserId, message);
  }

  /**
   * Send user presence update
   */
  sendPresenceUpdate(userId, status = 'online') {
    // Get followers to notify of presence change
    const Follow = require('../models/Follow');
    Follow.getFollowers(userId).then(followers => {
      const message = {
        type: 'user_presence',
        data: {
          user_id: userId,
          status,
          timestamp: new Date().toISOString()
        }
      };

      const followerIds = followers.map(f => f.user_id);
      this.sendToUsers(followerIds, message);
    }).catch(error => {
      console.error('Error sending presence update:', error.message);
    });
  }

  /**
   * Send notification in real-time
   */
  sendNotification(notification) {
    const message = {
      type: 'notification',
      data: notification.toJSON()
    };

    return this.sendToUser(notification.user_id, message);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const totalConnections = Array.from(this.connections.values())
      .reduce((sum, connections) => sum + connections.size, 0);

    const userCounts = {};
    for (const [userId, connections] of this.connections) {
      userCounts[userId] = connections.size;
    }

    const now = new Date();
    const connectionDetails = Array.from(this.connectionMeta.values()).map(meta => ({
      userId: meta.userId,
      username: meta.username,
      connectedAt: meta.connectedAt,
      lastActivity: meta.lastActivity,
      uptime: Math.floor((now - meta.connectedAt) / 1000)
    }));

    return {
      total_connections: totalConnections,
      unique_users: this.connections.size,
      user_connection_counts: userCounts,
      connections: connectionDetails,
      server_uptime: process.uptime()
    };
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections() {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    let cleanedCount = 0;

    for (const [connectionId, meta] of this.connectionMeta) {
      if (now - meta.lastActivity > staleThreshold) {
        // Find and close the stale connection
        const userConnections = this.connections.get(meta.userId);
        if (userConnections) {
          for (const ws of userConnections) {
            if (ws.connectionId === connectionId) {
              ws.close();
              cleanedCount++;
              break;
            }
          }
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Send heartbeat to all connections
   */
  sendHeartbeat() {
    const message = {
      type: 'heartbeat',
      data: {
        server_time: new Date().toISOString(),
        uptime: process.uptime()
      }
    };

    return this.broadcast(message);
  }

  /**
   * Handle incoming real-time messages
   */
  handleMessage(ws, message) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;

      switch (data.type) {
        case 'ping':
          this.sendToConnection(ws, {
            type: 'pong',
            data: { timestamp: new Date().toISOString() }
          });
          break;

        case 'typing_start':
          if (data.target_user_id) {
            this.sendTypingIndicator(ws.user.id, data.target_user_id, true);
          }
          break;

        case 'typing_stop':
          if (data.target_user_id) {
            this.sendTypingIndicator(ws.user.id, data.target_user_id, false);
          }
          break;

        case 'presence_update':
          this.sendPresenceUpdate(ws.user.id, data.status || 'online');
          break;

        default:
          console.log(`📡 Unknown real-time message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling real-time message:', error.message);
    }
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get users currently online
   */
  getOnlineUsers() {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId) {
    return this.connections.has(userId) && this.connections.get(userId).size > 0;
  }
}

// Create singleton instance
const realTimeService = new RealTimeService();

module.exports = realTimeService;