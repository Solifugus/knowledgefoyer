/**
 * Articles Routes for Knowledge Foyer
 *
 * Handles article CRUD operations, publishing, and discovery
 */

const express = require('express');
const { authMiddleware, optionalAuth, requireResourceOwner } = require('../middleware/auth');
const { requireUserSubdomain } = require('../middleware/subdomain');
const { createValidationError, createNotFoundError, createAuthzError } = require('../middleware/errorHandlers');
const Article = require('../models/Article');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/articles
 * Get articles (with optional filtering and pagination)
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      username,
      status = 'published',
      visibility = 'public',
      limit = 50,
      offset = 0,
      orderBy = 'published_at',
      orderDirection = 'DESC',
      search
    } = req.query;

    let articles;

    if (search) {
      // Search articles
      articles = await Article.search(search, {
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        orderBy
      });
    } else if (username) {
      // Get articles by specific user
      const includePrivate = req.user && req.user.username === username.toLowerCase();

      articles = await Article.findByUser(username, {
        includePrivate,
        status,
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        orderBy,
        orderDirection
      });
    } else {
      // General article listing would go here
      // For now, return empty array as this requires more complex queries
      articles = [];
    }

    res.json({
      articles: articles.map(article => article.toPublicJSON()),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: articles.length // This would be the total count in a real implementation
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/articles/:id
 * Get article by ID
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user can view private articles
    const includePrivate = !!req.user;

    const article = await Article.findById(id, includePrivate);

    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check if user can view private article
    if (article.visibility === 'private' && (!req.user || req.user.id !== article.user_id)) {
      throw createAuthzError('You do not have permission to view this article');
    }

    // Increment view count (but not for the author)
    if (!req.user || req.user.id !== article.user_id) {
      await article.incrementViews();
    }

    res.json({
      article: article.toPublicJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/articles
 * Create a new article
 */
router.post('/', authMiddleware, requireUserSubdomain, requireResourceOwner, async (req, res, next) => {
  try {
    const { title, content, summary, visibility = 'public', tags = [] } = req.body;

    if (!title || !content) {
      throw createValidationError('Title and content are required');
    }

    const article = await Article.create(req.user.id, {
      title,
      content,
      summary,
      visibility
    });

    // TODO: Handle tags in a future update

    res.status(201).json({
      message: 'Article created successfully',
      article: article.toOwnerJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/articles/:id
 * Update an existing article
 */
router.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, summary, visibility } = req.body;

    const article = await Article.findById(id, true);

    if (!article) {
      throw createNotFoundError('Article');
    }

    if (article.user_id !== req.user.id) {
      throw createAuthzError('You do not have permission to update this article');
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (summary !== undefined) updates.summary = summary;
    if (visibility !== undefined) updates.visibility = visibility;

    if (Object.keys(updates).length === 0) {
      throw createValidationError('No valid fields provided for update');
    }

    await article.update(updates, req.user.id);

    res.json({
      message: 'Article updated successfully',
      article: article.toOwnerJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/articles/:id
 * Delete an article
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id, true);

    if (!article) {
      throw createNotFoundError('Article');
    }

    if (article.user_id !== req.user.id) {
      throw createAuthzError('You do not have permission to delete this article');
    }

    await article.delete(req.user.id);

    res.json({
      message: 'Article deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/articles/:id/publish
 * Publish an article
 */
router.post('/:id/publish', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id, true);

    if (!article) {
      throw createNotFoundError('Article');
    }

    if (article.user_id !== req.user.id) {
      throw createAuthzError('You do not have permission to publish this article');
    }

    await article.publish(req.user.id);

    res.json({
      message: 'Article published successfully',
      article: article.toOwnerJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/articles/:id/unpublish
 * Unpublish an article
 */
router.post('/:id/unpublish', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id, true);

    if (!article) {
      throw createNotFoundError('Article');
    }

    if (article.user_id !== req.user.id) {
      throw createAuthzError('You do not have permission to unpublish this article');
    }

    await article.unpublish(req.user.id);

    res.json({
      message: 'Article unpublished successfully',
      article: article.toOwnerJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/articles/:id/similar
 * Find similar articles (duplicate detection)
 */
router.get('/:id/similar', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id, !!req.user);

    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check if user can view the article
    if (article.visibility === 'private' && (!req.user || req.user.id !== article.user_id)) {
      throw createAuthzError('You do not have permission to view this article');
    }

    const similarArticles = await Article.findSimilarContent(article.content_hash, id);

    res.json({
      similar_articles: similarArticles.map(a => a.toPublicJSON()),
      count: similarArticles.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:username/:slug
 * Get article by username and slug (subdomain routing)
 */
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const username = req.subdomain;

    if (!username) {
      throw createValidationError('This endpoint requires a user subdomain');
    }

    const includePrivate = req.user && req.user.username === username.toLowerCase();

    const article = await Article.findByUserAndSlug(username, slug, includePrivate);

    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check if user can view private article
    if (article.visibility === 'private' && (!req.user || req.user.id !== article.user_id)) {
      throw createAuthzError('You do not have permission to view this article');
    }

    // Increment view count (but not for the author)
    if (!req.user || req.user.id !== article.user_id) {
      await article.incrementViews();
    }

    res.json({
      article: article.toPublicJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:slug/versions
 * Get version history for an article
 */
router.get('/:slug/versions', optionalAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const username = req.subdomain;

    if (!username) {
      throw createValidationError('This endpoint requires a user subdomain');
    }

    const includePrivate = req.user && req.user.username === username.toLowerCase();
    const article = await Article.findByUserAndSlug(username, slug, includePrivate);

    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check permissions
    if (article.visibility === 'private' && (!req.user || req.user.id !== article.user_id)) {
      throw createAuthzError('You do not have permission to view this article');
    }

    const versions = await article.getVersionHistory({ limit: parseInt(limit), offset: parseInt(offset) });
    const stats = await article.getVersionStats();

    const isOwner = req.user && req.user.id === article.user_id;

    res.json({
      article_id: article.id,
      article_title: article.title,
      versions: versions.map(v => isOwner ? v.toJSON() : v.toPublicJSON()),
      stats,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: versions.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:slug/versions/:version_number
 * Get specific version content
 */
router.get('/:slug/versions/:version_number', optionalAuth, async (req, res, next) => {
  try {
    const { slug, version_number } = req.params;
    const username = req.subdomain;

    if (!username) {
      throw createValidationError('This endpoint requires a user subdomain');
    }

    const includePrivate = req.user && req.user.username === username.toLowerCase();
    const article = await Article.findByUserAndSlug(username, slug, includePrivate);

    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check permissions
    if (article.visibility === 'private' && (!req.user || req.user.id !== article.user_id)) {
      throw createAuthzError('You do not have permission to view this article');
    }

    const version = await article.getVersion(parseInt(version_number));
    if (!version) {
      throw createNotFoundError('Version');
    }

    const isOwner = req.user && req.user.id === article.user_id;

    res.json({
      version: isOwner ? version.toJSON() : version.toPublicJSON()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/articles/:id/versions
 * Get version history by article ID (for authenticated requests)
 */
router.get('/api/articles/:id/versions', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const article = await Article.findById(id, true);
    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check ownership
    if (article.user_id !== req.user.id) {
      throw createAuthzError('You do not have permission to view this article');
    }

    const versions = await article.getVersionHistory({ limit: parseInt(limit), offset: parseInt(offset) });
    const stats = await article.getVersionStats();

    res.json({
      article_id: article.id,
      article_title: article.title,
      versions: versions.map(v => v.toJSON()),
      stats,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: versions.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/articles/:id/changes
 * Get change history for an article
 */
router.get('/api/articles/:id/changes', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const article = await Article.findById(id, true);
    if (!article) {
      throw createNotFoundError('Article');
    }

    // Check ownership
    if (article.user_id !== req.user.id) {
      throw createAuthzError('You do not have permission to view this article');
    }

    const ArticleVersion = require('../models/ArticleVersion');
    const changes = await ArticleVersion.getArticleChanges(id, { limit: parseInt(limit), offset: parseInt(offset) });
    const changeStats = await ArticleVersion.getChangeStatistics(id);

    res.json({
      article_id: id,
      changes,
      stats: changeStats,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: changes.length
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;