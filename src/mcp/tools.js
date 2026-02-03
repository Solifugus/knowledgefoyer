/**
 * MCP Tools for Knowledge Foyer
 *
 * Implementation of all MCP tool handlers
 */

const Article = require('../models/Article');
const ArticleVersion = require('../models/ArticleVersion');
const FeedbackResolution = require('../models/FeedbackResolution');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Message = require('../models/Message');
const Notification = require('../models/Notification');

/**
 * Tool registry with all available tools
 */
const TOOLS = {
  // Article Management
  'create_article': {
    description: 'Create a new article',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        content: { type: 'string', minLength: 10 },
        summary: { type: 'string', maxLength: 1000 },
        visibility: { type: 'string', enum: ['public', 'private', 'unlisted'] }
      },
      required: ['title', 'content']
    }
  },

  'update_article': {
    description: 'Update an existing article with version control',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        title: { type: 'string', minLength: 1, maxLength: 255 },
        content: { type: 'string', minLength: 10 },
        summary: { type: 'string', maxLength: 1000 },
        visibility: { type: 'string', enum: ['public', 'private', 'unlisted'] },
        change_summary: { type: 'string', maxLength: 500 }
      },
      required: ['article_id']
    }
  },

  'get_article': {
    description: 'Get an article by ID or username/slug',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        slug: { type: 'string' }
      }
    }
  },

  'delete_article': {
    description: 'Delete an article',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' }
      },
      required: ['article_id']
    }
  },

  'publish_article': {
    description: 'Publish or unpublish an article',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        action: { type: 'string', enum: ['publish', 'unpublish'] }
      },
      required: ['article_id', 'action']
    }
  },

  // Version Control Tools
  'get_version_history': {
    description: 'Get version history for an article',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      },
      required: ['article_id']
    }
  },

  'get_version_content': {
    description: 'Get content of a specific article version',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        version_number: { type: 'number', minimum: 1 }
      },
      required: ['article_id', 'version_number']
    }
  },

  'get_version_stats': {
    description: 'Get statistics for article versions',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' }
      },
      required: ['article_id']
    }
  },

  // Feedback Resolution Tools
  'create_feedback_resolution': {
    description: 'Mark feedback as resolved in a version',
    parameters: {
      type: 'object',
      properties: {
        feedback_id: { type: 'string', format: 'uuid' },
        article_id: { type: 'string', format: 'uuid' },
        from_version: { type: 'number', minimum: 1 },
        to_version: { type: 'number', minimum: 1 },
        resolution_type: {
          type: 'string',
          enum: ['addressed', 'incorporated', 'partially_addressed', 'rejected']
        },
        resolution_notes: { type: 'string', maxLength: 1000 },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['feedback_id', 'article_id', 'from_version', 'to_version']
    }
  },

  'get_feedback_resolutions': {
    description: 'Get feedback resolutions for an article or version',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        version_number: { type: 'number', minimum: 1 },
        feedback_id: { type: 'string', format: 'uuid' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  // User Profile Tools
  'update_profile': {
    description: 'Update user profile',
    parameters: {
      type: 'object',
      properties: {
        display_name: { type: 'string', maxLength: 100 },
        bio: { type: 'string', maxLength: 500 },
        location: { type: 'string', maxLength: 100 },
        website: { type: 'string', format: 'uri' }
      }
    }
  },

  // Search and Discovery
  'search_articles': {
    description: 'Search for articles',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2 },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      },
      required: ['query']
    }
  },

  // Social Features - Follow System
  'follow_user': {
    description: 'Follow another user',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' }
      }
    }
  },

  'unfollow_user': {
    description: 'Unfollow a user',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' }
      }
    }
  },

  'get_followers': {
    description: 'Get list of followers for a user',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'get_following': {
    description: 'Get list of users that a user is following',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'get_follow_suggestions': {
    description: 'Get follow suggestions for a user',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  // Social Features - Messaging
  'create_message': {
    description: 'Create a new message/post',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 2000 },
        message_type: { type: 'string', enum: ['post', 'announcement'] },
        visibility: { type: 'string', enum: ['public', 'followers', 'private'] },
        reply_to_id: { type: 'string', format: 'uuid' },
        article_id: { type: 'string', format: 'uuid' },
        metadata: { type: 'object' }
      },
      required: ['content']
    }
  },

  'get_messages': {
    description: 'Get messages for a user',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        message_type: { type: 'string', enum: ['post', 'announcement', 'system'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'get_feed': {
    description: 'Get personalized feed for the current user',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'get_public_timeline': {
    description: 'Get public timeline of recent messages',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'update_message': {
    description: 'Update a message',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', format: 'uuid' },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
        visibility: { type: 'string', enum: ['public', 'followers', 'private'] },
        is_pinned: { type: 'boolean' }
      },
      required: ['message_id']
    }
  },

  'delete_message': {
    description: 'Delete a message',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', format: 'uuid' }
      },
      required: ['message_id']
    }
  },

  // Social Features - Notifications
  'get_notifications': {
    description: 'Get notifications for the current user',
    parameters: {
      type: 'object',
      properties: {
        unread_only: { type: 'boolean' },
        type: { type: 'string', enum: ['new_follower', 'new_article', 'article_updated', 'new_message', 'message_reply', 'feedback_received', 'feedback_resolved'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'mark_notification_read': {
    description: 'Mark a notification as read',
    parameters: {
      type: 'object',
      properties: {
        notification_id: { type: 'string', format: 'uuid' }
      },
      required: ['notification_id']
    }
  },

  'mark_all_notifications_read': {
    description: 'Mark all notifications as read',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['new_follower', 'new_article', 'article_updated', 'new_message', 'message_reply', 'feedback_received', 'feedback_resolved'] }
      }
    }
  },

  'get_notification_summary': {
    description: 'Get notification summary by type',
    parameters: {
      type: 'object',
      properties: {}
    }
  },

  // Custom Exposition Pages
  'create_exposition': {
    description: 'Create a custom exposition page',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        slug: { type: 'string', maxLength: 100 },
        description: { type: 'string', maxLength: 2000 }
      },
      required: ['title']
    }
  },

  'update_exposition': {
    description: 'Update exposition details',
    parameters: {
      type: 'object',
      properties: {
        exposition_id: { type: 'string', format: 'uuid' },
        title: { type: 'string', minLength: 1, maxLength: 255 },
        description: { type: 'string', maxLength: 2000 },
        slug: { type: 'string', maxLength: 100 }
      },
      required: ['exposition_id']
    }
  },

  'add_exposition_criterion': {
    description: 'Add author or tag criterion to exposition',
    parameters: {
      type: 'object',
      properties: {
        exposition_id: { type: 'string', format: 'uuid' },
        criterion_type: { type: 'string', enum: ['author', 'tag'] },
        criterion_value: { type: 'string', minLength: 1, maxLength: 100 }
      },
      required: ['exposition_id', 'criterion_type', 'criterion_value']
    }
  },

  'remove_exposition_criterion': {
    description: 'Remove criterion from exposition',
    parameters: {
      type: 'object',
      properties: {
        criterion_id: { type: 'string', format: 'uuid' }
      },
      required: ['criterion_id']
    }
  },

  'get_exposition': {
    description: 'Get exposition with criteria and matching articles',
    parameters: {
      type: 'object',
      properties: {
        exposition_id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        slug: { type: 'string' },
        include_articles: { type: 'boolean' },
        article_limit: { type: 'number', minimum: 1, maximum: 100 },
        article_offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'list_expositions': {
    description: 'List expositions (all public ones or user\'s own)',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published', 'archived'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      }
    }
  },

  'publish_exposition': {
    description: 'Publish an exposition to make it public',
    parameters: {
      type: 'object',
      properties: {
        exposition_id: { type: 'string', format: 'uuid' }
      },
      required: ['exposition_id']
    }
  },

  'unpublish_exposition': {
    description: 'Unpublish an exposition (make it draft)',
    parameters: {
      type: 'object',
      properties: {
        exposition_id: { type: 'string', format: 'uuid' }
      },
      required: ['exposition_id']
    }
  },

  'delete_exposition': {
    description: 'Delete an exposition',
    parameters: {
      type: 'object',
      properties: {
        exposition_id: { type: 'string', format: 'uuid' }
      },
      required: ['exposition_id']
    }
  },

  'search_expositions': {
    description: 'Search public expositions by title and description',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      },
      required: ['query']
    }
  },

  // AI-Powered Tools
  'check_feedback_similarity': {
    description: 'Check if feedback content is similar to existing feedback using AI',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        feedback_text: { type: 'string', minLength: 1, maxLength: 2000 },
        similarity_threshold: { type: 'number', minimum: 0, maximum: 1 },
        include_analysis: { type: 'boolean' }
      },
      required: ['article_id', 'feedback_text']
    }
  },

  'submit_feedback': {
    description: 'Submit feedback on an article with AI similarity checking',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
        is_public: { type: 'boolean' },
        skip_similarity_check: { type: 'boolean' }
      },
      required: ['article_id', 'content']
    }
  },

  'get_feedback': {
    description: 'Get feedback for an article',
    parameters: {
      type: 'object',
      properties: {
        article_id: { type: 'string', format: 'uuid' },
        include_private: { type: 'boolean' },
        status: { type: 'string', enum: ['active', 'addressed', 'ignored_by_ai', 'manually_restored'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 }
      },
      required: ['article_id']
    }
  },

  'get_ai_statistics': {
    description: 'Get AI features usage statistics and status',
    parameters: {
      type: 'object',
      properties: {}
    }
  },

  // Performance Monitoring Tools
  'get_system_health': {
    description: 'Get comprehensive system health status and metrics',
    parameters: {
      type: 'object',
      properties: {
        include_details: { type: 'boolean' }
      }
    }
  },

  'get_performance_metrics': {
    description: 'Get detailed performance metrics for the system',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['requests', 'database', 'cache', 'system', 'ai', 'all']
        }
      }
    }
  },

  'get_active_alerts': {
    description: 'Get currently active monitoring alerts',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        unresolved_only: { type: 'boolean' }
      }
    }
  },

  'resolve_alert': {
    description: 'Mark a monitoring alert as resolved',
    parameters: {
      type: 'object',
      properties: {
        alert_id: { type: 'number' }
      },
      required: ['alert_id']
    }
  },

  'clear_cache': {
    description: 'Clear application cache (use with caution)',
    parameters: {
      type: 'object',
      properties: {
        cache_type: {
          type: 'string',
          enum: ['all', 'articles', 'users', 'feeds', 'search', 'openai']
        },
        confirm: { type: 'boolean' }
      },
      required: ['confirm']
    }
  },

  'update_monitoring_config': {
    description: 'Update monitoring thresholds and configuration',
    parameters: {
      type: 'object',
      properties: {
        thresholds: {
          type: 'object',
          properties: {
            responseTime: { type: 'number', minimum: 0 },
            errorRate: { type: 'number', minimum: 0, maximum: 1 },
            memoryUsage: { type: 'number', minimum: 0, maximum: 1 },
            cpuUsage: { type: 'number', minimum: 0, maximum: 1 },
            cacheHitRate: { type: 'number', minimum: 0, maximum: 1 }
          }
        }
      },
      required: ['thresholds']
    }
  }
};

/**
 * Tool handlers
 */
const TOOL_HANDLERS = {
  // Article Management Handlers
  async create_article(user, args) {
    try {
      const article = await Article.create(user.id, args);
      return {
        success: true,
        data: article.toOwnerJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async update_article(user, args) {
    try {
      const { article_id, change_summary, ...updates } = args;

      const article = await Article.findById(article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      if (article.user_id !== user.id) {
        return { success: false, error: 'Unauthorized' };
      }

      const updatedArticle = await article.update(updates, user.id, change_summary);

      return {
        success: true,
        data: updatedArticle.toOwnerJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_article(user, args) {
    try {
      let article;

      if (args.article_id) {
        article = await Article.findById(args.article_id, false);
      } else if (args.username && args.slug) {
        article = await Article.findByUserAndSlug(args.username, args.slug, false);
      } else {
        return { success: false, error: 'Must provide article_id or username/slug' };
      }

      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      // Increment view count
      await article.incrementViews();

      const isOwner = article.user_id === user.id;
      return {
        success: true,
        data: isOwner ? article.toOwnerJSON() : article.toPublicJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async delete_article(user, args) {
    try {
      const article = await Article.findById(args.article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      if (article.user_id !== user.id) {
        return { success: false, error: 'Unauthorized' };
      }

      await article.delete(user.id);

      return {
        success: true,
        message: 'Article deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async publish_article(user, args) {
    try {
      const article = await Article.findById(args.article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      if (article.user_id !== user.id) {
        return { success: false, error: 'Unauthorized' };
      }

      if (args.action === 'publish') {
        await article.publish(user.id);
      } else if (args.action === 'unpublish') {
        await article.unpublish(user.id);
      }

      return {
        success: true,
        data: article.toOwnerJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Version Control Handlers
  async get_version_history(user, args) {
    try {
      const { article_id, limit = 20, offset = 0 } = args;

      const article = await Article.findById(article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      const isOwner = article.user_id === user.id;
      if (!isOwner && article.visibility === 'private') {
        return { success: false, error: 'Unauthorized' };
      }

      const versions = await ArticleVersion.getVersionHistory(article_id, { limit, offset });

      return {
        success: true,
        data: {
          article_id,
          versions: versions.map(v => isOwner ? v.toJSON() : v.toPublicJSON())
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_version_content(user, args) {
    try {
      const { article_id, version_number } = args;

      const article = await Article.findById(article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      const isOwner = article.user_id === user.id;
      if (!isOwner && article.visibility === 'private') {
        return { success: false, error: 'Unauthorized' };
      }

      const version = await ArticleVersion.getVersion(article_id, version_number);
      if (!version) {
        return { success: false, error: 'Version not found' };
      }

      return {
        success: true,
        data: isOwner ? version.toJSON() : version.toPublicJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_version_stats(user, args) {
    try {
      const { article_id } = args;

      const article = await Article.findById(article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      const isOwner = article.user_id === user.id;
      if (!isOwner && article.visibility === 'private') {
        return { success: false, error: 'Unauthorized' };
      }

      const stats = await ArticleVersion.getVersionStats(article_id);

      return {
        success: true,
        data: {
          article_id,
          stats
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Feedback Resolution Handlers
  async create_feedback_resolution(user, args) {
    try {
      const {
        feedback_id,
        article_id,
        from_version,
        to_version,
        resolution_type = 'addressed',
        resolution_notes = null,
        confidence_score = 1.0
      } = args;

      const article = await Article.findById(article_id, true);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      if (article.user_id !== user.id) {
        return { success: false, error: 'Unauthorized' };
      }

      const resolution = await FeedbackResolution.create({
        feedbackId: feedback_id,
        articleId: article_id,
        fromVersion: from_version,
        toVersion: to_version,
        resolutionType: resolution_type,
        resolutionNotes: resolution_notes,
        confidenceScore: confidence_score,
        createdBy: user.id
      });

      return {
        success: true,
        data: resolution.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_feedback_resolutions(user, args) {
    try {
      const { article_id, version_number, feedback_id, limit = 20, offset = 0 } = args;

      let resolutions;

      if (feedback_id) {
        resolutions = await FeedbackResolution.getByFeedbackId(feedback_id);
      } else if (article_id && version_number) {
        resolutions = await FeedbackResolution.getByVersion(article_id, version_number);
      } else if (article_id) {
        resolutions = await FeedbackResolution.getByArticleId(article_id, { limit, offset });
      } else {
        return { success: false, error: 'Must provide article_id, version_number, or feedback_id' };
      }

      return {
        success: true,
        data: {
          resolutions: resolutions.map(r => r.toPublicJSON())
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // User Profile Handler
  async update_profile(user, args) {
    try {
      const userModel = await User.findById(user.id);
      if (!userModel) {
        return { success: false, error: 'User not found' };
      }

      await userModel.updateProfile(args);

      return {
        success: true,
        data: userModel.toProfileJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Search Handler
  async search_articles(user, args) {
    try {
      const { query, limit = 20, offset = 0 } = args;

      const articles = await Article.search(query, { limit, offset });

      return {
        success: true,
        data: {
          query,
          articles: articles.map(a => a.toPublicJSON()),
          pagination: { limit, offset, total: articles.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Social Features - Follow System Handlers
  async follow_user(user, args) {
    try {
      const { user_id, username } = args;

      let targetUserId = user_id;
      if (!targetUserId && username) {
        const targetUser = await User.findByUsername(username);
        if (!targetUser) {
          return { success: false, error: 'User not found' };
        }
        targetUserId = targetUser.id;
      }

      if (!targetUserId) {
        return { success: false, error: 'Must provide user_id or username' };
      }

      const follow = await Follow.create(user.id, targetUserId);

      return {
        success: true,
        data: follow.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async unfollow_user(user, args) {
    try {
      const { user_id, username } = args;

      let targetUserId = user_id;
      if (!targetUserId && username) {
        const targetUser = await User.findByUsername(username);
        if (!targetUser) {
          return { success: false, error: 'User not found' };
        }
        targetUserId = targetUser.id;
      }

      if (!targetUserId) {
        return { success: false, error: 'Must provide user_id or username' };
      }

      await Follow.remove(user.id, targetUserId);

      return {
        success: true,
        message: 'Successfully unfollowed user'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_followers(user, args) {
    try {
      const { user_id, username, limit = 50, offset = 0 } = args;

      let targetUserId = user_id || user.id;
      if (!user_id && username) {
        const targetUser = await User.findByUsername(username);
        if (!targetUser) {
          return { success: false, error: 'User not found' };
        }
        targetUserId = targetUser.id;
      }

      const followers = await Follow.getFollowers(targetUserId, { limit, offset });

      return {
        success: true,
        data: {
          user_id: targetUserId,
          followers,
          pagination: { limit, offset, total: followers.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_following(user, args) {
    try {
      const { user_id, username, limit = 50, offset = 0 } = args;

      let targetUserId = user_id || user.id;
      if (!user_id && username) {
        const targetUser = await User.findByUsername(username);
        if (!targetUser) {
          return { success: false, error: 'User not found' };
        }
        targetUserId = targetUser.id;
      }

      const following = await Follow.getFollowing(targetUserId, { limit, offset });

      return {
        success: true,
        data: {
          user_id: targetUserId,
          following,
          pagination: { limit, offset, total: following.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_follow_suggestions(user, args) {
    try {
      const { limit = 10, offset = 0 } = args;

      const suggestions = await Follow.getFollowSuggestions(user.id, { limit, offset });

      return {
        success: true,
        data: {
          suggestions,
          pagination: { limit, offset, total: suggestions.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Social Features - Messaging Handlers
  async create_message(user, args) {
    try {
      const {
        content,
        message_type = 'post',
        visibility = 'public',
        reply_to_id,
        article_id,
        metadata = {}
      } = args;

      const message = await Message.create({
        userId: user.id,
        content,
        messageType: message_type,
        visibility,
        replyToId: reply_to_id,
        articleId: article_id,
        metadata
      });

      return {
        success: true,
        data: message.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_messages(user, args) {
    try {
      const { user_id, username, message_type, limit = 50, offset = 0 } = args;

      let targetUserId = user_id || user.id;
      if (!user_id && username) {
        const targetUser = await User.findByUsername(username);
        if (!targetUser) {
          return { success: false, error: 'User not found' };
        }
        targetUserId = targetUser.id;
      }

      const isOwner = targetUserId === user.id;
      const messages = await Message.findByUser(targetUserId, {
        includePrivate: isOwner,
        messageType: message_type,
        limit,
        offset
      });

      return {
        success: true,
        data: {
          user_id: targetUserId,
          messages: messages.map(m => isOwner ? m.toJSON() : m.toPublicJSON()),
          pagination: { limit, offset, total: messages.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_feed(user, args) {
    try {
      const { limit = 50, offset = 0 } = args;

      const feedItems = await Message.getUserFeed(user.id, { limit, offset });

      return {
        success: true,
        data: {
          feed_items: feedItems,
          pagination: { limit, offset, total: feedItems.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_public_timeline(user, args) {
    try {
      const { limit = 50, offset = 0 } = args;

      const messages = await Message.getPublicTimeline({ limit, offset });

      return {
        success: true,
        data: {
          messages: messages.map(m => m.toPublicJSON()),
          pagination: { limit, offset, total: messages.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async update_message(user, args) {
    try {
      const { message_id, ...updates } = args;

      const message = await Message.findById(message_id, true);
      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      const updatedMessage = await message.update(updates, user.id);

      return {
        success: true,
        data: updatedMessage.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async delete_message(user, args) {
    try {
      const { message_id } = args;

      const message = await Message.findById(message_id, true);
      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      await message.delete(user.id);

      return {
        success: true,
        message: 'Message deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Social Features - Notification Handlers
  async get_notifications(user, args) {
    try {
      const { unread_only = false, type, limit = 50, offset = 0 } = args;

      const notifications = await Notification.getUserNotifications(user.id, {
        unreadOnly: unread_only,
        type,
        limit,
        offset
      });

      return {
        success: true,
        data: {
          notifications: notifications.map(n => n.toJSON()),
          pagination: { limit, offset, total: notifications.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async mark_notification_read(user, args) {
    try {
      const { notification_id } = args;

      const notification = await Notification.findById(notification_id, user.id);
      if (!notification) {
        return { success: false, error: 'Notification not found' };
      }

      await notification.markAsRead();

      return {
        success: true,
        data: notification.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async mark_all_notifications_read(user, args) {
    try {
      const { type } = args;

      const notifications = await Notification.markAllAsRead(user.id, type);

      return {
        success: true,
        data: {
          marked_count: notifications.length,
          type: type || 'all'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_notification_summary(user, args) {
    try {
      const summary = await Notification.getNotificationSummary(user.id);
      const unreadCount = await Notification.getUnreadCount(user.id);

      return {
        success: true,
        data: {
          summary,
          total_unread: unreadCount
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Exposition Handlers
  async create_exposition(user, args) {
    try {
      const ExpositionService = require('../services/ExpositionService');

      const exposition = await ExpositionService.createExposition(user.id, args);

      return {
        success: true,
        data: exposition.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async update_exposition(user, args) {
    try {
      const Exposition = require('../models/Exposition');
      const { exposition_id, ...updates } = args;

      const exposition = await Exposition.findById(exposition_id, true);
      if (!exposition) {
        return { success: false, error: 'Exposition not found' };
      }

      const updatedExposition = await exposition.update(updates, user.id);

      return {
        success: true,
        data: updatedExposition.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async add_exposition_criterion(user, args) {
    try {
      const ExpositionService = require('../services/ExpositionService');
      const { exposition_id, criterion_type, criterion_value } = args;

      const result = await ExpositionService.addCriterion(
        exposition_id,
        criterion_type,
        criterion_value,
        user.id
      );

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async remove_exposition_criterion(user, args) {
    try {
      const ExpositionService = require('../services/ExpositionService');
      const { criterion_id } = args;

      const result = await ExpositionService.removeCriterion(criterion_id, user.id);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_exposition(user, args) {
    try {
      const ExpositionService = require('../services/ExpositionService');
      const {
        exposition_id,
        username,
        slug,
        include_articles = true,
        article_limit = 50,
        article_offset = 0
      } = args;

      let result;

      if (exposition_id) {
        result = await ExpositionService.getExpositionWithContent(exposition_id, {
          includePrivate: true,
          articleLimit: include_articles ? article_limit : 0,
          articleOffset: article_offset,
          includeCriteria: true,
          includeStats: true
        });
      } else if (username && slug) {
        result = await ExpositionService.getExpositionBySlugWithContent(username, slug, {
          includePrivate: false,
          articleLimit: include_articles ? article_limit : 0,
          articleOffset: article_offset,
          includeCriteria: true,
          includeStats: true
        });
      } else {
        return { success: false, error: 'Must provide exposition_id or username/slug' };
      }

      if (!result) {
        return { success: false, error: 'Exposition not found' };
      }

      const isOwner = result.exposition.author_id === user.id;

      return {
        success: true,
        data: {
          exposition: isOwner ? result.exposition.toJSON() : result.exposition.toPublicJSON(),
          criteria: result.criteria.map(c => c.toPublicJSON()),
          articles: include_articles ? result.articles : [],
          stats: result.stats,
          pagination: include_articles ? { limit: article_limit, offset: article_offset } : null
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async list_expositions(user, args) {
    try {
      const Exposition = require('../models/Exposition');
      const { username, status, limit = 50, offset = 0 } = args;

      let expositions;

      if (username) {
        // Get expositions for a specific user
        const isOwner = user.username === username.toLowerCase();
        expositions = await Exposition.findByAuthor(username, {
          includePrivate: isOwner,
          status,
          limit,
          offset
        });
      } else {
        // Get public expositions
        expositions = await Exposition.getPublicExpositions({ limit, offset });
      }

      return {
        success: true,
        data: {
          expositions: expositions.map(e => e.toPublicJSON()),
          pagination: { limit, offset, total: expositions.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async publish_exposition(user, args) {
    try {
      const Exposition = require('../models/Exposition');
      const { exposition_id } = args;

      const exposition = await Exposition.findById(exposition_id, true);
      if (!exposition) {
        return { success: false, error: 'Exposition not found' };
      }

      await exposition.publish(user.id);

      return {
        success: true,
        data: exposition.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async unpublish_exposition(user, args) {
    try {
      const Exposition = require('../models/Exposition');
      const { exposition_id } = args;

      const exposition = await Exposition.findById(exposition_id, true);
      if (!exposition) {
        return { success: false, error: 'Exposition not found' };
      }

      await exposition.unpublish(user.id);

      return {
        success: true,
        data: exposition.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async delete_exposition(user, args) {
    try {
      const Exposition = require('../models/Exposition');
      const { exposition_id } = args;

      const exposition = await Exposition.findById(exposition_id, true);
      if (!exposition) {
        return { success: false, error: 'Exposition not found' };
      }

      await exposition.delete(user.id);

      return {
        success: true,
        message: 'Exposition deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async search_expositions(user, args) {
    try {
      const ExpositionService = require('../services/ExpositionService');
      const { query, limit = 50, offset = 0 } = args;

      const expositions = await ExpositionService.searchExpositions(query, {
        limit,
        offset,
        includeStats: false
      });

      return {
        success: true,
        data: {
          query,
          expositions: expositions.map(e => e.toPublicJSON()),
          pagination: { limit, offset, total: expositions.length }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // AI-Powered Tool Handlers
  async check_feedback_similarity(user, args) {
    try {
      const FeedbackSimilarityService = require('../services/FeedbackSimilarityService');
      const {
        article_id,
        feedback_text,
        similarity_threshold,
        include_analysis = true
      } = args;

      // Verify article exists and is accessible
      const Article = require('../models/Article');
      const article = await Article.findById(article_id, false);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      const result = await FeedbackSimilarityService.checkSimilarity(
        article_id,
        feedback_text,
        {
          threshold: similarity_threshold,
          generateAnalysis: include_analysis
        }
      );

      return {
        success: true,
        data: {
          article_id,
          has_similar: result.hasSimilar,
          similar_feedback: result.similarFeedback,
          analysis: result.analysis,
          threshold: result.threshold,
          ai_enabled: result.aiEnabled,
          embedding_info: result.embedding || null,
          message: result.message || null
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async submit_feedback(user, args) {
    try {
      const Feedback = require('../models/Feedback');
      const FeedbackSimilarityService = require('../services/FeedbackSimilarityService');
      const {
        article_id,
        content,
        is_public = true,
        skip_similarity_check = false
      } = args;

      // Check for similar feedback first (unless skipped)
      let similarityResult = null;
      if (!skip_similarity_check) {
        try {
          similarityResult = await FeedbackSimilarityService.checkSimilarity(
            article_id,
            content,
            { generateAnalysis: true }
          );

          // If similar feedback found, return warning without creating feedback
          if (similarityResult.hasSimilar && similarityResult.similarFeedback.length > 0) {
            return {
              success: false,
              requires_confirmation: true,
              error: 'Similar feedback detected',
              similarity_data: {
                similar_feedback: similarityResult.similarFeedback,
                analysis: similarityResult.analysis,
                threshold: similarityResult.threshold
              }
            };
          }
        } catch (similarityError) {
          console.error('Error checking similarity, proceeding without check:', similarityError.message);
          // Continue with feedback submission if similarity check fails
        }
      }

      // Create the feedback
      const feedback = await Feedback.create({
        articleId: article_id,
        userId: user.id,
        content,
        isPublic: is_public
      });

      return {
        success: true,
        data: {
          feedback: feedback.toJSON(),
          similarity_check: similarityResult ? {
            checked: true,
            ai_enabled: similarityResult.aiEnabled,
            similar_found: similarityResult.hasSimilar
          } : {
            checked: false,
            skipped: skip_similarity_check
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_feedback(user, args) {
    try {
      const Feedback = require('../models/Feedback');
      const {
        article_id,
        include_private = false,
        status = 'active',
        limit = 50,
        offset = 0
      } = args;

      // Verify article exists
      const Article = require('../models/Article');
      const article = await Article.findById(article_id, false);
      if (!article) {
        return { success: false, error: 'Article not found' };
      }

      // Check if user can see private feedback
      const isOwner = article.user_id === user.id;
      const canSeePrivate = include_private && isOwner;

      const feedback = await Feedback.findByArticle(article_id, {
        includePrivate: canSeePrivate,
        status,
        includeAuthor: true,
        limit,
        offset
      });

      return {
        success: true,
        data: {
          article_id,
          feedback: feedback.map(f => isOwner ? f.toJSON() : f.toPublicJSON()),
          pagination: { limit, offset, total: feedback.length },
          can_see_private: canSeePrivate
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_ai_statistics(user, args) {
    try {
      const FeedbackSimilarityService = require('../services/FeedbackSimilarityService');
      const openAIService = require('../services/OpenAIService');

      const [similarityStats, feedbackStats] = await Promise.all([
        FeedbackSimilarityService.getStatistics(),
        require('../models/Feedback').getStatistics()
      ]);

      return {
        success: true,
        data: {
          similarity_detection: similarityStats,
          feedback_stats: feedbackStats,
          openai_service: {
            enabled: openAIService.isEnabled,
            usage: openAIService.getUsageStats()
          },
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Performance Monitoring Tool Handlers
  async get_system_health(user, args) {
    try {
      const monitoringService = require('../services/MonitoringService');
      const health = await monitoringService.healthCheck();

      if (args.include_details) {
        // Include detailed metrics when requested
        const metrics = monitoringService.getMetrics();
        health.detailed_metrics = {
          uptime: Date.now() - metrics.system.startTime,
          memory_usage: metrics.system.currentMemory,
          cpu_usage: metrics.system.currentCpu,
          request_stats: {
            total: metrics.requests.total,
            success_rate: metrics.requests.total > 0 ?
              ((metrics.requests.success / metrics.requests.total) * 100).toFixed(1) + '%' : '100%',
            avg_response_time: metrics.requests.avgResponseTime || 0
          },
          cache_stats: {
            hit_rate: metrics.cache.hitRate ? (metrics.cache.hitRate * 100).toFixed(1) + '%' : 'N/A',
            total_operations: metrics.cache.hits + metrics.cache.misses,
            errors: metrics.cache.errors
          }
        };
      }

      return {
        success: true,
        data: health
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_performance_metrics(user, args) {
    try {
      const monitoringService = require('../services/MonitoringService');
      const allMetrics = monitoringService.getMetrics();

      let data;
      if (args.category && args.category !== 'all') {
        // Return specific category
        if (allMetrics[args.category]) {
          data = {
            category: args.category,
            metrics: allMetrics[args.category],
            timestamp: new Date().toISOString()
          };
        } else {
          return {
            success: false,
            error: `Invalid category: ${args.category}`
          };
        }
      } else {
        // Return all metrics
        data = {
          ...allMetrics,
          timestamp: new Date().toISOString()
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async get_active_alerts(user, args) {
    try {
      const monitoringService = require('../services/MonitoringService');
      const unresolved = args.unresolved_only !== false; // Default to true
      let alerts = monitoringService.getAlerts(unresolved);

      // Filter by severity if specified
      if (args.severity) {
        // Simple severity classification based on alert type
        const severityMap = {
          'high_memory_usage': 'high',
          'high_cpu_usage': 'high',
          'slow_response': 'medium',
          'high_error_rate': 'high',
          'application_error': 'critical'
        };

        alerts = alerts.filter(alert => {
          const alertSeverity = severityMap[alert.type] || 'low';
          return alertSeverity === args.severity;
        });
      }

      return {
        success: true,
        data: {
          alerts,
          total: alerts.length,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async resolve_alert(user, args) {
    try {
      const monitoringService = require('../services/MonitoringService');
      monitoringService.resolveAlert(args.alert_id);

      return {
        success: true,
        message: `Alert ${args.alert_id} has been resolved`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async clear_cache(user, args) {
    try {
      if (!args.confirm) {
        return {
          success: false,
          error: 'Cache clearing requires explicit confirmation'
        };
      }

      const cacheService = require('../services/CacheService');

      if (args.cache_type === 'all' || !args.cache_type) {
        // Clear all cache
        const success = await cacheService.clearAll();
        return {
          success,
          message: success ? 'All cache cleared successfully' : 'Failed to clear cache',
          timestamp: new Date().toISOString()
        };
      } else {
        // Clear specific cache type
        let pattern;
        switch (args.cache_type) {
          case 'articles':
            pattern = 'article:*';
            break;
          case 'users':
            pattern = 'user:*';
            break;
          case 'feeds':
            pattern = 'feed:*';
            break;
          case 'search':
            pattern = 'search:*';
            break;
          case 'openai':
            pattern = 'ai:*';
            break;
          default:
            return {
              success: false,
              error: `Invalid cache type: ${args.cache_type}`
            };
        }

        const deletedCount = await cacheService.delPattern(pattern);
        return {
          success: true,
          message: `Cleared ${deletedCount} ${args.cache_type} cache entries`,
          deleted_count: deletedCount,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async update_monitoring_config(user, args) {
    try {
      const monitoringService = require('../services/MonitoringService');

      // Validate thresholds
      const validThresholds = {};
      for (const [key, value] of Object.entries(args.thresholds)) {
        if (typeof value === 'number' && value >= 0) {
          validThresholds[key] = value;
        }
      }

      if (Object.keys(validThresholds).length === 0) {
        return {
          success: false,
          error: 'No valid threshold values provided'
        };
      }

      monitoringService.updateThresholds(validThresholds);

      return {
        success: true,
        message: 'Monitoring configuration updated successfully',
        updated_thresholds: validThresholds,
        current_config: {
          thresholds: monitoringService.thresholds,
          is_monitoring: monitoringService.isMonitoring
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Get list of available tools
 */
function getAvailableTools() {
  return Object.keys(TOOLS).map(name => ({
    name,
    description: TOOLS[name].description,
    parameters: TOOLS[name].parameters
  }));
}

/**
 * Execute a tool
 */
async function executeTool(toolName, user, args, requestId) {
  try {
    if (!TOOL_HANDLERS[toolName]) {
      return {
        type: 'tool_response',
        request_id: requestId,
        success: false,
        error: `Unknown tool: ${toolName}`
      };
    }

    // Validate parameters (basic validation - could be enhanced with JSON schema)
    const toolDef = TOOLS[toolName];
    if (toolDef.parameters && toolDef.parameters.required) {
      for (const required of toolDef.parameters.required) {
        if (args[required] === undefined) {
          return {
            type: 'tool_response',
            request_id: requestId,
            success: false,
            error: `Missing required parameter: ${required}`
          };
        }
      }
    }

    const result = await TOOL_HANDLERS[toolName](user, args);

    return {
      type: 'tool_response',
      request_id: requestId,
      ...result
    };
  } catch (error) {
    console.error(`❌ Error executing tool ${toolName}:`, error);
    return {
      type: 'tool_response',
      request_id: requestId,
      success: false,
      error: 'Internal server error'
    };
  }
}

module.exports = {
  TOOLS,
  TOOL_HANDLERS,
  getAvailableTools,
  executeTool
};