/**
 * Cache Middleware for Knowledge Foyer
 *
 * Provides caching utilities and middleware for Express routes
 */

const cacheService = require('../services/CacheService');
const crypto = require('crypto');

/**
 * Generate cache key for request
 */
function generateCacheKey(req, keyPrefix = 'route') {
  const baseUrl = req.baseUrl || '';
  const path = req.path;
  const query = Object.keys(req.query).length > 0 ?
    '?' + Object.keys(req.query).sort().map(key => `${key}=${req.query[key]}`).join('&') : '';
  const userId = req.user ? req.user.id : 'anonymous';

  return `${keyPrefix}:${userId}:${crypto.createHash('md5').update(baseUrl + path + query).digest('hex')}`;
}

/**
 * Cache middleware for GET routes
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300,
    keyPrefix = 'route',
    varyBy = [],
    skipCache = () => false
  } = options;

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching if function returns true
    if (skipCache(req)) {
      return next();
    }

    try {
      let cacheKey = generateCacheKey(req, keyPrefix);

      // Add variation parameters to key
      if (varyBy.length > 0) {
        const variations = varyBy.map(field => {
          if (field.startsWith('header.')) {
            return req.get(field.substring(7)) || '';
          } else if (field.startsWith('user.')) {
            return req.user ? req.user[field.substring(5)] : '';
          } else {
            return req[field] || '';
          }
        }).join(':');

        if (variations) {
          cacheKey += ':' + crypto.createHash('md5').update(variations).digest('hex').substring(0, 8);
        }
      }

      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        // Add cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
          'X-Cached-At': cachedData.cached_at
        });

        return res.json(cachedData.data);
      }

      // Store original res.json function
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function(data) {
        // Cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheData = {
            data,
            cached_at: new Date().toISOString(),
            status_code: res.statusCode
          };

          // Cache asynchronously to avoid blocking response
          setImmediate(async () => {
            try {
              await cacheService.set(cacheKey, cacheData, ttl);
            } catch (error) {
              console.error(`Cache set error for key ${cacheKey}:`, error.message);
            }
          });
        }

        // Add cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey
        });

        // Call original json function
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next(); // Continue without caching on error
    }
  };
}

/**
 * Middleware to invalidate cache on data modifications
 */
function cacheInvalidationMiddleware(patterns = []) {
  return async (req, res, next) => {
    // Store original res.json function
    const originalJson = res.json;

    // Override res.json to invalidate cache after successful operations
    res.json = function(data) {
      // Invalidate cache for successful write operations
      if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') &&
          res.statusCode >= 200 && res.statusCode < 300 && data && data.success) {

        // Invalidate asynchronously to avoid blocking response
        setImmediate(async () => {
          try {
            for (const pattern of patterns) {
              let resolvedPattern = pattern;

              // Replace placeholders with actual values
              if (pattern.includes('{user_id}') && req.user) {
                resolvedPattern = resolvedPattern.replace('{user_id}', req.user.id);
              }

              if (pattern.includes('{article_id}') && req.params.id) {
                resolvedPattern = resolvedPattern.replace('{article_id}', req.params.id);
              }

              if (pattern.includes('{article_id}') && data.data && data.data.id) {
                resolvedPattern = resolvedPattern.replace('{article_id}', data.data.id);
              }

              await cacheService.delPattern(resolvedPattern);
            }
          } catch (error) {
            console.error('Cache invalidation error:', error.message);
          }
        });
      }

      // Call original json function
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Cache warmer utility functions
 */
const cacheWarmer = {
  /**
   * Warm popular articles cache
   */
  async warmPopularArticles() {
    try {
      console.log('🔥 Warming popular articles cache...');

      const { query } = require('../config/database');
      const Article = require('../models/Article');

      // Get top 20 most viewed articles
      const result = await query(`
        SELECT id FROM articles
        WHERE status = 'published' AND visibility = 'public'
        ORDER BY view_count DESC
        LIMIT 20
      `);

      let warmed = 0;
      for (const row of result.rows) {
        try {
          const article = await Article.findById(row.id, false);
          if (article) {
            await cacheService.cacheArticle(article, 600); // 10 minutes
            warmed++;
          }
        } catch (error) {
          console.error(`Error warming article ${row.id}:`, error.message);
        }
      }

      console.log(`🔥 Warmed ${warmed} popular articles in cache`);
      return warmed;
    } catch (error) {
      console.error('Error warming popular articles cache:', error.message);
      return 0;
    }
  },

  /**
   * Warm user profiles cache for active users
   */
  async warmActiveUsers() {
    try {
      console.log('🔥 Warming active users cache...');

      const { query } = require('../config/database');
      const User = require('../models/User');

      // Get recently active users (posted content in last 7 days)
      const result = await query(`
        SELECT DISTINCT u.id FROM users u
        JOIN articles a ON u.id = a.user_id
        WHERE a.created_at > NOW() - INTERVAL '7 days'
          AND u.is_active = true
        LIMIT 50
      `);

      let warmed = 0;
      for (const row of result.rows) {
        try {
          const user = await User.findById(row.id);
          if (user) {
            await cacheService.cacheUser(user, 900); // 15 minutes
            await cacheService.cacheUserByUsername(user, 900);
            warmed++;
          }
        } catch (error) {
          console.error(`Error warming user ${row.id}:`, error.message);
        }
      }

      console.log(`🔥 Warmed ${warmed} active users in cache`);
      return warmed;
    } catch (error) {
      console.error('Error warming active users cache:', error.message);
      return 0;
    }
  },

  /**
   * Warm platform statistics
   */
  async warmStatistics() {
    try {
      console.log('🔥 Warming statistics cache...');

      const { query } = require('../config/database');

      // Cache platform stats
      const userCount = await query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
      const articleCount = await query(`SELECT COUNT(*) as count FROM articles WHERE status = 'published' AND visibility = 'public'`);
      const expositionCount = await query(`SELECT COUNT(*) as count FROM expositions WHERE status = 'published'`);

      const stats = {
        users: parseInt(userCount.rows[0].count),
        articles: parseInt(articleCount.rows[0].count),
        expositions: parseInt(expositionCount.rows[0].count),
        generated_at: new Date().toISOString()
      };

      await cacheService.cacheStats('platform', stats, 1800); // 30 minutes

      console.log('🔥 Warmed platform statistics in cache');
      return 1;
    } catch (error) {
      console.error('Error warming statistics cache:', error.message);
      return 0;
    }
  },

  /**
   * Run all cache warming operations
   */
  async warmAll() {
    console.log('🔥 Starting cache warming process...');

    const results = await Promise.allSettled([
      this.warmPopularArticles(),
      this.warmActiveUsers(),
      this.warmStatistics()
    ]);

    let totalWarmed = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        totalWarmed += result.value;
      } else {
        console.error(`Cache warming operation ${index} failed:`, result.reason);
      }
    });

    console.log(`🔥 Cache warming complete: ${totalWarmed} items cached`);
    return totalWarmed;
  }
};

/**
 * Model-specific cache helpers
 */
const modelCache = {
  /**
   * Get or cache article
   */
  async getOrCacheArticle(articleId, includePrivate = false, loader = null) {
    const cacheKey = `article:${articleId}${includePrivate ? ':private' : ''}`;

    let article = await cacheService.get(cacheKey);
    if (article) {
      return article;
    }

    if (loader) {
      article = await loader();
    } else {
      const Article = require('../models/Article');
      article = await Article.findById(articleId, includePrivate);
    }

    if (article) {
      const ttl = includePrivate ? 180 : 300; // Shorter TTL for private content
      await cacheService.set(cacheKey, article.toJSON(), ttl);
    }

    return article;
  },

  /**
   * Get or cache user
   */
  async getOrCacheUser(userId, loader = null) {
    let user = await cacheService.getUser(userId);
    if (user) {
      return user;
    }

    if (loader) {
      user = await loader();
    } else {
      const User = require('../models/User');
      user = await User.findById(userId);
    }

    if (user) {
      await cacheService.cacheUser(user);
    }

    return user;
  },

  /**
   * Get or cache user by username
   */
  async getOrCacheUserByUsername(username, loader = null) {
    let user = await cacheService.getUserByUsername(username);
    if (user) {
      return user;
    }

    if (loader) {
      user = await loader();
    } else {
      const User = require('../models/User');
      user = await User.findByUsername(username);
    }

    if (user) {
      await cacheService.cacheUserByUsername(user);
    }

    return user;
  }
};

module.exports = {
  cacheMiddleware,
  cacheInvalidationMiddleware,
  generateCacheKey,
  cacheWarmer,
  modelCache,
  cacheService
};