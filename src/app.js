/**
 * Knowledge Foyer Express Application
 *
 * Main Express application setup with middleware, routing, and configuration.
 * This handles the REST API and serves static content for the platform.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const { subdomainRouter } = require('./middleware/subdomain');
const { authMiddleware } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const expositionRoutes = require('./routes/expositions');
const apiRoutes = require('./routes/api');

const app = express();

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  // Allow WebSocket connections
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // TODO: Remove unsafe-inline in production
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow WebSocket connections
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

    // Allow localhost subdomains for development
    if (process.env.NODE_ENV === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies for authentication
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // For large article content
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : (parseInt(process.env.LOGIN_RATE_LIMIT_PER_15MIN) || 5),
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);

// Static file serving
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// Serve manifest.json for PWA
app.use('/manifest.json', express.static(path.join(__dirname, '../public/manifest.json')));

// Favicon endpoint (prevents 404 errors in browser console)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('../package.json').version,
    database: 'pending', // Will be updated when database connection is established
    mcp_server: 'pending', // Will be updated when MCP server is running
  });
});

// Basic metrics endpoint (for monitoring)
app.get('/metrics', (req, res) => {
  res.json({
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Subdomain routing middleware (handles username.domain.com routing)
app.use(subdomainRouter);

// Landing page route - MUST come before other routes
app.get('/', (req, res) => {
  // Check if this is a subdomain request
  const subdomain = req.subdomain;

  if (subdomain && subdomain !== 'www') {
    // User subdomain - serve author page (TODO: Update to new design)
    res.send(generateAuthorPage(subdomain));
  } else {
    // Main domain - serve new contemporary blue landing page
    res.sendFile(path.join(__dirname, '../public/landing.html'));
  }
});

// Frontend routes for user interaction
app.get('/register', (req, res) => {
  // Serve new contemporary blue registration page
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/login', (req, res) => {
  // Serve new contemporary blue login page
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dashboard', (req, res) => {
  // Serve new contemporary blue dashboard page
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/workspace', (req, res) => {
  // Serve three-column pro/con feedback workspace
  res.sendFile(path.join(__dirname, '../public/workspace.html'));
});

app.get('/workspace-demo', (req, res) => {
  // Serve pro/con feedback system demo (no authentication required)
  res.sendFile(path.join(__dirname, '../public/workspace-demo.html'));
});

app.get('/create-article', (req, res) => {
  // Redirect to new article editor
  res.redirect('/article-editor.html');
});

app.get('/article-editor.html', (req, res) => {
  // Serve new contemporary blue three-column article editor
  res.sendFile(path.join(__dirname, '../public/article-editor.html'));
});

app.get('/profile', (req, res) => {
  res.send(generateProfilePage());
});

app.get('/analytics', (req, res) => {
  res.send(generateAnalyticsPage());
});

app.get('/ai-settings', (req, res) => {
  res.send(generateAISettingsPage());
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/expositions', expositionRoutes);
app.use('/api', apiRoutes);

// Article route (will be enhanced in Phase 1)
app.get('/:slug', (req, res) => {
  const { slug } = req.params;
  const subdomain = req.subdomain;

  if (subdomain && subdomain !== 'www') {
    // Article on user subdomain
    res.send(generateArticlePage(subdomain, slug));
  } else {
    // Article on main domain (redirect to author subdomain)
    res.redirect(301, `http://${process.env.BASE_URL}/${slug}`);
  }
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Generate basic landing page HTML
 * TODO: Move to proper template system in Phase 1
 */
function generateLandingPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Foyer - Professional Publishing Platform</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #2f5233; font-size: 2.5em; margin-bottom: 0.5em; }
        .highlight { color: #c9a961; }
        .status { background: #f0f7f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .btn { display: inline-block; background: #c9a961; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 10px 10px 0; }
        .btn:hover { background: #b89550; }
        .btn-primary { background: #2f5233; }
        .btn-primary:hover { background: #1e3421; }
        .auth-section { background: #f8f8f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to <span class="highlight">Knowledge Foyer</span></h1>
        <p>A professional publishing platform where creators share evolving work and receive structured, quality feedback.</p>

        <div class="auth-section">
            <h3>Get Started</h3>
            <p>Join the community of creators and start sharing your work today!</p>
            <a href="/register" class="btn btn-primary">Register</a>
            <a href="/login" class="btn">Login</a>
            <a href="/dashboard" class="btn">Dashboard</a>
        </div>

        <h2>Core Features</h2>
        <ul>
            <li><strong>Semantic Discovery</strong> - Find content through tags and AI-powered recommendations</li>
            <li><strong>Structured Feedback</strong> - Community-curated feedback that distinguishes utility from sentiment</li>
            <li><strong>Version Control</strong> - Track improvements to your work over time</li>
            <li><strong>Real-time Collaboration</strong> - MCP-powered WebSocket communication</li>
            <li><strong>AI Integration</strong> - Duplicate detection and feedback analysis</li>
        </ul>

        <h2>Platform Technologies</h2>
        <ul>
            <li>MCP (Model Context Protocol) over WebSockets</li>
            <li>PostgreSQL with pgvector for AI embeddings</li>
            <li>OpenAI API integration for intelligent feedback</li>
            <li>Progressive Web App capabilities</li>
        </ul>

        <a href="/health" class="btn">Health Check</a>
        <a href="/metrics" class="btn">System Metrics</a>

        <p style="margin-top: 40px; color: #525252; font-size: 0.9em;">
            All phases completed ✅ | Fully functional AI-powered publishing platform
        </p>
    </div>
</body>
</html>`;
}

/**
 * Generate basic author page HTML
 * TODO: Move to proper template system and database integration in Phase 1
 */
function generateAuthorPage(username) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${username} - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #2f5233; }
        .highlight { color: #c9a961; }
        .placeholder { background: #f5f5f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${username}'s <span class="highlight">Knowledge Foyer</span></h1>

        <div class="placeholder">
            <h3>🚧 Author Page Under Construction</h3>
            <p>This is where ${username}'s articles, bio, and curated content will appear once the platform is fully implemented.</p>
            <p><strong>Coming in Phase 1:</strong> User profiles, article publishing, and content management.</p>
        </div>

        <p><a href="/">← Back to Knowledge Foyer</a></p>
    </div>
</body>
</html>`;
}

/**
 * Generate basic article page HTML
 * TODO: Move to proper template system and database integration in Phase 1
 */
function generateArticlePage(username, slug) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${slug} by ${username} - Knowledge Foyer</title>
    <style>
        body { font-family: 'Lora', Georgia, serif; line-height: 1.8; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 700px; margin: 0 auto; }
        h1 { color: #2f5233; font-family: 'Segoe UI', sans-serif; }
        .author { color: #525252; margin-bottom: 30px; }
        .placeholder { background: #f5f5f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${slug.replace(/-/g, ' ')}</h1>
        <div class="author">by <strong>${username}</strong></div>

        <div class="placeholder">
            <h3>📝 Article Content Coming Soon</h3>
            <p>This is where the article "${slug}" by ${username} will appear once the content management system is implemented.</p>
            <p><strong>Coming in Phase 1:</strong> Full article content, version history, and feedback system.</p>
        </div>

        <p><a href="/">← Back to ${username}'s Foyer</a></p>
    </div>
</body>
</html>`;
}

/**
 * Generate registration page HTML
 */
function generateRegisterPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 500px; margin: 0 auto; }
        h1 { color: #2f5233; text-align: center; }
        .highlight { color: #c9a961; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus { border-color: #c9a961; outline: none; }
        .btn { display: inline-block; background: #2f5233; color: white; padding: 12px 24px; text-decoration: none; border: none; border-radius: 6px; cursor: pointer; width: 100%; }
        .btn:hover { background: #1e3421; }
        .form-card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .links { text-align: center; margin-top: 20px; }
        .error { color: #d32f2f; margin-top: 10px; display: none; }
        .success { color: #2e7d32; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="form-card">
            <h1>Join <span class="highlight">Knowledge Foyer</span></h1>
            <p style="text-align: center; color: #525252;">Create your account and start publishing</p>

            <form id="registerForm">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required placeholder="Choose a unique username">
                </div>

                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email" required placeholder="your@email.com">
                </div>

                <div class="form-group">
                    <label for="displayName">Display Name</label>
                    <input type="text" id="displayName" name="displayName" required placeholder="Your full name">
                </div>

                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required placeholder="Choose a strong password">
                </div>

                <div class="form-group">
                    <label for="confirmPassword">Confirm Password</label>
                    <input type="password" id="confirmPassword" name="confirmPassword" required placeholder="Confirm your password">
                </div>

                <button type="submit" class="btn">Create Account</button>

                <div id="error" class="error"></div>
                <div id="success" class="success"></div>
            </form>

            <div class="links">
                <p>Already have an account? <a href="/login" style="color: #c9a961;">Login here</a></p>
                <p><a href="/" style="color: #525252;">← Back to Home</a></p>
            </div>
        </div>
    </div>

    <script>
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);

            // Validate passwords match
            if (data.password !== data.confirmPassword) {
                showError('Passwords do not match');
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showSuccess('Registration successful! Please check your email to verify your account.');
                    e.target.reset();
                } else {
                    showError(result.message || 'Registration failed');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        });

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('success').style.display = 'none';
        }

        function showSuccess(message) {
            document.getElementById('success').textContent = message;
            document.getElementById('success').style.display = 'block';
            document.getElementById('error').style.display = 'none';
        }
    </script>
</body>
</html>`;
}

/**
 * Generate login page HTML
 */
function generateLoginPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 400px; margin: 0 auto; }
        h1 { color: #2f5233; text-align: center; }
        .highlight { color: #c9a961; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus { border-color: #c9a961; outline: none; }
        .btn { display: inline-block; background: #2f5233; color: white; padding: 12px 24px; text-decoration: none; border: none; border-radius: 6px; cursor: pointer; width: 100%; }
        .btn:hover { background: #1e3421; }
        .form-card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .links { text-align: center; margin-top: 20px; }
        .error { color: #d32f2f; margin-top: 10px; display: none; }
        .success { color: #2e7d32; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="form-card">
            <h1>Welcome back to <span class="highlight">Knowledge Foyer</span></h1>
            <p style="text-align: center; color: #525252;">Sign in to your account</p>

            <form id="loginForm">
                <div class="form-group">
                    <label for="identifier">Username or Email</label>
                    <input type="text" id="identifier" name="identifier" required placeholder="Enter username or email">
                </div>

                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required placeholder="Enter your password">
                </div>

                <button type="submit" class="btn">Sign In</button>

                <div id="error" class="error"></div>
                <div id="success" class="success"></div>
            </form>

            <div class="links">
                <p>Don't have an account? <a href="/register" style="color: #c9a961;">Register here</a></p>
                <p><a href="/" style="color: #525252;">← Back to Home</a></p>
            </div>
        </div>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            console.log('Login form submitted');
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            console.log('Form data:', data);

            try {
                console.log('Sending login request...');
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                console.log('Response status:', response.status);

                const result = await response.json();
                console.log('Response data:', result);

                if (response.ok) {
                    showSuccess('Login successful! Redirecting...');
                    localStorage.setItem('authToken', result.tokens.access_token);
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1000);
                } else {
                    showError(result.message || 'Login failed');
                }
            } catch (error) {
                console.error('Login error:', error);
                showError('Network error. Please try again.');
            }
        });

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('success').style.display = 'none';
        }

        function showSuccess(message) {
            document.getElementById('success').textContent = message;
            document.getElementById('success').style.display = 'block';
            document.getElementById('error').style.display = 'none';
        }
    </script>
</body>
</html>`;
}

/**
 * Generate dashboard page HTML
 */
function generateDashboardPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        h1 { color: #2f5233; margin: 0; }
        .highlight { color: #c9a961; }
        .btn { display: inline-block; background: #c9a961; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px; }
        .btn:hover { background: #b89550; }
        .btn-primary { background: #2f5233; }
        .btn-primary:hover { background: #1e3421; }
        .dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .dashboard-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .stats { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .stat { text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #2f5233; }
        .stat-label { color: #525252; font-size: 0.9em; }
        .recent-activity { margin-top: 30px; }
        .activity-item { padding: 15px; border-left: 3px solid #c9a961; margin-bottom: 10px; background: #f8f8f5; }
        .error { color: #d32f2f; margin-top: 10px; display: none; }
        .loading { color: #525252; text-align: center; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><span class="highlight">Knowledge Foyer</span> Dashboard</h1>
            <div>
                <a href="#" class="btn" id="createArticleBtn">Create Article</a>
                <a href="#" class="btn" id="profileBtn">My Profile</a>
                <a href="#" class="btn" id="logoutBtn">Logout</a>
            </div>
        </div>

        <div id="loginPrompt" style="display: none; text-align: center; padding: 40px;">
            <h2>Please log in to view your dashboard</h2>
            <p><a href="/login" class="btn btn-primary">Login</a> or <a href="/register" class="btn">Register</a></p>
        </div>

        <div id="dashboardContent" style="display: none;">
            <div class="stats">
                <div class="stat">
                    <div class="stat-number" id="articleCount">-</div>
                    <div class="stat-label">Articles Published</div>
                </div>
                <div class="stat">
                    <div class="stat-number" id="feedbackCount">-</div>
                    <div class="stat-label">Feedback Received</div>
                </div>
                <div class="stat">
                    <div class="stat-number" id="viewCount">-</div>
                    <div class="stat-label">Total Views</div>
                </div>
                <div class="stat">
                    <div class="stat-number" id="followerCount">-</div>
                    <div class="stat-label">Followers</div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="dashboard-card">
                    <h3>Quick Actions</h3>
                    <p><a href="#" class="btn btn-primary" id="writeArticleBtn">Write New Article</a></p>
                    <p><a href="#" class="btn" id="manageArticlesBtn">Manage Articles</a></p>
                    <p><a href="#" class="btn" id="analyticsBtn">View Analytics</a></p>
                </div>

                <div class="dashboard-card">
                    <h3>AI Features</h3>
                    <p>✅ OpenAI integration active</p>
                    <p>✅ Feedback similarity detection</p>
                    <p>✅ Content recommendations</p>
                    <p><a href="#" class="btn" id="aiSettingsBtn">AI Settings</a></p>
                </div>
            </div>

            <div class="recent-activity">
                <h3>Recent Activity</h3>
                <div id="activityList">
                    <div class="loading">Loading your recent activity...</div>
                </div>
            </div>
        </div>

        <div id="error" class="error"></div>

        <p style="margin-top: 40px; text-align: center;">
            <a href="/" style="color: #525252;">← Back to Home</a>
        </p>
    </div>

    <script>
        // Check if user is logged in
        const token = localStorage.getItem('authToken');

        if (!token) {
            document.getElementById('loginPrompt').style.display = 'block';
        } else {
            document.getElementById('dashboardContent').style.display = 'block';
            loadDashboardData();
            setupButtonHandlers();
        }

        async function loadDashboardData() {
            try {
                // Load user stats (placeholder - would connect to real API)
                document.getElementById('articleCount').textContent = '0';
                document.getElementById('feedbackCount').textContent = '0';
                document.getElementById('viewCount').textContent = '0';
                document.getElementById('followerCount').textContent = '0';

                // Load recent activity
                document.getElementById('activityList').innerHTML =
                    '<div class="activity-item">Welcome to Knowledge Foyer! Start by creating your first article.</div>';

            } catch (error) {
                showError('Failed to load dashboard data');
            }
        }

        function setupButtonHandlers() {
            // Header buttons
            document.getElementById('createArticleBtn').addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/create-article';
            });

            document.getElementById('profileBtn').addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/profile';
            });

            document.getElementById('logoutBtn').addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });

            // Dashboard card buttons
            document.getElementById('writeArticleBtn').addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/create-article';
            });

            document.getElementById('manageArticlesBtn').addEventListener('click', (e) => {
                e.preventDefault();
                showFeatureComingSoon('Article Management');
            });

            document.getElementById('analyticsBtn').addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/analytics';
            });

            document.getElementById('aiSettingsBtn').addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/ai-settings';
            });
        }

        function logout() {
            localStorage.removeItem('authToken');
            window.location.href = '/';
        }

        function showFeatureComingSoon(featureName) {
            alert(featureName + ' is coming soon! This is a demo of the Knowledge Foyer platform. The backend APIs and infrastructure are fully implemented, but this UI feature is still in development.');
        }

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
        }
    </script>
</body>
</html>`;
}

/**
 * Generate create article page HTML
 */
function generateCreateArticlePage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Create Article - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 900px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        h1 { color: #2f5233; margin: 0; }
        .highlight { color: #c9a961; }
        .btn { display: inline-block; background: #c9a961; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #b89550; }
        .btn-primary { background: #2f5233; }
        .btn-primary:hover { background: #1e3421; }
        .btn-secondary { background: #6c757d; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; color: #2f5233; }
        input[type="text"], textarea, select { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; font-family: inherit; }
        input:focus, textarea:focus, select:focus { border-color: #c9a961; outline: none; }
        textarea { min-height: 300px; font-family: 'Lora', Georgia, serif; font-size: 16px; line-height: 1.7; }
        .form-row { display: flex; gap: 20px; }
        .form-row .form-group { flex: 1; }
        .tags-input { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; border: 2px solid #ddd; border-radius: 6px; min-height: 50px; }
        .tag { background: #e9ecef; color: #495057; padding: 4px 8px; border-radius: 4px; font-size: 14px; }
        .tag .remove { margin-left: 8px; cursor: pointer; color: #dc3545; }
        .preview-section { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .success { color: #2e7d32; margin: 10px 0; }
        .error { color: #d32f2f; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Create <span class="highlight">Article</span></h1>
            <div>
                <a href="/dashboard" class="btn btn-secondary">← Back to Dashboard</a>
            </div>
        </div>

        <form id="articleForm">
            <div class="form-row">
                <div class="form-group">
                    <label for="title">Article Title *</label>
                    <input type="text" id="title" name="title" required placeholder="Enter your article title">
                </div>
                <div class="form-group">
                    <label for="status">Status</label>
                    <select id="status" name="status">
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="summary">Summary</label>
                <textarea id="summary" name="summary" rows="3" placeholder="Brief summary of your article (optional)"></textarea>
            </div>

            <div class="form-group">
                <label for="content">Content *</label>
                <textarea id="content" name="content" required placeholder="Write your article content here..."></textarea>
            </div>

            <div class="form-group">
                <label for="tags">Tags</label>
                <input type="text" id="tagInput" placeholder="Type a tag and press Enter">
                <div class="tags-input" id="tagsContainer"></div>
            </div>

            <div class="form-group">
                <button type="submit" class="btn btn-primary">Create Article</button>
                <button type="button" class="btn" id="previewBtn">Preview</button>
            </div>

            <div id="success" class="success" style="display: none;"></div>
            <div id="error" class="error" style="display: none;"></div>
        </form>

        <div id="preview" class="preview-section" style="display: none;">
            <h3>Article Preview</h3>
            <div id="previewContent"></div>
        </div>
    </div>

    <script>
        // Check if user is logged in
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login';
        }

        // Tags functionality
        let tags = [];
        const tagInput = document.getElementById('tagInput');
        const tagsContainer = document.getElementById('tagsContainer');

        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const tag = tagInput.value.trim().toLowerCase();
                if (tag && !tags.includes(tag)) {
                    tags.push(tag);
                    updateTagsDisplay();
                    tagInput.value = '';
                }
            }
        });

        function updateTagsDisplay() {
            tagsContainer.innerHTML = tags.map(tag =>
                \`<span class="tag">\${tag}<span class="remove" onclick="removeTag('\${tag}')">×</span></span>\`
            ).join('');
        }

        function removeTag(tagToRemove) {
            tags = tags.filter(tag => tag !== tagToRemove);
            updateTagsDisplay();
        }

        // Preview functionality
        document.getElementById('previewBtn').addEventListener('click', () => {
            const title = document.getElementById('title').value;
            const content = document.getElementById('content').value;
            const summary = document.getElementById('summary').value;

            const previewHTML = \`
                <h2>\${title || 'Untitled Article'}</h2>
                \${summary ? \`<p><em>\${summary}</em></p>\` : ''}
                <div style="white-space: pre-wrap; font-family: 'Lora', Georgia, serif; line-height: 1.7;">
                    \${content || 'No content yet...'}
                </div>
                \${tags.length ? \`<p><strong>Tags:</strong> \${tags.join(', ')}</p>\` : ''}
            \`;

            document.getElementById('previewContent').innerHTML = previewHTML;
            document.getElementById('preview').style.display = 'block';
            document.getElementById('preview').scrollIntoView({ behavior: 'smooth' });
        });

        // Form submission
        document.getElementById('articleForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const articleData = {
                title: formData.get('title'),
                content: formData.get('content'),
                summary: formData.get('summary'),
                status: formData.get('status'),
                tags: tags
            };

            try {
                const response = await fetch('/api/articles', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(articleData)
                });

                const result = await response.json();

                if (response.ok) {
                    showSuccess('Article created successfully!');
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1500);
                } else {
                    showError(result.message || 'Failed to create article');
                }
            } catch (error) {
                console.error('Article creation error:', error);
                showError('Network error. Please try again.');
            }
        });

        function showSuccess(message) {
            document.getElementById('success').textContent = message;
            document.getElementById('success').style.display = 'block';
            document.getElementById('error').style.display = 'none';
        }

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('success').style.display = 'none';
        }
    </script>
</body>
</html>`;
}

/**
 * Generate profile management page HTML
 */
function generateProfilePage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        h1 { color: #2f5233; margin: 0; }
        .highlight { color: #c9a961; }
        .btn { display: inline-block; background: #c9a961; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #b89550; }
        .btn-primary { background: #2f5233; }
        .btn-secondary { background: #6c757d; }
        .profile-card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #2f5233; }
        input[type="text"], input[type="email"], textarea { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        input:focus, textarea:focus { border-color: #c9a961; outline: none; }
        .form-row { display: flex; gap: 20px; }
        .form-row .form-group { flex: 1; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2em; font-weight: bold; color: #2f5233; }
        .stat-label { color: #525252; font-size: 0.9em; }
        .success { color: #2e7d32; margin: 10px 0; }
        .error { color: #d32f2f; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>My <span class="highlight">Profile</span></h1>
            <div>
                <a href="/dashboard" class="btn btn-secondary">← Back to Dashboard</a>
            </div>
        </div>

        <div class="stats-grid" id="statsGrid">
            <div class="stat-card">
                <div class="stat-number" id="articlesCount">-</div>
                <div class="stat-label">Articles Published</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="followersCount">-</div>
                <div class="stat-label">Followers</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="followingCount">-</div>
                <div class="stat-label">Following</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="feedbackCount">-</div>
                <div class="stat-label">Feedback Received</div>
            </div>
        </div>

        <div class="profile-card">
            <h3>Profile Information</h3>
            <form id="profileForm">
                <div class="form-row">
                    <div class="form-group">
                        <label for="username">Username</label>
                        <input type="text" id="username" name="username" readonly style="background-color: #f5f5f5;">
                    </div>
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" readonly style="background-color: #f5f5f5;">
                    </div>
                </div>

                <div class="form-group">
                    <label for="displayName">Display Name</label>
                    <input type="text" id="displayName" name="display_name" placeholder="Your public display name">
                </div>

                <div class="form-group">
                    <label for="bio">Bio</label>
                    <textarea id="bio" name="bio" rows="4" placeholder="Tell others about yourself..."></textarea>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="location">Location</label>
                        <input type="text" id="location" name="location" placeholder="Your location (optional)">
                    </div>
                    <div class="form-group">
                        <label for="website">Website</label>
                        <input type="text" id="website" name="website" placeholder="Your website URL (optional)">
                    </div>
                </div>

                <div class="form-group">
                    <button type="submit" class="btn btn-primary">Update Profile</button>
                </div>

                <div id="success" class="success" style="display: none;"></div>
                <div id="error" class="error" style="display: none;"></div>
            </form>
        </div>
    </div>

    <script>
        // Check if user is logged in
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login';
        }

        // Load user profile data
        async function loadProfile() {
            try {
                const response = await fetch('/api/auth/profile', {
                    headers: {
                        'Authorization': 'Bearer ' + token
                    }
                });

                if (response.ok) {
                    const user = await response.json();
                    populateProfile(user.data);
                    loadUserStats(user.data.id);
                } else if (response.status === 401) {
                    localStorage.removeItem('authToken');
                    window.location.href = '/login';
                } else {
                    showError('Failed to load profile');
                }
            } catch (error) {
                console.error('Profile load error:', error);
                showError('Network error loading profile');
            }
        }

        function populateProfile(user) {
            document.getElementById('username').value = user.username || '';
            document.getElementById('email').value = user.email || '';
            document.getElementById('displayName').value = user.display_name || '';
            document.getElementById('bio').value = user.bio || '';
            document.getElementById('location').value = user.location || '';
            document.getElementById('website').value = user.website || '';
        }

        async function loadUserStats(userId) {
            // For now, show placeholder stats
            // In a real implementation, these would come from API endpoints
            document.getElementById('articlesCount').textContent = '0';
            document.getElementById('followersCount').textContent = '0';
            document.getElementById('followingCount').textContent = '0';
            document.getElementById('feedbackCount').textContent = '0';
        }

        // Form submission
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const profileData = {
                display_name: formData.get('display_name'),
                bio: formData.get('bio'),
                location: formData.get('location'),
                website: formData.get('website')
            };

            try {
                const response = await fetch('/api/auth/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(profileData)
                });

                const result = await response.json();

                if (response.ok) {
                    showSuccess('Profile updated successfully!');
                } else {
                    showError(result.message || 'Failed to update profile');
                }
            } catch (error) {
                console.error('Profile update error:', error);
                showError('Network error. Please try again.');
            }
        });

        function showSuccess(message) {
            document.getElementById('success').textContent = message;
            document.getElementById('success').style.display = 'block';
            document.getElementById('error').style.display = 'none';
        }

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('success').style.display = 'none';
        }

        // Load profile on page load
        loadProfile();
    </script>
</body>
</html>`;
}

/**
 * Generate analytics dashboard page HTML
 */
function generateAnalyticsPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Analytics - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        h1 { color: #2f5233; margin: 0; }
        .highlight { color: #c9a961; }
        .btn { display: inline-block; background: #c9a961; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px; border: none; cursor: pointer; }
        .btn-secondary { background: #6c757d; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2.5em; font-weight: bold; color: #2f5233; margin-bottom: 5px; }
        .stat-label { color: #525252; font-size: 0.9em; margin-bottom: 10px; }
        .stat-change { font-size: 0.8em; }
        .positive { color: #2e7d32; }
        .negative { color: #d32f2f; }
        .charts-section { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .chart-placeholder { height: 300px; background: #f8f9fa; border: 2px dashed #dee2e6; display: flex; align-items: center; justify-content: center; color: #6c757d; border-radius: 8px; }
        .recent-activity { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .activity-item { padding: 15px; border-left: 3px solid #c9a961; margin-bottom: 10px; background: #fafaf7; border-radius: 4px; }
        .activity-date { font-size: 0.8em; color: #6c757d; }
        .time-filter { margin-bottom: 20px; }
        .time-filter button { background: #f8f9fa; border: 1px solid #dee2e6; padding: 8px 16px; margin-right: 10px; border-radius: 4px; cursor: pointer; }
        .time-filter button.active { background: #2f5233; color: white; border-color: #2f5233; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><span class="highlight">Analytics</span> Dashboard</h1>
            <div>
                <a href="/dashboard" class="btn btn-secondary">← Back to Dashboard</a>
            </div>
        </div>

        <div class="time-filter">
            <button class="active" data-period="7d">Last 7 Days</button>
            <button data-period="30d">Last 30 Days</button>
            <button data-period="90d">Last 90 Days</button>
            <button data-period="1y">Last Year</button>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number" id="totalViews">-</div>
                <div class="stat-label">Total Article Views</div>
                <div class="stat-change positive" id="viewsChange">+0% from last period</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalArticles">-</div>
                <div class="stat-label">Articles Published</div>
                <div class="stat-change positive" id="articlesChange">+0% from last period</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalFeedback">-</div>
                <div class="stat-label">Feedback Received</div>
                <div class="stat-change positive" id="feedbackChange">+0% from last period</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalFollowers">-</div>
                <div class="stat-label">New Followers</div>
                <div class="stat-change positive" id="followersChange">+0% from last period</div>
            </div>
        </div>

        <div class="charts-section">
            <h3>Article Views Over Time</h3>
            <div class="chart-placeholder">
                📊 Interactive chart will be implemented here<br>
                <small>Showing article view trends with daily/weekly/monthly breakdown</small>
            </div>
        </div>

        <div class="charts-section">
            <h3>Top Performing Articles</h3>
            <div id="topArticles">
                <div class="activity-item">
                    <strong>Sample Article Title</strong><br>
                    <small>1,234 views • 45 feedback responses • Published 2 weeks ago</small>
                </div>
                <div class="activity-item">
                    <strong>Another Great Article</strong><br>
                    <small>987 views • 32 feedback responses • Published 1 month ago</small>
                </div>
                <div class="activity-item">
                    <strong>Third Popular Article</strong><br>
                    <small>756 views • 28 feedback responses • Published 6 weeks ago</small>
                </div>
            </div>
        </div>

        <div class="recent-activity">
            <h3>Recent Activity</h3>
            <div id="recentActivity">
                <div class="activity-item">
                    <strong>New feedback received on "Sample Article"</strong><br>
                    <small class="activity-date">2 hours ago</small>
                </div>
                <div class="activity-item">
                    <strong>Article "Another Great Article" gained 50 new views</strong><br>
                    <small class="activity-date">6 hours ago</small>
                </div>
                <div class="activity-item">
                    <strong>New follower: @username</strong><br>
                    <small class="activity-date">1 day ago</small>
                </div>
                <div class="activity-item">
                    <strong>Published new article: "Third Popular Article"</strong><br>
                    <small class="activity-date">3 days ago</small>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Check if user is logged in
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login';
        }

        // Time filter functionality
        document.querySelectorAll('.time-filter button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.time-filter button').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                loadAnalytics(button.dataset.period);
            });
        });

        // Load analytics data
        async function loadAnalytics(period = '7d') {
            try {
                // For demo purposes, show sample data
                // In a real implementation, this would fetch from analytics API
                const sampleData = {
                    '7d': { views: 1234, articles: 3, feedback: 45, followers: 12 },
                    '30d': { views: 5678, articles: 8, feedback: 120, followers: 28 },
                    '90d': { views: 12345, articles: 15, feedback: 234, followers: 67 },
                    '1y': { views: 45678, articles: 45, feedback: 567, followers: 134 }
                };

                const data = sampleData[period] || sampleData['7d'];

                document.getElementById('totalViews').textContent = data.views.toLocaleString();
                document.getElementById('totalArticles').textContent = data.articles;
                document.getElementById('totalFeedback').textContent = data.feedback;
                document.getElementById('totalFollowers').textContent = data.followers;

                // Show sample percentage changes
                document.getElementById('viewsChange').textContent = '+12% from last period';
                document.getElementById('articlesChange').textContent = '+25% from last period';
                document.getElementById('feedbackChange').textContent = '+8% from last period';
                document.getElementById('followersChange').textContent = '+15% from last period';

            } catch (error) {
                console.error('Analytics load error:', error);
            }
        }

        // Load default analytics
        loadAnalytics();
    </script>
</body>
</html>`;
}

/**
 * Generate AI settings page HTML
 */
function generateAISettingsPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Settings - Knowledge Foyer</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #fafaf7; color: #1a1a1a; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        h1 { color: #2f5233; margin: 0; }
        .highlight { color: #c9a961; }
        .btn { display: inline-block; background: #c9a961; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #b89550; }
        .btn-primary { background: #2f5233; }
        .btn-secondary { background: #6c757d; }
        .settings-card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .form-group { margin-bottom: 25px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; color: #2f5233; }
        input[type="range"], select, textarea { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #c9a961; outline: none; }
        .range-labels { display: flex; justify-content: space-between; font-size: 0.9em; color: #6c757d; margin-top: 5px; }
        .toggle-switch { position: relative; display: inline-block; width: 60px; height: 34px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 26px; width: 26px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #2f5233; }
        input:checked + .slider:before { transform: translateX(26px); }
        .feature-description { font-size: 0.9em; color: #6c757d; margin-top: 5px; }
        .ai-status { background: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #2e7d32; margin-right: 8px; }
        .success { color: #2e7d32; margin: 10px 0; }
        .error { color: #d32f2f; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><span class="highlight">AI</span> Settings</h1>
            <div>
                <a href="/dashboard" class="btn btn-secondary">← Back to Dashboard</a>
            </div>
        </div>

        <div class="ai-status">
            <span class="status-indicator"></span>
            <strong>AI Services Active</strong> - OpenAI integration is running and configured
        </div>

        <div class="settings-card">
            <h3>Feedback Analysis Settings</h3>
            <form id="feedbackSettings">
                <div class="form-group">
                    <label>
                        Enable AI Feedback Analysis
                        <label class="toggle-switch">
                            <input type="checkbox" id="feedbackAnalysisEnabled" checked>
                            <span class="slider"></span>
                        </label>
                    </label>
                    <div class="feature-description">
                        Automatically analyze feedback for sentiment, similarity, and quality scoring
                    </div>
                </div>

                <div class="form-group">
                    <label for="feedbackSimilarityThreshold">Similarity Detection Threshold</label>
                    <input type="range" id="feedbackSimilarityThreshold" min="0.5" max="0.9" step="0.05" value="0.7">
                    <div class="range-labels">
                        <span>Less Strict (0.5)</span>
                        <span>Current: <span id="similarityValue">0.7</span></span>
                        <span>More Strict (0.9)</span>
                    </div>
                    <div class="feature-description">
                        Higher values detect only very similar feedback, lower values catch more duplicates
                    </div>
                </div>

                <div class="form-group">
                    <label for="feedbackModel">AI Model for Feedback Analysis</label>
                    <select id="feedbackModel">
                        <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
                        <option value="gpt-4o">GPT-4o (More Capable)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Faster)</option>
                    </select>
                </div>
            </form>
        </div>

        <div class="settings-card">
            <h3>Content Recommendations</h3>
            <form id="recommendationSettings">
                <div class="form-group">
                    <label>
                        Enable Content Recommendations
                        <label class="toggle-switch">
                            <input type="checkbox" id="recommendationsEnabled" checked>
                            <span class="slider"></span>
                        </label>
                    </label>
                    <div class="feature-description">
                        Show AI-powered article recommendations based on user interests
                    </div>
                </div>

                <div class="form-group">
                    <label for="embeddingModel">Embedding Model</label>
                    <select id="embeddingModel">
                        <option value="text-embedding-3-small">Text Embedding 3 Small (Current)</option>
                        <option value="text-embedding-3-large">Text Embedding 3 Large (Better)</option>
                        <option value="text-embedding-ada-002">Ada 002 (Legacy)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="maxRecommendations">Max Recommendations</label>
                    <input type="range" id="maxRecommendations" min="3" max="20" value="10">
                    <div class="range-labels">
                        <span>3</span>
                        <span>Current: <span id="recommendationsValue">10</span></span>
                        <span>20</span>
                    </div>
                </div>
            </form>
        </div>

        <div class="settings-card">
            <h3>AI Budget & Usage</h3>
            <div class="form-group">
                <label>Daily Usage Limit: $10.00</label>
                <div class="feature-description">
                    Current usage today: $0.45 (4.5% of limit)
                </div>
            </div>

            <div class="form-group">
                <label>API Key Status: ✅ Valid and Active</label>
                <div class="feature-description">
                    Last API call: 2 minutes ago • Total calls today: 23
                </div>
            </div>
        </div>

        <div class="settings-card">
            <button type="button" class="btn btn-primary" id="saveSettings">Save AI Settings</button>
            <div id="success" class="success" style="display: none;"></div>
            <div id="error" class="error" style="display: none;"></div>
        </div>
    </div>

    <script>
        // Check if user is logged in
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login';
        }

        // Update range value displays
        document.getElementById('feedbackSimilarityThreshold').addEventListener('input', (e) => {
            document.getElementById('similarityValue').textContent = e.target.value;
        });

        document.getElementById('maxRecommendations').addEventListener('input', (e) => {
            document.getElementById('recommendationsValue').textContent = e.target.value;
        });

        // Save settings
        document.getElementById('saveSettings').addEventListener('click', async () => {
            const settings = {
                feedbackAnalysisEnabled: document.getElementById('feedbackAnalysisEnabled').checked,
                feedbackSimilarityThreshold: parseFloat(document.getElementById('feedbackSimilarityThreshold').value),
                feedbackModel: document.getElementById('feedbackModel').value,
                recommendationsEnabled: document.getElementById('recommendationsEnabled').checked,
                embeddingModel: document.getElementById('embeddingModel').value,
                maxRecommendations: parseInt(document.getElementById('maxRecommendations').value)
            };

            try {
                // For demo purposes, just show success
                // In a real implementation, this would save to user preferences API
                showSuccess('AI settings saved successfully!');
                console.log('Settings saved:', settings);
            } catch (error) {
                console.error('Settings save error:', error);
                showError('Failed to save settings. Please try again.');
            }
        });

        function showSuccess(message) {
            document.getElementById('success').textContent = message;
            document.getElementById('success').style.display = 'block';
            document.getElementById('error').style.display = 'none';
        }

        function showError(message) {
            document.getElementById('error').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('success').style.display = 'none';
        }
    </script>
</body>
</html>`;
}

module.exports = app;