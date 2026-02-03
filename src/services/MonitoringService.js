/**
 * Monitoring Service for Knowledge Foyer
 *
 * Comprehensive performance monitoring, health checks, and metrics collection
 */

const os = require('os');
const { query } = require('../config/database');
const cacheService = require('./CacheService');

class MonitoringService {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        error: 0,
        byEndpoint: {},
        responseTime: []
      },
      database: {
        connectionCount: 0,
        queryCount: 0,
        slowQueries: [],
        errors: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        errors: 0
      },
      system: {
        startTime: Date.now(),
        lastCheck: null,
        memoryUsage: [],
        cpuUsage: []
      },
      ai: {
        requests: 0,
        tokens: 0,
        errors: 0,
        costs: 0
      }
    };

    this.alerts = [];
    this.thresholds = {
      responseTime: 1000,     // 1 second
      errorRate: 0.05,        // 5%
      memoryUsage: 0.8,       // 80% of available memory
      cpuUsage: 0.8,          // 80%
      dbConnections: 80,      // 80% of max connections
      cacheHitRate: 0.7       // 70% minimum hit rate
    };

    this.isMonitoring = false;
    this.monitoringInterval = null;

    // Start monitoring on initialization
    this.startMonitoring();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    console.log('📊 Starting performance monitoring...');

    // Collect system metrics every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    console.log('📊 Performance monitoring stopped');
  }

  /**
   * Record API request metrics
   */
  recordRequest(method, endpoint, statusCode, responseTime, errorMessage = null) {
    this.metrics.requests.total++;

    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.error++;
    }

    // Track by endpoint
    const endpointKey = `${method} ${endpoint}`;
    if (!this.metrics.requests.byEndpoint[endpointKey]) {
      this.metrics.requests.byEndpoint[endpointKey] = {
        count: 0,
        totalTime: 0,
        errors: 0
      };
    }

    this.metrics.requests.byEndpoint[endpointKey].count++;
    this.metrics.requests.byEndpoint[endpointKey].totalTime += responseTime;

    if (statusCode >= 400) {
      this.metrics.requests.byEndpoint[endpointKey].errors++;
    }

    // Store response times (keep last 1000)
    this.metrics.requests.responseTime.push({
      timestamp: Date.now(),
      time: responseTime,
      endpoint: endpointKey,
      statusCode
    });

    if (this.metrics.requests.responseTime.length > 1000) {
      this.metrics.requests.responseTime = this.metrics.requests.responseTime.slice(-1000);
    }

    // Check for alerts
    this.checkPerformanceAlerts(responseTime, statusCode, endpointKey);
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(query, duration, error = null) {
    this.metrics.database.queryCount++;

    if (error) {
      this.metrics.database.errors++;
      console.error('🗄️ Database query error:', error.message);
    }

    // Track slow queries
    if (duration > 1000) { // Queries taking more than 1 second
      this.metrics.database.slowQueries.push({
        query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
        duration,
        timestamp: Date.now(),
        error: error ? error.message : null
      });

      // Keep only last 50 slow queries
      if (this.metrics.database.slowQueries.length > 50) {
        this.metrics.database.slowQueries = this.metrics.database.slowQueries.slice(-50);
      }
    }
  }

  /**
   * Record cache operation metrics
   */
  recordCacheOperation(operation, hit = false, error = null) {
    if (error) {
      this.metrics.cache.errors++;
    } else if (operation === 'get') {
      if (hit) {
        this.metrics.cache.hits++;
      } else {
        this.metrics.cache.misses++;
      }
    }
  }

  /**
   * Record AI service metrics
   */
  recordAIOperation(tokens, cost, error = null) {
    this.metrics.ai.requests++;

    if (error) {
      this.metrics.ai.errors++;
    } else {
      this.metrics.ai.tokens += tokens;
      this.metrics.ai.costs += cost;
    }
  }

  /**
   * Collect system performance metrics
   */
  collectSystemMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      // Memory metrics
      this.metrics.system.memoryUsage.push({
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        systemUsed: usedMemory,
        systemTotal: totalMemory,
        systemUsagePercent: (usedMemory / totalMemory) * 100
      });

      // Keep only last 100 measurements
      if (this.metrics.system.memoryUsage.length > 100) {
        this.metrics.system.memoryUsage = this.metrics.system.memoryUsage.slice(-100);
      }

      // CPU metrics (simplified)
      const loadAverage = os.loadavg();
      this.metrics.system.cpuUsage.push({
        timestamp: Date.now(),
        loadAvg1: loadAverage[0],
        loadAvg5: loadAverage[1],
        loadAvg15: loadAverage[2],
        cpuCount: os.cpus().length
      });

      // Keep only last 100 measurements
      if (this.metrics.system.cpuUsage.length > 100) {
        this.metrics.system.cpuUsage = this.metrics.system.cpuUsage.slice(-100);
      }

      this.metrics.system.lastCheck = Date.now();

      // Check system alerts
      this.checkSystemAlerts(usedMemory / totalMemory, loadAverage[0] / os.cpus().length);
    } catch (error) {
      console.error('📊 Error collecting system metrics:', error.message);
    }
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts(responseTime, statusCode, endpoint) {
    const now = Date.now();

    // Slow response time alert
    if (responseTime > this.thresholds.responseTime) {
      this.addAlert('slow_response', `Slow response detected: ${responseTime}ms for ${endpoint}`, {
        responseTime,
        endpoint,
        threshold: this.thresholds.responseTime
      });
    }

    // Error rate alert (check last 100 requests for this endpoint)
    if (this.metrics.requests.byEndpoint[endpoint]) {
      const endpointMetrics = this.metrics.requests.byEndpoint[endpoint];
      const errorRate = endpointMetrics.errors / endpointMetrics.count;

      if (errorRate > this.thresholds.errorRate && endpointMetrics.count > 10) {
        this.addAlert('high_error_rate', `High error rate detected: ${(errorRate * 100).toFixed(1)}% for ${endpoint}`, {
          errorRate,
          endpoint,
          threshold: this.thresholds.errorRate
        });
      }
    }
  }

  /**
   * Check for system resource alerts
   */
  checkSystemAlerts(memoryUsageRatio, cpuUsageRatio) {
    // Memory usage alert
    if (memoryUsageRatio > this.thresholds.memoryUsage) {
      this.addAlert('high_memory_usage', `High memory usage: ${(memoryUsageRatio * 100).toFixed(1)}%`, {
        usage: memoryUsageRatio,
        threshold: this.thresholds.memoryUsage
      });
    }

    // CPU usage alert
    if (cpuUsageRatio > this.thresholds.cpuUsage) {
      this.addAlert('high_cpu_usage', `High CPU usage: ${(cpuUsageRatio * 100).toFixed(1)}%`, {
        usage: cpuUsageRatio,
        threshold: this.thresholds.cpuUsage
      });
    }
  }

  /**
   * Add alert to the system
   */
  addAlert(type, message, data = {}) {
    const alert = {
      id: Date.now() + Math.random(),
      type,
      message,
      data,
      timestamp: Date.now(),
      resolved: false
    };

    this.alerts.push(alert);
    console.warn(`🚨 ALERT [${type}]: ${message}`);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Comprehensive health check
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.metrics.system.startTime,
      services: {},
      metrics: {},
      alerts: this.alerts.filter(a => !a.resolved).length
    };

    try {
      // Database health check
      const dbStart = Date.now();
      await query('SELECT 1');
      const dbTime = Date.now() - dbStart;

      health.services.database = {
        status: 'healthy',
        responseTime: dbTime,
        connections: this.metrics.database.connectionCount
      };
    } catch (error) {
      health.services.database = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }

    // Cache health check
    try {
      const cacheHealth = await cacheService.healthCheck();
      health.services.cache = cacheHealth;

      if (!cacheHealth.healthy) {
        health.status = health.status === 'healthy' ? 'degraded' : 'unhealthy';
      }
    } catch (error) {
      health.services.cache = {
        healthy: false,
        message: error.message
      };
      health.status = health.status === 'healthy' ? 'degraded' : 'unhealthy';
    }

    // System metrics
    const latestMemory = this.metrics.system.memoryUsage.slice(-1)[0];
    const latestCpu = this.metrics.system.cpuUsage.slice(-1)[0];

    if (latestMemory && latestCpu) {
      health.metrics.system = {
        memory: {
          heapUsed: Math.round(latestMemory.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(latestMemory.heapTotal / 1024 / 1024),
          systemUsagePercent: Math.round(latestMemory.systemUsagePercent * 100) / 100
        },
        cpu: {
          loadAvg1: Math.round(latestCpu.loadAvg1 * 100) / 100,
          loadAvg5: Math.round(latestCpu.loadAvg5 * 100) / 100,
          cpuCount: latestCpu.cpuCount
        }
      };

      // Check system resource health
      if (latestMemory.systemUsagePercent > 85 || latestCpu.loadAvg1 / latestCpu.cpuCount > 0.9) {
        health.status = health.status === 'healthy' ? 'degraded' : health.status;
      }
    }

    // Request metrics
    health.metrics.requests = {
      total: this.metrics.requests.total,
      success: this.metrics.requests.success,
      error: this.metrics.requests.error,
      errorRate: this.metrics.requests.total > 0 ?
        ((this.metrics.requests.error / this.metrics.requests.total) * 100).toFixed(2) + '%' : '0%'
    };

    // Cache metrics
    const totalCacheOps = this.metrics.cache.hits + this.metrics.cache.misses;
    health.metrics.cache = {
      hits: this.metrics.cache.hits,
      misses: this.metrics.cache.misses,
      errors: this.metrics.cache.errors,
      hitRate: totalCacheOps > 0 ?
        ((this.metrics.cache.hits / totalCacheOps) * 100).toFixed(2) + '%' : 'N/A'
    };

    // Database metrics
    health.metrics.database = {
      totalQueries: this.metrics.database.queryCount,
      slowQueries: this.metrics.database.slowQueries.length,
      errors: this.metrics.database.errors
    };

    // AI metrics
    health.metrics.ai = {
      requests: this.metrics.ai.requests,
      tokens: this.metrics.ai.tokens,
      errors: this.metrics.ai.errors,
      totalCost: this.metrics.ai.costs.toFixed(4)
    };

    return health;
  }

  /**
   * Get detailed performance metrics
   */
  getMetrics() {
    return {
      requests: {
        ...this.metrics.requests,
        avgResponseTime: this.calculateAverageResponseTime(),
        slowestEndpoints: this.getSlowestEndpoints()
      },
      database: {
        ...this.metrics.database,
        avgQueryTime: this.calculateAverageQueryTime()
      },
      cache: {
        ...this.metrics.cache,
        hitRate: this.calculateCacheHitRate()
      },
      system: {
        ...this.metrics.system,
        currentMemory: this.getCurrentMemoryUsage(),
        currentCpu: this.getCurrentCpuUsage()
      },
      ai: this.metrics.ai
    };
  }

  /**
   * Get current alerts
   */
  getAlerts(unresolved = false) {
    return unresolved ?
      this.alerts.filter(a => !a.resolved) :
      this.alerts;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
    }
  }

  /**
   * Calculate average response time for recent requests
   */
  calculateAverageResponseTime() {
    const recentRequests = this.metrics.requests.responseTime.slice(-100);
    if (recentRequests.length === 0) return 0;

    const total = recentRequests.reduce((sum, req) => sum + req.time, 0);
    return Math.round(total / recentRequests.length);
  }

  /**
   * Get slowest endpoints
   */
  getSlowestEndpoints() {
    const endpoints = Object.entries(this.metrics.requests.byEndpoint)
      .map(([endpoint, metrics]) => ({
        endpoint,
        avgTime: Math.round(metrics.totalTime / metrics.count),
        requests: metrics.count,
        errors: metrics.errors
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 5);

    return endpoints;
  }

  /**
   * Calculate average database query time
   */
  calculateAverageQueryTime() {
    if (this.metrics.database.slowQueries.length === 0) return 0;

    const total = this.metrics.database.slowQueries.reduce((sum, query) => sum + query.duration, 0);
    return Math.round(total / this.metrics.database.slowQueries.length);
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    return total > 0 ? (this.metrics.cache.hits / total) : 0;
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage() {
    const latest = this.metrics.system.memoryUsage.slice(-1)[0];
    return latest || null;
  }

  /**
   * Get current CPU usage
   */
  getCurrentCpuUsage() {
    const latest = this.metrics.system.cpuUsage.slice(-1)[0];
    return latest || null;
  }

  /**
   * Clean up old metrics data
   */
  cleanupOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    // Clean up old response times
    this.metrics.requests.responseTime = this.metrics.requests.responseTime
      .filter(req => req.timestamp > oneHourAgo);

    // Clean up old slow queries
    this.metrics.database.slowQueries = this.metrics.database.slowQueries
      .filter(query => query.timestamp > oneHourAgo);

    // Clean up old system metrics (keep last hour only)
    this.metrics.system.memoryUsage = this.metrics.system.memoryUsage
      .filter(mem => mem.timestamp > oneHourAgo);

    this.metrics.system.cpuUsage = this.metrics.system.cpuUsage
      .filter(cpu => cpu.timestamp > oneHourAgo);

    // Clean up old resolved alerts
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(alert =>
      !alert.resolved || alert.timestamp > oneDayAgo
    );

    console.log('📊 Cleaned up old monitoring data');
  }

  /**
   * Update monitoring configuration
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('📊 Monitoring thresholds updated:', newThresholds);
  }
}

// Create singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;