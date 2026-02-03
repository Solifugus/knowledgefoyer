/**
 * Error Tracking Service for Knowledge Foyer
 *
 * Comprehensive error tracking with external service integration and analytics
 */

const { query } = require('../config/database');
const loggingService = require('./LoggingService');

class ErrorTrackingService {
  constructor() {
    this.config = {
      sentryDsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      release: process.env.GIT_COMMIT || 'unknown',
      enableSentry: !!process.env.SENTRY_DSN,
      enableLocalTracking: process.env.ENABLE_LOCAL_ERROR_TRACKING !== 'false',
      sampleRate: parseFloat(process.env.ERROR_SAMPLE_RATE) || 1.0
    };

    this.errorCounts = new Map();
    this.errorPatterns = new Map();
    this.recentErrors = [];
    this.maxRecentErrors = 100;

    this.isInitialized = false;
    this.sentry = null;

    this.initialize();
  }

  /**
   * Initialize error tracking services
   */
  async initialize() {
    try {
      // Initialize Sentry if configured
      if (this.config.enableSentry) {
        await this.initializeSentry();
      }

      // Initialize local error tracking
      if (this.config.enableLocalTracking) {
        await this.initializeLocalTracking();
      }

      this.isInitialized = true;
      loggingService.info('Error tracking service initialized', {
        sentry: this.config.enableSentry,
        localTracking: this.config.enableLocalTracking,
        environment: this.config.environment
      });
    } catch (error) {
      loggingService.error('Failed to initialize error tracking service', { error });
    }
  }

  /**
   * Initialize Sentry error tracking
   */
  async initializeSentry() {
    try {
      const Sentry = require('@sentry/node');
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');

      Sentry.init({
        dsn: this.config.sentryDsn,
        environment: this.config.environment,
        release: this.config.release,
        sampleRate: this.config.sampleRate,
        integrations: [
          nodeProfilingIntegration()
        ],
        beforeSend: (event) => this.beforeSendToSentry(event),
        beforeBreadcrumb: (breadcrumb) => this.beforeBreadcrumb(breadcrumb)
      });

      this.sentry = Sentry;
      loggingService.info('Sentry error tracking initialized');
    } catch (error) {
      loggingService.warn('Failed to initialize Sentry', { error: error.message });
      this.config.enableSentry = false;
    }
  }

  /**
   * Initialize local error tracking database
   */
  async initializeLocalTracking() {
    try {
      // Create error tracking tables if they don't exist
      await query(`
        CREATE TABLE IF NOT EXISTS error_tracking (
          id SERIAL PRIMARY KEY,
          error_hash VARCHAR(64) UNIQUE NOT NULL,
          error_type VARCHAR(100) NOT NULL,
          error_message TEXT NOT NULL,
          error_stack TEXT,
          first_occurrence TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_occurrence TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          occurrence_count INTEGER DEFAULT 1,
          environment VARCHAR(50),
          user_id UUID REFERENCES users(id),
          request_path VARCHAR(500),
          request_method VARCHAR(10),
          request_ip INET,
          user_agent TEXT,
          resolved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_error_tracking_hash ON error_tracking(error_hash);
        CREATE INDEX IF NOT EXISTS idx_error_tracking_type ON error_tracking(error_type);
        CREATE INDEX IF NOT EXISTS idx_error_tracking_occurrence ON error_tracking(last_occurrence);
        CREATE INDEX IF NOT EXISTS idx_error_tracking_count ON error_tracking(occurrence_count);
      `);

      loggingService.info('Local error tracking database initialized');
    } catch (error) {
      loggingService.warn('Failed to initialize local error tracking', { error: error.message });
      this.config.enableLocalTracking = false;
    }
  }

  /**
   * Generate error hash for deduplication
   */
  generateErrorHash(error, context = {}) {
    const crypto = require('crypto');

    const hashInput = [
      error.name || 'Error',
      error.message || 'Unknown error',
      error.stack?.split('\n')[1] || '', // First line of stack trace
      context.requestPath || '',
      error.errorCode || ''
    ].join('|');

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Extract error context from request
   */
  extractErrorContext(req) {
    if (!req) return {};

    return {
      requestId: req.id,
      requestPath: req.path,
      requestMethod: req.method,
      requestIp: req.realIP || req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      userEmail: req.user?.email,
      referer: req.get('Referer'),
      query: req.query,
      params: req.params
    };
  }

  /**
   * Track error occurrence
   */
  async trackError(error, context = {}) {
    if (!this.isInitialized) return;

    try {
      const errorHash = this.generateErrorHash(error, context);
      const errorInfo = {
        hash: errorHash,
        type: error.name || 'Error',
        message: error.message || 'Unknown error',
        stack: error.stack,
        timestamp: new Date(),
        context,
        environment: this.config.environment
      };

      // Update in-memory tracking
      this.updateInMemoryTracking(errorInfo);

      // Track in external services
      await Promise.allSettled([
        this.trackInSentry(error, context),
        this.trackLocally(errorInfo)
      ]);

      loggingService.debug('Error tracked successfully', {
        errorHash,
        errorType: errorInfo.type
      });
    } catch (trackingError) {
      loggingService.error('Failed to track error', { error: trackingError });
    }
  }

  /**
   * Update in-memory error tracking
   */
  updateInMemoryTracking(errorInfo) {
    const { hash, type, message, timestamp } = errorInfo;

    // Update error counts
    const currentCount = this.errorCounts.get(hash) || 0;
    this.errorCounts.set(hash, currentCount + 1);

    // Track error patterns
    if (!this.errorPatterns.has(type)) {
      this.errorPatterns.set(type, new Map());
    }
    const typePatterns = this.errorPatterns.get(type);
    const messageCount = typePatterns.get(message) || 0;
    typePatterns.set(message, messageCount + 1);

    // Add to recent errors
    this.recentErrors.unshift({
      hash,
      type,
      message,
      timestamp,
      context: errorInfo.context
    });

    // Keep only recent errors
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors = this.recentErrors.slice(0, this.maxRecentErrors);
    }
  }

  /**
   * Track error in Sentry
   */
  async trackInSentry(error, context) {
    if (!this.config.enableSentry || !this.sentry) return;

    try {
      this.sentry.withScope((scope) => {
        // Set user context
        if (context.userId) {
          scope.setUser({
            id: context.userId,
            email: context.userEmail
          });
        }

        // Set request context
        if (context.requestPath) {
          scope.setTag('request.path', context.requestPath);
          scope.setTag('request.method', context.requestMethod);
        }

        // Set additional context
        scope.setContext('error_context', context);
        scope.setLevel('error');

        // Capture the error
        this.sentry.captureException(error);
      });
    } catch (sentryError) {
      loggingService.debug('Failed to track error in Sentry', { error: sentryError });
    }
  }

  /**
   * Track error locally in database
   */
  async trackLocally(errorInfo) {
    if (!this.config.enableLocalTracking) return;

    try {
      const { hash, type, message, stack, context, environment } = errorInfo;

      await query(`
        INSERT INTO error_tracking (
          error_hash, error_type, error_message, error_stack,
          environment, user_id, request_path, request_method,
          request_ip, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (error_hash) DO UPDATE SET
          last_occurrence = NOW(),
          occurrence_count = error_tracking.occurrence_count + 1,
          updated_at = NOW()
      `, [
        hash,
        type,
        message,
        stack,
        environment,
        context.userId || null,
        context.requestPath || null,
        context.requestMethod || null,
        context.requestIp || null,
        context.userAgent || null
      ]);
    } catch (dbError) {
      loggingService.debug('Failed to track error locally', { error: dbError });
    }
  }

  /**
   * Get error statistics
   */
  async getErrorStatistics(timeframe = '24 hours') {
    if (!this.config.enableLocalTracking) {
      return this.getInMemoryStatistics();
    }

    try {
      const result = await query(`
        SELECT
          COUNT(*) as total_errors,
          COUNT(DISTINCT error_hash) as unique_errors,
          error_type,
          COUNT(*) as type_count
        FROM error_tracking
        WHERE last_occurrence > NOW() - INTERVAL $1
        GROUP BY error_type
        ORDER BY type_count DESC
      `, [timeframe]);

      const topErrors = await query(`
        SELECT
          error_hash,
          error_type,
          error_message,
          occurrence_count,
          last_occurrence,
          resolved
        FROM error_tracking
        WHERE last_occurrence > NOW() - INTERVAL $1
        ORDER BY occurrence_count DESC
        LIMIT 10
      `, [timeframe]);

      return {
        timeframe,
        total_errors: result.rows.reduce((sum, row) => sum + parseInt(row.type_count), 0),
        unique_errors: result.rows.length,
        error_types: result.rows,
        top_errors: topErrors.rows,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      loggingService.error('Failed to get error statistics', { error });
      return this.getInMemoryStatistics();
    }
  }

  /**
   * Get in-memory error statistics
   */
  getInMemoryStatistics() {
    const errorsByType = new Map();

    for (const [type, patterns] of this.errorPatterns) {
      let totalCount = 0;
      for (const count of patterns.values()) {
        totalCount += count;
      }
      errorsByType.set(type, totalCount);
    }

    const sortedTypes = Array.from(errorsByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const sortedErrors = Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([hash, count]) => {
        const recentError = this.recentErrors.find(e => e.hash === hash);
        return {
          error_hash: hash,
          occurrence_count: count,
          error_type: recentError?.type || 'Unknown',
          error_message: recentError?.message || 'Unknown',
          last_occurrence: recentError?.timestamp || new Date()
        };
      });

    return {
      timeframe: 'current session',
      total_errors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      unique_errors: this.errorCounts.size,
      error_types: sortedTypes.map(([type, count]) => ({
        error_type: type,
        type_count: count
      })),
      top_errors: sortedErrors,
      recent_errors: this.recentErrors.slice(0, 10),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Mark error as resolved
   */
  async markErrorResolved(errorHash, resolvedBy = null) {
    if (!this.config.enableLocalTracking) return false;

    try {
      const result = await query(`
        UPDATE error_tracking
        SET resolved = true, updated_at = NOW()
        WHERE error_hash = $1
      `, [errorHash]);

      if (result.rowCount > 0) {
        loggingService.info('Error marked as resolved', {
          errorHash,
          resolvedBy
        });
        return true;
      }

      return false;
    } catch (error) {
      loggingService.error('Failed to mark error as resolved', { error });
      return false;
    }
  }

  /**
   * Get error details
   */
  async getErrorDetails(errorHash) {
    if (!this.config.enableLocalTracking) return null;

    try {
      const result = await query(`
        SELECT * FROM error_tracking
        WHERE error_hash = $1
      `, [errorHash]);

      return result.rows[0] || null;
    } catch (error) {
      loggingService.error('Failed to get error details', { error });
      return null;
    }
  }

  /**
   * Clean up old error records
   */
  async cleanupOldErrors(daysToKeep = 90) {
    if (!this.config.enableLocalTracking) return 0;

    try {
      const result = await query(`
        DELETE FROM error_tracking
        WHERE last_occurrence < NOW() - INTERVAL $1 DAY
          AND resolved = true
      `, [daysToKeep]);

      loggingService.info('Cleaned up old error records', {
        deletedCount: result.rowCount,
        daysToKeep
      });

      return result.rowCount;
    } catch (error) {
      loggingService.error('Failed to cleanup old errors', { error });
      return 0;
    }
  }

  /**
   * Sentry before send hook
   */
  beforeSendToSentry(event) {
    // Filter out certain errors or add custom logic
    if (event.exception) {
      const error = event.exception.values[0];

      // Skip certain error types
      if (error.type === 'ValidationError' || error.type === 'AuthenticationError') {
        return null;
      }

      // Add custom fingerprinting
      const fingerprint = this.generateErrorHash(
        { name: error.type, message: error.value, stack: error.stacktrace?.frames?.[0]?.filename },
        { requestPath: event.request?.url }
      );
      event.fingerprint = [fingerprint];
    }

    return event;
  }

  /**
   * Sentry breadcrumb filter
   */
  beforeBreadcrumb(breadcrumb) {
    // Filter out noisy breadcrumbs
    if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/health')) {
      return null;
    }

    return breadcrumb;
  }

  /**
   * Express middleware for error tracking
   */
  middleware() {
    return (error, req, res, next) => {
      const context = this.extractErrorContext(req);
      this.trackError(error, context);
      next(error);
    };
  }

  /**
   * Get service health
   */
  getHealth() {
    return {
      initialized: this.isInitialized,
      sentry: {
        enabled: this.config.enableSentry,
        configured: !!this.config.sentryDsn
      },
      localTracking: {
        enabled: this.config.enableLocalTracking
      },
      inMemoryStats: {
        totalErrorTypes: this.errorPatterns.size,
        recentErrorCount: this.recentErrors.length,
        uniqueErrors: this.errorCounts.size
      }
    };
  }
}

// Create singleton instance
const errorTrackingService = new ErrorTrackingService();

module.exports = errorTrackingService;