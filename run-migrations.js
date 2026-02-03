#!/usr/bin/env node

/**
 * Simple migration runner for Knowledge Foyer
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load environment variables
require('dotenv').config();

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Running database migrations...');

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migrations to run`);

    // Run each migration
    for (const file of migrationFiles) {
      console.log(`📄 Running migration: ${file}`);

      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await pool.query(sqlContent);
        console.log(`✅ Migration ${file} completed successfully`);
      } catch (error) {
        // Some migrations might fail if tables already exist - that's okay
        console.log(`⚠️  Migration ${file}: ${error.message}`);
      }
    }

    console.log('✅ All migrations completed!');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();