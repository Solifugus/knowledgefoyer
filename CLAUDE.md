# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Foyer is a professional publishing platform where creators share evolving work and receive structured, quality feedback. The project currently exists as a comprehensive design specification in `knowledgefoyer-design.md` and has not yet been implemented.

**Current Status**: Design/Specification Phase (0% implementation)

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

**Key Dependencies** (specified but not yet installed):
- `express`, `ws`, `@modelcontextprotocol/sdk`
- `pg`, `pgvector`, `jsonwebtoken`, `bcrypt`
- `openai`, `nodemailer`, `validator`, `dotenv`
- `nodemon` for development

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

**Note**: The following commands are specified in the design document but package.json does not exist yet.

```bash
# Installation (when package.json exists)
npm install
cp .env.example .env
# Edit .env with your values

# Database operations
npm run db:migrate     # Run migrations
npm run db:seed        # Seed development data (optional)

# Development
npm run dev            # Start with nodemon for auto-reload

# Testing
npm test               # Run test suite
npm run test:watch     # Watch mode for development
```

## Project Structure (Planned)

```
knowledge-foyer/
├── src/
│   ├── config/           # Configuration files
│   ├── db/              # Database connection, migrations
│   ├── models/          # Data models
│   ├── routes/          # REST endpoints
│   ├── mcp/             # MCP server and tools
│   ├── services/        # Business logic, OpenAI integration
│   ├── middleware/      # Express middleware, auth
│   ├── utils/           # Utilities, helpers
│   └── app.js           # Express app setup
├── public/              # Static assets (CSS, JS, images)
├── views/               # HTML templates (if using SSR)
├── migrations/          # Database migrations
├── tests/               # Test files
├── .env.example         # Environment template
├── package.json
└── server.js            # Entry point
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

## Implementation Priority

Since this is a design-only project, implementation should start with:

1. **Project Setup**: Create package.json and basic Node.js structure
2. **Database Schema**: Implement PostgreSQL schema and migrations
3. **Authentication Layer**: JWT, bcrypt, email verification
4. **REST API Foundation**: Basic Express endpoints before WebSocket/MCP
5. **MCP Server Implementation**: Add WebSocket layer with MCP tools
6. **Frontend Development**: Progressive enhancement from server-rendered HTML
7. **AI Integration**: OpenAI API for embeddings and feedback analysis
8. **Testing & Documentation**: Comprehensive test suite and setup guides

## Current Files

- `knowledgefoyer-design.md`: Complete 2000+ line design specification
- `.claude/settings.local.json`: Local Claude IDE settings