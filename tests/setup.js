/**
 * Global Test Setup for Knowledge Foyer
 * Common configuration and utilities for all test suites
 */

const path = require('path');

// Load test environment variables
require('dotenv').config({
  path: path.join(__dirname, '..', '.env.test')
});

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Increase test timeout for CI environments
if (process.env.CI) {
  jest.setTimeout(60000);
} else {
  jest.setTimeout(30000);
}

// Mock external services by default
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((callback) => {
    callback({
      setUser: jest.fn(),
      setTag: jest.fn(),
      setContext: jest.fn(),
      setLevel: jest.fn()
    });
  })
}));

// Mock Redis if not available in test environment
if (!process.env.REDIS_URL) {
  jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
      connect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      setEx: jest.fn(),
      keys: jest.fn(),
      flushDb: jest.fn(),
      info: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn(),
      on: jest.fn()
    }))
  }));
}

// Mock OpenAI if no API key provided
if (!process.env.OPENAI_API_KEY) {
  jest.mock('openai', () => ({
    OpenAI: jest.fn(() => ({
      embeddings: {
        create: jest.fn(() => ({
          data: [{ embedding: new Array(1536).fill(0.1) }],
          usage: { total_tokens: 100 }
        }))
      },
      chat: {
        completions: {
          create: jest.fn(() => ({
            choices: [{ message: { content: 'Mock response' } }],
            usage: { total_tokens: 150 }
          }))
        }
      }
    }))
  }));
}

// Mock file system operations in tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn((path) => {
    // Allow test files to exist
    if (path.includes('test') || path.includes('spec')) {
      return true;
    }
    return jest.requireActual('fs').existsSync(path);
  }),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  statSync: jest.fn(() => ({
    size: 1024,
    mtime: new Date()
  })),
  renameSync: jest.fn(),
  unlinkSync: jest.fn(),
  readdirSync: jest.fn(() => [])
}));

// Global test utilities
global.testUtils = {
  // Create mock request object
  createMockRequest: (options = {}) => ({
    id: 'test-request-id',
    method: 'GET',
    url: '/test',
    path: '/test',
    query: {},
    params: {},
    headers: {},
    body: {},
    user: null,
    ip: '127.0.0.1',
    realIP: '127.0.0.1',
    startTime: Date.now(),
    get: jest.fn((header) => options.headers?.[header] || null),
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    ...options
  }),

  // Create mock response object
  createMockResponse: (options = {}) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      headers: {},
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      get: jest.fn((name) => res.headers[name]),
      getHeaders: jest.fn(() => res.headers),
      ...options
    };

    // Mock chaining
    res.status.mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });

    return res;
  },

  // Create mock user object
  createMockUser: (overrides = {}) => ({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    display_name: 'Test User',
    is_active: true,
    email_verified: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  }),

  // Create mock article object
  createMockArticle: (overrides = {}) => ({
    id: 'article-123',
    user_id: 'user-123',
    title: 'Test Article',
    slug: 'test-article',
    content: 'This is test content',
    summary: 'Test summary',
    status: 'published',
    visibility: 'public',
    version: 1,
    view_count: 0,
    feedback_count: 0,
    published_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    toPublicJSON: jest.fn(),
    toOwnerJSON: jest.fn(),
    ...overrides
  }),

  // Create mock database query result
  createMockQueryResult: (rows = [], fields = []) => ({
    rows,
    fields,
    rowCount: rows.length,
    command: 'SELECT'
  }),

  // Sleep utility for async tests
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random test data
  randomString: (length = 10) => {
    return Math.random().toString(36).substring(2, length + 2);
  },

  randomEmail: () => {
    return `test-${Math.random().toString(36).substring(2)}@example.com`;
  },

  randomId: () => {
    return 'test-' + Math.random().toString(36).substring(2);
  }
};

// Error handling for unhandled promises in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in test:', reason);
  // Don't exit in test environment, just log
});

// Global error handler for tests
global.console = {
  ...console,
  // Suppress console.error in tests unless explicitly needed
  error: process.env.TEST_VERBOSE === 'true' ? console.error : jest.fn(),
  warn: process.env.TEST_VERBOSE === 'true' ? console.warn : jest.fn()
};

// Custom matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);

    return {
      message: () => `expected ${received} to be a valid UUID`,
      pass
    };
  },

  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = typeof received === 'string' && emailRegex.test(received);

    return {
      message: () => `expected ${received} to be a valid email`,
      pass
    };
  },

  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received.getTime());

    return {
      message: () => `expected ${received} to be a valid Date`,
      pass
    };
  },

  toHaveValidStructure(received, structure) {
    const pass = Object.keys(structure).every(key => {
      if (typeof structure[key] === 'function') {
        return structure[key](received[key]);
      }
      return received.hasOwnProperty(key);
    });

    return {
      message: () => `expected object to have valid structure`,
      pass
    };
  }
});

// Setup database transaction rollback for integration tests
global.setupTestTransaction = async (query) => {
  await query('BEGIN');

  return {
    rollback: async () => {
      await query('ROLLBACK');
    }
  };
};

// Clean up after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();

  // Clear any test-specific environment variables
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('TEST_')) {
      delete process.env[key];
    }
  });
});

// Ensure clean state before tests
beforeAll(() => {
  // Set consistent timezone for tests
  process.env.TZ = 'UTC';
});

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});