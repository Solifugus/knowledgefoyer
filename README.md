# Knowledge Foyer 🏛️

**A professional publishing platform where creators share evolving work and receive structured, quality feedback.**

[![Development Status](https://img.shields.io/badge/status-Foundation%20Complete-green)](https://github.com/knowledge-foyer/platform)
[![Phase](https://img.shields.io/badge/current%20phase-Ready%20for%20Phase%201-blue)](./docs/development-plan.md)
[![Progress](https://img.shields.io/badge/progress-14%25-orange)](#development-progress)

## 🎯 Vision

Knowledge Foyer emphasizes content quality over engagement metrics, enabling creators to:
- Share work that improves over time through structured feedback
- Discover content through semantic tagging and AI recommendations
- Receive meaningful critiques that distinguish utility from sentiment
- Build professional credibility through demonstrated work

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+ with pgvector extension
- OpenAI API key (for AI features in Phase 6)

### Installation

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd knowledge-foyer
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database and API credentials
   ```

3. **Set up database**
   ```bash
   createdb knowledge_foyer_dev
   psql knowledge_foyer_dev -c "CREATE EXTENSION pgvector;"
   psql knowledge_foyer_dev -c "CREATE EXTENSION \"uuid-ossp\";"
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Visit the application**
   - Main site: http://localhost:3000
   - Test user page: http://testuser.localhost:3000
   - Health check: http://localhost:3000/health

## 🏗️ Architecture

**Hybrid Communication Protocol:**
- **MCP over WebSockets**: Primary protocol for authenticated interactions
- **REST over HTTP**: Supporting protocol for SEO, initial page loads, OAuth

**Technology Stack:**
- **Backend**: Node.js, Express, WebSocket, MCP (Model Context Protocol)
- **Frontend**: Vanilla HTML/CSS/JS (progressive enhancement)
- **Database**: PostgreSQL with pgvector for AI embeddings
- **AI**: OpenAI API for feedback analysis and similarity detection
- **Real-time**: WebSocket events with MCP tool calls

## 📊 Development Progress

**Current Status: Foundation Phase Complete ✅**

```
Overall Progress: 14% (1/7 phases complete)

✅ Foundation    - Project infrastructure, basic Express app
⏳ Phase 1      - Core Platform (Authentication, Articles, MCP)
⏳ Phase 2      - Feedback System with real-time ranking
⏳ Phase 3      - Version Control and change tracking
⏳ Phase 4      - Social Features (follow, messaging)
⏳ Phase 5      - Custom Exposition Pages
⏳ Phase 6      - OpenAI Integration (embeddings, analysis)
```

**View detailed progress:**
```bash
npm run progress:show
```

## 🛠️ Available Scripts

```bash
# Development
npm run dev              # Start development server with auto-reload
npm start               # Start production server
npm test                # Run test suite
npm run test:watch      # Watch mode for testing

# Database
npm run db:migrate      # Run database migrations
npm run db:seed         # Seed development data

# Development Tools
npm run lint            # Check code style
npm run lint:fix        # Fix code style issues
npm run progress:show   # Display development progress
```

## 📂 Project Structure

```
knowledge-foyer/
├── src/
│   ├── config/           # Configuration files
│   ├── db/              # Database connections, queries
│   ├── models/          # Data models (coming in Phase 1)
│   ├── routes/          # REST API routes (coming in Phase 1)
│   ├── mcp/             # MCP server and tools
│   │   ├── server.js    # WebSocket MCP server
│   │   └── tools/       # MCP tool implementations
│   ├── services/        # Business logic, external APIs
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # JWT authentication
│   │   ├── subdomain.js # Subdomain routing
│   │   └── errorHandlers.js
│   ├── utils/
│   │   └── progress.js  # Development progress tracker
│   ├── app.js           # Express application setup
│   └── server.js        # Main entry point
├── public/              # Static assets (CSS, JS, images)
├── views/               # HTML templates (coming in Phase 1)
├── migrations/          # Database migration files
├── tests/               # Test files
├── .development-progress.json  # Progress tracking
├── package.json
└── README.md
```

## 🔧 Current Features (Foundation Phase)

- ✅ **Express Application**: Configured with security middleware, CORS, rate limiting
- ✅ **Subdomain Routing**: Support for username.localhost:3000 user spaces
- ✅ **MCP WebSocket Server**: Basic WebSocket server with authentication
- ✅ **Progress Tracking**: Automated development progress monitoring
- ✅ **Development Environment**: Hot reloading, error handling, logging

**Demo Pages:**
- Landing page with project overview
- Placeholder author pages (username.localhost:3000)
- Basic article pages with routing
- Health check and metrics endpoints

## 🎯 Next Phase: Core Platform (Phase 1)

**Ready to implement:**
- User registration and email verification
- JWT authentication for REST and WebSocket
- Article creation and publishing via MCP tools
- Database schema with core tables
- Tag system and content management

**Estimated Duration: 2-3 weeks**

## 🔐 Security Features

- Helmet.js for security headers
- CORS with configurable origins
- Rate limiting on authentication and API endpoints
- JWT-based authentication for both REST and WebSocket
- Input validation and sanitization (coming in Phase 1)
- bcrypt password hashing (coming in Phase 1)

## 📋 Environment Configuration

Key environment variables (see `.env.example`):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_foyer_dev

# Authentication
JWT_SECRET=your-super-secret-key
JWT_ACCESS_EXPIRY=15m

# Server
NODE_ENV=development
PORT=3000
WS_PORT=3001

# Email (for Phase 1)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587

# OpenAI (for Phase 6)
OPENAI_API_KEY=sk-your-key-here
```

## 🧪 Testing Strategy

**Current Test Coverage: 0% (tests coming in Phase 1)**

**Planned Test Suites:**
- Unit tests for business logic
- Integration tests for REST and MCP APIs
- End-to-end tests for critical user flows
- WebSocket connection and real-time event testing

## 📚 Key Concepts

**MCP (Model Context Protocol):**
- Tool-based architecture for structured client-server communication
- WebSocket persistence enables real-time updates
- Future-proof for AI agent integration

**Subdomain Multi-tenancy:**
- Each user gets their own subdomain (username.knowledgefoyer.com)
- Content isolation and custom branding
- SEO benefits for individual creators

**Structured Feedback System:**
- Three-way ranking: positive utility, negative utility, ignore
- AI-powered duplicate detection (Phase 6)
- Community curation distinguishes helpful from harmful feedback

## 🚀 Production Deployment

**Infrastructure Requirements:**
- VPS with 4GB RAM, 2 CPU cores minimum
- PostgreSQL 15+ with pgvector extension
- Redis for caching (Phase 6+)
- SSL certificate with wildcard domain support
- NGINX reverse proxy for WebSocket and HTTP

**Deployment checklist available in:** `/docs/production-deployment.md` (coming in Phase 1)

## 📖 Documentation

- [Development Plan](/.claude/plans/wiggly-crafting-lecun.md) - Complete implementation roadmap
- [Design Specification](./knowledgefoyer-design.md) - Full feature specification
- [Claude Code Guidance](./CLAUDE.md) - Guide for AI assistance

## 🤝 Contributing

This project follows a structured development approach with clear phases and progress tracking.

**Current Focus: Phase 1 - Core Platform**
- Database schema implementation
- User authentication system
- Article publishing via MCP
- Test suite foundation

**To contribute:**
1. Check current phase progress: `npm run progress:show`
2. Review the development plan and current phase requirements
3. Follow existing code patterns and architecture decisions
4. Ensure all tests pass before submitting changes

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with cutting-edge technology for the future of professional content creation.**

*Knowledge Foyer - Where ideas evolve through thoughtful feedback.*