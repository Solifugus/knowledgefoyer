# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Foyer is a professional publishing platform where creators share evolving work and receive structured, quality feedback. The project is a comprehensive implementation with both backend API/MCP server and frontend SPA fully functional.

**Current Status**: Phase 6 Complete - Production-Ready Implementation (~95% complete)

## Technology Stack

**Backend**:
- Node.js with Express framework
- Hybrid architecture: MCP (Model Context Protocol) over WebSockets + REST endpoints
- JWT-based authentication with bcrypt password hashing
- PostgreSQL with pgvector extension for vector embeddings
- OpenAI API integration for AI features

**Frontend**:
- Progressive Web Application (PWA) using vanilla HTML, CSS, and JavaScript
- No frontend framework (React, Vue, etc.)
- Service worker for offline capability
- WebSocket connection for MCP communication
- Minimal dependencies approach

**Key Dependencies** (installed and configured):
- `express`, `ws`, `@modelcontextprotocol/sdk` - Core server framework and MCP
- `pg`, `pgvector`, `jsonwebtoken`, `bcrypt` - Database and authentication
- `openai`, `nodemailer`, `validator`, `dotenv` - AI integration and utilities
- `cors`, `helmet`, `express-rate-limit`, `compression` - Security and performance
- `marked` for markdown processing, testing framework with `jest`
- `nodemon`, `eslint` for development tooling

## Architecture

**Communication Protocols**:
- **MCP over WebSockets**: Primary protocol for authenticated user interactions
- **REST over HTTP**: Supporting protocol for initial page loads, OAuth, public content

**Core Features**:
- Article publishing with version tracking
- AI-powered feedback ranking and duplicate detection
- Tag-based content discovery
- Real-time updates via WebSocket events
- Email verification system
- Subdomain-based user spaces (username.knowledgefoyer.com)

## Development Commands

**All commands are fully implemented and tested:**

```bash
# Installation
npm install
cp .env.example .env
# Edit .env with your database and API credentials

# Database operations
npm run db:migrate     # Run all migrations (6 complete migrations)
npm run db:seed        # Seed development data
npm run setup:db       # Complete database setup
npm run setup:clean    # Clean database setup

# Development
npm run dev            # Start with nodemon for auto-reload
npm start              # Start production server

# Testing
npm test               # Run comprehensive test suite
npm run test:watch     # Watch mode for development

# Code quality
npm run lint           # ESLint code checking
npm run lint:fix       # Auto-fix linting issues
```

## Project Structure (Implemented)

```
knowledge-foyer/
├── src/
│   ├── config/           # Database configuration
│   │   └── database.js   # PostgreSQL connection with pgvector
│   ├── models/           # Complete data models (10+ files)
│   │   ├── User.js, Article.js, ArticleVersion.js
│   │   ├── Feedback.js, Follow.js, Message.js
│   │   ├── Exposition.js, ExpositionCriteria.js
│   │   └── Notification.js, FeedbackResolution.js
│   ├── routes/           # REST API endpoints (4 modules)
│   │   ├── auth.js, articles.js, expositions.js
│   │   ├── api.js, monitoring.js
│   ├── mcp/              # Complete MCP implementation
│   │   ├── server.js     # WebSocket MCP server
│   │   └── tools.js      # 40+ MCP tools implemented
│   ├── services/         # Business logic layer (12+ services)
│   │   ├── OpenAIService.js, EmailService.js
│   │   ├── FeedbackSimilarityService.js
│   │   ├── NotificationService.js, RealTimeService.js
│   │   └── ExpositionService.js, CacheService.js
│   ├── middleware/       # Express middleware (7 modules)
│   │   ├── auth.js, subdomain.js, errorHandlers.js
│   │   ├── cache.js, requestLogger.js, monitoring.js
│   ├── utils/            # Utilities and helpers
│   │   ├── progress.js, optimizedQueries.js
│   ├── app.js            # Express application setup
│   └── server.js         # Main entry point
├── public/               # Complete SPA frontend
│   ├── index.html        # Main SPA shell
│   ├── manifest.json     # PWA manifest
│   ├── sw.js            # Service worker
│   ├── css/             # Comprehensive styling
│   │   └── layouts/spa.css # Main SPA styles
│   └── js/              # Complete frontend application
│       ├── core/        # Core systems (router, auth, MCP client)
│       ├── pages/       # SPA page controllers (5+ pages)
│       └── components/  # Reusable UI components
├── migrations/           # 6 complete database migrations
├── .env.example          # Complete environment template
├── package.json          # All dependencies installed
├── server.js             # Delegation to src/server.js
└── production-*.sh       # Production management scripts
```

## Database

**PostgreSQL Extensions Required**:
- `pgvector` - Vector similarity search for embeddings
- `uuid-ossp` - UUID generation
- `pg_trgm` - Trigram matching for fuzzy search (optional)

**Core Data Models**:
- User Account, Article, Article Version, Tag, Article Tag Association
- Follow, Message, Custom Exposition Page, Exposition Criteria
- Feedback, Feedback Ranking, Feedback Utility Scores, Feedback Resolution

## MCP (Model Context Protocol) Integration

The platform uses MCP as its primary communication protocol:

**MCP Tools** (user-initiated actions):
- Article management: `create_article`, `update_article`, `delete_article`
- Feedback system: `submit_feedback`, `rank_feedback`, `get_feedback_rankings`
- Content discovery: `search_articles`, `get_article`, `check_feedback_similarity`
- User features: `update_profile`, `follow_author`, `unfollow_author`

**Real-time Events** (server-initiated updates):
- `feedback_ranked`, `feedback_addressed`, `article_updated`, `ranking_updated`

## Design System

**Colors**:
- Primary: Deep Green (#2f5233)
- Accent: Muted Gold (#c9a961)
- Background: Warm off-white (#fafaf7)
- Text: Near-black (#1a1a1a)

**Typography**:
- Sans-serif for UI: Inter, Segoe UI
- Serif for body: Lora, Georgia
- Monospace for code: JetBrains Mono, Fira Code

## Environment Variables (Development)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_foyer_dev

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here

# Server
NODE_ENV=development
PORT=3000
WS_PORT=3001

# Email (use test service like Ethereal for development)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=test-user
SMTP_PASS=test-password
EMAIL_FROM=noreply@knowledgefoyer.test

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

## Development Guidelines

**Security Considerations**:
- Rate limiting on all endpoints (especially login, feedback submission)
- Input sanitization and SQL injection prevention
- HTTPS required in production (WSS for WebSockets)
- Origin validation for WebSocket connections

**Performance Optimizations**:
- Database indexing for common queries
- Redis caching for frequently accessed data
- WebSocket connection pooling
- Optimistic UI updates

**Testing Strategy**:
- Unit tests for business logic
- Integration tests for API endpoints
- End-to-end tests for critical user flows
- WebSocket testing tools for MCP debugging

## Implementation Status - COMPLETE ✅

**All core implementation phases completed:**

1. **✅ Project Setup**: Complete Node.js structure with 30+ dependencies
2. **✅ Database Schema**: 6 migrations with comprehensive PostgreSQL schema + pgvector
3. **✅ Authentication Layer**: JWT, bcrypt, email verification fully implemented
4. **✅ REST API Foundation**: Complete Express API with security middleware
5. **✅ MCP Server Implementation**: Full WebSocket/MCP server with 40+ tools
6. **✅ Frontend Development**: Production-ready SPA with PWA features
7. **✅ AI Integration**: OpenAI embeddings, feedback analysis, similarity detection
8. **🔄 Performance & Deployment**: Final optimization phase in progress

**Current Status**: Production-ready platform with comprehensive feature set

## Key Documentation Files

- `knowledgefoyer-design.md`: Original 2000+ line design specification
- `development-progress.md`: Accurate phase-by-phase implementation status
- `DEVELOPMENT_SETUP.md`: Setup and configuration guide
- `README.md`: User-facing documentation (needs updating)
- `CLAUDE.md`: This file - guidance for Claude Code
- `.env.example`: Complete environment configuration template

## Implementation Highlights

**Backend Features Completed:**
- User authentication with email verification
- Article publishing with version control
- Structured feedback system with AI duplicate detection
- Social features (follow, messaging, feeds)
- Custom exposition pages
- Real-time WebSocket communication
- OpenAI integration for content analysis
- Comprehensive security and rate limiting

**Frontend Features Completed:**
- Single Page Application (SPA) with hash routing
- Progressive Web App (PWA) with offline support
- Responsive design with mobile-first approach
- Real-time UI updates via WebSocket
- Complete user dashboard and article editor
- Search and discovery systems
- Authentication modals and user management