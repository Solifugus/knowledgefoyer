/**
 * Error Handling Middleware for Knowledge Foyer
 *
 * Centralized error handling for Express application
 */

/**
 * 404 Not Found Handler
 */
function notFoundHandler(req, res, next) {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

/**
 * General Error Handler
 */
function errorHandler(error, req, res, next) {
  const statusCode = error.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log error for debugging
  if (statusCode === 500) {
    console.error('Server Error:', error);
  }

  // Prepare error response
  const errorResponse = {
    error: error.message || 'Internal Server Error',
    status: statusCode,
    timestamp: new Date().toISOString(),
  };

  // Add stack trace in development
  if (!isProduction && error.stack) {
    errorResponse.stack = error.stack;
  }

  // Add request info in development
  if (!isProduction) {
    errorResponse.request = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    };
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Create a validation error
 */
function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.type = 'validation';
  return error;
}

/**
 * Create an authentication error
 */
function createAuthError(message = 'Authentication failed') {
  const error = new Error(message);
  error.status = 401;
  error.type = 'auth';
  return error;
}

/**
 * Create an authorization error
 */
function createAuthorizationError(message = 'Access denied') {
  const error = new Error(message);
  error.status = 403;
  error.type = 'authorization';
  return error;
}

/**
 * Create a not found error
 */
function createNotFoundError(message = 'Resource not found') {
  const error = new Error(message);
  error.status = 404;
  error.type = 'not_found';
  return error;
}

module.exports = {
  notFoundHandler,
  errorHandler,
  createValidationError,
  createAuthError,
  createAuthorizationError,
  createNotFoundError,
};