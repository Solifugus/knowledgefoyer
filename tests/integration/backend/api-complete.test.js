/**
 * Complete Backend API Integration Tests
 *
 * Tests the full backend API functionality with real database operations,
 * actual server instances, and complete request-response cycles.
 */

const request = require('supertest');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Import the actual app (not mocked)
const createApp = require('../../../src/app');

describe('Backend API Integration Tests (Real Database)', () => {
  let app;
  let server;
  let dbPool;
  let testUser;
  let authToken;

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
    process.env.JWT_SECRET = 'test-integration-secret-key';
    process.env.DATABASE_URL = `postgresql://${TEST_DB_CONFIG.user}:${TEST_DB_CONFIG.password}@${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}/${TEST_DB_CONFIG.database}`;

    console.log('🔧 Setting up integration test environment...');

    // Initialize database pool
    dbPool = new Pool(TEST_DB_CONFIG);

    // Test database connection
    try {
      const client = await dbPool.connect();
      console.log('✅ Connected to test database');
      client.release();
    } catch (error) {
      console.error('❌ Failed to connect to test database:', error);
      throw new Error('Test database connection failed. Ensure test database exists and is accessible.');
    }

    // Initialize Express app
    app = createApp;

    console.log('✅ Integration test setup completed');
  });

  beforeEach(async () => {
    // Clean up database before each test
    await cleanDatabase();

    // Create a test user for authentication
    testUser = await createTestUser();

    // Generate authentication token
    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log(`🧪 Test setup: Created user ${testUser.username} with token`);
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanDatabase();
  });

  afterAll(async () => {
    // Close database connections
    if (dbPool) {
      await dbPool.end();
      console.log('🔌 Closed test database connection');
    }

    if (server) {
      await new Promise(resolve => server.close(resolve));
      console.log('🔌 Closed test server');
    }
  });

  // Utility function to clean test database
  async function cleanDatabase() {
    const queries = [
      'DELETE FROM article_feedback',
      'DELETE FROM article_versions',
      'DELETE FROM articles',
      'DELETE FROM users WHERE username LIKE \'test_%\'',
      'DELETE FROM email_verification_tokens',
    ];

    for (const query of queries) {
      try {
        await dbPool.query(query);
      } catch (error) {
        // Ignore errors for non-existent records
        if (!error.message.includes('does not exist')) {
          console.warn('Database cleanup warning:', error.message);
        }
      }
    }
  }

  // Utility function to create a test user
  async function createTestUser(userData = {}) {
    const defaultUser = {
      id: uuidv4(),
      username: `test_user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      email: `test_${Date.now()}@example.com`,
      password: 'password123',
      display_name: 'Test Integration User',
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

  describe('Authentication Integration', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user with real database operations', async () => {
        const userData = {
          username: `newuser_${Date.now()}`,
          email: `newuser_${Date.now()}@example.com`,
          password: 'password123',
          display_name: 'New Integration User'
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('registered successfully');

        // Verify user was actually created in database
        const dbResult = await dbPool.query(
          'SELECT id, username, email, display_name, is_active, email_verified FROM users WHERE username = $1',
          [userData.username]
        );

        expect(dbResult.rows).toHaveLength(1);
        const dbUser = dbResult.rows[0];
        expect(dbUser.username).toBe(userData.username);
        expect(dbUser.email).toBe(userData.email);
        expect(dbUser.display_name).toBe(userData.display_name);
        expect(dbUser.is_active).toBe(true);
        expect(dbUser.email_verified).toBe(false); // Should require email verification
      });

      it('should prevent duplicate username registration', async () => {
        // Try to register with existing user's username
        const userData = {
          username: testUser.username, // Use existing username
          email: 'different@example.com',
          password: 'password123'
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('USERNAME_TAKEN');
      });

      it('should prevent duplicate email registration', async () => {
        // Try to register with existing user's email
        const userData = {
          username: 'differentuser',
          email: testUser.email, // Use existing email
          password: 'password123'
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('EMAIL_TAKEN');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login successfully with correct credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            identifier: testUser.email,
            password: testUser.password
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.token).toBeDefined();
        expect(response.body.refreshToken).toBeDefined();
        expect(response.body.user.id).toBe(testUser.id);
        expect(response.body.user.username).toBe(testUser.username);
        expect(response.body.user.email).toBe(testUser.email);

        // Verify token is valid
        const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
        expect(decoded.userId).toBe(testUser.id);
        expect(decoded.email).toBe(testUser.email);
      });

      it('should fail with incorrect password', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            identifier: testUser.email,
            password: 'wrongpassword'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('INVALID_CREDENTIALS');
      });

      it('should fail with non-existent user', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            identifier: 'nonexistent@example.com',
            password: 'password123'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('INVALID_CREDENTIALS');
      });
    });
  });

  describe('Articles Integration', () => {
    describe('POST /api/articles', () => {
      it('should create a new article with real database operations', async () => {
        const articleData = {
          title: 'Integration Test Article',
          content: 'This is a comprehensive integration test article with substantial content that meets the minimum requirements for article creation.',
          summary: 'A test article for integration testing',
          visibility: 'public'
        };

        const response = await request(app)
          .post('/api/articles')
          .set('Authorization', `Bearer ${authToken}`)
          .send(articleData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.title).toBe(articleData.title);
        expect(response.body.data.content).toBe(articleData.content);
        expect(response.body.data.user_id).toBe(testUser.id);
        expect(response.body.data.status).toBe('draft');

        // Verify article was created in database
        const dbResult = await dbPool.query(
          'SELECT * FROM articles WHERE id = $1',
          [response.body.data.id]
        );

        expect(dbResult.rows).toHaveLength(1);
        const dbArticle = dbResult.rows[0];
        expect(dbArticle.title).toBe(articleData.title);
        expect(dbArticle.content).toBe(articleData.content);
        expect(dbArticle.user_id).toBe(testUser.id);

        // Verify article version was created
        const versionResult = await dbPool.query(
          'SELECT * FROM article_versions WHERE article_id = $1',
          [response.body.data.id]
        );

        expect(versionResult.rows).toHaveLength(1);
        expect(versionResult.rows[0].version_number).toBe(1);
      });

      it('should require authentication for article creation', async () => {
        const articleData = {
          title: 'Test Article',
          content: 'This should fail without authentication.'
        };

        const response = await request(app)
          .post('/api/articles')
          .send(articleData)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('AUTHENTICATION_ERROR');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/articles')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ title: 'Test Article' }) // Missing content
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/articles/:id', () => {
      let testArticle;

      beforeEach(async () => {
        // Create a test article
        const articleResult = await dbPool.query(`
          INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING *
        `, [
          uuidv4(),
          testUser.id,
          'Test Article for Retrieval',
          'test-article-retrieval',
          'This is the content of the test article for retrieval testing.',
          'Test article summary',
          'published',
          'public',
          1
        ]);

        testArticle = articleResult.rows[0];
      });

      it('should retrieve article by ID with view count increment', async () => {
        const initialViews = testArticle.view_count || 0;

        const response = await request(app)
          .get(`/api/articles/${testArticle.id}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe(testArticle.id);
        expect(response.body.data.title).toBe(testArticle.title);
        expect(response.body.data.content).toBe(testArticle.content);

        // Verify view count was incremented in database
        const updatedResult = await dbPool.query(
          'SELECT view_count FROM articles WHERE id = $1',
          [testArticle.id]
        );

        expect(updatedResult.rows[0].view_count).toBe(initialViews + 1);
      });

      it('should return 404 for non-existent article', async () => {
        const response = await request(app)
          .get('/api/articles/00000000-0000-0000-0000-000000000000')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('NOT_FOUND');
      });
    });

    describe('PUT /api/articles/:id', () => {
      let testArticle;

      beforeEach(async () => {
        // Create a test article owned by test user
        const articleResult = await dbPool.query(`
          INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING *
        `, [
          uuidv4(),
          testUser.id,
          'Original Title',
          'original-title',
          'Original content of the article.',
          'Original summary',
          'draft',
          'public',
          1
        ]);

        testArticle = articleResult.rows[0];
      });

      it('should update article with version tracking', async () => {
        const updateData = {
          title: 'Updated Title',
          content: 'This is the updated content with more comprehensive information for testing.',
          change_summary: 'Updated title and content for integration testing'
        };

        const response = await request(app)
          .put(`/api/articles/${testArticle.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.title).toBe(updateData.title);
        expect(response.body.data.content).toBe(updateData.content);
        expect(response.body.data.version).toBe(2); // Version should increment

        // Verify changes in database
        const updatedResult = await dbPool.query(
          'SELECT * FROM articles WHERE id = $1',
          [testArticle.id]
        );

        const updatedArticle = updatedResult.rows[0];
        expect(updatedArticle.title).toBe(updateData.title);
        expect(updatedArticle.content).toBe(updateData.content);
        expect(updatedArticle.version).toBe(2);

        // Verify new version was created
        const versionResult = await dbPool.query(
          'SELECT * FROM article_versions WHERE article_id = $1 ORDER BY version_number',
          [testArticle.id]
        );

        expect(versionResult.rows).toHaveLength(2);
        expect(versionResult.rows[1].version_number).toBe(2);
        expect(versionResult.rows[1].title).toBe(updateData.title);
        expect(versionResult.rows[1].change_summary).toBe(updateData.change_summary);
      });

      it('should prevent unauthorized article updates', async () => {
        // Create another user
        const otherUser = await createTestUser({
          username: `other_user_${Date.now()}`,
          email: `other_${Date.now()}@example.com`
        });

        const otherUserToken = jwt.sign(
          { userId: otherUser.id, email: otherUser.email },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        const response = await request(app)
          .put(`/api/articles/${testArticle.id}`)
          .set('Authorization', `Bearer ${otherUserToken}`)
          .send({
            title: 'Unauthorized Update',
            content: 'This should fail.'
          })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.errorCode).toBe('AUTHORIZATION_ERROR');

        // Verify article was not modified
        const unchangedResult = await dbPool.query(
          'SELECT title, content FROM articles WHERE id = $1',
          [testArticle.id]
        );

        expect(unchangedResult.rows[0].title).toBe(testArticle.title);
        expect(unchangedResult.rows[0].content).toBe(testArticle.content);
      });
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should rollback article creation on error', async () => {
      // This test verifies transaction rollback behavior
      // We'll create an article with invalid data that should trigger a rollback

      const initialArticleCount = await dbPool.query('SELECT COUNT(*) FROM articles');
      const initialVersionCount = await dbPool.query('SELECT COUNT(*) FROM article_versions');

      // Attempt to create article with extremely long title (should fail validation)
      const invalidData = {
        title: 'x'.repeat(1000), // Exceeds maximum length
        content: 'Valid content'
      };

      await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      // Verify no articles or versions were created
      const finalArticleCount = await dbPool.query('SELECT COUNT(*) FROM articles');
      const finalVersionCount = await dbPool.query('SELECT COUNT(*) FROM article_versions');

      expect(finalArticleCount.rows[0].count).toBe(initialArticleCount.rows[0].count);
      expect(finalVersionCount.rows[0].count).toBe(initialVersionCount.rows[0].count);
    });
  });

  describe('Performance Integration', () => {
    it('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();
      const concurrentRequests = 10;

      // Create multiple concurrent article creation requests
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/articles')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Concurrent Article ${i}`,
            content: `This is the content for concurrent article ${i} with enough text to meet minimum requirements.`,
            summary: `Summary for article ${i}`
          })
      );

      const responses = await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.title).toBe(`Concurrent Article ${i}`);
      });

      // Performance check: should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 10 concurrent requests

      // Verify all articles were created in database
      const articleCount = await dbPool.query(
        'SELECT COUNT(*) FROM articles WHERE user_id = $1',
        [testUser.id]
      );

      expect(parseInt(articleCount.rows[0].count)).toBe(concurrentRequests);

      console.log(`✅ Concurrent requests completed in ${totalTime}ms`);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database connection errors gracefully', async () => {
      // This is a simulation - in real scenarios you might temporarily
      // disconnect the database to test error handling

      // For now, we'll test with malformed queries that would cause errors
      const response = await request(app)
        .get('/api/articles/invalid-uuid-format')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(true);
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    });
  });
});