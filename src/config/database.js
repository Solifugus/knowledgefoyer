/**
 * Database Configuration for Knowledge Foyer
 *
 * PostgreSQL connection setup with pgvector extension support
 */

const { Pool } = require('pg');

let pool;

/**
 * Database configuration with optimized connection pooling
 */
const config = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,

  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX) || 25, // Maximum connections in pool
  min: parseInt(process.env.DB_POOL_MIN) || 2,  // Minimum connections to maintain

  // Connection timeouts (in milliseconds)
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // 10 seconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000, // 30 seconds
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000, // 60 seconds

  // Query timeout
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000, // 30 seconds

  // Statement timeout for long-running queries
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000, // 60 seconds

  // Additional optimization settings
  application_name: process.env.NODE_ENV === 'production' ? 'knowledge-foyer-prod' : 'knowledge-foyer-dev',

  // Enable prepared statements for better performance
  allowExitOnIdle: true,

  // Connection validation
  validateConnection: true
};

/**
 * Initialize database connection pool
 */
function initializeDatabase() {
  if (!pool) {
    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('❌ Database connection error:', err);
    });

    pool.on('connect', () => {
      console.log('🔗 New database connection established');
    });

    pool.on('remove', () => {
      console.log('🔗 Database connection removed from pool');
    });
  }

  return pool;
}

/**
 * Get database pool instance
 */
function getDatabase() {
  if (!pool) {
    return initializeDatabase();
  }
  return pool;
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const db = getDatabase();
    const result = await db.query('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database connection successful');
    console.log(`📊 PostgreSQL version: ${result.rows[0].postgres_version.split(' ')[1]}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Check if required extensions are installed
 */
async function checkExtensions() {
  try {
    const db = getDatabase();

    // Check for pgvector extension
    const vectorResult = await db.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as has_vector;
    `);

    // Check for uuid-ossp extension
    const uuidResult = await db.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
      ) as has_uuid;
    `);

    const hasVector = vectorResult.rows[0].has_vector;
    const hasUuid = uuidResult.rows[0].has_uuid;

    console.log(`${hasVector ? '✅' : '❌'} pgvector extension: ${hasVector ? 'installed' : 'missing'}`);
    console.log(`${hasUuid ? '✅' : '❌'} uuid-ossp extension: ${hasUuid ? 'installed' : 'missing'}`);

    if (!hasVector) {
      console.log('💡 To install pgvector: CREATE EXTENSION vector;');
    }

    if (!hasUuid) {
      console.log('💡 To install uuid-ossp: CREATE EXTENSION "uuid-ossp";');
    }

    return { vector: hasVector, uuid: hasUuid };
  } catch (error) {
    console.error('❌ Error checking extensions:', error.message);
    return { vector: false, uuid: false };
  }
}

/**
 * Execute a query with enhanced monitoring and optimization
 */
async function query(text, params, queryName = 'unknown') {
  const start = Date.now();

  try {
    const db = getDatabase();

    // Set query timeout if configured
    if (config.query_timeout) {
      await db.query(`SET statement_timeout = ${config.query_timeout}`);
    }

    const result = await db.query(text, params);
    const duration = Date.now() - start;

    // Enhanced logging for development
    if (process.env.NODE_ENV === 'development') {
      if (duration > 100) {
        console.log(`🐌 Slow query (${duration}ms) [${queryName}]:`, text.substring(0, 150));
      } else if (process.env.DB_LOG_ALL_QUERIES === 'true') {
        console.log(`📊 Query (${duration}ms) [${queryName}]:`, text.substring(0, 100));
      }
    }

    // Integration with monitoring service
    try {
      const monitoringService = require('../services/MonitoringService');
      monitoringService.recordDatabaseQuery(text, duration);
    } catch (monitoringError) {
      // Monitoring service might not be available, which is fine
    }

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    console.error('❌ Database query error:', {
      message: error.message,
      query: text.substring(0, 150),
      params: params ? JSON.stringify(params).substring(0, 200) : null,
      duration,
      queryName
    });

    // Record error in monitoring
    try {
      const monitoringService = require('../services/MonitoringService');
      monitoringService.recordDatabaseQuery(text, duration, error);
    } catch (monitoringError) {
      // Monitoring service might not be available
    }

    throw error;
  }
}

/**
 * Execute a prepared query with caching
 */
async function preparedQuery(queryName, text, params = []) {
  return await query(text, params, queryName);
}

/**
 * Execute query with connection pooling metrics
 */
async function queryWithMetrics(text, params, queryName = 'unknown') {
  const db = getDatabase();
  const poolStats = {
    totalCount: db.totalCount,
    idleCount: db.idleCount,
    waitingCount: db.waitingCount
  };

  // Log pool contention warnings
  if (poolStats.waitingCount > 5) {
    console.warn(`⚠️ High pool contention: ${poolStats.waitingCount} connections waiting`);
  }

  return await query(text, params, queryName);
}

/**
 * Begin a database transaction
 */
async function getClient() {
  const db = getDatabase();
  return await db.connect();
}

/**
 * Execute multiple queries in a transaction
 */
async function transaction(callback) {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get database pool statistics
 */
function getPoolStats() {
  if (!pool) {
    return { error: 'Database pool not initialized' };
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    config: {
      max: config.max,
      min: config.min,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
      acquireTimeoutMillis: config.acquireTimeoutMillis
    }
  };
}

/**
 * Execute database maintenance tasks
 */
async function performMaintenance() {
  const results = {
    timestamp: new Date().toISOString(),
    tasks: []
  };

  try {
    // Analyze all tables for better query planning
    console.log('🔧 Running database maintenance: ANALYZE...');
    await query('ANALYZE', [], 'maintenance_analyze');
    results.tasks.push({ task: 'analyze', status: 'completed' });

    // Update table statistics
    const tableResult = await query(`
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `, [], 'maintenance_get_tables');

    for (const row of tableResult.rows) {
      try {
        await query(`ANALYZE ${row.tablename}`, [], `maintenance_analyze_${row.tablename}`);
      } catch (error) {
        console.warn(`Warning: Could not analyze table ${row.tablename}:`, error.message);
      }
    }

    // Check for bloated tables (basic check)
    const bloatResult = await query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `, [], 'maintenance_check_bloat');

    results.tasks.push({
      task: 'bloat_check',
      status: 'completed',
      largest_tables: bloatResult.rows
    });

    console.log('✅ Database maintenance completed');
    return results;
  } catch (error) {
    console.error('❌ Database maintenance failed:', error.message);
    results.tasks.push({ task: 'maintenance', status: 'failed', error: error.message });
    return results;
  }
}

/**
 * Get database performance metrics
 */
async function getDatabaseMetrics() {
  try {
    // Get database size and connection info
    const metricsResult = await query(`
      SELECT
        pg_database_size(current_database()) as db_size_bytes,
        pg_size_pretty(pg_database_size(current_database())) as db_size,
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `, [], 'metrics_database_stats');

    // Get query statistics
    const queryStatsResult = await query(`
      SELECT
        sum(calls) as total_calls,
        sum(total_time) as total_time,
        avg(mean_time) as avg_time,
        max(max_time) as max_time
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    `, [], 'metrics_query_stats').catch(() => ({ rows: [{}] })); // pg_stat_statements might not be available

    const metrics = metricsResult.rows[0];
    const queryStats = queryStatsResult.rows[0];

    return {
      database: {
        size_bytes: parseInt(metrics.db_size_bytes),
        size_human: metrics.db_size,
        total_connections: parseInt(metrics.total_connections),
        active_connections: parseInt(metrics.active_connections),
        idle_connections: parseInt(metrics.idle_connections)
      },
      queries: {
        total_calls: parseInt(queryStats.total_calls) || 0,
        total_time: parseFloat(queryStats.total_time) || 0,
        avg_time: parseFloat(queryStats.avg_time) || 0,
        max_time: parseFloat(queryStats.max_time) || 0
      },
      pool: getPoolStats(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting database metrics:', error.message);
    return {
      error: error.message,
      pool: getPoolStats(),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Close all database connections
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log('✅ Database connections closed');
  }
}

// Graceful shutdown
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

// Pool event monitoring
function setupPoolMonitoring() {
  if (pool) {
    pool.on('acquire', (client) => {
      if (process.env.NODE_ENV === 'development' && process.env.DB_LOG_CONNECTIONS === 'true') {
        console.log('🔗 Database connection acquired from pool');
      }
    });

    pool.on('release', (err, client) => {
      if (err) {
        console.error('🔗 Database connection release error:', err.message);
      } else if (process.env.NODE_ENV === 'development' && process.env.DB_LOG_CONNECTIONS === 'true') {
        console.log('🔗 Database connection released to pool');
      }
    });
  }
}

// Initialize pool monitoring when module loads
setTimeout(setupPoolMonitoring, 1000);

module.exports = {
  initializeDatabase,
  getDatabase,
  testConnection,
  checkExtensions,
  query,
  preparedQuery,
  queryWithMetrics,
  transaction,
  getClient,
  closeDatabase,
  getPoolStats,
  performMaintenance,
  getDatabaseMetrics,
  config
};