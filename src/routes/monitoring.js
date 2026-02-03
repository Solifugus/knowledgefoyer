/**
 * Monitoring Routes for Knowledge Foyer
 *
 * API endpoints for system monitoring, health checks, and performance metrics
 */

const express = require('express');
const router = express.Router();
const monitoringService = require('../services/MonitoringService');
const cacheService = require('../services/CacheService');
const { query } = require('../config/database');

/**
 * GET /api/monitoring/health - Comprehensive health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await monitoringService.healthCheck();

    // Set appropriate HTTP status
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/metrics - System performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = monitoringService.getMetrics();

    // Add cache metrics from cache service
    try {
      const cacheMetrics = await cacheService.getMetrics();
      if (cacheMetrics && cacheMetrics.connected) {
        metrics.cache.redis = {
          keyspace_hits: cacheMetrics.keyspace_hits,
          keyspace_misses: cacheMetrics.keyspace_misses,
          hit_rate: cacheMetrics.hit_rate,
          used_memory: cacheMetrics.used_memory_human,
          connected_clients: cacheMetrics.connected_clients
        };
      }
    } catch (cacheError) {
      metrics.cache.redis = { error: cacheError.message };
    }

    res.json(metrics);
  } catch (error) {
    console.error('Metrics retrieval error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/monitoring/alerts - Active alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const unresolved = req.query.unresolved === 'true';
    const alerts = monitoringService.getAlerts(unresolved);

    res.json({
      alerts,
      total: alerts.length,
      unresolved: alerts.filter(a => !a.resolved).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Alerts retrieval error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve alerts',
      message: error.message
    });
  }
});

/**
 * POST /api/monitoring/alerts/:id/resolve - Resolve an alert
 */
router.post('/alerts/:id/resolve', (req, res) => {
  try {
    const alertId = parseInt(req.params.id);

    if (isNaN(alertId)) {
      return res.status(400).json({
        error: 'Invalid alert ID'
      });
    }

    monitoringService.resolveAlert(alertId);

    res.json({
      success: true,
      message: 'Alert resolved successfully',
      alertId
    });
  } catch (error) {
    console.error('Alert resolution error:', error.message);
    res.status(500).json({
      error: 'Failed to resolve alert',
      message: error.message
    });
  }
});

/**
 * GET /api/monitoring/config - Monitoring configuration
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      thresholds: monitoringService.thresholds,
      isMonitoring: monitoringService.isMonitoring,
      monitoringInterval: 30000, // 30 seconds
      cleanupInterval: 3600000   // 1 hour
    });
  } catch (error) {
    console.error('Configuration retrieval error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve configuration',
      message: error.message
    });
  }
});

/**
 * PUT /api/monitoring/config - Update monitoring configuration
 */
router.put('/config', (req, res) => {
  try {
    const { thresholds } = req.body;

    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        error: 'Invalid threshold configuration'
      });
    }

    // Validate threshold values
    const validThresholds = {};
    for (const [key, value] of Object.entries(thresholds)) {
      if (typeof value === 'number' && value >= 0) {
        validThresholds[key] = value;
      }
    }

    if (Object.keys(validThresholds).length === 0) {
      return res.status(400).json({
        error: 'No valid threshold values provided'
      });
    }

    monitoringService.updateThresholds(validThresholds);

    res.json({
      success: true,
      message: 'Monitoring configuration updated',
      updatedThresholds: validThresholds,
      currentThresholds: monitoringService.thresholds
    });
  } catch (error) {
    console.error('Configuration update error:', error.message);
    res.status(500).json({
      error: 'Failed to update configuration',
      message: error.message
    });
  }
});

/**
 * GET /api/monitoring/database - Database-specific health and metrics
 */
router.get('/database', async (req, res) => {
  try {
    const dbHealth = {
      status: 'checking',
      timestamp: new Date().toISOString(),
      metrics: {}
    };

    // Test database connection and response time
    const startTime = Date.now();
    try {
      await query('SELECT 1 as test, NOW() as server_time');
      const responseTime = Date.now() - startTime;

      dbHealth.status = 'healthy';
      dbHealth.metrics.responseTime = responseTime;
    } catch (error) {
      dbHealth.status = 'unhealthy';
      dbHealth.error = error.message;
    }

    // Get database statistics
    try {
      const dbStatsResult = await query(`
        SELECT
          (SELECT count(*) FROM users) as user_count,
          (SELECT count(*) FROM articles WHERE status = 'published') as published_articles,
          (SELECT count(*) FROM feedback WHERE status = 'active') as active_feedback,
          (SELECT count(*) FROM notifications WHERE read = false) as unread_notifications
      `);

      if (dbStatsResult.rows.length > 0) {
        dbHealth.metrics.counts = {
          users: parseInt(dbStatsResult.rows[0].user_count),
          publishedArticles: parseInt(dbStatsResult.rows[0].published_articles),
          activeFeedback: parseInt(dbStatsResult.rows[0].active_feedback),
          unreadNotifications: parseInt(dbStatsResult.rows[0].unread_notifications)
        };
      }
    } catch (statsError) {
      console.warn('Could not retrieve database statistics:', statsError.message);
    }

    // Get connection and query metrics from monitoring service
    const monitoringMetrics = monitoringService.getMetrics();
    dbHealth.metrics.monitoring = {
      totalQueries: monitoringMetrics.database.queryCount,
      slowQueries: monitoringMetrics.database.slowQueries.length,
      errors: monitoringMetrics.database.errors,
      avgQueryTime: monitoringMetrics.database.avgQueryTime
    };

    const statusCode = dbHealth.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(dbHealth);
  } catch (error) {
    console.error('Database health check error:', error.message);
    res.status(500).json({
      status: 'error',
      error: 'Database health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/cache - Cache-specific health and metrics
 */
router.get('/cache', async (req, res) => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    const cacheMetrics = await cacheService.getMetrics();

    // Combine health check and metrics
    const result = {
      ...cacheHealth,
      metrics: cacheMetrics,
      monitoring: monitoringService.getMetrics().cache,
      timestamp: new Date().toISOString()
    };

    const statusCode = cacheHealth.healthy ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Cache health check error:', error.message);
    res.status(500).json({
      healthy: false,
      error: 'Cache health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/system - System resource metrics
 */
router.get('/system', (req, res) => {
  try {
    const metrics = monitoringService.getMetrics();
    const systemMetrics = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - metrics.system.startTime,
      current: {
        memory: metrics.system.currentMemory,
        cpu: metrics.system.currentCpu
      },
      recent: {
        memory: metrics.system.memoryUsage.slice(-10), // Last 10 measurements
        cpu: metrics.system.cpuUsage.slice(-10)
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      }
    };

    // Add OS information
    const os = require('os');
    systemMetrics.os = {
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
      cpuCount: os.cpus().length
    };

    res.json(systemMetrics);
  } catch (error) {
    console.error('System metrics error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve system metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/monitoring/ai - AI service metrics
 */
router.get('/ai', async (req, res) => {
  try {
    const monitoringMetrics = monitoringService.getMetrics();
    const aiMetrics = {
      monitoring: monitoringMetrics.ai,
      timestamp: new Date().toISOString()
    };

    // Try to get AI service status if available
    try {
      const openAIService = require('../services/OpenAIService');
      aiMetrics.service = {
        enabled: openAIService.isEnabled,
        model: {
          embedding: openAIService.config.embeddingModel,
          completion: openAIService.config.completionModel
        },
        budget: {
          dailyLimit: openAIService.config.dailyBudgetLimit,
          currentUsage: await openAIService.getTodayUsage()
        }
      };

      // Get usage statistics
      const usageStats = await openAIService.getUsageStatistics();
      aiMetrics.usage = usageStats;

    } catch (aiError) {
      aiMetrics.service = {
        enabled: false,
        error: aiError.message
      };
    }

    res.json(aiMetrics);
  } catch (error) {
    console.error('AI metrics error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve AI metrics',
      message: error.message
    });
  }
});

/**
 * POST /api/monitoring/clear-cache - Clear all cache data
 * WARNING: This should be used with caution
 */
router.post('/clear-cache', async (req, res) => {
  try {
    const confirmed = req.body.confirm === true;

    if (!confirmed) {
      return res.status(400).json({
        error: 'Cache clearing requires explicit confirmation',
        message: 'Send { "confirm": true } in request body'
      });
    }

    const success = await cacheService.clearAll();

    if (success) {
      res.json({
        success: true,
        message: 'All cache data cleared successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache'
      });
    }
  } catch (error) {
    console.error('Cache clearing error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * GET /api/monitoring/dashboard - Combined dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get all monitoring data in one request for dashboard
    const [health, metrics, alerts] = await Promise.all([
      monitoringService.healthCheck(),
      monitoringService.getMetrics(),
      Promise.resolve(monitoringService.getAlerts(true)) // Unresolved alerts only
    ]);

    // Get cache metrics
    let cacheMetrics = null;
    try {
      cacheMetrics = await cacheService.getMetrics();
    } catch (cacheError) {
      cacheMetrics = { error: cacheError.message };
    }

    const dashboard = {
      timestamp: new Date().toISOString(),
      health,
      metrics,
      alerts: {
        unresolved: alerts,
        count: alerts.length
      },
      cache: cacheMetrics,
      summary: {
        uptime: Date.now() - metrics.system.startTime,
        requestsToday: metrics.requests.total,
        errorRate: metrics.requests.total > 0 ?
          ((metrics.requests.error / metrics.requests.total) * 100).toFixed(2) + '%' : '0%',
        cacheHitRate: metrics.cache.hitRate ?
          (metrics.cache.hitRate * 100).toFixed(1) + '%' : 'N/A',
        totalAlerts: alerts.length,
        aiRequestsToday: metrics.ai.requests,
        totalAICost: '$' + metrics.ai.costs.toFixed(4)
      }
    };

    res.json(dashboard);
  } catch (error) {
    console.error('Dashboard data error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      message: error.message
    });
  }
});

module.exports = router;