/**
 * Exposition Routes for Knowledge Foyer
 *
 * REST endpoints for exposition page rendering and API access
 */

const express = require('express');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const Exposition = require('../models/Exposition');
const ExpositionService = require('../services/ExpositionService');

const router = express.Router();

/**
 * GET /api/expositions
 * List public expositions with pagination
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      limit = 50,
      offset = 0,
      search,
      orderBy = 'updated_at',
      orderDirection = 'DESC'
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    let expositions;

    if (search) {
      // Search expositions
      expositions = await ExpositionService.searchExpositions(search, {
        limit: parsedLimit,
        offset: parsedOffset
      });
    } else {
      // Get all public expositions
      expositions = await Exposition.getPublicExpositions({
        limit: parsedLimit,
        offset: parsedOffset,
        orderBy,
        orderDirection
      });
    }

    res.json({
      success: true,
      data: {
        expositions: expositions.map(e => e.toPublicJSON()),
        pagination: {
          limit: parsedLimit,
          offset: parsedOffset,
          total: expositions.length
        },
        query: search || null
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expositions/popular
 * Get popular expositions (by article count)
 */
router.get('/popular', optionalAuth, async (req, res, next) => {
  try {
    const {
      limit = 20,
      offset = 0,
      minArticles = 1
    } = req.query;

    const expositions = await ExpositionService.getPopularExpositions({
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
      minArticles: parseInt(minArticles) || 1
    });

    res.json({
      success: true,
      data: {
        expositions: expositions.map(e => e.toPublicJSON()),
        pagination: {
          limit: parseInt(limit) || 20,
          offset: parseInt(offset) || 0,
          total: expositions.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expositions/recent
 * Get recently updated expositions
 */
router.get('/recent', optionalAuth, async (req, res, next) => {
  try {
    const {
      limit = 20,
      offset = 0,
      daysBack = 30
    } = req.query;

    const expositions = await ExpositionService.getRecentExpositions({
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
      daysBack: parseInt(daysBack) || 30
    });

    res.json({
      success: true,
      data: {
        expositions: expositions.map(e => e.toPublicJSON()),
        pagination: {
          limit: parseInt(limit) || 20,
          offset: parseInt(offset) || 0,
          total: expositions.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expositions/recommended
 * Get exposition recommendations for authenticated user
 */
router.get('/recommended', requireAuth, async (req, res, next) => {
  try {
    const {
      limit = 10,
      offset = 0
    } = req.query;

    const expositions = await ExpositionService.getRecommendedExpositions(req.user.id, {
      limit: Math.min(parseInt(limit) || 10, 50),
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: {
        expositions: expositions.map(e => ({
          ...e.toPublicJSON(),
          relevance_score: e.relevance_score
        })),
        pagination: {
          limit: parseInt(limit) || 10,
          offset: parseInt(offset) || 0,
          total: expositions.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expositions/:id
 * Get exposition by ID with full content
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate UUID format (simple check to prevent favicon.ico and similar)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid exposition ID format'
      });
    }
    const {
      includeArticles = 'true',
      articleLimit = 50,
      articleOffset = 0
    } = req.query;

    const result = await ExpositionService.getExpositionWithContent(id, {
      includePrivate: false,
      articleLimit: includeArticles === 'true' ? Math.min(parseInt(articleLimit) || 50, 100) : 0,
      articleOffset: parseInt(articleOffset) || 0,
      includeCriteria: true,
      includeStats: true
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Exposition not found'
      });
    }

    const isOwner = req.user && result.exposition.author_id === req.user.id;

    res.json({
      success: true,
      data: {
        exposition: isOwner ? result.exposition.toJSON() : result.exposition.toPublicJSON(),
        criteria: result.criteria.map(c => c.toPublicJSON()),
        articles: includeArticles === 'true' ? result.articles : [],
        stats: result.stats,
        pagination: includeArticles === 'true' ? {
          limit: parseInt(articleLimit) || 50,
          offset: parseInt(articleOffset) || 0
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expositions/:id/related
 * Get related expositions (similar criteria)
 */
router.get('/:id/related', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 5 } = req.query;

    // Verify exposition exists
    const exposition = await Exposition.findById(id, false);
    if (!exposition) {
      return res.status(404).json({
        success: false,
        error: 'Exposition not found'
      });
    }

    const relatedExpositions = await ExpositionService.getRelatedExpositions(id, {
      limit: Math.min(parseInt(limit) || 5, 20),
      excludeOwn: true
    });

    res.json({
      success: true,
      data: {
        exposition_id: id,
        related: relatedExpositions.map(e => ({
          ...e.toPublicJSON(),
          shared_criteria: e.shared_criteria
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/expositions/:id/analytics
 * Get exposition analytics (owner only)
 */
router.get('/:id/analytics', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const analytics = await ExpositionService.getExpositionAnalytics(id, req.user.id);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

/**
 * GET /api/users/:username/expositions
 * Get expositions by user
 */
router.get('/users/:username', optionalAuth, async (req, res, next) => {
  try {
    const { username } = req.params;
    const {
      status,
      limit = 50,
      offset = 0,
      orderBy = 'updated_at',
      orderDirection = 'DESC'
    } = req.query;

    const isOwner = req.user && req.user.username === username.toLowerCase();

    const expositions = await Exposition.findByAuthor(username, {
      includePrivate: isOwner,
      status: isOwner ? status : 'published', // Only published for non-owners
      limit: Math.min(parseInt(limit) || 50, 100),
      offset: parseInt(offset) || 0,
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      data: {
        username,
        expositions: expositions.map(e => isOwner ? e.toJSON() : e.toPublicJSON()),
        pagination: {
          limit: parseInt(limit) || 50,
          offset: parseInt(offset) || 0,
          total: expositions.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:username/expositions/:slug
 * Public exposition page (HTML)
 */
router.get('/:username/expositions/:slug', optionalAuth, async (req, res, next) => {
  try {
    const { username, slug } = req.params;

    const result = await ExpositionService.getExpositionBySlugWithContent(username, slug, {
      includePrivate: false,
      articleLimit: 50,
      articleOffset: 0,
      includeCriteria: true,
      includeStats: true
    });

    if (!result) {
      return res.status(404).render('error', {
        title: 'Exposition Not Found',
        message: 'The exposition you are looking for does not exist.',
        statusCode: 404
      });
    }

    const { exposition, criteria, articles, stats } = result;

    // Group criteria by type for display
    const criteriaByType = {
      author: criteria.filter(c => c.criterion_type === 'author'),
      tag: criteria.filter(c => c.criterion_type === 'tag')
    };

    res.render('exposition', {
      title: `${exposition.title} - ${exposition.author.display_name} - Knowledge Foyer`,
      exposition: exposition.toPublicJSON(),
      criteria: criteriaByType,
      articles,
      stats,
      user: req.user,
      isOwner: req.user && exposition.author_id === req.user.id,
      meta: {
        description: exposition.description || `Curated collection: ${exposition.title}`,
        author: exposition.author.display_name,
        url: `/blog/${username}/expositions/${slug}`,
        image: null // Could add exposition cover images later
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;