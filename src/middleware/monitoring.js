/**
 * Monitoring Middleware for Knowledge Foyer
 *
 * Express middleware for performance tracking and monitoring
 */

const monitoringService = require('../services/MonitoringService');

/**
 * Request performance tracking middleware
 */
function requestMonitoring(req, res, next) {
  const startTime = Date.now();

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Extract endpoint pattern (remove IDs and query params)
    const endpoint = getEndpointPattern(req.path);

    // Record the request metrics
    monitoringService.recordRequest(
      req.method,
      endpoint,
      res.statusCode,
      responseTime,
      res.statusCode >= 400 ? res.statusMessage : null
    );

    // Call original end function
    originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Database query monitoring wrapper
 */
function wrapDatabaseQuery(originalQuery) {
  return async function monitoredQuery(...args) {
    const startTime = Date.now();
    const queryText = typeof args[0] === 'string' ? args[0] : 'Complex Query';

    try {
      const result = await originalQuery.apply(this, args);
      const duration = Date.now() - startTime;

      monitoringService.recordDatabaseQuery(queryText, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      monitoringService.recordDatabaseQuery(queryText, duration, error);
      throw error;
    }
  };
}

/**
 * Cache operation monitoring wrapper
 */
function wrapCacheOperation(operation, originalMethod) {
  return async function monitoredCacheOp(...args) {
    try {
      const result = await originalMethod.apply(this, args);

      // For get operations, check if we got a hit
      if (operation === 'get') {
        const hit = result !== null && result !== undefined;
        monitoringService.recordCacheOperation(operation, hit);
      } else {
        monitoringService.recordCacheOperation(operation, false);
      }

      return result;
    } catch (error) {
      monitoringService.recordCacheOperation(operation, false, error);
      throw error;
    }
  };
}

/**
 * AI operation monitoring wrapper
 */
function wrapAIOperation(originalMethod, estimateTokens = null) {
  return async function monitoredAIOp(...args) {
    try {
      const result = await originalMethod.apply(this, args);

      // Extract metrics from result if available
      let tokens = 0;
      let cost = 0;

      if (result && typeof result === 'object') {
        tokens = result.usage?.total_tokens || 0;
        cost = result.cost || 0;

        // If no usage info, estimate tokens
        if (!tokens && estimateTokens && typeof estimateTokens === 'function') {
          tokens = estimateTokens(args, result);
        }
      }

      monitoringService.recordAIOperation(tokens, cost);
      return result;
    } catch (error) {
      monitoringService.recordAIOperation(0, 0, error);
      throw error;
    }
  };
}

/**
 * Extract endpoint pattern from request path
 */
function getEndpointPattern(path) {
  // Replace UUIDs and numeric IDs with placeholders
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{id}')
    .replace(/\/\d+/g, '/{id}')
    .replace(/\/[a-z0-9-_]+\.(jpg|jpeg|png|gif|pdf|json|xml|txt)$/i, '/{file}');
}

/**
 * Error handling middleware with monitoring
 */
function errorMonitoring(err, req, res, next) {
  // Log the error for monitoring
  console.error('🚨 Application Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Add error to monitoring service as a critical alert
  monitoringService.addAlert('application_error', `Application error: ${err.message}`, {
    url: req.url,
    method: req.method,
    stack: err.stack,
    userAgent: req.get('User-Agent')
  });

  // Continue with standard error handling
  next(err);
}

/**
 * Health check endpoint handler
 */
async function healthCheckHandler(req, res) {
  try {
    const health = await monitoringService.healthCheck();

    // Set appropriate HTTP status based on health
    let statusCode;
    switch (health.status) {
      case 'healthy':
        statusCode = 200;
        break;
      case 'degraded':
        statusCode = 200; // Still operational, just degraded
        break;
      case 'unhealthy':
        statusCode = 503; // Service unavailable
        break;
      default:
        statusCode = 500;
    }

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
}

/**
 * Metrics endpoint handler
 */
function metricsHandler(req, res) {
  try {
    const metrics = monitoringService.getMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Metrics retrieval error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
}

/**
 * Alerts endpoint handler
 */
function alertsHandler(req, res) {
  try {
    const unresolved = req.query.unresolved === 'true';
    const alerts = monitoringService.getAlerts(unresolved);

    res.json({
      alerts,
      total: alerts.length,
      unresolved: alerts.filter(a => !a.resolved).length
    });
  } catch (error) {
    console.error('Alerts retrieval error:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve alerts',
      message: error.message
    });
  }
}

/**
 * Alert resolution endpoint handler
 */
function resolveAlertHandler(req, res) {
  try {
    const { alertId } = req.params;

    if (!alertId) {
      return res.status(400).json({
        error: 'Alert ID is required'
      });
    }

    monitoringService.resolveAlert(parseInt(alertId));

    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });
  } catch (error) {
    console.error('Alert resolution error:', error.message);
    res.status(500).json({
      error: 'Failed to resolve alert',
      message: error.message
    });
  }
}

/**
 * Monitoring configuration endpoint handler
 */
function configHandler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get current configuration
      res.json({
        thresholds: monitoringService.thresholds,
        isMonitoring: monitoringService.isMonitoring
      });
    } else if (req.method === 'PUT') {
      // Update configuration
      const { thresholds } = req.body;

      if (thresholds && typeof thresholds === 'object') {
        monitoringService.updateThresholds(thresholds);

        res.json({
          success: true,
          message: 'Monitoring configuration updated',
          thresholds: monitoringService.thresholds
        });
      } else {
        res.status(400).json({
          error: 'Invalid configuration data'
        });
      }
    } else {
      res.status(405).json({
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Configuration error:', error.message);
    res.status(500).json({
      error: 'Failed to handle configuration request',
      message: error.message
    });
  }
}

/**
 * Initialize monitoring for database and cache services
 */
function initializeServiceMonitoring() {
  try {
    // Wrap database query function if available
    const { query } = require('../config/database');
    if (query && typeof query === 'function') {
      require('../config/database').query = wrapDatabaseQuery(query);
    }

    // Wrap cache service methods if available
    const cacheService = require('../services/CacheService');
    if (cacheService) {
      const originalGet = cacheService.get.bind(cacheService);
      const originalSet = cacheService.set.bind(cacheService);
      const originalDel = cacheService.del.bind(cacheService);

      cacheService.get = wrapCacheOperation('get', originalGet);
      cacheService.set = wrapCacheOperation('set', originalSet);
      cacheService.del = wrapCacheOperation('delete', originalDel);
    }

    // Wrap OpenAI service methods if available
    try {
      const openAIService = require('../services/OpenAIService');
      if (openAIService) {
        const originalGenerateEmbedding = openAIService.generateEmbedding.bind(openAIService);
        const originalGenerateCompletion = openAIService.generateCompletion.bind(openAIService);

        openAIService.generateEmbedding = wrapAIOperation(originalGenerateEmbedding);
        openAIService.generateCompletion = wrapAIOperation(originalGenerateCompletion);
      }
    } catch (openAIError) {
      // OpenAI service might not be available, which is fine
      console.log('📊 OpenAI service monitoring not available:', openAIError.message);
    }

    console.log('📊 Service monitoring initialization complete');
  } catch (error) {
    console.error('📊 Service monitoring initialization failed:', error.message);
  }
}

/**
 * Express router setup for monitoring endpoints
 */
function setupMonitoringRoutes(app) {
  // Health check endpoint (public)
  app.get('/health', healthCheckHandler);

  // Monitoring endpoints (should be protected in production)
  app.get('/admin/metrics', metricsHandler);
  app.get('/admin/alerts', alertsHandler);
  app.post('/admin/alerts/:alertId/resolve', resolveAlertHandler);
  app.get('/admin/monitoring/config', configHandler);
  app.put('/admin/monitoring/config', configHandler);

  console.log('📊 Monitoring endpoints configured');
}

module.exports = {
  requestMonitoring,
  errorMonitoring,
  healthCheckHandler,
  metricsHandler,
  alertsHandler,
  resolveAlertHandler,
  configHandler,
  wrapDatabaseQuery,
  wrapCacheOperation,
  wrapAIOperation,
  initializeServiceMonitoring,
  setupMonitoringRoutes
};