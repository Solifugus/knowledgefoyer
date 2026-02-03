/**
 * Error Handling Middleware for Knowledge Foyer
 *
 * Comprehensive error handling with logging, monitoring, and graceful responses
 */

const loggingService = require('../services/LoggingService');

/**
 * Custom error classes for better error categorization
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp
    };
  }
}

class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message = 'External service unavailable') {
    super(`${service}: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

/**
 * Error handler for async route handlers
 * Wraps async functions to catch and forward errors to Express error handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Sanitize error for client response
 */
function sanitizeError(error, isDevelopment = false) {
  const sanitized = {
    error: true,
    message: error.message || 'An unexpected error occurred',
    errorCode: error.errorCode || 'INTERNAL_ERROR',
    timestamp: error.timestamp || new Date().toISOString()
  };

  // Add additional details in development mode
  if (isDevelopment) {
    sanitized.stack = error.stack;
    sanitized.name = error.name;

    if (error.field) sanitized.field = error.field;
    if (error.value) sanitized.value = error.value;
    if (error.service) sanitized.service = error.service;
  }

  // Add request ID if available
  if (error.requestId) {
    sanitized.requestId = error.requestId;
  }

  return sanitized;
}

/**
 * Determine if error should be reported to monitoring
 */
function shouldReportError(error) {
  // Don't report client errors (4xx) or operational errors
  if (error.statusCode >= 400 && error.statusCode < 500 && error.isOperational) {
    return false;
  }

  // Always report server errors (5xx)
  if (error.statusCode >= 500) {
    return true;
  }

  // Report non-operational errors
  return !error.isOperational;
}

/**
 * Enhanced error reporting with context
 */
function reportError(error, req = null, additionalContext = {}) {
  const errorContext = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      errorCode: error.errorCode,
      isOperational: error.isOperational
    },
    ...additionalContext
  };

  // Add request context
  if (req) {
    errorContext.request = {
      id: req.id,
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    };

    // Add body for non-GET requests (excluding sensitive data)
    if (req.method !== 'GET' && req.body) {
      const sanitizedBody = { ...req.body };

      // Remove sensitive fields
      const sensitiveFields = ['password', 'token', 'secret', 'key'];
      sensitiveFields.forEach(field => {
        if (sanitizedBody[field]) {
          sanitizedBody[field] = '[REDACTED]';
        }
      });

      errorContext.request.body = sanitizedBody;
    }
  }

  // Log the error
  loggingService.error('Application error occurred', errorContext);

  // Report to monitoring service if it's a significant error
  if (shouldReportError(error)) {
    try {
      const monitoringService = require('../services/MonitoringService');
      monitoringService.addAlert('critical_error', error.message, errorContext);
    } catch (monitoringError) {
      // Monitoring service might not be available
      loggingService.warn('Failed to report error to monitoring service', {
        error: monitoringError.message
      });
    }
  }
}

/**
 * Convert common errors to AppError instances
 */
function normalizeError(error) {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // MongoDB/Database errors
  if (error.name === 'MongoError' || error.code === 'ECONNREFUSED') {
    return new DatabaseError('Database connection failed', error);
  }

  // Postgres errors
  if (error.code && error.code.startsWith('23')) {
    if (error.code === '23505') {
      return new ConflictError('Duplicate entry');
    }
    if (error.code === '23503') {
      return new ValidationError('Foreign key constraint violation');
    }
    return new DatabaseError('Database constraint violation', error);
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }

  // Validation errors (from express-validator or joi)
  if (error.name === 'ValidationError') {
    return new ValidationError(error.message);
  }

  // Multer errors (file upload)
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('File too large');
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Too many files');
  }

  // Syntax errors (JSON parsing, etc.)
  if (error instanceof SyntaxError) {
    return new ValidationError('Invalid request format');
  }

  // CORS errors
  if (error.message && error.message.includes('CORS')) {
    return new AuthorizationError('Cross-origin request not allowed');
  }

  // Default to generic server error
  return new AppError(
    process.env.NODE_ENV === 'production' ?
      'An unexpected error occurred' :
      error.message,
    500,
    'INTERNAL_ERROR',
    false
  );
}

/**
 * Main error handling middleware
 */
function errorHandler(error, req, res, next) {
  // Ensure we have a normalized error
  const normalizedError = normalizeError(error);

  // Add request ID to error
  if (req.id) {
    normalizedError.requestId = req.id;
  }

  // Report the error
  reportError(normalizedError, req);

  // Determine response status code
  const statusCode = normalizedError.statusCode || 500;

  // Sanitize error for client response
  const isDevelopment = process.env.NODE_ENV === 'development';
  const sanitizedError = sanitizeError(normalizedError, isDevelopment);

  // Set security headers for error responses
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    ...sanitizedError,
    supportInfo: process.env.NODE_ENV === 'production' ? {
      message: 'If this problem persists, please contact support',
      timestamp: normalizedError.timestamp
    } : undefined
  });

  // Log request completion
  loggingService.http('Request completed with error', {
    req,
    statusCode,
    error: normalizedError.errorCode
  });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.method} ${req.url} not found`);
  next(error);
}

/**
 * Unhandled promise rejection handler
 */
function setupUnhandledRejectionHandler() {
  process.on('unhandledRejection', (reason, promise) => {
    const error = new AppError(
      `Unhandled Promise Rejection: ${reason}`,
      500,
      'UNHANDLED_REJECTION',
      false
    );

    loggingService.error('Unhandled Promise Rejection', {
      error,
      reason: reason?.toString(),
      promise: promise?.toString()
    });

    // In production, we might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });
}

/**
 * Uncaught exception handler
 */
function setupUncaughtExceptionHandler() {
  process.on('uncaughtException', (error) => {
    const appError = new AppError(
      `Uncaught Exception: ${error.message}`,
      500,
      'UNCAUGHT_EXCEPTION',
      false
    );

    loggingService.error('Uncaught Exception', { error: appError });

    // Uncaught exceptions are serious, we should exit
    process.exit(1);
  });
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown() {
  const shutdown = (signal) => {
    loggingService.info(`Received ${signal}, starting graceful shutdown`);

    // Close server gracefully
    if (global.server) {
      global.server.close(() => {
        loggingService.info('HTTP server closed');

        // Close database connections
        try {
          const { closeDatabase } = require('../config/database');
          closeDatabase();
        } catch (error) {
          loggingService.warn('Error closing database connections', { error });
        }

        // Close cache connections
        try {
          const cacheService = require('../services/CacheService');
          cacheService.disconnect();
        } catch (error) {
          loggingService.warn('Error closing cache connections', { error });
        }

        loggingService.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force close after timeout
      setTimeout(() => {
        loggingService.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Request timeout handler
 */
function timeoutHandler(timeout = 30000) {
  return (req, res, next) => {
    // Set timeout for request
    req.setTimeout(timeout, () => {
      const error = new AppError(
        'Request timeout',
        408,
        'REQUEST_TIMEOUT'
      );
      next(error);
    });

    // Set timeout for response
    res.setTimeout(timeout, () => {
      const error = new AppError(
        'Response timeout',
        408,
        'RESPONSE_TIMEOUT'
      );
      next(error);
    });

    next();
  };
}

/**
 * Initialize error handling
 */
function initializeErrorHandling() {
  setupUnhandledRejectionHandler();
  setupUncaughtExceptionHandler();
  setupGracefulShutdown();

  loggingService.info('Error handling initialized');
}

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,

  // Middleware functions
  asyncHandler,
  errorHandler,
  notFoundHandler,
  timeoutHandler,

  // Utility functions
  sanitizeError,
  reportError,
  normalizeError,
  initializeErrorHandling
};