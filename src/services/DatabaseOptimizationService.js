/**
 * Database Optimization Service for Knowledge Foyer
 *
 * Comprehensive database performance optimization, monitoring, and maintenance
 */

const { query, getDatabase, transaction } = require('../config/database');

class DatabaseOptimizationService {
  constructor() {
    this.slowQueryThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000; // 1 second
    this.queryStats = new Map();
    this.connectionStats = {
      totalQueries: 0,
      slowQueries: 0,
      errors: 0,
      averageExecutionTime: 0,
      lastOptimizationRun: null
    };

    this.optimizationTasks = {
      analyzeQueries: this.analyzeQueries.bind(this),
      updateStatistics: this.updateStatistics.bind(this),
      checkIndexes: this.checkIndexes.bind(this),
      cleanupData: this.cleanupData.bind(this),
      optimizeConnections: this.optimizeConnections.bind(this)
    };

    this.isMonitoring = false;
    this.startMonitoring();
  }

  /**
   * Start database performance monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('🔍 Starting database optimization monitoring...');

    // Run optimization tasks periodically
    setInterval(async () => {
      await this.runOptimizationCycle();
    }, 30 * 60 * 1000); // Every 30 minutes

    // Update statistics more frequently
    setInterval(async () => {
      await this.updateConnectionStats();
    }, 60 * 1000); // Every minute
  }

  /**
   * Enhanced query execution with monitoring
   */
  async executeQuery(queryText, params = [], queryName = 'unknown') {
    const startTime = Date.now();
    const queryKey = this.generateQueryKey(queryText, queryName);

    try {
      const result = await query(queryText, params);
      const duration = Date.now() - startTime;

      // Update statistics
      this.updateQueryStats(queryKey, duration, true);
      this.connectionStats.totalQueries++;

      // Track slow queries
      if (duration > this.slowQueryThreshold) {
        this.connectionStats.slowQueries++;
        console.warn(`🐌 Slow query detected (${duration}ms): ${queryName}`, {
          query: queryText.substring(0, 150) + '...',
          duration,
          params: params ? params.length : 0
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateQueryStats(queryKey, duration, false);
      this.connectionStats.errors++;

      console.error(`❌ Database query error in ${queryName}:`, {
        message: error.message,
        query: queryText.substring(0, 150),
        duration
      });

      throw error;
    }
  }

  /**
   * Generate unique key for query tracking
   */
  generateQueryKey(queryText, queryName) {
    // Normalize query by removing parameters and whitespace
    const normalized = queryText
      .replace(/\$\d+/g, '?') // Replace parameter placeholders
      .replace(/\s+/g, ' ')   // Normalize whitespace
      .trim()
      .substring(0, 100);     // Limit length

    return `${queryName}:${normalized}`;
  }

  /**
   * Update query statistics
   */
  updateQueryStats(queryKey, duration, success) {
    if (!this.queryStats.has(queryKey)) {
      this.queryStats.set(queryKey, {
        count: 0,
        totalTime: 0,
        errors: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        lastExecuted: null
      });
    }

    const stats = this.queryStats.get(queryKey);
    stats.count++;
    stats.totalTime += duration;
    stats.avgTime = Math.round(stats.totalTime / stats.count);
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);
    stats.lastExecuted = new Date();

    if (!success) {
      stats.errors++;
    }
  }

  /**
   * Run comprehensive optimization cycle
   */
  async runOptimizationCycle() {
    console.log('🔧 Starting database optimization cycle...');

    const results = {
      timestamp: new Date().toISOString(),
      tasks: {}
    };

    for (const [taskName, taskFunction] of Object.entries(this.optimizationTasks)) {
      try {
        console.log(`🔧 Running ${taskName}...`);
        const result = await taskFunction();
        results.tasks[taskName] = { success: true, result };
      } catch (error) {
        console.error(`❌ Optimization task ${taskName} failed:`, error.message);
        results.tasks[taskName] = { success: false, error: error.message };
      }
    }

    this.connectionStats.lastOptimizationRun = new Date();
    console.log('🔧 Database optimization cycle complete');

    return results;
  }

  /**
   * Analyze query performance patterns
   */
  async analyzeQueries() {
    const analysis = {
      slowestQueries: [],
      mostFrequent: [],
      errorProne: [],
      recommendations: []
    };

    // Sort queries by different metrics
    const queryArray = Array.from(this.queryStats.entries());

    // Slowest queries by average time
    analysis.slowestQueries = queryArray
      .sort((a, b) => b[1].avgTime - a[1].avgTime)
      .slice(0, 10)
      .map(([key, stats]) => ({ query: key, ...stats }));

    // Most frequent queries
    analysis.mostFrequent = queryArray
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, stats]) => ({ query: key, ...stats }));

    // Error-prone queries
    analysis.errorProne = queryArray
      .filter(([, stats]) => stats.errors > 0)
      .sort((a, b) => (b[1].errors / b[1].count) - (a[1].errors / a[1].count))
      .slice(0, 5)
      .map(([key, stats]) => ({
        query: key,
        ...stats,
        errorRate: ((stats.errors / stats.count) * 100).toFixed(2) + '%'
      }));

    // Generate recommendations
    if (analysis.slowestQueries.length > 0 && analysis.slowestQueries[0].avgTime > 1000) {
      analysis.recommendations.push({
        type: 'slow_queries',
        message: 'Consider optimizing slow queries with indexes or query restructuring'
      });
    }

    if (analysis.errorProne.length > 0) {
      analysis.recommendations.push({
        type: 'error_handling',
        message: 'Review error-prone queries for better error handling'
      });
    }

    if (this.connectionStats.slowQueries > this.connectionStats.totalQueries * 0.1) {
      analysis.recommendations.push({
        type: 'performance',
        message: 'High percentage of slow queries detected - consider database optimization'
      });
    }

    return analysis;
  }

  /**
   * Update database table statistics for query planner
   */
  async updateStatistics() {
    try {
      // Update statistics for key tables
      const tables = ['articles', 'users', 'feedback', 'notifications', 'article_versions'];
      const results = [];

      for (const table of tables) {
        try {
          await query(`ANALYZE ${table}`);
          results.push({ table, status: 'updated' });
        } catch (error) {
          results.push({ table, status: 'error', error: error.message });
        }
      }

      // Update global statistics
      await query('ANALYZE');

      return {
        message: 'Database statistics updated',
        tables: results,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to update statistics: ${error.message}`);
    }
  }

  /**
   * Check and recommend database indexes
   */
  async checkIndexes() {
    try {
      // Get current indexes
      const indexResult = await query(`
        SELECT
          schemaname,
          tablename,
          indexname,
          indexdef,
          schemaname || '.' || tablename as full_table_name
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `);

      // Get table sizes
      const sizeResult = await query(`
        SELECT
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `);

      // Get unused indexes (basic check)
      const unusedIndexResult = await query(`
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE idx_tup_read = 0 AND idx_tup_fetch = 0
        ORDER BY schemaname, tablename
      `);

      const analysis = {
        total_indexes: indexResult.rows.length,
        tables_analyzed: sizeResult.rows.length,
        potentially_unused: unusedIndexResult.rows.length,
        indexes: indexResult.rows,
        table_sizes: sizeResult.rows,
        unused_indexes: unusedIndexResult.rows,
        recommendations: []
      };

      // Generate index recommendations
      const largeTables = sizeResult.rows.filter(row => row.size_bytes > 10 * 1024 * 1024); // > 10MB
      if (largeTables.length > 0) {
        analysis.recommendations.push({
          type: 'large_tables',
          message: `Monitor indexes for large tables: ${largeTables.map(t => t.tablename).join(', ')}`,
          tables: largeTables
        });
      }

      if (unusedIndexResult.rows.length > 0) {
        analysis.recommendations.push({
          type: 'unused_indexes',
          message: `Consider dropping unused indexes: ${unusedIndexResult.rows.map(i => i.indexname).join(', ')}`,
          indexes: unusedIndexResult.rows
        });
      }

      return analysis;
    } catch (error) {
      throw new Error(`Failed to check indexes: ${error.message}`);
    }
  }

  /**
   * Cleanup old data to improve performance
   */
  async cleanupData() {
    const cleanupResults = {
      operations: [],
      total_cleaned: 0
    };

    try {
      // Clean up old notifications (older than 90 days)
      const notificationResult = await query(`
        DELETE FROM notifications
        WHERE created_at < NOW() - INTERVAL '90 days'
      `);

      cleanupResults.operations.push({
        table: 'notifications',
        operation: 'delete_old_records',
        affected_rows: notificationResult.rowCount,
        criteria: 'older than 90 days'
      });

      cleanupResults.total_cleaned += notificationResult.rowCount;

      // Clean up old feed items (older than 60 days)
      const feedResult = await query(`
        DELETE FROM feed_items
        WHERE created_at < NOW() - INTERVAL '60 days'
      `);

      cleanupResults.operations.push({
        table: 'feed_items',
        operation: 'delete_old_records',
        affected_rows: feedResult.rowCount,
        criteria: 'older than 60 days'
      });

      cleanupResults.total_cleaned += feedResult.rowCount;

      // Clean up resolved feedback older than 1 year
      const feedbackResult = await query(`
        DELETE FROM feedback
        WHERE status = 'addressed'
          AND updated_at < NOW() - INTERVAL '1 year'
      `);

      cleanupResults.operations.push({
        table: 'feedback',
        operation: 'delete_resolved_feedback',
        affected_rows: feedbackResult.rowCount,
        criteria: 'resolved and older than 1 year'
      });

      cleanupResults.total_cleaned += feedbackResult.rowCount;

      // Vacuum tables after cleanup if significant data was removed
      if (cleanupResults.total_cleaned > 100) {
        await query('VACUUM ANALYZE');
        cleanupResults.operations.push({
          operation: 'vacuum_analyze',
          message: 'Database vacuumed and analyzed after cleanup'
        });
      }

      return cleanupResults;
    } catch (error) {
      throw new Error(`Failed to cleanup data: ${error.message}`);
    }
  }

  /**
   * Optimize connection pool settings
   */
  async optimizeConnections() {
    try {
      const pool = getDatabase();

      // Get current connection stats
      const connectionResult = await query(`
        SELECT
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      const stats = connectionResult.rows[0];

      // Get pool information
      const poolStats = {
        total_count: pool.totalCount,
        idle_count: pool.idleCount,
        waiting_count: pool.waitingCount
      };

      const analysis = {
        database_connections: {
          total: parseInt(stats.total_connections),
          active: parseInt(stats.active_connections),
          idle: parseInt(stats.idle_connections),
          idle_in_transaction: parseInt(stats.idle_in_transaction)
        },
        pool_stats: poolStats,
        recommendations: []
      };

      // Generate recommendations
      if (stats.idle_in_transaction > 0) {
        analysis.recommendations.push({
          type: 'idle_transactions',
          message: `Found ${stats.idle_in_transaction} idle in transaction connections - check for unclosed transactions`
        });
      }

      if (poolStats.waiting_count > 0) {
        analysis.recommendations.push({
          type: 'pool_contention',
          message: `${poolStats.waiting_count} connections waiting for pool - consider increasing pool size`
        });
      }

      const activeRatio = stats.active_connections / stats.total_connections;
      if (activeRatio > 0.8) {
        analysis.recommendations.push({
          type: 'high_utilization',
          message: `High connection utilization (${(activeRatio * 100).toFixed(1)}%) - monitor for performance issues`
        });
      }

      return analysis;
    } catch (error) {
      throw new Error(`Failed to optimize connections: ${error.message}`);
    }
  }

  /**
   * Update connection statistics
   */
  async updateConnectionStats() {
    if (this.connectionStats.totalQueries > 0) {
      // Update average execution time based on recent queries
      let totalTime = 0;
      let queryCount = 0;

      for (const [, stats] of this.queryStats) {
        totalTime += stats.totalTime;
        queryCount += stats.count;
      }

      this.connectionStats.averageExecutionTime = queryCount > 0 ?
        Math.round(totalTime / queryCount) : 0;
    }
  }

  /**
   * Get comprehensive database performance report
   */
  async getPerformanceReport() {
    try {
      const [queryAnalysis, indexAnalysis, connectionAnalysis] = await Promise.all([
        this.analyzeQueries(),
        this.checkIndexes(),
        this.optimizeConnections()
      ]);

      return {
        timestamp: new Date().toISOString(),
        connection_stats: this.connectionStats,
        query_analysis: queryAnalysis,
        index_analysis: indexAnalysis,
        connection_analysis: connectionAnalysis,
        summary: {
          total_queries: this.connectionStats.totalQueries,
          slow_query_rate: this.connectionStats.totalQueries > 0 ?
            ((this.connectionStats.slowQueries / this.connectionStats.totalQueries) * 100).toFixed(2) + '%' : '0%',
          error_rate: this.connectionStats.totalQueries > 0 ?
            ((this.connectionStats.errors / this.connectionStats.totalQueries) * 100).toFixed(2) + '%' : '0%',
          avg_execution_time: this.connectionStats.averageExecutionTime + 'ms',
          last_optimization: this.connectionStats.lastOptimizationRun
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate performance report: ${error.message}`);
    }
  }

  /**
   * Manually trigger optimization cycle
   */
  async triggerOptimization() {
    console.log('🔧 Manually triggering database optimization...');
    return await this.runOptimizationCycle();
  }

  /**
   * Get query statistics
   */
  getQueryStatistics() {
    const queryArray = Array.from(this.queryStats.entries());

    return {
      total_unique_queries: queryArray.length,
      total_executions: this.connectionStats.totalQueries,
      queries: queryArray.map(([key, stats]) => ({
        query: key,
        ...stats,
        error_rate: stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(2) + '%' : '0%'
      }))
    };
  }

  /**
   * Clear query statistics
   */
  clearStatistics() {
    this.queryStats.clear();
    this.connectionStats = {
      totalQueries: 0,
      slowQueries: 0,
      errors: 0,
      averageExecutionTime: 0,
      lastOptimizationRun: null
    };

    console.log('📊 Database optimization statistics cleared');
  }
}

// Create singleton instance
const databaseOptimizationService = new DatabaseOptimizationService();

module.exports = databaseOptimizationService;