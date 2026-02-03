#!/usr/bin/env node

/**
 * Database Migration Runner for Knowledge Foyer
 *
 * Manages database schema migrations with version tracking
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { query, testConnection, checkExtensions } = require('../src/config/database');
const ProgressTracker = require('../src/utils/progress');

const MIGRATIONS_DIR = __dirname;
const progressTracker = new ProgressTracker();

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(file => file.match(/^\d{3}_.*\.sql$/))
    .sort();
}

/**
 * Get current migration version from database
 */
async function getCurrentVersion() {
  try {
    // Check if migrations table exists
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'migrations'
      );
    `);

    if (!result.rows[0].exists) {
      return '000';
    }

    // Get latest migration version
    const versionResult = await query(
      'SELECT version FROM migrations ORDER BY version DESC LIMIT 1'
    );

    return versionResult.rows.length > 0 ? versionResult.rows[0].version : '000';
  } catch (error) {
    console.error('❌ Error checking migration version:', error.message);
    return '000';
  }
}

/**
 * Create migrations tracking table
 */
async function createMigrationsTable() {
  console.log('📋 Creating migrations tracking table...');

  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(3) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  console.log('✅ Migrations table created');
}

/**
 * Run a single migration
 */
async function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');
  const version = filename.substring(0, 3);
  const name = filename.substring(4, filename.length - 4);

  console.log(`📦 Running migration ${version}: ${name}`);

  try {
    // Execute migration SQL
    await query(sql);

    // Record migration in tracking table
    await query(
      'INSERT INTO migrations (version, name) VALUES ($1, $2)',
      [version, name]
    );

    console.log(`✅ Migration ${version} completed successfully`);
    return version;
  } catch (error) {
    console.error(`❌ Migration ${version} failed:`, error.message);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  // Test database connection
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('❌ Cannot connect to database. Please check your DATABASE_URL in .env');
    process.exit(1);
  }

  // Check extensions
  console.log('\n🔧 Checking required PostgreSQL extensions...');
  const extensions = await checkExtensions();

  // Only require uuid-ossp for core functionality
  if (!extensions.uuid) {
    console.log('\n⚠️  Required extension missing. Please run as database superuser:');
    console.log('   CREATE EXTENSION "uuid-ossp";');
    console.log('\nThen run migrations again.');
    process.exit(1);
  }

  // pgvector is optional for AI features (Phase 6)
  if (!extensions.vector) {
    console.log('\n💡 Optional: pgvector extension not found (needed for AI features in Phase 6)');
    console.log('   To install later: CREATE EXTENSION vector;');
  }

  // Ensure migrations table exists
  await createMigrationsTable();

  // Get current version and available migrations
  const currentVersion = await getCurrentVersion();
  const migrationFiles = getMigrationFiles();

  console.log(`📊 Current database version: ${currentVersion}`);
  console.log(`📁 Available migrations: ${migrationFiles.length}\n`);

  // Find pending migrations
  const pendingMigrations = migrationFiles.filter(file => {
    const fileVersion = file.substring(0, 3);
    return fileVersion > currentVersion;
  });

  if (pendingMigrations.length === 0) {
    console.log('✅ Database is up to date!');
    return;
  }

  console.log(`🔄 Found ${pendingMigrations.length} pending migrations:\n`);

  let latestVersion = currentVersion;

  // Run each pending migration
  for (const filename of pendingMigrations) {
    latestVersion = await runMigration(filename);
  }

  // Update progress tracker
  progressTracker.updateMigrationVersion(latestVersion);

  console.log(`\n✅ All migrations completed successfully!`);
  console.log(`📊 Database version: ${currentVersion} → ${latestVersion}`);
}

/**
 * Show migration status
 */
async function showStatus() {
  console.log('📊 Migration Status\n');

  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('❌ Cannot connect to database');
    return;
  }

  const currentVersion = await getCurrentVersion();
  const migrationFiles = getMigrationFiles();

  console.log(`Current database version: ${currentVersion}`);
  console.log(`Available migrations: ${migrationFiles.length}\n`);

  console.log('Migration files:');
  migrationFiles.forEach(file => {
    const version = file.substring(0, 3);
    const name = file.substring(4, file.length - 4);
    const status = version <= currentVersion ? '✅ Applied' : '⏳ Pending';
    console.log(`  ${version}: ${name} - ${status}`);
  });

  const pendingCount = migrationFiles.filter(file => file.substring(0, 3) > currentVersion).length;
  console.log(`\n${pendingCount} pending migrations`);
}

/**
 * Create a new migration file
 */
function createMigration(name) {
  if (!name) {
    console.error('❌ Migration name is required');
    console.log('Usage: node migrate.js create <name>');
    return;
  }

  const migrationFiles = getMigrationFiles();
  const lastVersion = migrationFiles.length > 0 ? migrationFiles[migrationFiles.length - 1].substring(0, 3) : '000';
  const nextVersion = String(parseInt(lastVersion) + 1).padStart(3, '0');

  const filename = `${nextVersion}_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.sql`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const template = `-- Migration ${nextVersion}: ${name}
-- Created: ${new Date().toISOString()}

BEGIN;

-- TODO: Add your migration SQL here

COMMIT;
`;

  fs.writeFileSync(filepath, template);
  console.log(`✅ Created migration: ${filename}`);
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'up':
      case undefined:
        await runMigrations();
        break;

      case 'status':
        await showStatus();
        break;

      case 'create':
        createMigration(process.argv[3]);
        break;

      default:
        console.log('Usage:');
        console.log('  node migrate.js [up]     - Run pending migrations');
        console.log('  node migrate.js status   - Show migration status');
        console.log('  node migrate.js create <name> - Create new migration');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { runMigrations, showStatus, createMigration };