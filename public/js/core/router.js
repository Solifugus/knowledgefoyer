/**
 * SPA Router for Knowledge Foyer
 *
 * Handles client-side navigation without page reloads using hash-based routing
 * for maximum compatibility and simplicity.
 */

class SPARouter {
  constructor() {
    this.routes = new Map();
    this.middlewares = [];
    this.currentRoute = null;
    this.currentParams = {};
    this.contentContainer = null;
    this.loadingElement = null;

    // Initialize router
    this.init();
  }

  /**
   * Initialize router and set up event listeners
   */
  init() {
    // Find content container
    this.contentContainer = document.getElementById('spa-content');
    if (!this.contentContainer) {
      console.error('❌ SPA content container (#spa-content) not found');
      return;
    }

    // Create loading element if it doesn't exist
    this.ensureLoadingElement();

    // Setup event listeners
    this.setupEventListeners();

    // Handle initial route
    this.handleInitialRoute();
  }

  /**
   * Set up navigation event listeners
   */
  setupEventListeners() {
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || '/';
      this.handleRoute(hash);
    });

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', (event) => {
      const hash = window.location.hash.slice(1) || '/';
      this.handleRoute(hash);
    });

    // Intercept clicks on SPA links
    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-spa-link]');
      if (link) {
        event.preventDefault();

        let path;
        if (link.hasAttribute('href')) {
          // Extract path from href
          const href = link.getAttribute('href');
          if (href.startsWith('#')) {
            path = href.slice(1);
          } else if (href.startsWith('/')) {
            path = href;
          } else {
            path = href;
          }
        } else if (link.hasAttribute('data-path')) {
          path = link.getAttribute('data-path');
        } else {
          console.warn('SPA link missing href or data-path attribute:', link);
          return;
        }

        this.navigate(path);
      }
    });
  }

  /**
   * Register a route handler
   * @param {string|RegExp} path - Route path or pattern
   * @param {Function} handler - Route handler function
   * @param {Object} options - Additional route options
   */
  addRoute(path, handler, options = {}) {
    const route = {
      path,
      handler,
      pattern: this.createRoutePattern(path),
      ...options
    };

    this.routes.set(path, route);
    console.log(`📍 Route registered: ${path}`);
  }

  /**
   * Add middleware function
   * @param {Function} middleware - Middleware function
   */
  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * Navigate to a specific path
   * @param {string} path - Target path
   * @param {Object} options - Navigation options
   */
  navigate(path, options = {}) {
    const { replace = false, silent = false } = options;

    // Normalize path
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Update browser URL
    const hash = '#' + path;
    if (replace) {
      window.location.replace(hash);
    } else {
      window.location.hash = hash;
    }

    // Handle route if silent navigation requested
    if (silent) {
      this.handleRoute(path);
    }
  }

  /**
   * Handle initial route on page load
   */
  handleInitialRoute() {
    const hash = window.location.hash.slice(1) || '/';
    this.handleRoute(hash);
  }

  /**
   * Handle route navigation
   * @param {string} path - Route path to handle
   */
  async handleRoute(path) {
    console.log(`🔄 Navigating to: ${path}`);

    try {
      // Run pre-route middlewares
      for (const middleware of this.middlewares) {
        const result = await middleware(path);
        if (result === false) {
          console.log('🚫 Route blocked by middleware');
          return;
        }
      }

      // Find matching route
      const { route, params } = this.matchRoute(path);

      if (!route) {
        console.log(`❌ No route found for: ${path}`);
        this.handle404(path);
        return;
      }

      // Show loading state
      this.showLoadingState();

      // Store current route info
      this.currentRoute = path;
      this.currentParams = params;

      // Execute route handler
      await route.handler(params, path);

      // Dispatch route change event
      this.dispatchRouteEvent('route-changed', { path, params, route });

      console.log(`✅ Route handled successfully: ${path}`);

    } catch (error) {
      console.error(`❌ Route handling error for ${path}:`, error);
      this.handleRouteError(error, path);
    }
  }

  /**
   * Find route that matches the given path
   * @param {string} path - Path to match
   * @returns {Object} - Matched route and extracted parameters
   */
  matchRoute(path) {
    for (const [routePath, route] of this.routes) {
      const match = path.match(route.pattern);
      if (match) {
        // Extract parameters from regex groups
        const params = {};
        if (route.paramNames) {
          route.paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
          });
        }

        // Add numeric parameters for simple regex matches
        if (match.length > 1 && !route.paramNames) {
          for (let i = 1; i < match.length; i++) {
            params[i - 1] = match[i];
          }
        }

        return { route, params };
      }
    }

    return { route: null, params: {} };
  }

  /**
   * Create regex pattern from route path
   * @param {string|RegExp} path - Route path
   * @returns {RegExp} - Compiled regex pattern
   */
  createRoutePattern(path) {
    if (path instanceof RegExp) {
      return path;
    }

    // Handle named parameters (e.g., /user/:id)
    const paramNames = [];
    let pattern = path.replace(/:([^/]+)/g, (match, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    // Escape special regex characters except our parameter replacements
    pattern = pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');

    // Make trailing slash optional
    if (pattern.endsWith('/')) {
      pattern = pattern.slice(0, -1) + '/?';
    }

    // Anchor pattern
    pattern = `^${pattern}$`;

    const regex = new RegExp(pattern);
    regex.paramNames = paramNames;

    return regex;
  }

  /**
   * Render content in the main content area
   * @param {string} html - HTML content to render
   * @param {Object} options - Rendering options
   */
  renderContent(html, options = {}) {
    const { title, className, scrollToTop = true } = options;

    // Hide loading state
    this.hideLoadingState();

    // Set content
    this.contentContainer.innerHTML = html;

    // Apply CSS class if specified
    if (className) {
      this.contentContainer.className = `spa-content ${className}`;
    } else {
      this.contentContainer.className = 'spa-content';
    }

    // Update page title
    if (title) {
      document.title = `${title} - Knowledge Foyer`;
    }

    // Scroll to top if requested
    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Dispatch content-rendered event
    this.dispatchRouteEvent('content-rendered', {
      title,
      className,
      path: this.currentRoute
    });

    // Re-initialize any components in the new content
    this.initializePageComponents();
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    if (this.loadingElement) {
      this.loadingElement.style.display = 'flex';
    }
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    if (this.loadingElement) {
      this.loadingElement.style.display = 'none';
    }
  }

  /**
   * Ensure loading element exists
   */
  ensureLoadingElement() {
    this.loadingElement = this.contentContainer.querySelector('.page-loading');

    if (!this.loadingElement) {
      this.loadingElement = document.createElement('div');
      this.loadingElement.className = 'page-loading';
      this.loadingElement.innerHTML = `
        <div class="page-loading-spinner"></div>
        <p class="page-loading-text">Loading...</p>
      `;
      this.contentContainer.appendChild(this.loadingElement);
    }
  }

  /**
   * Handle 404 errors
   * @param {string} path - Path that wasn't found
   */
  handle404(path) {
    const html = `
      <div class="error-page">
        <div class="error-content">
          <h1>Page Not Found</h1>
          <p>The page <code>${path}</code> doesn't exist.</p>
          <div class="error-actions">
            <a href="#/" class="btn btn-primary" data-spa-link>
              Return Home
            </a>
            <button class="btn btn-secondary" onclick="history.back()">
              Go Back
            </button>
          </div>
        </div>
      </div>
    `;

    this.renderContent(html, { title: 'Page Not Found' });
    this.dispatchRouteEvent('route-not-found', { path });
  }

  /**
   * Handle route errors
   * @param {Error} error - The error that occurred
   * @param {string} path - Path being handled when error occurred
   */
  handleRouteError(error, path) {
    console.error('Route error:', error);

    const html = `
      <div class="error-page">
        <div class="error-content">
          <h1>Something Went Wrong</h1>
          <p>An error occurred while loading this page.</p>
          <details class="error-details">
            <summary>Error Details</summary>
            <pre><code>${error.message}\n${error.stack}</code></pre>
          </details>
          <div class="error-actions">
            <button class="btn btn-primary" onclick="window.location.reload()">
              Reload Page
            </button>
            <a href="#/" class="btn btn-secondary" data-spa-link>
              Return Home
            </a>
          </div>
        </div>
      </div>
    `;

    this.renderContent(html, { title: 'Error' });
    this.dispatchRouteEvent('route-error', { error, path });
  }

  /**
   * Initialize components in the current page content
   */
  initializePageComponents() {
    // Re-run any component initialization
    const event = new CustomEvent('spa:page-loaded', {
      detail: {
        path: this.currentRoute,
        params: this.currentParams,
        container: this.contentContainer
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Dispatch router events
   * @param {string} eventName - Event name
   * @param {Object} detail - Event detail data
   */
  dispatchRouteEvent(eventName, detail) {
    const event = new CustomEvent(`spa:${eventName}`, { detail });
    document.dispatchEvent(event);
  }

  /**
   * Get current route information
   * @returns {Object} - Current route info
   */
  getCurrentRoute() {
    return {
      path: this.currentRoute,
      params: this.currentParams,
      url: window.location.hash
    };
  }

  /**
   * Check if a given path matches the current route
   * @param {string} path - Path to check
   * @returns {boolean} - True if path matches current route
   */
  isCurrentRoute(path) {
    return this.currentRoute === path;
  }

  /**
   * Generate URL for a given path
   * @param {string} path - Route path
   * @param {Object} params - Route parameters
   * @returns {string} - Full URL with hash
   */
  generateUrl(path, params = {}) {
    let url = path;

    // Replace named parameters
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    }

    return `#${url}`;
  }

  /**
   * Prefetch a route (for performance optimization)
   * @param {string} path - Path to prefetch
   */
  async prefetch(path) {
    try {
      const { route } = this.matchRoute(path);
      if (route && route.prefetch) {
        await route.prefetch();
      }
    } catch (error) {
      console.warn('Prefetch failed:', error);
    }
  }

  /**
   * Destroy router and clean up event listeners
   */
  destroy() {
    window.removeEventListener('hashchange', this.handleRoute);
    window.removeEventListener('popstate', this.handleRoute);
    document.removeEventListener('click', this.interceptLinks);

    this.routes.clear();
    this.middlewares = [];
    this.currentRoute = null;
    this.currentParams = {};
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SPARouter;
} else {
  window.SPARouter = SPARouter;
}