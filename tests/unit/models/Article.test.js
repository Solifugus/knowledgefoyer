/**
 * Unit Tests for Article Model
 */

const Article = require('../../../src/models/Article');

// Mock database module
jest.mock('../../../src/config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

const { query, transaction } = require('../../../src/config/database');

describe('Article Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create article instance with correct properties', () => {
      const articleData = {
        id: 'article-123',
        user_id: 'user-123',
        title: 'Test Article',
        slug: 'test-article',
        content: 'Test content',
        summary: 'Test summary',
        version: 1,
        status: 'published',
        visibility: 'public',
        published_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        view_count: 5,
        feedback_count: 2,
        content_hash: 'hash123'
      };

      const article = new Article(articleData);

      expect(article.id).toBe(articleData.id);
      expect(article.user_id).toBe(articleData.user_id);
      expect(article.title).toBe(articleData.title);
      expect(article.slug).toBe(articleData.slug);
      expect(article.content).toBe(articleData.content);
      expect(article.summary).toBe(articleData.summary);
      expect(article.version).toBe(articleData.version);
      expect(article.status).toBe(articleData.status);
      expect(article.visibility).toBe(articleData.visibility);
    });

    it('should initialize with empty tags array if not provided', () => {
      const article = new Article({ id: 'test' });
      expect(article.tags).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create new article successfully', async () => {
      const userId = 'user-123';
      const articleData = {
        title: 'New Article',
        content: 'Article content',
        summary: 'Article summary',
        visibility: 'public'
      };

      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{
                id: 'new-article-123',
                ...articleData,
                user_id: userId,
                slug: 'new-article',
                content_hash: 'hash123',
                current_version: 1
              }]
            })
            .mockResolvedValueOnce({}) // For version creation
        };
        return await callback(mockClient);
      });

      transaction.mockImplementation(mockTransaction);

      const article = await Article.create(userId, articleData);

      expect(article).toBeInstanceOf(Article);
      expect(article.title).toBe(articleData.title);
      expect(article.content).toBe(articleData.content);
      expect(article.user_id).toBe(userId);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error for missing required fields', async () => {
      await expect(Article.create('user-123', {})).rejects.toThrow('Title and content are required');
    });

    it('should throw error for invalid title length', async () => {
      const articleData = {
        title: '', // Empty title
        content: 'Valid content'
      };

      await expect(Article.create('user-123', articleData)).rejects.toThrow('Title must be 1-255 characters');
    });

    it('should throw error for short content', async () => {
      const articleData = {
        title: 'Valid title',
        content: 'Short' // Less than 10 characters
      };

      await expect(Article.create('user-123', articleData)).rejects.toThrow('Content must be at least 10 characters');
    });

    it('should throw error for invalid visibility', async () => {
      const articleData = {
        title: 'Valid title',
        content: 'Valid content',
        visibility: 'invalid'
      };

      await expect(Article.create('user-123', articleData)).rejects.toThrow('Visibility must be public, private, or unlisted');
    });
  });

  describe('generateUniqueSlug', () => {
    it('should generate slug from title', async () => {
      query.mockResolvedValue({ rows: [] }); // No existing slugs

      const slug = await Article.generateUniqueSlug('user-123', 'Test Article Title');

      expect(slug).toBe('test-article-title');
      expect(query).toHaveBeenCalledWith(
        'SELECT id FROM articles WHERE user_id = $1 AND slug = $2',
        ['user-123', 'test-article-title']
      );
    });

    it('should handle special characters in title', async () => {
      query.mockResolvedValue({ rows: [] });

      const slug = await Article.generateUniqueSlug('user-123', 'Test @ Article & Title!');

      expect(slug).toBe('test-article-title');
    });

    it('should append counter for duplicate slugs', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }) // First attempt fails
        .mockResolvedValueOnce({ rows: [] }); // Second attempt succeeds

      const slug = await Article.generateUniqueSlug('user-123', 'Test Article');

      expect(slug).toBe('test-article-1');
    });

    it('should handle empty title', async () => {
      query.mockResolvedValue({ rows: [] });

      const slug = await Article.generateUniqueSlug('user-123', '');

      expect(slug).toBe('untitled');
    });
  });

  describe('findById', () => {
    it('should find article by ID with author info', async () => {
      const mockArticleData = {
        id: 'article-123',
        title: 'Test Article',
        username: 'testuser',
        display_name: 'Test User'
      };

      query.mockResolvedValue({ rows: [mockArticleData] });

      const article = await Article.findById('article-123');

      expect(article).toBeInstanceOf(Article);
      expect(article.id).toBe(mockArticleData.id);
      expect(article.author.username).toBe(mockArticleData.username);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT a.*, u.username, u.display_name'),
        ['article-123']
      );
    });

    it('should exclude private articles by default', async () => {
      query.mockResolvedValue({ rows: [] });

      await Article.findById('article-123');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`AND a.visibility != 'private'`),
        ['article-123']
      );
    });

    it('should include private articles when requested', async () => {
      query.mockResolvedValue({ rows: [] });

      await Article.findById('article-123', true);

      expect(query).toHaveBeenCalledWith(
        expect.not.stringContaining(`AND a.visibility != 'private'`),
        ['article-123']
      );
    });

    it('should return null when article not found', async () => {
      query.mockResolvedValue({ rows: [] });

      const article = await Article.findById('non-existent');

      expect(article).toBeNull();
    });
  });

  describe('findByUserAndSlug', () => {
    it('should find article by username and slug', async () => {
      const mockArticleData = {
        id: 'article-123',
        slug: 'test-article',
        username: 'testuser',
        display_name: 'Test User'
      };

      query.mockResolvedValue({ rows: [mockArticleData] });

      const article = await Article.findByUserAndSlug('testuser', 'test-article');

      expect(article).toBeInstanceOf(Article);
      expect(article.id).toBe(mockArticleData.id);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE u.username = $1 AND a.slug = $2'),
        ['testuser', 'test-article']
      );
    });
  });

  describe('search', () => {
    it('should search articles with relevance scoring', async () => {
      const mockResults = [
        {
          id: 'article-1',
          title: 'Test Article',
          relevance: 1.0,
          username: 'user1',
          display_name: 'User One'
        }
      ];

      query.mockResolvedValue({ rows: mockResults });

      const articles = await Article.search('test', { limit: 10, offset: 0 });

      expect(Array.isArray(articles)).toBe(true);
      expect(articles[0]).toBeInstanceOf(Article);
      expect(articles[0].relevance).toBe(1.0);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('CASE WHEN LOWER(a.title) LIKE'),
        ['%test%', 10, 0, 0.1]
      );
    });
  });

  describe('update', () => {
    let article;

    beforeEach(() => {
      article = new Article({
        id: 'article-123',
        user_id: 'user-123',
        title: 'Original Title',
        content: 'Original content'
      });
    });

    it('should update article successfully', async () => {
      const updates = {
        title: 'Updated Title',
        content: 'Updated content'
      };

      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({
            rows: [{
              id: 'article-123',
              ...updates,
              user_id: 'user-123'
            }]
          })
        };
        return await callback(mockClient);
      });

      transaction.mockImplementation(mockTransaction);

      // Mock ArticleVersion.createVersion
      jest.doMock('../../../src/models/ArticleVersion', () => ({
        createVersion: jest.fn().mockResolvedValue({ version_number: 2 })
      }));

      const result = await article.update(updates, 'user-123');

      expect(result).toBe(article);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unauthorized update', async () => {
      await expect(article.update({}, 'different-user')).rejects.toThrow('Unauthorized to update this article');
    });

    it('should throw error for no valid fields', async () => {
      await expect(article.update({ invalid_field: 'value' }, 'user-123')).rejects.toThrow('No valid fields to update');
    });
  });

  describe('publish', () => {
    let article;

    beforeEach(() => {
      article = new Article({
        id: 'article-123',
        user_id: 'user-123',
        status: 'draft'
      });
    });

    it('should publish article successfully', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({
            rows: [{
              id: 'article-123',
              user_id: 'user-123',
              status: 'published',
              published_at: new Date()
            }]
          })
        };
        return await callback(mockClient);
      });

      transaction.mockImplementation(mockTransaction);

      // Mock dependencies
      jest.doMock('../../../src/services/NotificationService', () => ({
        handleArticlePublishedNotifications: jest.fn()
      }));
      jest.doMock('../../../src/services/FeedService', () => ({
        createFeedItemsForArticle: jest.fn()
      }));
      jest.doMock('../../../src/models/Follow', () => ({
        getFollowers: jest.fn().mockResolvedValue([])
      }));

      const result = await article.publish('user-123');

      expect(result).toBe(article);
      expect(article.status).toBe('published');
    });

    it('should throw error for unauthorized publish', async () => {
      await expect(article.publish('different-user')).rejects.toThrow('Unauthorized to publish this article');
    });

    it('should throw error for already published article', async () => {
      article.status = 'published';
      await expect(article.publish('user-123')).rejects.toThrow('Article is already published');
    });
  });

  describe('incrementViews', () => {
    it('should increment view count', async () => {
      const article = new Article({
        id: 'article-123',
        view_count: 5
      });

      query.mockResolvedValue({});

      await article.incrementViews();

      expect(article.view_count).toBe(6);
      expect(query).toHaveBeenCalledWith(
        'UPDATE articles SET view_count = view_count + 1 WHERE id = $1',
        ['article-123']
      );
    });
  });

  describe('toPublicJSON', () => {
    it('should return public article data', () => {
      const article = new Article({
        id: 'article-123',
        title: 'Test Article',
        content: 'Test content',
        content_hash: 'private-hash',
        author: { username: 'testuser' }
      });

      const publicData = article.toPublicJSON();

      expect(publicData.id).toBe('article-123');
      expect(publicData.title).toBe('Test Article');
      expect(publicData.content).toBe('Test content');
      expect(publicData.author).toEqual({ username: 'testuser' });
      expect(publicData.content_hash).toBeUndefined();
    });
  });

  describe('toOwnerJSON', () => {
    it('should return owner article data with private fields', () => {
      const article = new Article({
        id: 'article-123',
        title: 'Test Article',
        content_hash: 'private-hash'
      });

      const ownerData = article.toOwnerJSON();

      expect(ownerData.id).toBe('article-123');
      expect(ownerData.content_hash).toBe('private-hash');
    });
  });

  describe('findSimilarContent', () => {
    it('should find articles with same content hash', async () => {
      const mockResults = [
        {
          id: 'similar-article',
          content_hash: 'same-hash',
          username: 'otheruser',
          display_name: 'Other User'
        }
      ];

      query.mockResolvedValue({ rows: mockResults });

      const similarArticles = await Article.findSimilarContent('same-hash');

      expect(Array.isArray(similarArticles)).toBe(true);
      expect(similarArticles[0]).toBeInstanceOf(Article);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE content_hash = $1'),
        ['same-hash']
      );
    });

    it('should exclude specific article ID', async () => {
      query.mockResolvedValue({ rows: [] });

      await Article.findSimilarContent('hash', 'exclude-id');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('AND id != $2'),
        ['hash', 'exclude-id']
      );
    });
  });
});