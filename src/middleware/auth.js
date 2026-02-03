/**
 * Authentication Middleware for Knowledge Foyer
 *
 * JWT-based authentication for both REST and WebSocket connections
 */

const jwt = require('jsonwebtoken');

/**
 * Extract JWT token from request headers or query parameters
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter (for WebSocket upgrades)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  // Check cookies (if using cookie-based auth)
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Verify JWT token and attach user to request
 */
function authMiddleware(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'No token provided',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    let message = 'Invalid token';

    if (error.name === 'TokenExpiredError') {
      message = 'Token expired';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Invalid token format';
    }

    return res.status(401).json({
      error: 'Authentication failed',
      message,
    });
  }
}

/**
 * Optional authentication - attaches user if token is valid, but doesn't require it
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    // Invalid token, but we don't fail - just set user to null
    req.user = null;
  }

  next();
}

/**
 * WebSocket authentication helper
 */
function authenticateWebSocket(request) {
  return new Promise((resolve, reject) => {
    const token = extractToken({
      headers: request.headers,
      query: new URL(request.url, 'http://localhost').searchParams
    });

    if (!token) {
      return reject(new Error('No authentication token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      resolve(decoded);
    } catch (error) {
      reject(new Error(`Authentication failed: ${error.message}`));
    }
  });
}

/**
 * Generate JWT token for user
 */
function generateToken(user, options = {}) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    type: options.type || 'access',
  };

  const tokenOptions = {
    expiresIn: options.expiresIn || process.env.JWT_ACCESS_EXPIRY || '15m',
    issuer: 'knowledge-foyer',
    audience: 'knowledge-foyer-users',
  };

  return jwt.sign(payload, process.env.JWT_SECRET, tokenOptions);
}

/**
 * Generate refresh token
 */
function generateRefreshToken(user) {
  return generateToken(user, {
    type: 'refresh',
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  });
}

/**
 * Middleware to check if user owns the resource based on subdomain
 */
function requireResourceOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  if (!req.subdomain) {
    return res.status(400).json({
      error: 'User subdomain required',
    });
  }

  // Check if the authenticated user owns this subdomain
  if (req.user.username !== req.subdomain) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
    });
  }

  next();
}

module.exports = {
  authMiddleware,
  requireAuth: authMiddleware, // Alias for consistency
  optionalAuth,
  authenticateWebSocket,
  generateToken,
  generateRefreshToken,
  requireResourceOwner,
  extractToken,
};