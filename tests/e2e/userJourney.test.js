/**
 * End-to-End User Journey Tests
 * Tests complete user workflows from authentication through article management
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

// Mock external dependencies for E2E tests
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/CacheService');
jest.mock('../../../src/services/OpenAIService');

const { query, transaction } = require('../../../src/config/database');

describe('User Journey E2E Tests', () => {
  let app;
  let testUser;
  let authToken;
  let createdArticle;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key-e2e';
    process.env.SMTP_HOST = 'test-smtp';

    // Import app after environment setup
    app = require('../../../src/app');

    // Setup database mocks for consistent responses
    setupDatabaseMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create unique test user for this test run
    testUser = {
      id: uuidv4(),
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password_hash: '$2b$10$hashedpassword',
      display_name: 'Test User',
      is_active: true,
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    };
  });

  function setupDatabaseMocks() {
    // Mock transaction function
    transaction.mockImplementation(async (callback) => {
      const mockClient = {
        query: jest.fn().mockImplementation((...args) => query(...args))
      };
      return await callback(mockClient);
    });
  }

  describe('Complete User Registration and Article Management Journey', () => {
    it('should complete full user journey: register -> verify -> login -> create article -> update -> publish', async () => {
      // Step 1: User Registration
      console.log('📝 Step 1: User Registration');

      // Mock user registration database queries
      query
        .mockResolvedValueOnce({ rows: [] }) // Check if email exists
        .mockResolvedValueOnce({ rows: [] }) // Check if username exists
        .mockResolvedValueOnce({
          rows: [{
            id: testUser.id,
            username: testUser.username,
            email: testUser.email,
            email_verified: false
          }]
        }); // Create user

      const registrationData = {
        username: testUser.username,
        email: testUser.email,
        password: 'password123',
        display_name: testUser.display_name
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(registrationData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.message).toContain('registered successfully');

      // Step 2: Email Verification (simulate)
      console.log('📧 Step 2: Email Verification');

      // Mock email verification
      query.mockResolvedValueOnce({
        rows: [{
          ...testUser,
          email_verified: true
        }]
      });

      const verificationToken = 'mock-verification-token';
      const verifyResponse = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.message).toContain('verified');

      // Step 3: User Login
      console.log('🔐 Step 3: User Login');

      // Mock login database query
      query.mockResolvedValueOnce({
        rows: [{
          ...testUser,
          email_verified: true
        }]
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'password123'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.user.id).toBe(testUser.id);

      authToken = loginResponse.body.token;

      // Step 4: Create Article
      console.log('📄 Step 4: Create Article');

      const articleId = uuidv4();
      createdArticle = {
        id: articleId,
        user_id: testUser.id,
        title: 'My First Article',
        slug: 'my-first-article',
        content: 'This is the content of my first article. It contains valuable information.',
        summary: 'A summary of my first article',
        status: 'draft',
        visibility: 'public',
        version: 1,
        view_count: 0,
        feedback_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
        content_hash: 'content-hash-123'
      };

      // Mock article creation
      query
        .mockResolvedValueOnce({ rows: [] }) // Check slug uniqueness
        .mockResolvedValueOnce({ rows: [createdArticle] }) // Create article
        .mockResolvedValueOnce({}); // Create initial version

      const articleData = {
        title: createdArticle.title,
        content: createdArticle.content,
        summary: createdArticle.summary,
        visibility: createdArticle.visibility
      };

      const createResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(articleData)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.title).toBe(articleData.title);

      // Step 5: Retrieve Created Article
      console.log('👀 Step 5: Retrieve Article');

      // Mock get article
      query.mockResolvedValueOnce({
        rows: [{
          ...createdArticle,
          username: testUser.username,
          display_name: testUser.display_name
        }]
      });

      const getResponse = await request(app)
        .get(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(articleId);
      expect(getResponse.body.data.title).toBe(createdArticle.title);

      // Step 6: Update Article
      console.log('✏️ Step 6: Update Article');

      const updatedContent = 'This is the updated content with more detailed information.';
      const updatedTitle = 'My Updated First Article';

      // Mock article update
      query
        .mockResolvedValueOnce({
          rows: [{
            ...createdArticle,
            username: testUser.username,
            display_name: testUser.display_name
          }]
        }) // Find article
        .mockResolvedValueOnce({}) // Create new version
        .mockResolvedValueOnce({
          rows: [{
            ...createdArticle,
            title: updatedTitle,
            content: updatedContent,
            version: 2
          }]
        }); // Update article

      const updateData = {
        title: updatedTitle,
        content: updatedContent,
        change_summary: 'Updated title and improved content'
      };

      const updateResponse = await request(app)
        .put(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.title).toBe(updatedTitle);

      // Step 7: Publish Article
      console.log('🚀 Step 7: Publish Article');

      // Mock article publish
      query
        .mockResolvedValueOnce({
          rows: [{
            ...createdArticle,
            title: updatedTitle,
            content: updatedContent,
            status: 'draft'
          }]
        }) // Find article
        .mockResolvedValueOnce([]) // Get followers
        .mockResolvedValueOnce({
          rows: [{
            ...createdArticle,
            title: updatedTitle,
            content: updatedContent,
            status: 'published',
            published_at: new Date()
          }]
        }); // Update status

      const publishResponse = await request(app)
        .post(`/api/articles/${articleId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(publishResponse.body.success).toBe(true);
      expect(publishResponse.body.data.status).toBe('published');

      // Step 8: Search for Published Article
      console.log('🔍 Step 8: Search Articles');

      // Mock article search
      query.mockResolvedValueOnce({
        rows: [{
          ...createdArticle,
          title: updatedTitle,
          content: updatedContent,
          status: 'published',
          username: testUser.username,
          display_name: testUser.display_name,
          relevance: 0.9
        }]
      });

      const searchResponse = await request(app)
        .get('/api/articles')
        .query({ q: 'first article', limit: 10 })
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.data.length).toBeGreaterThan(0);
      expect(searchResponse.body.data[0].title).toBe(updatedTitle);

      // Step 9: Add Feedback to Article
      console.log('💬 Step 9: Submit Feedback');

      const feedbackId = uuidv4();
      const feedbackData = {
        content: 'Great article! Very informative and well written.',
        is_public: true
      };

      // Mock feedback submission
      query
        .mockResolvedValueOnce({
          rows: [{
            ...createdArticle,
            status: 'published',
            visibility: 'public'
          }]
        }) // Find article
        .mockResolvedValueOnce([]) // Check similar feedback
        .mockResolvedValueOnce({
          rows: [{
            id: feedbackId,
            article_id: articleId,
            user_id: testUser.id,
            ...feedbackData,
            created_at: new Date()
          }]
        }); // Create feedback

      const feedbackResponse = await request(app)
        .post(`/api/articles/${articleId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(feedbackData)
        .expect(201);

      expect(feedbackResponse.body.success).toBe(true);
      expect(feedbackResponse.body.data.content).toBe(feedbackData.content);

      // Step 10: Get Article Feedback
      console.log('📋 Step 10: Retrieve Feedback');

      // Mock get feedback
      query.mockResolvedValueOnce({
        rows: [{
          id: feedbackId,
          content: feedbackData.content,
          is_public: true,
          status: 'active',
          created_at: new Date(),
          username: testUser.username,
          display_name: testUser.display_name
        }]
      });

      const getFeedbackResponse = await request(app)
        .get(`/api/articles/${articleId}/feedback`)
        .expect(200);

      expect(getFeedbackResponse.body.success).toBe(true);
      expect(getFeedbackResponse.body.data.length).toBeGreaterThan(0);
      expect(getFeedbackResponse.body.data[0].content).toBe(feedbackData.content);

      console.log('✅ User journey completed successfully!');
    });

    it('should handle errors gracefully during user journey', async () => {
      // Test error handling during registration
      console.log('🔥 Testing Error Handling');

      // Mock database error
      query.mockRejectedValueOnce(new Error('Database connection failed'));

      const registrationData = {
        username: 'erroruser',
        email: 'error@example.com',
        password: 'password123'
      };

      const errorResponse = await request(app)
        .post('/api/auth/register')
        .send(registrationData)
        .expect(500);

      expect(errorResponse.body.success).toBe(false);
      expect(errorResponse.body.error).toBe(true);
    });

    it('should enforce authentication requirements', async () => {
      console.log('🔐 Testing Authentication Requirements');

      // Try to create article without authentication
      const articleData = {
        title: 'Unauthorized Article',
        content: 'This should fail'
      };

      const unauthorizedResponse = await request(app)
        .post('/api/articles')
        .send(articleData)
        .expect(401);

      expect(unauthorizedResponse.body.success).toBe(false);
      expect(unauthorizedResponse.body.errorCode).toBe('AUTHENTICATION_ERROR');

      // Try with invalid token
      const invalidTokenResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', 'Bearer invalid-token')
        .send(articleData)
        .expect(401);

      expect(invalidTokenResponse.body.success).toBe(false);
    });

    it('should validate input data throughout journey', async () => {
      console.log('✅ Testing Input Validation');

      // Test invalid registration data
      const invalidRegistration = {
        username: '', // Empty username
        email: 'invalid-email', // Invalid email format
        password: '123' // Too short password
      };

      const validationResponse = await request(app)
        .post('/api/auth/register')
        .send(invalidRegistration)
        .expect(400);

      expect(validationResponse.body.success).toBe(false);
      expect(validationResponse.body.errorCode).toBe('VALIDATION_ERROR');

      // Test invalid article data (with valid auth)
      const mockUser = global.testUtils.createMockUser();
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { userId: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Mock user lookup for authentication
      query.mockResolvedValueOnce({ rows: [mockUser] });

      const invalidArticle = {
        title: '', // Empty title
        content: 'a' // Too short content
      };

      const articleValidationResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidArticle)
        .expect(400);

      expect(articleValidationResponse.body.success).toBe(false);
    });
  });

  describe('Multi-User Interaction Journey', () => {
    it('should handle interactions between multiple users', async () => {
      console.log('👥 Testing Multi-User Interactions');

      // Create two test users
      const user1 = global.testUtils.createMockUser({
        id: uuidv4(),
        username: 'user1',
        email: 'user1@example.com'
      });

      const user2 = global.testUtils.createMockUser({
        id: uuidv4(),
        username: 'user2',
        email: 'user2@example.com'
      });

      const jwt = require('jsonwebtoken');
      const token1 = jwt.sign({ userId: user1.id }, process.env.JWT_SECRET);
      const token2 = jwt.sign({ userId: user2.id }, process.env.JWT_SECRET);

      // User1 creates an article
      const articleId = uuidv4();
      const article = global.testUtils.createMockArticle({
        id: articleId,
        user_id: user1.id,
        status: 'published',
        visibility: 'public'
      });

      // Mock article creation by user1
      query
        .mockResolvedValueOnce({ rows: [user1] }) // Auth user1
        .mockResolvedValueOnce({ rows: [] }) // Check slug
        .mockResolvedValueOnce({ rows: [article] }) // Create article
        .mockResolvedValueOnce({}); // Create version

      const createResponse = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          title: 'Shared Article',
          content: 'This article will receive feedback from another user.',
          summary: 'A shared article'
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);

      // User2 views the article
      query
        .mockResolvedValueOnce({
          rows: [{
            ...article,
            username: user1.username,
            display_name: user1.display_name
          }]
        }) // Find article
        .mockResolvedValueOnce({}); // Increment views

      const viewResponse = await request(app)
        .get(`/api/articles/${articleId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      expect(viewResponse.body.success).toBe(true);
      expect(viewResponse.body.data.id).toBe(articleId);

      // User2 provides feedback
      query
        .mockResolvedValueOnce({ rows: [user2] }) // Auth user2
        .mockResolvedValueOnce({ rows: [article] }) // Find article
        .mockResolvedValueOnce([]) // Check similar feedback
        .mockResolvedValueOnce({
          rows: [{
            id: uuidv4(),
            article_id: articleId,
            user_id: user2.id,
            content: 'Great article! Thanks for sharing.',
            is_public: true,
            created_at: new Date()
          }]
        }); // Create feedback

      const feedbackResponse = await request(app)
        .post(`/api/articles/${articleId}/feedback`)
        .set('Authorization', `Bearer ${token2}`)
        .send({
          content: 'Great article! Thanks for sharing.',
          is_public: true
        })
        .expect(201);

      expect(feedbackResponse.body.success).toBe(true);

      // User1 views their feedback
      query.mockResolvedValueOnce({
        rows: [{
          id: uuidv4(),
          content: 'Great article! Thanks for sharing.',
          is_public: true,
          status: 'active',
          created_at: new Date(),
          username: user2.username,
          display_name: user2.display_name
        }]
      });

      const viewFeedbackResponse = await request(app)
        .get(`/api/articles/${articleId}/feedback`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(viewFeedbackResponse.body.success).toBe(true);
      expect(viewFeedbackResponse.body.data.length).toBeGreaterThan(0);

      console.log('✅ Multi-user interaction completed successfully!');
    });
  });
});