# Knowledge Foyer Development Setup

This guide walks you through setting up Knowledge Foyer for development with nginx reverse proxy support.

## 🏗️ Architecture

```
nginx (port 80) [Optional]
    ↓
Knowledge Foyer App (port 3000)
WebSocket Server (port 3001)
    ↓
PostgreSQL Database with pgvector
```

## ✅ Current Status

**Phases 1-6 Complete (95%)** - Production-Ready Platform
- ✅ Express.js application with comprehensive security middleware
- ✅ JWT authentication with email verification system
- ✅ Complete database models (User, Article, ArticleVersion, Feedback, etc.)
- ✅ Full REST API (/api/auth, /api/articles, /api/expositions)
- ✅ MCP WebSocket server with 40+ tools implemented
- ✅ Social features (follow, messaging, feeds, notifications)
- ✅ Version control system with article history
- ✅ Custom exposition pages with flexible criteria
- ✅ OpenAI integration (embeddings, feedback analysis, similarity detection)
- ✅ Complete SPA frontend with PWA features
- ✅ Real-time WebSocket communication
- ✅ Subdomain routing and nginx configuration

## 🚀 Quick Start

### 1. Application Testing (No nginx)

Test the application directly:

```bash
# Start the application
npm start

# In another terminal, test endpoints:
curl http://localhost:3000/health
curl http://localhost:3000/api
curl -H "Host: testuser.localhost" http://localhost:3000/
```

### 2. Full Setup with nginx

#### Install nginx Configuration

```bash
# Install our nginx configuration
sudo ./nginx/setup.sh install

# This will:
# - Copy configuration to /etc/nginx/sites-available/knowledgefoyer
# - Enable the site
# - Test and reload nginx
```

#### Start Knowledge Foyer

```bash
# Start the application (uses ports 8000/8001)
npm run dev
```

#### Test Complete Setup

```bash
# Test the nginx + app setup
./nginx/setup.sh test

# Manual testing:
curl http://localhost/health
curl http://localhost/api
curl -H "Host: testuser.localhost" http://localhost/
```

## 🔧 Configuration

### Environment Variables (.env)

```env
NODE_ENV=development
PORT=3000              # App server port (default configuration)
WS_PORT=3001          # WebSocket server port
BASE_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=development-jwt-secret-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database (fully configured and operational)
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_foyer_dev
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# OpenAI Integration (operational)
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_COMPLETION_MODEL=gpt-4
OPENAI_DAILY_BUDGET=5.00

# Email Configuration
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-test-email@ethereal.email
SMTP_PASS=your-test-password

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### nginx Configuration

The nginx configuration (`nginx/knowledgefoyer.conf`) provides:

- **Reverse Proxy**: nginx (port 80) → App (port 8000)
- **WebSocket Support**: `/ws/` → WebSocket server (port 8001)
- **Subdomain Routing**: `*.localhost` handled correctly
- **Rate Limiting**: API and auth endpoints protected
- **Security Headers**: XSS protection, CSRF protection
- **Gzip Compression**: Better performance
- **Static File Serving**: Optional optimization

## 📝 Available Scripts

### Application Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run test suite
npm run db:migrate # Run database migrations
```

### nginx Management

```bash
sudo ./nginx/setup.sh install   # Install nginx configuration
sudo ./nginx/setup.sh remove    # Remove nginx configuration
sudo ./nginx/setup.sh reload    # Reload nginx
./nginx/setup.sh test           # Test setup (no sudo needed)
./nginx/setup.sh status         # Show status (no sudo needed)
```

## 🌐 Available URLs

### With nginx (Recommended)

- **Main Site**: http://localhost/
- **API**: http://localhost/api
- **User Pages**: http://testuser.localhost/
- **Health Check**: http://localhost/health
- **WebSockets**: ws://localhost/ws/

### Direct Access (Development)

- **Main Site**: http://localhost:8000/
- **API**: http://localhost:8000/api
- **Health Check**: http://localhost:8000/health
- **WebSockets**: ws://localhost:8001

## 🧪 Testing Endpoints

### Health & Status

```bash
# Health check
curl http://localhost/health

# API information
curl http://localhost/api

# System metrics (localhost only)
curl http://localhost/metrics
```

### Authentication API

```bash
# Register new user
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testuser","password":"password123"}'
```

### Articles API

```bash
# Get articles for user (requires authentication)
curl http://localhost/api/articles?username=testuser

# Search articles
curl "http://localhost/api/search?q=knowledge"

# Content discovery
curl "http://localhost/api/discover?category=recent"
```

### Subdomain Testing

```bash
# Test user subdomain
curl -H "Host: testuser.localhost" http://localhost/

# Test article on subdomain
curl -H "Host: testuser.localhost" http://localhost/my-article-slug
```

## 🗄️ Database Setup (Completed ✅)

The database is fully configured and operational:

```bash
# Database is already set up with:
# - PostgreSQL 17.7 with pgvector extension
# - 6 complete migrations (001-006)
# - Comprehensive schema with all tables
# - Vector embeddings support for AI features

# To verify database status:
npm run db:test

# To re-run migrations if needed:
npm run db:migrate

# Test database connection:
curl http://localhost:3000/health
```

**Current Database Features:**
- ✅ User authentication and email verification
- ✅ Article management with version control
- ✅ Feedback system with AI-powered analysis
- ✅ Social features (follows, messages, notifications)
- ✅ Custom exposition pages
- ✅ Vector embeddings for content similarity

## 🐳 Docker Setup (Optional)

For a complete containerized setup:

```bash
# Build and start services
docker-compose up -d

# This will start:
# - nginx (port 80)
# - Knowledge Foyer app (port 8000)
# - PostgreSQL (port 5432)
```

## 🔍 Troubleshooting

### Port Conflicts

```bash
# Check what's using ports
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :8000

# Kill processes if needed
sudo pkill nginx
pkill -f "node src/server.js"
```

### nginx Issues

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx status
systemctl status nginx

# View nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Application Issues

```bash
# Check application logs
tail -f /tmp/app.log

# Test direct connection (bypass nginx)
curl http://localhost:8000/health

# Check WebSocket server
curl http://localhost:8001
```

## 🚀 Performance Testing

### Load Testing with curl

```bash
# Test concurrent requests
for i in {1..10}; do
  curl -s http://localhost/health &
done
wait

# Test rate limiting
for i in {1..20}; do
  curl -s http://localhost/api/auth/register &
done
wait
```

### WebSocket Testing

```bash
# Install wscat for WebSocket testing
npm install -g wscat

# Test WebSocket connection
wscat -c ws://localhost/ws/
```

## 📊 Monitoring

### Application Metrics

```bash
# System metrics (restricted to localhost)
curl http://localhost/metrics

# Health with uptime
curl http://localhost/health
```

### nginx Metrics

```bash
# nginx status (if enabled)
curl http://localhost/nginx_status
```

## 🔐 Security Features

### Built-in Security

- **Rate Limiting**: 10 req/s for API, 5 req/m for auth
- **Security Headers**: XSS, CSRF, Content-Type protection
- **CORS**: Configured origins only
- **JWT**: Secure token-based authentication
- **Password Hashing**: bcrypt with 12 rounds
- **Input Validation**: All inputs validated and sanitized

### nginx Security

- **Reverse Proxy**: Hides internal ports
- **Request Filtering**: Invalid requests blocked
- **SSL Ready**: Configuration prepared for HTTPS
- **Access Control**: Metrics endpoint restricted

## 📈 Next Steps

1. **Database Setup**: Configure PostgreSQL and run migrations
2. **Frontend Development**: Build the user interface
3. **Testing Suite**: Comprehensive test coverage
4. **CI/CD Pipeline**: Automated testing and deployment
5. **Production Deployment**: SSL, monitoring, scaling

---

## 🎯 Current Implementation Status

✅ **Application Server**: Production-ready on port 3000
✅ **WebSocket/MCP Server**: Full implementation on port 3001
✅ **Database**: PostgreSQL 17.7 with pgvector, 6 migrations complete
✅ **API Endpoints**: Complete REST API with authentication, articles, expositions
✅ **MCP Tools**: 40+ implemented tools for real-time communication
✅ **Frontend SPA**: Complete single-page application with PWA features
✅ **AI Integration**: OpenAI embeddings and GPT-4 analysis
✅ **Social Features**: Follow, messaging, feeds, notifications
✅ **Version Control**: Article versioning with diff visualization
✅ **Custom Expositions**: User-created content collections
✅ **Security**: JWT auth, rate limiting, email verification
✅ **Real-time Updates**: WebSocket events and live notifications

**Production-ready platform - Ready for deployment!** 🚀