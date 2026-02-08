/**
 * WebSocket/MCP Integration Tests
 *
 * Tests the Model Context Protocol (MCP) over WebSocket functionality
 * including real-time communication, tool execution, and event handling.
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Import MCP server
const { MCPServer } = require('../../../src/mcp/server');

describe('WebSocket/MCP Integration Tests', () => {
  let mcpServer;
  let dbPool;
  let testUser;
  let authToken;
  let wsPort;

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
    process.env.JWT_SECRET = 'test-mcp-secret-key';
    process.env.DATABASE_URL = `postgresql://${TEST_DB_CONFIG.user}:${TEST_DB_CONFIG.password}@${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}/${TEST_DB_CONFIG.database}`;

    console.log('🔌 Setting up MCP WebSocket integration tests...');

    // Initialize database pool
    dbPool = new Pool(TEST_DB_CONFIG);

    // Test database connection
    try {
      const client = await dbPool.connect();
      console.log('✅ Connected to test database for MCP tests');
      client.release();
    } catch (error) {
      console.error('❌ Failed to connect to test database for MCP tests:', error);
      throw new Error('Test database connection failed for MCP tests');
    }

    // Start MCP server on test port
    wsPort = 3002; // Use different port for testing
    mcpServer = new MCPServer({ port: wsPort });
    await mcpServer.start();

    console.log(`✅ MCP Server started on port ${wsPort}`);
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

    console.log(`🧪 MCP Test setup: Created user ${testUser.username}`);
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanDatabase();
  });

  afterAll(async () => {
    // Stop MCP server
    if (mcpServer) {
      await mcpServer.stop();
      console.log('🔌 Stopped MCP server');
    }

    // Close database connections
    if (dbPool) {
      await dbPool.end();
      console.log('🔌 Closed MCP test database connection');
    }
  });

  // Utility function to clean test database
  async function cleanDatabase() {
    const queries = [
      'DELETE FROM article_feedback',
      'DELETE FROM article_versions',
      'DELETE FROM articles',
      'DELETE FROM users WHERE username LIKE \'test_%\'',
      'DELETE FROM follows',
      'DELETE FROM messages'
    ];

    for (const query of queries) {
      try {
        await dbPool.query(query);
      } catch (error) {
        // Ignore errors for non-existent records
        if (!error.message.includes('does not exist')) {
          console.warn('MCP Database cleanup warning:', error.message);
        }
      }
    }
  }

  // Utility function to create a test user
  async function createTestUser(userData = {}) {
    const bcrypt = require('bcrypt');

    const defaultUser = {
      id: uuidv4(),
      username: `mcp_test_user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      email: `mcp_test_${Date.now()}@example.com`,
      password: 'password123',
      display_name: 'MCP Test User',
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

  // Utility function to create WebSocket connection
  function createWebSocketConnection(token = authToken) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${wsPort}?token=${token}`);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Utility function to send MCP request and wait for response
  function sendMCPRequest(ws, tool, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: tool,
          arguments: params
        }
      };

      const timeout = setTimeout(() => {
        reject(new Error('MCP request timeout'));
      }, 10000);

      ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());

          if (response.id === requestId) {
            clearTimeout(timeout);

            if (response.error) {
              reject(new Error(`MCP Error: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for non-matching messages
        }
      });

      ws.send(JSON.stringify(request));
    });
  }

  describe('WebSocket Connection', () => {
    it('should establish authenticated WebSocket connection', async () => {
      const ws = await createWebSocketConnection();

      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Close connection
      ws.close();

      // Wait for connection to close
      await new Promise((resolve) => {
        ws.on('close', resolve);
      });

      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it('should reject connection with invalid token', async () => {
      const invalidToken = 'invalid-token';

      await expect(createWebSocketConnection(invalidToken))
        .rejects.toThrow();
    });

    it('should reject connection with no token', async () => {
      await expect(createWebSocketConnection(''))
        .rejects.toThrow();
    });
  });

  describe('MCP Tool Execution', () => {
    let ws;

    beforeEach(async () => {
      ws = await createWebSocketConnection();
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    describe('Article Tools', () => {
      it('should create article via MCP create_article tool', async () => {
        const articleData = {
          title: 'MCP Test Article',
          content: 'This article was created via the MCP create_article tool for integration testing.',
          summary: 'MCP test article summary',
          visibility: 'public'
        };

        const result = await sendMCPRequest(ws, 'create_article', articleData);

        expect(result.success).toBe(true);
        expect(result.data.title).toBe(articleData.title);
        expect(result.data.content).toBe(articleData.content);
        expect(result.data.user_id).toBe(testUser.id);
        expect(result.data.status).toBe('draft');

        // Verify article was created in database
        const dbResult = await dbPool.query(
          'SELECT * FROM articles WHERE id = $1',
          [result.data.id]
        );

        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].title).toBe(articleData.title);
      });

      it('should get article via MCP get_article tool', async () => {
        // First create an article directly in database
        const articleId = uuidv4();
        await dbPool.query(`
          INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        `, [
          articleId,
          testUser.id,
          'Test Article for MCP Get',
          'test-article-mcp-get',
          'Content for MCP get test.',
          'Summary for MCP get test',
          'published',
          'public',
          1
        ]);

        const result = await sendMCPRequest(ws, 'get_article', { id: articleId });

        expect(result.success).toBe(true);
        expect(result.data.id).toBe(articleId);
        expect(result.data.title).toBe('Test Article for MCP Get');
        expect(result.data.content).toBe('Content for MCP get test.');
      });

      it('should update article via MCP update_article tool', async () => {
        // First create an article
        const articleResult = await sendMCPRequest(ws, 'create_article', {
          title: 'Original MCP Title',
          content: 'Original content for MCP update test.',
          summary: 'Original summary'
        });

        const articleId = articleResult.data.id;

        // Now update it
        const updateData = {
          id: articleId,
          title: 'Updated MCP Title',
          content: 'Updated content for MCP update test with more comprehensive information.',
          change_summary: 'Updated via MCP for integration testing'
        };

        const updateResult = await sendMCPRequest(ws, 'update_article', updateData);

        expect(updateResult.success).toBe(true);
        expect(updateResult.data.title).toBe(updateData.title);
        expect(updateResult.data.content).toBe(updateData.content);
        expect(updateResult.data.version).toBe(2);

        // Verify update in database
        const dbResult = await dbPool.query(
          'SELECT title, content, version FROM articles WHERE id = $1',
          [articleId]
        );

        expect(dbResult.rows[0].title).toBe(updateData.title);
        expect(dbResult.rows[0].content).toBe(updateData.content);
        expect(dbResult.rows[0].version).toBe(2);
      });
    });

    describe('User Tools', () => {
      it('should get user profile via MCP get_user_profile tool', async () => {
        const result = await sendMCPRequest(ws, 'get_user_profile', {});

        expect(result.success).toBe(true);
        expect(result.data.id).toBe(testUser.id);
        expect(result.data.username).toBe(testUser.username);
        expect(result.data.email).toBe(testUser.email);
        expect(result.data.display_name).toBe(testUser.display_name);
      });

      it('should update user profile via MCP update_profile tool', async () => {
        const updateData = {
          display_name: 'Updated MCP Display Name',
          bio: 'This is my updated bio via MCP.'
        };

        const result = await sendMCPRequest(ws, 'update_profile', updateData);

        expect(result.success).toBe(true);
        expect(result.data.display_name).toBe(updateData.display_name);

        // Verify update in database
        const dbResult = await dbPool.query(
          'SELECT display_name, bio FROM users WHERE id = $1',
          [testUser.id]
        );

        expect(dbResult.rows[0].display_name).toBe(updateData.display_name);
        expect(dbResult.rows[0].bio).toBe(updateData.bio);
      });
    });

    describe('Search Tools', () => {
      beforeEach(async () => {
        // Create test articles for searching
        await dbPool.query(`
          INSERT INTO articles (id, user_id, title, slug, content, summary, status, visibility, version, created_at, updated_at)
          VALUES
            ($1, $2, 'First Search Test Article', 'first-search-test', 'Content about knowledge management and publishing.', 'Search test 1', 'published', 'public', 1, NOW(), NOW()),
            ($2, $2, 'Second Search Test Article', 'second-search-test', 'Content about feedback systems and collaboration.', 'Search test 2', 'published', 'public', 1, NOW(), NOW())
        `, [uuidv4(), uuidv4(), testUser.id]);
      });

      it('should search articles via MCP search_articles tool', async () => {
        const result = await sendMCPRequest(ws, 'search_articles', {
          query: 'knowledge',
          limit: 10
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeInstanceOf(Array);
        expect(result.data.length).toBeGreaterThan(0);

        const foundArticle = result.data.find(article =>
          article.title.includes('First Search Test Article')
        );
        expect(foundArticle).toBeDefined();
        expect(foundArticle.title).toBe('First Search Test Article');
      });
    });
  });

  describe('Real-time Events', () => {
    let ws1, ws2;
    let testUser2;

    beforeEach(async () => {
      // Create a second test user
      testUser2 = await createTestUser({
        username: `mcp_user2_${Date.now()}`,
        email: `mcp_user2_${Date.now()}@example.com`
      });

      const authToken2 = jwt.sign(
        { userId: testUser2.id, email: testUser2.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Create two WebSocket connections
      ws1 = await createWebSocketConnection(authToken);
      ws2 = await createWebSocketConnection(authToken2);
    });

    afterEach(() => {
      if (ws1 && ws1.readyState === WebSocket.OPEN) ws1.close();
      if (ws2 && ws2.readyState === WebSocket.OPEN) ws2.close();
    });

    it('should receive real-time events for article creation', async () => {
      const eventReceived = new Promise((resolve) => {
        ws2.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.method === 'notification' && message.params.event === 'article_published') {
            resolve(message.params.data);
          }
        });
      });

      // User 1 creates and publishes an article
      const articleResult = await sendMCPRequest(ws1, 'create_article', {
        title: 'Real-time Test Article',
        content: 'This article tests real-time event notifications.',
        summary: 'Real-time test'
      });

      await sendMCPRequest(ws1, 'publish_article', {
        id: articleResult.data.id
      });

      // User 2 should receive the event
      const eventData = await eventReceived;

      expect(eventData.title).toBe('Real-time Test Article');
      expect(eventData.user_id).toBe(testUser.id);
    });
  });

  describe('Error Handling', () => {
    let ws;

    beforeEach(async () => {
      ws = await createWebSocketConnection();
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle invalid MCP tool calls', async () => {
      await expect(sendMCPRequest(ws, 'non_existent_tool', {}))
        .rejects.toThrow('MCP Error');
    });

    it('should handle malformed MCP requests', async () => {
      const malformedRequest = '{"invalid": json}';

      // Send malformed request
      ws.send(malformedRequest);

      // Should receive error response
      const errorReceived = new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.error) {
            resolve(message.error);
          }
        });
      });

      const error = await errorReceived;
      expect(error).toBeDefined();
      expect(error.code).toBe(-32700); // Parse error
    });

    it('should handle database errors in MCP tools', async () => {
      // Try to create article with invalid data
      await expect(sendMCPRequest(ws, 'create_article', {
        title: 'x'.repeat(1000), // Too long
        content: 'Valid content'
      })).rejects.toThrow('MCP Error');
    });
  });

  describe('Performance', () => {
    let ws;

    beforeEach(async () => {
      ws = await createWebSocketConnection();
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle concurrent MCP requests efficiently', async () => {
      const startTime = Date.now();
      const concurrentRequests = 5;

      // Send multiple concurrent MCP requests
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        sendMCPRequest(ws, 'create_article', {
          title: `Concurrent MCP Article ${i}`,
          content: `Content for concurrent MCP article ${i} with adequate length.`,
          summary: `Summary ${i}`
        })
      );

      const results = await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.data.title).toBe(`Concurrent MCP Article ${i}`);
      });

      // Performance check
      expect(totalTime).toBeLessThan(3000); // 3 seconds for 5 concurrent MCP requests

      console.log(`✅ Concurrent MCP requests completed in ${totalTime}ms`);
    });

    it('should maintain WebSocket connection stability', async () => {
      // Send requests over time to test connection stability
      for (let i = 0; i < 3; i++) {
        const result = await sendMCPRequest(ws, 'get_user_profile', {});
        expect(result.success).toBe(true);

        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });
});