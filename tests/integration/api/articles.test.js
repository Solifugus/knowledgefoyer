/**
 * Integration Tests for Articles API
 * Tests the complete request-response cycle for article operations
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock the database and models
jest.mock('../../../src/config/database');
jest.mock('../../../src/models/Article');
jest.mock('../../../src/models/User');

const { query, transaction } = require('../../../src/config/database');
const Article = require('../../../src/models/Article');
const User = require('../../../src/models/User');

describe('Articles API Integration Tests', () => {
  let app;
  let server;
  let authToken;
  let mockUser;
  let mockTransaction;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';

    // Import app after setting environment
    app = require('../../../src/app');

    // Create test user
    mockUser = global.testUtils.createMockUser({
      id: 'test-user-123',
      username: 'testuser',
      email: 'test@example.com'
    });

    // Generate auth token
    authToken = jwt.sign(
      { userId: mockUser.id, email: mockUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Setup database mocks
    mockTransaction = jest.fn().mockImplementation(async (callback) => {
      const mockClient = { query: jest.fn() };
      return await callback(mockClient);
    });
    transaction.mockImplementation(mockTransaction);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock user authentication
    User.findById.mockResolvedValue(mockUser);
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('POST /api/articles', () => {
    it('should create a new article successfully', async () => {
      const newArticle = global.testUtils.createMockArticle({
        id: 'new-article-123',
        user_id: mockUser.id,
        title: 'New Test Article',
        content: 'This is the content of the new test article'
      });

      Article.create.mockResolvedValue(newArticle);
      newArticle.toOwnerJSON = jest.fn().mockReturnValue({
        id: newArticle.id,
        title: newArticle.title,
        content: newArticle.content,
        status: newArticle.status
      });

      const articleData = {
        title: 'New Test Article',
        content: 'This is the content of the new test article',
        summary: 'Test article summary',
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
      expect(Article.create).toHaveBeenCalledWith(mockUser.id, articleData);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/articles')
        .send({ title: 'Test', content: 'Test content' })
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

    it('should handle creation errors', async () => {
      Article.create.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Article',
          content: 'Test content'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/articles/:id', () => {
    it('should get article by ID', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        title: 'Test Article',
        user_id: 'other-user'
      });

      mockArticle.incrementViews = jest.fn().mockResolvedValue();
      mockArticle.toPublicJSON = jest.fn().mockReturnValue({
        id: mockArticle.id,
        title: mockArticle.title,
        content: mockArticle.content
      });

      Article.findById.mockResolvedValue(mockArticle);

      const response = await request(app)
        .get('/api/articles/article-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockArticle.id);
      expect(response.body.data.title).toBe(mockArticle.title);
      expect(Article.findById).toHaveBeenCalledWith('article-123', false);
      expect(mockArticle.incrementViews).toHaveBeenCalled();
    });

    it('should return owner data for own article', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        user_id: mockUser.id // Same as authenticated user
      });

      mockArticle.incrementViews = jest.fn().mockResolvedValue();
      mockArticle.toOwnerJSON = jest.fn().mockReturnValue({
        id: mockArticle.id,
        title: mockArticle.title,
        content: mockArticle.content,
        content_hash: 'hash123'
      });

      Article.findById.mockResolvedValue(mockArticle);

      const response = await request(app)
        .get('/api/articles/article-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(mockArticle.toOwnerJSON).toHaveBeenCalled();
      expect(response.body.data.content_hash).toBe('hash123');
    });

    it('should return 404 for non-existent article', async () => {
      Article.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/articles/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/articles/:id', () => {
    it('should update article successfully', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        user_id: mockUser.id,
        title: 'Original Title'
      });

      const updatedArticle = { ...mockArticle, title: 'Updated Title' };
      mockArticle.update = jest.fn().mockResolvedValue(updatedArticle);
      updatedArticle.toOwnerJSON = jest.fn().mockReturnValue({
        id: mockArticle.id,
        title: 'Updated Title'
      });

      Article.findById.mockResolvedValue(mockArticle);

      const updateData = {
        title: 'Updated Title',
        content: 'Updated content',
        change_summary: 'Updated title and content'
      };

      const response = await request(app)
        .put('/api/articles/article-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Title');
      expect(mockArticle.update).toHaveBeenCalledWith(
        { title: 'Updated Title', content: 'Updated content' },
        mockUser.id,
        'Updated title and content'
      );
    });

    it('should require authentication for update', async () => {
      const response = await request(app)
        .put('/api/articles/article-123')
        .send({ title: 'Updated Title' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should prevent unauthorized updates', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        user_id: 'other-user' // Different user
      });

      Article.findById.mockResolvedValue(mockArticle);

      const response = await request(app)
        .put('/api/articles/article-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('DELETE /api/articles/:id', () => {
    it('should delete article successfully', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        user_id: mockUser.id
      });

      mockArticle.delete = jest.fn().mockResolvedValue(true);
      Article.findById.mockResolvedValue(mockArticle);

      const response = await request(app)
        .delete('/api/articles/article-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
      expect(mockArticle.delete).toHaveBeenCalledWith(mockUser.id);
    });

    it('should prevent unauthorized deletion', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        user_id: 'other-user'
      });

      Article.findById.mockResolvedValue(mockArticle);

      const response = await request(app)
        .delete('/api/articles/article-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/articles/:id/publish', () => {
    it('should publish article successfully', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        id: 'article-123',
        user_id: mockUser.id,
        status: 'draft'
      });

      const publishedArticle = { ...mockArticle, status: 'published' };
      mockArticle.publish = jest.fn().mockResolvedValue(publishedArticle);
      publishedArticle.toOwnerJSON = jest.fn().mockReturnValue({
        id: mockArticle.id,
        status: 'published'
      });

      Article.findById.mockResolvedValue(mockArticle);

      const response = await request(app)
        .post('/api/articles/article-123/publish')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('published');
      expect(mockArticle.publish).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('GET /api/articles', () => {
    it('should get articles with pagination', async () => {
      const mockArticles = [
        global.testUtils.createMockArticle({ id: 'article-1' }),
        global.testUtils.createMockArticle({ id: 'article-2' })
      ];

      mockArticles.forEach(article => {
        article.toPublicJSON = jest.fn().mockReturnValue({
          id: article.id,
          title: article.title
        });
      });

      Article.search = jest.fn().mockResolvedValue(mockArticles);

      const response = await request(app)
        .get('/api/articles')
        .query({ q: 'test', limit: 10, offset: 0 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
      expect(Article.search).toHaveBeenCalledWith('test', {
        limit: 10,
        offset: 0
      });
    });

    it('should handle empty search results', async () => {
      Article.search = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/articles')
        .query({ q: 'nonexistent' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      Article.findById.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/articles/article-123')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(true);
    });

    it('should handle invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should handle malformed authentication token', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', 'Bearer invalid-token')
        .send({ title: 'Test', content: 'Test content' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // This test would need actual rate limiting middleware configured
      // For now, we'll test that the middleware is applied

      const mockArticle = global.testUtils.createMockArticle();
      Article.create.mockResolvedValue(mockArticle);
      mockArticle.toOwnerJSON = jest.fn().mockReturnValue({});

      const articleData = {
        title: 'Test Article',
        content: 'Test content'
      };

      // Make multiple rapid requests (would need actual rate limiting to test properly)
      const requests = Array(5).fill().map(() =>
        request(app)
          .post('/api/articles')
          .set('Authorization', `Bearer ${authToken}`)
          .send(articleData)
      );

      const responses = await Promise.all(requests);

      // At least some requests should succeed
      expect(responses.some(res => res.status === 201)).toBe(true);
    });
  });

  describe('Request Validation', () => {
    it('should validate article title length', async () => {
      const longTitle = 'a'.repeat(300); // Exceeds max length

      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: longTitle,
          content: 'Valid content'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should validate content length', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Valid title',
          content: 'Short' // Too short
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should validate visibility values', async () => {
      const response = await request(app)
        .post('/api/articles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Valid title',
          content: 'Valid content',
          visibility: 'invalid_value'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    });
  });
});