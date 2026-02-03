/**
 * API Routes for Knowledge Foyer
 *
 * Central router for all API endpoints
 */

const express = require('express');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api
 * API information and status
 */
router.get('/', (req, res) => {
  res.json({
    name: 'Knowledge Foyer API',
    version: '0.1.0',
    description: 'Professional publishing platform for evolving work and structured feedback',
    status: 'development',
    endpoints: {
      auth: '/api/auth',
      articles: '/api/articles',
      health: '/health',
      metrics: '/metrics'
    },
    documentation: 'https://docs.knowledgefoyer.com/api',
    support: 'https://github.com/knowledgefoyer/issues'
  });
});

/**
 * GET /api/stats
 * Public platform statistics
 */
router.get('/stats', optionalAuth, async (req, res, next) => {
  try {
    const { query } = require('../config/database');

    // Get basic statistics
    const userCount = await query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
    const articleCount = await query(`SELECT COUNT(*) as count FROM articles WHERE status = 'published' AND visibility = 'public'`);
    const feedbackCount = await query('SELECT COUNT(*) as count FROM feedback WHERE is_public = true');

    // Get recent activity (last 30 days)
    const recentUsers = await query(`
      SELECT COUNT(*) as count FROM users
      WHERE created_at > NOW() - INTERVAL '30 days' AND is_active = true
    `);
    const recentArticles = await query(`
      SELECT COUNT(*) as count FROM articles
      WHERE published_at > NOW() - INTERVAL '30 days'
      AND status = 'published' AND visibility = 'public'
    `);

    res.json({
      platform: {
        total_users: parseInt(userCount.rows[0].count),
        total_articles: parseInt(articleCount.rows[0].count),
        total_feedback: parseInt(feedbackCount.rows[0].count)
      },
      recent_activity: {
        new_users_30d: parseInt(recentUsers.rows[0].count),
        new_articles_30d: parseInt(recentArticles.rows[0].count)
      },
      features: {
        mcp_enabled: true,
        ai_feedback_analysis: false, // Will be enabled in later phases
        real_time_collaboration: true,
        version_control: true
      },
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/search
 * Global search across articles
 */
router.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const { q: searchQuery, limit = 20, offset = 0 } = req.query;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.json({
        results: [],
        pagination: { limit: parseInt(limit), offset: parseInt(offset), total: 0 },
        message: 'Search query must be at least 2 characters'
      });
    }

    const Article = require('../models/Article');

    const articles = await Article.search(searchQuery, {
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset)
    });

    res.json({
      results: articles.map(article => ({
        type: 'article',
        id: article.id,
        title: article.title,
        summary: article.summary,
        author: article.author,
        published_at: article.published_at,
        relevance: article.relevance
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: articles.length // In a real app, this would be the total count
      },
      query: searchQuery.trim()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/discover
 * Content discovery recommendations
 */
router.get('/discover', optionalAuth, async (req, res, next) => {
  try {
    const { category = 'recent', limit = 20 } = req.query;

    const { query } = require('../config/database');

    let articles = [];

    switch (category) {
      case 'recent':
        // Most recently published articles
        const recentResult = await query(`
          SELECT a.*, u.username, u.display_name
          FROM articles a
          LEFT JOIN users u ON a.user_id = u.id
          WHERE a.status = 'published' AND a.visibility = 'public'
          ORDER BY a.published_at DESC
          LIMIT $1
        `, [Math.min(parseInt(limit), 50)]);

        articles = recentResult.rows;
        break;

      case 'popular':
        // Most viewed articles in last 7 days
        const popularResult = await query(`
          SELECT a.*, u.username, u.display_name
          FROM articles a
          LEFT JOIN users u ON a.user_id = u.id
          WHERE a.status = 'published' AND a.visibility = 'public'
          AND a.published_at > NOW() - INTERVAL '7 days'
          ORDER BY a.view_count DESC, a.published_at DESC
          LIMIT $1
        `, [Math.min(parseInt(limit), 50)]);

        articles = popularResult.rows;
        break;

      case 'discussed':
        // Articles with most feedback
        const discussedResult = await query(`
          SELECT a.*, u.username, u.display_name
          FROM articles a
          LEFT JOIN users u ON a.user_id = u.id
          WHERE a.status = 'published' AND a.visibility = 'public'
          ORDER BY a.feedback_count DESC, a.published_at DESC
          LIMIT $1
        `, [Math.min(parseInt(limit), 50)]);

        articles = discussedResult.rows;
        break;

      default:
        throw createValidationError('Invalid category. Use: recent, popular, or discussed');
    }

    const Article = require('../models/Article');
    const formattedArticles = articles.map(row => {
      const article = new Article(row);
      article.author = {
        username: row.username,
        display_name: row.display_name
      };
      return article.toPublicJSON();
    });

    res.json({
      category,
      articles: formattedArticles,
      count: formattedArticles.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;