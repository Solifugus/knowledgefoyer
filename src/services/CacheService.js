/**
 * Cache Service for Knowledge Foyer
 *
 * Comprehensive caching layer using Redis for performance optimization
 */

const Redis = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      defaultTTL: parseInt(process.env.REDIS_TTL_DEFAULT) || 300, // 5 minutes
      maxRetries: 3,
      retryDelay: 1000,
      connectTimeout: 10000
    };

    this.keyPrefixes = {
      article: 'article:',
      user: 'user:',
      exposition: 'expo:',
      feed: 'feed:',
      feedback: 'feedback:',
      stats: 'stats:',
      session: 'session:',
      openai: 'ai:',
      search: 'search:'
    };

    this.ttls = {
      article: 300,      // 5 minutes
      user: 600,         // 10 minutes
      exposition: 180,   // 3 minutes
      feed: 60,          // 1 minute
      feedback: 300,     // 5 minutes
      stats: 120,        // 2 minutes
      session: 3600,     // 1 hour
      openai: 86400,     // 24 hours
      search: 300        // 5 minutes
    };

    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    if (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL) {
      console.log('🗄️  Cache service disabled (no Redis URL configured)');
      return;
    }

    try {
      this.client = Redis.createClient({
        url: this.config.url,
        socket: {
          connectTimeout: this.config.connectTimeout,
          lazyConnect: true
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('🗄️  Redis connection refused');
            return new Error('Redis server connection refused');
          }

          if (options.total_retry_time > 1000 * 60 * 10) { // 10 minutes
            console.error('🗄️  Redis retry time exhausted');
            return new Error('Redis retry time exhausted');
          }

          if (options.attempt > this.config.maxRetries) {
            console.error('🗄️  Redis max retries reached');
            return undefined;
          }

          return Math.min(options.attempt * this.config.retryDelay, 3000);
        }
      });

      this.client.on('error', (err) => {
        console.error('🗄️  Redis client error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🗄️  Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('🗄️  Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('🗄️  Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      console.log('🗄️  Cache service initialized successfully');
    } catch (error) {
      console.error('🗄️  Failed to initialize cache service:', error.message);
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Generate cache key with prefix
   */
  buildKey(prefix, identifier, suffix = null) {
    const baseKey = `${this.keyPrefixes[prefix] || ''}${identifier}`;
    return suffix ? `${baseKey}:${suffix}` : baseKey;
  }

  /**
   * Get data from cache
   */
  async get(key, defaultValue = null) {
    if (!this.isConnected || !this.client) {
      return defaultValue;
    }

    try {
      const data = await this.client.get(key);
      if (data === null) {
        return defaultValue;
      }

      return JSON.parse(data);
    } catch (error) {
      console.error(`🗄️  Cache get error for key ${key}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Set data in cache
   */
  async set(key, value, ttl = null) {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      const expiration = ttl || this.config.defaultTTL;

      await this.client.setEx(key, expiration, serializedValue);
      return true;
    } catch (error) {
      console.error(`🗄️  Cache set error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`🗄️  Cache delete error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delPattern(pattern) {
    if (!this.isConnected || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      console.error(`🗄️  Cache pattern delete error for pattern ${pattern}:`, error.message);
      return 0;
    }
  }

  /**
   * Cache article data
   */
  async cacheArticle(article, ttl = null) {
    const key = this.buildKey('article', article.id);
    const expiration = ttl || this.ttls.article;

    return await this.set(key, {
      ...article.toJSON(),
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached article
   */
  async getArticle(articleId) {
    const key = this.buildKey('article', articleId);
    return await this.get(key);
  }

  /**
   * Invalidate article cache
   */
  async invalidateArticle(articleId) {
    const patterns = [
      this.buildKey('article', articleId),
      this.buildKey('article', articleId, '*'),
      this.buildKey('feed', '*'), // Invalidate feeds as they may include this article
      this.buildKey('stats', '*') // Invalidate stats as article counts may change
    ];

    let deletedCount = 0;
    for (const pattern of patterns) {
      deletedCount += await this.delPattern(pattern);
    }

    return deletedCount;
  }

  /**
   * Cache user profile data
   */
  async cacheUser(user, ttl = null) {
    const key = this.buildKey('user', user.id);
    const expiration = ttl || this.ttls.user;

    return await this.set(key, {
      ...user.toProfileJSON(),
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached user
   */
  async getUser(userId) {
    const key = this.buildKey('user', userId);
    return await this.get(key);
  }

  /**
   * Cache user by username
   */
  async cacheUserByUsername(user, ttl = null) {
    const key = this.buildKey('user', `username:${user.username}`);
    const expiration = ttl || this.ttls.user;

    return await this.set(key, {
      ...user.toProfileJSON(),
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached user by username
   */
  async getUserByUsername(username) {
    const key = this.buildKey('user', `username:${username}`);
    return await this.get(key);
  }

  /**
   * Cache exposition data
   */
  async cacheExposition(exposition, articles = null, criteria = null, ttl = null) {
    const key = this.buildKey('exposition', exposition.id);
    const expiration = ttl || this.ttls.exposition;

    const cacheData = {
      exposition: exposition.toPublicJSON(),
      cached_at: new Date().toISOString()
    };

    if (articles) {
      cacheData.articles = articles;
    }

    if (criteria) {
      cacheData.criteria = criteria;
    }

    return await this.set(key, cacheData, expiration);
  }

  /**
   * Get cached exposition
   */
  async getExposition(expositionId) {
    const key = this.buildKey('exposition', expositionId);
    return await this.get(key);
  }

  /**
   * Cache feed data
   */
  async cacheFeed(userId, feedType, feedData, ttl = null) {
    const key = this.buildKey('feed', `${userId}:${feedType}`);
    const expiration = ttl || this.ttls.feed;

    return await this.set(key, {
      feed: feedData,
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached feed
   */
  async getFeed(userId, feedType) {
    const key = this.buildKey('feed', `${userId}:${feedType}`);
    return await this.get(key);
  }

  /**
   * Invalidate user feeds
   */
  async invalidateUserFeeds(userId) {
    const pattern = this.buildKey('feed', `${userId}:*`);
    return await this.delPattern(pattern);
  }

  /**
   * Invalidate all feeds (when major content changes)
   */
  async invalidateAllFeeds() {
    const pattern = this.buildKey('feed', '*');
    return await this.delPattern(pattern);
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(query, type, results, ttl = null) {
    const queryHash = require('crypto').createHash('sha256').update(query).digest('hex').substring(0, 16);
    const key = this.buildKey('search', `${type}:${queryHash}`);
    const expiration = ttl || this.ttls.search;

    return await this.set(key, {
      query,
      type,
      results,
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached search results
   */
  async getSearchResults(query, type) {
    const queryHash = require('crypto').createHash('sha256').update(query).digest('hex').substring(0, 16);
    const key = this.buildKey('search', `${type}:${queryHash}`);
    return await this.get(key);
  }

  /**
   * Cache OpenAI API responses (for cost optimization)
   */
  async cacheOpenAIResponse(inputHash, response, ttl = null) {
    const key = this.buildKey('openai', inputHash);
    const expiration = ttl || this.ttls.openai;

    return await this.set(key, {
      response,
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached OpenAI response
   */
  async getOpenAIResponse(inputHash) {
    const key = this.buildKey('openai', inputHash);
    const cached = await this.get(key);
    return cached ? cached.response : null;
  }

  /**
   * Cache statistics
   */
  async cacheStats(statsType, data, ttl = null) {
    const key = this.buildKey('stats', statsType);
    const expiration = ttl || this.ttls.stats;

    return await this.set(key, {
      stats: data,
      cached_at: new Date().toISOString()
    }, expiration);
  }

  /**
   * Get cached statistics
   */
  async getStats(statsType) {
    const key = this.buildKey('stats', statsType);
    const cached = await this.get(key);
    return cached ? cached.stats : null;
  }

  /**
   * Get cache performance metrics
   */
  async getMetrics() {
    if (!this.isConnected || !this.client) {
      return {
        connected: false,
        error: 'Redis not connected'
      };
    }

    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');

      // Parse basic stats
      const stats = {};
      info.split('\r\n').forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key && value) {
            stats[key] = value;
          }
        }
      });

      return {
        connected: this.isConnected,
        keyspace_hits: parseInt(stats.keyspace_hits) || 0,
        keyspace_misses: parseInt(stats.keyspace_misses) || 0,
        connected_clients: parseInt(stats.connected_clients) || 0,
        used_memory_human: stats.used_memory_human || 'unknown',
        hit_rate: stats.keyspace_hits && stats.keyspace_misses ?
          (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2) + '%' : 'N/A',
        config: this.config
      };
    } catch (error) {
      console.error('🗄️  Error getting cache metrics:', error.message);
      return {
        connected: this.isConnected,
        error: error.message
      };
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll() {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.flushDb();
      console.log('🗄️  Cache cleared completely');
      return true;
    } catch (error) {
      console.error('🗄️  Error clearing cache:', error.message);
      return false;
    }
  }

  /**
   * Gracefully close Redis connection
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('🗄️  Cache service disconnected gracefully');
      } catch (error) {
        console.error('🗄️  Error disconnecting cache service:', error.message);
      }
    }
  }

  /**
   * Check if cache is healthy
   */
  async healthCheck() {
    if (!this.client) {
      return { healthy: false, message: 'Cache service not initialized' };
    }

    try {
      const testKey = 'health_check';
      const testValue = Date.now();

      await this.client.set(testKey, testValue, { EX: 1 });
      const retrieved = await this.client.get(testKey);

      if (retrieved === testValue.toString()) {
        return { healthy: true, message: 'Cache service operational' };
      } else {
        return { healthy: false, message: 'Cache service not responding correctly' };
      }
    } catch (error) {
      return { healthy: false, message: `Cache service error: ${error.message}` };
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;