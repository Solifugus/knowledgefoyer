/**
 * Request Logging Middleware for Knowledge Foyer
 *
 * Comprehensive request/response logging with performance tracking
 */

const { v4: uuidv4 } = require('uuid');
const loggingService = require('../services/LoggingService');

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return uuidv4();
}

/**
 * Extract real IP address from request
 */
function extractRealIP(req) {
  return req.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
         req.get('X-Real-IP') ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * Sanitize request data for logging
 */
function sanitizeRequestData(data, sensitiveFields = []) {
  if (!data || typeof data !== 'object') return data;

  const defaultSensitiveFields = [
    'password', 'token', 'secret', 'key', 'authorization',
    'cookie', 'x-api-key', 'x-auth-token'
  ];

  const allSensitiveFields = [...defaultSensitiveFields, ...sensitiveFields];
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = allSensitiveFields.some(field =>
      keyLower.includes(field.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeRequestData(value, sensitiveFields);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extract user information from request
 */
function extractUserInfo(req) {
  if (!req.user) return null;

  return {
    id: req.user.id,
    username: req.user.username,
    email: req.user.email ? req.user.email.substring(0, 3) + '***' : undefined,
    isActive: req.user.is_active
  };
}

/**
 * Determine if request should be logged
 */
function shouldLogRequest(req) {
  const skipPaths = [
    '/health',
    '/favicon.ico',
    '/robots.txt'
  ];

  const skipExtensions = [
    '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.eot'
  ];

  // Skip certain paths
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return false;
  }

  // Skip static file requests
  if (skipExtensions.some(ext => req.path.toLowerCase().endsWith(ext))) {
    return false;
  }

  // Skip if explicitly disabled
  if (req.headers['x-skip-logging']) {
    return false;
  }

  return true;
}

/**
 * Request context middleware
 */
function requestContext(req, res, next) {
  // Generate unique request ID
  req.id = req.get('X-Request-ID') || generateRequestId();

  // Set request ID in response header
  res.set('X-Request-ID', req.id);

  // Add timestamp
  req.startTime = Date.now();

  // Extract real IP
  req.realIP = extractRealIP(req);

  // Create request-scoped logger
  req.logger = loggingService.child({
    requestId: req.id,
    ip: req.realIP
  });

  next();
}

/**
 * Request logging middleware
 */
function requestLogger(options = {}) {
  const {
    logLevel = 'http',
    includeHeaders = false,
    includeBody = false,
    includeQuery = true,
    includeParams = true,
    maxBodySize = 1024,
    sensitiveFields = []
  } = options;

  return (req, res, next) => {
    // Skip logging if not needed
    if (!shouldLogRequest(req)) {
      return next();
    }

    // Prepare request data
    const requestData = {
      method: req.method,
      url: req.url,
      path: req.path,
      protocol: req.protocol,
      httpVersion: req.httpVersion,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      acceptLanguage: req.get('Accept-Language'),
      user: extractUserInfo(req)
    };

    // Add query parameters
    if (includeQuery && Object.keys(req.query).length > 0) {
      requestData.query = sanitizeRequestData(req.query, sensitiveFields);
    }

    // Add route parameters
    if (includeParams && Object.keys(req.params).length > 0) {
      requestData.params = req.params;
    }

    // Add headers if requested
    if (includeHeaders) {
      requestData.headers = sanitizeRequestData(req.headers, sensitiveFields);
    }

    // Add body if requested and present
    if (includeBody && req.body) {
      let body = req.body;

      // Truncate large bodies
      if (typeof body === 'string' && body.length > maxBodySize) {
        body = body.substring(0, maxBodySize) + '... [TRUNCATED]';
      } else if (typeof body === 'object') {
        const bodyString = JSON.stringify(body);
        if (bodyString.length > maxBodySize) {
          body = JSON.stringify(body).substring(0, maxBodySize) + '... [TRUNCATED]';
        }
      }

      requestData.body = sanitizeRequestData(body, sensitiveFields);
    }

    // Log incoming request
    req.logger[logLevel]('Incoming request', {
      type: 'request',
      request: requestData
    });

    // Capture original res.end to log response
    const originalEnd = res.end;
    let responseBody = '';

    // Capture response data if needed
    if (includeBody) {
      const originalJson = res.json;
      res.json = function(data) {
        responseBody = data;
        return originalJson.call(this, data);
      };

      const originalSend = res.send;
      res.send = function(data) {
        if (!responseBody) responseBody = data;
        return originalSend.call(this, data);
      };
    }

    // Override res.end to capture response metrics
    res.end = function(chunk, encoding) {
      const endTime = Date.now();
      const duration = endTime - req.startTime;

      // Prepare response data
      const responseData = {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration,
        contentLength: res.get('Content-Length'),
        contentType: res.get('Content-Type'),
        cacheControl: res.get('Cache-Control')
      };

      // Add response headers if requested
      if (includeHeaders) {
        responseData.headers = res.getHeaders();
      }

      // Add response body if requested and available
      if (includeBody && responseBody) {
        let body = responseBody;

        // Truncate large responses
        if (typeof body === 'string' && body.length > maxBodySize) {
          body = body.substring(0, maxBodySize) + '... [TRUNCATED]';
        } else if (typeof body === 'object') {
          const bodyString = JSON.stringify(body);
          if (bodyString.length > maxBodySize) {
            body = bodyString.substring(0, maxBodySize) + '... [TRUNCATED]';
          } else {
            body = responseBody;
          }
        }

        responseData.body = body;
      }

      // Determine log level based on status code and duration
      let responseLogLevel = logLevel;
      if (res.statusCode >= 500) {
        responseLogLevel = 'error';
      } else if (res.statusCode >= 400) {
        responseLogLevel = 'warn';
      } else if (duration > 5000) {
        responseLogLevel = 'warn';
      } else if (duration > 1000) {
        responseLogLevel = 'info';
      }

      // Log response
      req.logger[responseLogLevel]('Request completed', {
        type: 'response',
        request: {
          method: req.method,
          url: req.url,
          user: requestData.user
        },
        response: responseData
      });

      // Log to monitoring service for performance tracking
      try {
        const monitoringService = require('../services/MonitoringService');
        monitoringService.recordRequest(
          req.method,
          req.path,
          res.statusCode,
          duration
        );
      } catch (error) {
        // Monitoring service might not be available
      }

      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * Error response logger
 */
function errorResponseLogger(error, req, res, next) {
  if (req.logger) {
    req.logger.error('Request failed with error', {
      type: 'error_response',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode
      },
      request: {
        method: req.method,
        url: req.url,
        user: extractUserInfo(req)
      }
    });
  }

  next(error);
}

/**
 * Authentication event logger
 */
function authLogger(event, req, details = {}) {
  if (!req.logger) return;

  req.logger.auth(event, req.user?.id, {
    ip: req.realIP,
    userAgent: req.get('User-Agent'),
    ...details
  });
}

/**
 * Business event logger
 */
function businessEventLogger(event, req, data = {}) {
  if (!req.logger) return;

  req.logger.business(event, data, {
    user: extractUserInfo(req),
    ip: req.realIP
  });
}

/**
 * Security event logger
 */
function securityLogger(event, req, details = {}) {
  if (!req.logger) return;

  req.logger.security(event, details, {
    ip: req.realIP,
    userAgent: req.get('User-Agent'),
    user: extractUserInfo(req)
  });
}

/**
 * Performance logger for specific operations
 */
function performanceLogger(operation, duration, req, metadata = {}) {
  if (!req.logger) return;

  const logLevel = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';

  req.logger[logLevel]('Performance measurement', {
    type: 'performance',
    operation,
    duration,
    user: extractUserInfo(req),
    ...metadata
  });
}

/**
 * API usage tracker
 */
function apiUsageLogger(req, res, next) {
  // Skip non-API requests
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  if (req.logger) {
    req.logger.info('API usage', {
      type: 'api_usage',
      endpoint: req.path,
      method: req.method,
      user: extractUserInfo(req),
      timestamp: new Date().toISOString()
    });
  }

  next();
}

/**
 * Setup request logging
 */
function setupRequestLogging(app, options = {}) {
  // Add request context middleware first
  app.use(requestContext);

  // Add request logging middleware
  app.use(requestLogger(options));

  // Add API usage tracking
  app.use(apiUsageLogger);

  loggingService.info('Request logging initialized', {
    options: {
      ...options,
      sensitiveFields: '[REDACTED]'
    }
  });
}

module.exports = {
  requestContext,
  requestLogger,
  errorResponseLogger,
  authLogger,
  businessEventLogger,
  securityLogger,
  performanceLogger,
  apiUsageLogger,
  setupRequestLogging,

  // Utility functions
  generateRequestId,
  extractRealIP,
  extractUserInfo,
  sanitizeRequestData,
  shouldLogRequest
};