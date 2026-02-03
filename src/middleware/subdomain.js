/**
 * Subdomain Routing Middleware for Knowledge Foyer
 *
 * Handles subdomain-based user spaces (username.knowledgefoyer.com)
 */

/**
 * Extract subdomain from request and attach to req object
 */
function subdomainRouter(req, res, next) {
  const host = req.get('host');

  if (!host) {
    req.subdomain = null;
    return next();
  }

  // Split hostname into parts
  const hostParts = host.split('.');

  // For localhost development: username.localhost:3000
  if (host.includes('localhost')) {
    const parts = host.split('.');
    if (parts.length >= 2 && parts[0] !== 'localhost' && !parts[0].includes(':')) {
      req.subdomain = parts[0].toLowerCase();
    } else {
      req.subdomain = null;
    }
  }
  // For production: username.knowledgefoyer.com
  else if (hostParts.length >= 3) {
    // Extract subdomain (first part)
    const subdomain = hostParts[0].toLowerCase();

    // Skip common subdomains
    if (['www', 'api', 'admin', 'mail', 'ftp'].includes(subdomain)) {
      req.subdomain = null;
    } else {
      req.subdomain = subdomain;
    }
  } else {
    req.subdomain = null;
  }

  // Validate subdomain format (alphanumeric, hyphens, underscores)
  if (req.subdomain && !/^[a-z0-9_-]+$/.test(req.subdomain)) {
    req.subdomain = null;
  }

  // Add helper methods
  req.isMainDomain = !req.subdomain;
  req.isUserDomain = !!req.subdomain;

  next();
}

/**
 * Middleware to require user subdomain
 */
function requireUserSubdomain(req, res, next) {
  if (!req.subdomain) {
    return res.status(400).json({
      error: 'This endpoint requires a user subdomain (username.knowledgefoyer.com)',
    });
  }
  next();
}

/**
 * Middleware to require main domain
 */
function requireMainDomain(req, res, next) {
  if (req.subdomain) {
    return res.status(400).json({
      error: 'This endpoint is only available on the main domain',
    });
  }
  next();
}

module.exports = {
  subdomainRouter,
  requireUserSubdomain,
  requireMainDomain,
};