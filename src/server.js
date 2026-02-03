#!/usr/bin/env node

/**
 * Knowledge Foyer Server Entry Point
 *
 * Starts the Express application and WebSocket server for MCP communication.
 * This is the main entry point for the Knowledge Foyer platform.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = require('./app');
const { createMCPServer } = require('./mcp/server');
const ProgressTracker = require('./utils/progress');
const emailService = require('./services/EmailService');

// Configuration
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize progress tracker
const progressTracker = new ProgressTracker();

/**
 * Start the HTTP server
 */
function startHTTPServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Knowledge Foyer HTTP Server running on port ${PORT}`);
    console.log(`📧 Environment: ${NODE_ENV}`);
    console.log(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);

    if (NODE_ENV === 'development') {
      console.log(`\\n📋 Development URLs:`);
      console.log(`   Landing Page: http://localhost:${PORT}/`);
      console.log(`   Test User Page: http://testuser.localhost:${PORT}/`);
      console.log(`   Health Check: http://localhost:${PORT}/health`);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\\n🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ HTTP Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\\n🛑 SIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ HTTP Server closed');
      process.exit(0);
    });
  });

  return server;
}

/**
 * Start the WebSocket/MCP server
 */
function startMCPServer() {
  try {
    const mcpServer = createMCPServer(WS_PORT);
    console.log(`🔌 MCP WebSocket Server running on port ${WS_PORT}`);
    console.log(`📡 WebSocket URL: ws://localhost:${WS_PORT}`);
    return mcpServer;
  } catch (error) {
    console.error('❌ Failed to start MCP server:', error);
    if (NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.log('⚠️  Continuing without MCP server in development mode');
      return null;
    }
  }
}

/**
 * Display startup information
 */
function displayStartupInfo() {
  console.log('\\n' + '='.repeat(60));
  console.log('🏛️  KNOWLEDGE FOYER - Development Server');
  console.log('='.repeat(60));

  // Show current progress
  progressTracker.displayProgress();

  console.log('💡 Next Steps:');
  console.log('   1. Install dependencies: npm install');
  console.log('   2. Set up database: createdb knowledge_foyer_dev');
  console.log('   3. Configure .env file with your settings');
  console.log('   4. Run database migrations: npm run db:migrate');
  console.log('   5. Start development: npm run dev');
  console.log('\\n' + '='.repeat(60) + '\\n');
}

/**
 * Main startup function
 */
async function main() {
  try {
    // Display startup information
    displayStartupInfo();

    // Initialize email service
    console.log('🔌 Setting up email service...');
    await emailService.initialize();

    // Start HTTP server
    const httpServer = startHTTPServer();

    // Start MCP WebSocket server
    const mcpServer = startMCPServer();

    // Update progress tracker
    progressTracker.updateTaskCompletion('foundation', 5, 5);

    console.log('\\n✅ All servers started successfully!');
    console.log('📈 Foundation Phase: 100% Complete');
    console.log('🎯 Ready for Phase 1: Core Platform (MVP)');

  } catch (error) {
    console.error('❌ Failed to start servers:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

module.exports = { main, startHTTPServer, startMCPServer };