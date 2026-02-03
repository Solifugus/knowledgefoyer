# Knowledge Foyer Development Setup

This guide walks you through setting up Knowledge Foyer for development with nginx reverse proxy support.

## 🏗️ Architecture

```
nginx (port 80)
    ↓
Knowledge Foyer App (port 8000)
WebSocket Server (port 8001)
    ↓
PostgreSQL Database
```

## ✅ Current Status

**Phase 1 Complete (100%)** - Core Platform MVP
- ✅ Express.js application with security middleware
- ✅ JWT authentication system
- ✅ Database models (User, Article)
- ✅ Complete REST API (/api/auth, /api/articles)
- ✅ MCP WebSocket server
- ✅ Subdomain routing (username.domain.com)
- ✅ nginx configuration and automation

## 🚀 Quick Start

### 1. Application Testing (No nginx)

Test the application directly:

```bash
# Start the application
npm start

# In another terminal, test endpoints:
curl http://localhost:8000/health
curl http://localhost:8000/api
curl -H "Host: testuser.localhost" http://localhost:8000/
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
PORT=8000              # App server port (behind nginx)
WS_PORT=8001          # WebSocket server port
BASE_URL=http://localhost

# JWT Configuration
JWT_SECRET=development-jwt-secret-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Database (configure when ready)
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_foyer_dev

# CORS
ALLOWED_ORIGINS=http://localhost,http://localhost:8000
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

## 🗄️ Database Setup (Phase 2)

When ready to set up the database:

```bash
# 1. Install PostgreSQL with pgvector
sudo apt-get install postgresql postgresql-contrib
# Then install pgvector extension

# 2. Create database
createdb knowledge_foyer_dev

# 3. Run migrations
npm run db:migrate

# 4. Test database connection
curl http://localhost/api/stats
```

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

## 🎯 Current Test Results

✅ **Application Server**: Running on port 8000
✅ **WebSocket Server**: Running on port 8001
✅ **API Endpoints**: All routes configured and responding
✅ **Subdomain Routing**: testuser.localhost working perfectly
✅ **nginx Configuration**: Complete with security and performance optimizations
✅ **Rate Limiting**: API protection configured
✅ **Error Handling**: Comprehensive error responses

**Ready for full-stack development!** 🚀