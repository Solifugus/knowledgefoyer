/**
 * SPA + API Integration Tests
 *
 * Tests the frontend Single Page Application (SPA) integration with backend APIs
 * using browser automation to test real user interactions with actual server responses.
 */

const puppeteer = require('puppeteer');
const request = require('supertest');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Import the actual app
const createApp = require('../../../src/app');

describe('SPA + API Integration Tests', () => {
  let browser;
  let page;
  let app;
  let server;
  let dbPool;
  let testUser;
  let authToken;
  let serverPort;

  // Test database configuration
  const TEST_DB_CONFIG = {
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || '',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: process.env.TEST_DB_PORT || 5432,
    database: process.env.TEST_DATABASE || 'knowledge_foyer_test'
  };

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-spa-integration-secret';
    process.env.DATABASE_URL = `postgresql://${TEST_DB_CONFIG.user}:${TEST_DB_CONFIG.password}@${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}/${TEST_DB_CONFIG.database}`;

    console.log('🌐 Setting up SPA + API integration test environment...');

    // Initialize database pool
    dbPool = new Pool(TEST_DB_CONFIG);

    // Test database connection
    try {
      const client = await dbPool.connect();
      console.log('✅ Connected to test database for SPA tests');
      client.release();
    } catch (error) {
      console.error('❌ Failed to connect to test database for SPA tests:', error);
      throw new Error('Test database connection failed for SPA tests');
    }

    // Start the Express server
    app = createApp;
    serverPort = 3003; // Use unique port for SPA tests
    server = app.listen(serverPort);
    console.log(`✅ Test server started on port ${serverPort}`);

    // Launch browser for testing
    browser = await puppeteer.launch({
      headless: process.env.HEADLESS !== 'false', // Set HEADLESS=false to see browser
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 720 }
    });

    page = await browser.newPage();

    // Enable console logging from the page
    page.on('console', (msg) => {
      if (process.env.DEBUG_BROWSER === 'true') {
        console.log(`🌐 Browser console: ${msg.text()}`);
      }
    });

    // Enable request/response logging
    if (process.env.DEBUG_NETWORK === 'true') {
      page.on('request', request => {
        console.log(`🌐 Request: ${request.method()} ${request.url()}`);
      });

      page.on('response', response => {
        console.log(`🌐 Response: ${response.status()} ${response.url()}`);
      });
    }

    console.log('✅ Browser launched for SPA testing');
  });

  beforeEach(async () => {
    // Clean up database before each test
    await cleanDatabase();

    // Create a test user
    testUser = await createTestUser();

    // Generate authentication token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log(`🧪 SPA Test setup: Created user ${testUser.username}`);

    // Navigate to the SPA
    await page.goto(`http://localhost:${serverPort}`, {
      waitUntil: 'networkidle0',
      timeout: 10000
    });
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanDatabase();

    // Clear browser state
    if (page) {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }
  });

  afterAll(async () => {
    // Close browser
    if (browser) {
      await browser.close();
      console.log('🔌 Closed test browser');
    }

    // Close server
    if (server) {
      await new Promise(resolve => server.close(resolve));
      console.log('🔌 Closed test server');
    }

    // Close database connections
    if (dbPool) {
      await dbPool.end();
      console.log('🔌 Closed SPA test database connection');
    }
  });

  // Utility functions
  async function cleanDatabase() {
    const queries = [
      'DELETE FROM article_feedback',
      'DELETE FROM article_versions',
      'DELETE FROM articles',
      'DELETE FROM users WHERE username LIKE \'spa_%\'',
      'DELETE FROM email_verification_tokens'
    ];

    for (const query of queries) {
      try {
        await dbPool.query(query);
      } catch (error) {
        if (!error.message.includes('does not exist')) {
          console.warn('SPA Database cleanup warning:', error.message);
        }
      }
    }
  }

  async function createTestUser(userData = {}) {
    const defaultUser = {
      id: uuidv4(),
      username: `spa_test_user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      email: `spa_test_${Date.now()}@example.com`,
      password: 'password123',
      display_name: 'SPA Test User',
      is_active: true,
      email_verified: true
    };

    const user = { ...defaultUser, ...userData };
    user.password_hash = await bcrypt.hash(user.password, 10);

    const result = await dbPool.query(`
      INSERT INTO users (id, username, email, password_hash, display_name, is_active, email_verified, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, username, email, display_name, is_active, email_verified, created_at
    `, [user.id, user.username, user.email, user.password_hash, user.display_name, user.is_active, user.email_verified]);

    return { ...result.rows[0], password: user.password };
  }

  // Helper function to login via the UI
  async function loginViaUI() {
    // Wait for SPA to load
    await page.waitForSelector('#login-btn', { timeout: 5000 });

    // Click login button
    await page.click('#login-btn');

    // Wait for login modal
    await page.waitForSelector('#login-form', { timeout: 5000 });

    // Fill in login form
    await page.type('#email', testUser.email);
    await page.type('#password', testUser.password);

    // Submit form
    await page.click('#login-submit');

    // Wait for successful login (user menu appears)
    await page.waitForSelector('#user-menu', { timeout: 10000 });
  }

  describe('SPA Loading and Navigation', () => {
    it('should load the SPA successfully', async () => {
      // Check that the SPA shell loaded
      const title = await page.title();
      expect(title).toBe('Knowledge Foyer - Professional Publishing Platform');

      // Check that the main SPA content is present
      const spaContent = await page.waitForSelector('#spa-content', { timeout: 5000 });
      expect(spaContent).toBeTruthy();

      // Check that core JavaScript loaded
      const spaManager = await page.evaluate(() => {
        return typeof window.spa !== 'undefined';
      });
      expect(spaManager).toBe(true);
    });

    it('should navigate between pages using SPA routing', async () => {
      // Start on home page
      expect(page.url()).toContain('#/');

      // Navigate to about page (if it exists)
      await page.click('a[href="#/"]');
      await page.waitForTimeout(500);

      // URL should update but page shouldn't reload (SPA behavior)
      expect(page.url()).toContain('#/');
    });
  });

  describe('Authentication Integration', () => {
    it('should login successfully through the UI and make authenticated API calls', async () => {
      // Login via UI
      await loginViaUI();

      // Verify user menu is visible
      const userName = await page.$eval('#user-name', el => el.textContent);
      expect(userName).toBe(testUser.display_name);

      // Verify auth token was stored in localStorage
      const token = await page.evaluate(() => {
        return localStorage.getItem('authToken');
      });
      expect(token).toBeTruthy();

      // Navigate to dashboard (authenticated page)
      await page.click('a[href="#/dashboard"]');
      await page.waitForTimeout(1000);

      // Should be able to access dashboard
      expect(page.url()).toContain('#/dashboard');

      // Dashboard should load user's data
      const dashboardContent = await page.waitForSelector('.dashboard-content', { timeout: 5000 });
      expect(dashboardContent).toBeTruthy();
    });

    it('should handle login errors gracefully', async () => {
      // Click login button
      await page.click('#login-btn');
      await page.waitForSelector('#login-form');

      // Enter invalid credentials
      await page.type('#email', 'invalid@example.com');
      await page.type('#password', 'wrongpassword');

      // Submit form
      await page.click('#login-submit');

      // Should show error message
      const errorMessage = await page.waitForSelector('.error-message', { timeout: 5000 });
      const errorText = await errorMessage.evaluate(el => el.textContent);
      expect(errorText).toContain('Invalid credentials');
    });

    it('should logout successfully and clear authentication state', async () => {
      // Login first
      await loginViaUI();

      // Click logout button
      await page.click('#logout-btn');

      // Should return to logged out state
      await page.waitForSelector('#login-btn', { timeout: 5000 });

      // Auth token should be cleared
      const token = await page.evaluate(() => {
        return localStorage.getItem('authToken');
      });
      expect(token).toBeNull();

      // User menu should be hidden
      const userMenu = await page.$('#user-menu');
      if (userMenu) {
        const isVisible = await userMenu.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(false);
      }
    });
  });

  describe('Article Management Integration', () => {
    beforeEach(async () => {
      await loginViaUI();
    });

    it('should create a new article through the SPA', async () => {
      // Navigate to create article page
      await page.click('a[href="#/create"]');
      await page.waitForTimeout(1000);

      // Wait for article editor to load
      await page.waitForSelector('#article-editor', { timeout: 5000 });

      // Fill in article form
      await page.type('#article-title', 'SPA Integration Test Article');
      await page.type('#article-summary', 'This article was created through SPA integration testing.');

      // Fill in content editor
      await page.type('#article-content', 'This is the content of my integration test article. It contains comprehensive information about testing SPA integration with backend APIs.');

      // Submit form
      await page.click('#save-article-btn');

      // Wait for success notification
      const successMessage = await page.waitForSelector('.toast.success', { timeout: 10000 });
      expect(successMessage).toBeTruthy();

      // Verify article was created in database
      const dbResult = await dbPool.query(
        'SELECT * FROM articles WHERE user_id = $1 AND title = $2',
        [testUser.id, 'SPA Integration Test Article']
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].title).toBe('SPA Integration Test Article');
      expect(dbResult.rows[0].status).toBe('draft');
    });

    it('should load and display existing articles', async () => {
      // First create an article in the database
      const articleId = uuidv4();
      await dbPool.query(`
        INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        articleId,
        testUser.id,
        'Existing Article for SPA Test',
        'existing-article-spa-test',
        'This article exists in the database and should be loaded by the SPA.',
        'Existing article summary',
        'published',
        'public',
        1
      ]);

      // Navigate to dashboard
      await page.click('a[href="#/dashboard"]');
      await page.waitForTimeout(1000);

      // Wait for dashboard to load articles
      await page.waitForSelector('.article-list', { timeout: 5000 });

      // Check that the article appears
      const articleTitles = await page.$$eval('.article-item .article-title',
        elements => elements.map(el => el.textContent)
      );

      expect(articleTitles).toContain('Existing Article for SPA Test');
    });

    it('should update an article through the SPA', async () => {
      // Create an article first
      const articleId = uuidv4();
      await dbPool.query(`
        INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        articleId,
        testUser.id,
        'Article to Update',
        'article-to-update',
        'Original content.',
        'Original summary',
        'draft',
        'public',
        1
      ]);

      // Navigate to edit the article
      await page.goto(`http://localhost:${serverPort}#/edit/${articleId}`);
      await page.waitForTimeout(1000);

      // Wait for editor to load with existing content
      await page.waitForSelector('#article-editor', { timeout: 5000 });

      // Update the title
      await page.evaluate(() => {
        document.querySelector('#article-title').value = '';
      });
      await page.type('#article-title', 'Updated Article Title');

      // Update the content
      await page.evaluate(() => {
        document.querySelector('#article-content').value = '';
      });
      await page.type('#article-content', 'This is the updated content with more comprehensive information for SPA integration testing.');

      // Save changes
      await page.click('#save-article-btn');

      // Wait for success notification
      await page.waitForSelector('.toast.success', { timeout: 10000 });

      // Verify changes in database
      const dbResult = await dbPool.query(
        'SELECT title, content, version FROM articles WHERE id = $1',
        [articleId]
      );

      expect(dbResult.rows[0].title).toBe('Updated Article Title');
      expect(dbResult.rows[0].content).toContain('updated content');
      expect(dbResult.rows[0].version).toBe(2);
    });
  });

  describe('Search Integration', () => {
    beforeEach(async () => {
      // Create some test articles for searching
      await dbPool.query(`
        INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
        VALUES
          ($1, $2, 'JavaScript Fundamentals', 'js-fundamentals', 'Learn about JavaScript basics and concepts.', 'JS basics', 'published', 'public', 1, NOW(), NOW()),
          ($2, $2, 'React Best Practices', 'react-best-practices', 'Best practices for building React applications.', 'React tips', 'published', 'public', 1, NOW(), NOW()),
          ($3, $2, 'Database Design Patterns', 'db-design-patterns', 'Common patterns for database design and optimization.', 'DB patterns', 'published', 'public', 1, NOW(), NOW())
      `, [uuidv4(), uuidv4(), uuidv4(), testUser.id]);
    });

    it('should perform search through the SPA interface', async () => {
      // Navigate to search page
      await page.goto(`http://localhost:${serverPort}#/search`);
      await page.waitForTimeout(1000);

      // Wait for search interface
      await page.waitForSelector('#search-input', { timeout: 5000 });

      // Perform search
      await page.type('#search-input', 'JavaScript');
      await page.click('#search-button');

      // Wait for search results
      await page.waitForSelector('.search-results', { timeout: 5000 });

      // Check that relevant results appear
      const resultTitles = await page.$$eval('.search-result .result-title',
        elements => elements.map(el => el.textContent)
      );

      expect(resultTitles).toContain('JavaScript Fundamentals');
      expect(resultTitles).not.toContain('Database Design Patterns');
    });

    it('should handle empty search results gracefully', async () => {
      await page.goto(`http://localhost:${serverPort}#/search`);
      await page.waitForTimeout(1000);

      await page.waitForSelector('#search-input', { timeout: 5000 });

      // Search for something that doesn't exist
      await page.type('#search-input', 'nonexistentarticleterm');
      await page.click('#search-button');

      // Wait for empty results message
      const emptyMessage = await page.waitForSelector('.no-results-message', { timeout: 5000 });
      expect(emptyMessage).toBeTruthy();

      const messageText = await emptyMessage.evaluate(el => el.textContent);
      expect(messageText).toContain('No articles found');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle API errors gracefully in the UI', async () => {
      await loginViaUI();

      // Try to access a non-existent article
      await page.goto(`http://localhost:${serverPort}#/article/00000000-0000-0000-0000-000000000000`);
      await page.waitForTimeout(2000);

      // Should show 404 error page or message
      const errorContent = await page.$('.error-page, .not-found-message');
      expect(errorContent).toBeTruthy();
    });

    it('should handle network errors gracefully', async () => {
      // This test simulates network issues
      // In a real scenario, you might disable network or use network throttling

      await page.setOfflineMode(true);

      // Try to perform an action that requires network
      await page.click('#login-btn');
      await page.waitForSelector('#login-form');

      await page.type('#email', testUser.email);
      await page.type('#password', testUser.password);
      await page.click('#login-submit');

      // Should show network error message
      const errorMessage = await page.waitForSelector('.error-message, .network-error', { timeout: 10000 });
      expect(errorMessage).toBeTruthy();

      // Re-enable network
      await page.setOfflineMode(false);
    });
  });

  describe('Performance Integration', () => {
    it('should load pages within performance budgets', async () => {
      const startTime = Date.now();

      // Navigate to dashboard (data-heavy page)
      await loginViaUI();
      await page.click('a[href="#/dashboard"]');
      await page.waitForSelector('.dashboard-content', { timeout: 10000 });

      const loadTime = Date.now() - startTime;

      // Should load within 5 seconds (adjust based on your requirements)
      expect(loadTime).toBeLessThan(5000);

      console.log(`✅ Dashboard loaded in ${loadTime}ms`);
    });

    it('should handle multiple rapid API calls efficiently', async () => {
      await loginViaUI();

      const startTime = Date.now();

      // Rapidly navigate between pages to trigger multiple API calls
      await page.click('a[href="#/dashboard"]');
      await page.waitForTimeout(200);

      await page.click('a[href="#/create"]');
      await page.waitForTimeout(200);

      await page.click('a[href="#/dashboard"]');
      await page.waitForTimeout(200);

      await page.waitForSelector('.dashboard-content', { timeout: 5000 });

      const totalTime = Date.now() - startTime;

      // Should handle rapid navigation efficiently
      expect(totalTime).toBeLessThan(3000);

      console.log(`✅ Rapid navigation completed in ${totalTime}ms`);
    });
  });
});

// Note: This test file requires additional dependencies:
// npm install --save-dev puppeteer
//
// To run these tests:
// npm test tests/integration/frontend/spa-api-integration.test.js
//
// For debugging (visible browser):
// HEADLESS=false npm test tests/integration/frontend/spa-api-integration.test.js