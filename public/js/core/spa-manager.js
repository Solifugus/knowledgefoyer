/**
 * SPA Manager for Knowledge Foyer
 *
 * Main coordinator that sets up routing, authentication, and page controllers
 * for the single-page application architecture.
 */

class SPAManager {
  constructor() {
    this.router = null;
    this.auth = null;
    this.modal = null;
    this.mcpClient = null;

    // Page controllers
    this.landingPage = null;
    this.articlePage = null;
    this.dashboardPage = null;
    this.editorPage = null;
    this.searchPage = null;

    // Advanced systems
    this.navigation = null;
    this.performance = null;
    this.pwaFeatures = null;

    // Global state
    this.isInitialized = false;
    this.currentUser = null;

    this.init();
  }

  /**
   * Initialize the SPA Manager
   */
  async init() {
    try {
      console.log('🚀 Initializing SPA Manager...');

      // Initialize core systems
      await this.initializeRouter();
      await this.initializeAuth();
      await this.initializeComponents();
      await this.initializeAdvancedSystems();
      await this.setupRoutes();
      await this.initializePageControllers();

      // Set up global event handlers
      this.setupGlobalHandlers();

      // Mark as initialized
      this.isInitialized = true;

      console.log('✅ SPA Manager initialized successfully');

      // Dispatch ready event
      this.dispatchEvent('spa:ready', {
        router: this.router,
        auth: this.auth,
        manager: this
      });

    } catch (error) {
      console.error('❌ SPA Manager initialization failed:', error);
      this.showFallbackError();
    }
  }

  /**
   * Initialize the router
   */
  async initializeRouter() {
    console.log('📍 Initializing router...');

    if (typeof SPARouter === 'undefined') {
      throw new Error('SPARouter not found. Make sure router.js is loaded.');
    }

    this.router = new SPARouter();

    // Wait for router to be ready
    await new Promise((resolve) => {
      if (this.router.contentContainer) {
        resolve();
      } else {
        setTimeout(resolve, 100);
      }
    });

    console.log('✅ Router initialized');
  }

  /**
   * Initialize authentication system
   */
  async initializeAuth() {
    console.log('🔐 Initializing authentication...');

    // Basic auth state - will be enhanced later
    this.auth = {
      isAuthenticated: () => this.currentUser !== null,
      getCurrentUser: () => this.currentUser,
      login: (userData) => this.handleLogin(userData),
      logout: () => this.handleLogout(),
      checkAuthStatus: () => this.checkAuthStatus()
    };

    // Check existing auth status
    await this.checkAuthStatus();

    console.log('✅ Authentication initialized');
  }

  /**
   * Initialize UI components
   */
  async initializeComponents() {
    console.log('🧩 Initializing components...');

    // Initialize modal component
    if (typeof Modal !== 'undefined') {
      this.modal = new Modal();
    } else {
      console.warn('Modal component not found. Authentication will use fallback pages.');
    }

    // Initialize other components as needed
    // TODO: Initialize feedback system, article editor, etc.

    console.log('✅ Components initialized');
  }

  /**
   * Set up all application routes
   */
  async setupRoutes() {
    console.log('📍 Setting up routes...');

    // Landing page route
    this.router.addRoute('/', (route, params) => {
      console.log('🏠 Rendering landing page');
      const html = window.spaLandingPage?.renderHTML() || this.getFallbackLandingHTML();
      this.router.renderContent(html, {
        title: 'Knowledge Foyer - Professional Publishing Platform',
        className: 'landing-page-container'
      });
    });

    // Authentication routes (redirect to modals)
    this.router.addRoute('/login', (route, params) => {
      console.log('🔑 Showing login modal');
      if (this.auth.isAuthenticated()) {
        this.router.navigate('/dashboard');
        return;
      }
      this.modal?.showLogin();
      // Navigate back to home to keep URL clean
      this.router.navigate('/');
    });

    this.router.addRoute('/register', (route, params) => {
      console.log('📝 Showing registration modal');
      if (this.auth.isAuthenticated()) {
        this.router.navigate('/dashboard');
        return;
      }
      this.modal?.showRegister();
      // Navigate back to home to keep URL clean
      this.router.navigate('/');
    });

    // Dashboard route (authenticated)
    this.router.addRoute('/dashboard', (route, params) => {
      console.log('📊 Rendering dashboard');
      if (!this.auth.isAuthenticated()) {
        this.router.navigate('/login');
        return;
      }
      this.renderDashboardPage();
    });

    // Article routes
    this.router.addRoute('/article/:slug', (route, params) => {
      console.log('📖 Rendering article:', params.slug);
      this.renderArticlePage(params.slug);
    });

    this.router.addRoute('/create', (route, params) => {
      console.log('✍️ Rendering article editor');
      if (!this.auth.isAuthenticated()) {
        this.router.navigate('/login');
        return;
      }
      this.renderCreatePage();
    });

    this.router.addRoute('/edit/:slug', (route, params) => {
      console.log('✏️ Rendering article editor for:', params.slug);
      if (!this.auth.isAuthenticated()) {
        this.router.navigate('/login');
        return;
      }
      this.renderEditPage(params.slug);
    });

    // Search and discovery route
    this.router.addRoute('/search', (route, params) => {
      console.log('🔍 Rendering search page');
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const query = urlParams.get('q') || '';
      this.renderSearchPage(query);
    });

    // Profile and settings routes
    this.router.addRoute('/profile', (route, params) => {
      console.log('👤 Rendering profile page');
      if (!this.auth.isAuthenticated()) {
        this.router.navigate('/login');
        return;
      }
      this.renderProfilePage();
    });

    this.router.addRoute('/analytics', (route, params) => {
      console.log('📈 Rendering analytics page');
      if (!this.auth.isAuthenticated()) {
        this.router.navigate('/login');
        return;
      }
      this.renderAnalyticsPage();
    });

    this.router.addRoute('/ai-settings', (route, params) => {
      console.log('🤖 Rendering AI settings page');
      if (!this.auth.isAuthenticated()) {
        this.router.navigate('/login');
        return;
      }
      this.renderAISettingsPage();
    });

    // Demo and help routes
    this.router.addRoute('/workspace-demo', (route, params) => {
      console.log('🎮 Rendering workspace demo');
      this.renderWorkspaceDemoPage();
    });

    console.log('✅ Routes configured');
  }

  /**
   * Initialize page controllers
   */
  async initializePageControllers() {
    console.log('📄 Initializing page controllers...');

    // Landing page controller
    if (typeof SPALandingPage !== 'undefined') {
      // Landing page controller is already initialized globally
      this.landingPage = window.spaLandingPage;
    }

    // Initialize article page controller
    if (typeof SPAArticlePage !== 'undefined') {
      this.articlePage = new SPAArticlePage(this);
    }

    // Initialize dashboard page controller
    if (typeof SPADashboardPage !== 'undefined') {
      this.dashboardPage = new SPADashboardPage(this);
    }

    // Initialize editor page controller
    if (typeof SPAArticleEditor !== 'undefined') {
      this.editorPage = new SPAArticleEditor(this);
    }

    // Initialize search page controller
    if (typeof SPASearchPage !== 'undefined') {
      this.searchPage = new SPASearchPage(this);
    }

    // TODO: Initialize other page controllers

    console.log('✅ Page controllers initialized');
  }

  /**
   * Initialize advanced systems (navigation, performance, PWA)
   */
  async initializeAdvancedSystems() {
    console.log('⚡ Initializing advanced systems...');

    // Initialize navigation system
    if (typeof SPANavigation !== 'undefined') {
      this.navigation = new SPANavigation(this);
    }

    // Initialize performance monitoring
    if (typeof SPAPerformance !== 'undefined') {
      this.performance = new SPAPerformance(this);
    }

    // Initialize PWA features
    this.initializePWAFeatures();

    console.log('✅ Advanced systems initialized');
  }

  /**
   * Initialize PWA features
   */
  initializePWAFeatures() {
    // Install prompt handling
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.pwaInstallPrompt = event;

      // Show install button if user is authenticated
      if (this.auth.isAuthenticated()) {
        this.showPWAInstallOption();
      }
    });

    // Track PWA usage
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('📱 Running as PWA');
      this.trackPWAUsage();
    }

    // Handle app updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.handleAppUpdate();
      });
    }
  }

  /**
   * Show PWA install option
   */
  showPWAInstallOption() {
    if (!this.pwaInstallPrompt) return;

    const installButton = document.createElement('button');
    installButton.className = 'pwa-install-btn';
    installButton.innerHTML = '📱 Install App';
    installButton.onclick = () => this.installPWA();

    // Add to user menu or header
    const userMenu = document.querySelector('.user-dropdown-body');
    if (userMenu) {
      userMenu.appendChild(installButton);
    }
  }

  /**
   * Install PWA
   */
  async installPWA() {
    if (!this.pwaInstallPrompt) return;

    const result = await this.pwaInstallPrompt.prompt();
    if (result.outcome === 'accepted') {
      console.log('✅ PWA installed');
      this.showNotification('App installed successfully!', 'success');
    }

    this.pwaInstallPrompt = null;
  }

  /**
   * Track PWA usage
   */
  trackPWAUsage() {
    if (this.performance) {
      this.performance.recordCustomMetric('pwa-usage', {
        standalone: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle app update
   */
  handleAppUpdate() {
    this.showNotification(
      'A new version is available! The app will update automatically.',
      'info',
      { duration: 5000 }
    );
  }

  /**
   * Set up global event handlers
   */
  setupGlobalHandlers() {
    console.log('🌐 Setting up global handlers...');

    // Header navigation handlers
    this.setupHeaderHandlers();

    // Global keyboard shortcuts (already set up in index.html, but can extend here)
    this.setupKeyboardShortcuts();

    // Handle authentication state changes
    document.addEventListener('auth:login', (event) => {
      this.handleAuthChange(event.detail.user);
    });

    document.addEventListener('auth:logout', () => {
      this.handleAuthChange(null);
    });

    // Handle router events
    document.addEventListener('spa:route-changed', (event) => {
      this.handleRouteChange(event.detail);
    });

    console.log('✅ Global handlers configured');
  }

  /**
   * Set up header navigation handlers
   */
  setupHeaderHandlers() {
    // User menu dropdown
    const userMenuTrigger = document.getElementById('user-menu-trigger');
    const userDropdown = document.getElementById('user-dropdown');

    if (userMenuTrigger && userDropdown) {
      userMenuTrigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = userDropdown.style.display === 'block';
        userDropdown.style.display = isOpen ? 'none' : 'block';
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        userDropdown.style.display = 'none';
      });
    }

    // Mobile menu toggle
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuButton && mobileMenu) {
      mobileMenuButton.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.contains('open');
        if (isOpen) {
          mobileMenu.classList.remove('open');
          mobileMenuButton.setAttribute('aria-expanded', 'false');
        } else {
          mobileMenu.classList.add('open');
          mobileMenuButton.setAttribute('aria-expanded', 'true');
        }
      });
    }

    // Auth button handlers
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const mobileLoginBtn = document.getElementById('mobile-login-btn');
    const mobileRegisterBtn = document.getElementById('mobile-register-btn');
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

    if (loginBtn) {
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.modal?.showLogin();
      });
    }
    if (registerBtn) {
      registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.modal?.showRegister();
      });
    }
    if (mobileLoginBtn) {
      mobileLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.modal?.showLogin();
      });
    }
    if (mobileRegisterBtn) {
      mobileRegisterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.modal?.showRegister();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.auth.logout());
    }
    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener('click', () => this.auth.logout());
    }

    // Discover menu (placeholder)
    const discoverBtn = document.getElementById('discover-btn');
    const mobileDiscoverBtn = document.getElementById('mobile-discover-btn');

    if (discoverBtn) {
      discoverBtn.addEventListener('click', () => {
        this.showNotification('Discover feature coming soon!', 'info');
      });
    }
    if (mobileDiscoverBtn) {
      mobileDiscoverBtn.addEventListener('click', () => {
        this.showNotification('Discover feature coming soon!', 'info');
      });
    }
  }

  /**
   * Set up additional keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    // Additional shortcuts beyond those in index.html
    document.addEventListener('keydown', (event) => {
      // Only handle if not in input fields
      if (event.target.matches('input, textarea, [contenteditable]')) {
        return;
      }

      // Escape to close modals/dropdowns
      if (event.key === 'Escape') {
        // Close user dropdown
        const userDropdown = document.getElementById('user-dropdown');
        if (userDropdown) {
          userDropdown.style.display = 'none';
        }

        // Close mobile menu
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu) {
          mobileMenu.classList.remove('open');
        }
      }
    });
  }

  /**
   * Check authentication status
   */
  async checkAuthStatus() {
    try {
      // TODO: Make actual API call to check auth status
      const response = await this.apiRequest('/api/auth/me');

      if (response && response.ok) {
        const userData = await response.json();
        this.handleLogin(userData);
      } else {
        this.handleLogout();
      }
    } catch (error) {
      console.log('Auth check failed (expected in development):', error.message);
      this.handleLogout();
    }
  }

  /**
   * Handle user login
   * @param {Object} userData - User data from login/auth check
   */
  handleLogin(userData) {
    this.currentUser = userData;
    this.updateAuthUI(true);

    this.dispatchEvent('auth:login', { user: userData });

    console.log('✅ User logged in:', userData.username);
  }

  /**
   * Handle user logout
   */
  async handleLogout() {
    try {
      // TODO: Make API call to logout
      await this.apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.log('Logout API call failed (expected in development)');
    }

    this.currentUser = null;
    this.updateAuthUI(false);

    this.dispatchEvent('auth:logout');

    // Navigate to home page
    this.router.navigate('/');

    console.log('👋 User logged out');
  }

  /**
   * Update authentication UI state
   * @param {boolean} isAuthenticated - Whether user is authenticated
   */
  updateAuthUI(isAuthenticated) {
    const userMenu = document.getElementById('user-menu');
    const authCtas = document.getElementById('auth-ctas');
    const mobileAuthGuest = document.getElementById('mobile-auth-guest');
    const mobileAuthUser = document.getElementById('mobile-auth-user');

    if (isAuthenticated && this.currentUser) {
      // Show user menu, hide auth CTAs
      if (userMenu) userMenu.style.display = 'block';
      if (authCtas) authCtas.style.display = 'none';
      if (mobileAuthGuest) mobileAuthGuest.style.display = 'none';
      if (mobileAuthUser) mobileAuthUser.style.display = 'block';

      // Update user info in UI
      this.updateUserInfo();
    } else {
      // Show auth CTAs, hide user menu
      if (userMenu) userMenu.style.display = 'none';
      if (authCtas) authCtas.style.display = 'flex';
      if (mobileAuthGuest) mobileAuthGuest.style.display = 'block';
      if (mobileAuthUser) mobileAuthUser.style.display = 'none';
    }
  }

  /**
   * Update user info in the UI
   */
  updateUserInfo() {
    if (!this.currentUser) return;

    const elements = {
      'user-avatar': this.currentUser.avatar_url || '/images/default-avatar.png',
      'user-name': this.currentUser.display_name || this.currentUser.username,
      'user-display-name': this.currentUser.display_name || this.currentUser.username,
      'user-username': `@${this.currentUser.username}`,
      'mobile-user-avatar': this.currentUser.avatar_url || '/images/default-avatar.png',
      'mobile-user-name': this.currentUser.display_name || this.currentUser.username,
      'mobile-user-username': `@${this.currentUser.username}`
    };

    for (const [elementId, value] of Object.entries(elements)) {
      const element = document.getElementById(elementId);
      if (element) {
        if (elementId.includes('avatar')) {
          element.src = value;
          element.alt = `${this.currentUser.username} avatar`;
        } else {
          element.textContent = value;
        }
      }
    }
  }

  /**
   * Handle authentication state changes
   * @param {Object|null} user - User data or null
   */
  handleAuthChange(user) {
    this.currentUser = user;
    this.updateAuthUI(!!user);
  }

  /**
   * Handle route changes
   * @param {Object} routeData - Route change data
   */
  handleRouteChange(routeData) {
    // Update page title if needed
    if (routeData.title) {
      document.title = `${routeData.title} - Knowledge Foyer`;
    }

    // Update active navigation items
    this.updateNavigation(routeData.path);

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      mobileMenu.classList.remove('open');
    }
  }

  /**
   * Update navigation active states
   * @param {string} currentPath - Current route path
   */
  updateNavigation(currentPath) {
    // Update active navigation items based on current path
    document.querySelectorAll('[data-spa-link]').forEach(link => {
      const linkPath = link.getAttribute('href')?.slice(1) || link.getAttribute('data-path');
      if (linkPath === currentPath || (currentPath === '/' && linkPath === '/')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // ======================
  // PAGE RENDERING METHODS
  // ======================


  async renderDashboardPage() {
    try {
      if (!this.dashboardPage) {
        console.error('❌ Dashboard page controller not available');
        this.router.renderContent('<div class="error-state">Dashboard system not available</div>');
        return;
      }

      const html = await this.dashboardPage.renderDashboard();

      this.router.renderContent(html, {
        title: 'Dashboard - Knowledge Foyer',
        className: 'dashboard-page-container'
      });

      // Set up event handlers after rendering
      setTimeout(() => {
        this.dashboardPage.setupEventHandlers();
      }, 100);

    } catch (error) {
      console.error('❌ Failed to render dashboard page:', error);
      const errorHtml = `
        <div class="dashboard-page">
          <div class="dashboard-container">
            <div class="error-state">
              <h1>Error Loading Dashboard</h1>
              <p>Sorry, we couldn't load your dashboard. Please try again later.</p>
              <button class="btn btn-primary" data-spa-link data-path="/">← Return to Home</button>
            </div>
          </div>
        </div>
      `;
      this.router.renderContent(errorHtml, { title: 'Error - Knowledge Foyer' });
    }
  }

  async renderArticlePage(slug) {
    try {
      if (!this.articlePage) {
        console.error('❌ Article page controller not available');
        this.router.renderContent('<div class="error-state">Article system not available</div>');
        return;
      }

      const html = await this.articlePage.renderArticle(slug);
      const title = this.articlePage.currentArticle?.title || `Article - ${slug}`;

      this.router.renderContent(html, {
        title: `${title} - Knowledge Foyer`,
        className: 'article-page-container'
      });

      // Set up event handlers after rendering
      setTimeout(() => {
        this.articlePage.setupEventHandlers();
      }, 100);

    } catch (error) {
      console.error('❌ Failed to render article page:', error);
      const errorHtml = `
        <div class="article-page">
          <div class="article-container">
            <div class="error-state">
              <h1>Error Loading Article</h1>
              <p>Sorry, we couldn't load this article. Please try again later.</p>
              <button class="btn btn-primary" data-spa-link data-path="/">← Return to Home</button>
            </div>
          </div>
        </div>
      `;
      this.router.renderContent(errorHtml, { title: 'Error - Knowledge Foyer' });
    }
  }

  async renderCreatePage() {
    try {
      if (!this.editorPage) {
        console.error('❌ Editor page controller not available');
        this.router.renderContent('<div class="error-state">Editor system not available</div>');
        return;
      }

      const html = await this.editorPage.renderCreateEditor();

      this.router.renderContent(html, {
        title: 'Create Article - Knowledge Foyer',
        className: 'editor-page-container'
      });

      // Set up event handlers after rendering
      setTimeout(() => {
        this.editorPage.setupEventHandlers();
      }, 100);

    } catch (error) {
      console.error('❌ Failed to render create page:', error);
      const errorHtml = `
        <div class="editor-page">
          <div class="editor-container">
            <div class="error-state">
              <h1>Error Loading Editor</h1>
              <p>Sorry, we couldn't load the article editor. Please try again later.</p>
              <button class="btn btn-primary" data-spa-link data-path="/dashboard">← Back to Dashboard</button>
            </div>
          </div>
        </div>
      `;
      this.router.renderContent(errorHtml, { title: 'Error - Knowledge Foyer' });
    }
  }

  async renderEditPage(slug) {
    try {
      if (!this.editorPage) {
        console.error('❌ Editor page controller not available');
        this.router.renderContent('<div class="error-state">Editor system not available</div>');
        return;
      }

      const html = await this.editorPage.renderEditEditor(slug);

      this.router.renderContent(html, {
        title: `Edit Article - Knowledge Foyer`,
        className: 'editor-page-container'
      });

      // Set up event handlers after rendering
      setTimeout(() => {
        this.editorPage.setupEventHandlers();
      }, 100);

    } catch (error) {
      console.error('❌ Failed to render edit page:', error);
      const errorHtml = `
        <div class="editor-page">
          <div class="editor-container">
            <div class="error-state">
              <h1>Error Loading Editor</h1>
              <p>Sorry, we couldn't load the article editor. Please try again later.</p>
              <button class="btn btn-primary" data-spa-link data-path="/dashboard">← Back to Dashboard</button>
            </div>
          </div>
        </div>
      `;
      this.router.renderContent(errorHtml, { title: 'Error - Knowledge Foyer' });
    }
  }

  /**
   * Render search and discovery page
   */
  async renderSearchPage(query = '') {
    try {
      if (!this.searchPage) {
        console.error('❌ Search page controller not available');
        this.router.renderContent('<div class="error-state">Search system not available</div>');
        return;
      }

      await this.searchPage.renderSearchPage(query);

    } catch (error) {
      console.error('❌ Failed to render search page:', error);
      const errorHtml = `
        <div class="search-page">
          <div class="search-container">
            <div class="error-state">
              <h1>Search Unavailable</h1>
              <p>We're having trouble with search right now. Please try again later.</p>
              <button class="btn btn-primary" data-spa-link data-path="/">← Back to Home</button>
            </div>
          </div>
        </div>
      `;
      this.router.renderContent(errorHtml, { title: 'Search Error - Knowledge Foyer' });
    }
  }

  renderProfilePage() {
    const html = `
      <div class="profile-page">
        <div class="container">
          <h1>Profile</h1>
          <p>Profile functionality coming soon in later steps</p>
          <button class="btn btn-secondary" data-spa-link data-path="/">
            ← Back to Home
          </button>
        </div>
      </div>
    `;

    this.router.renderContent(html, { title: 'Profile' });
  }

  renderAnalyticsPage() {
    const html = `
      <div class="analytics-page">
        <div class="container">
          <h1>Analytics</h1>
          <p>Analytics functionality coming soon in later steps</p>
          <button class="btn btn-secondary" data-spa-link data-path="/">
            ← Back to Home
          </button>
        </div>
      </div>
    `;

    this.router.renderContent(html, { title: 'Analytics' });
  }

  renderAISettingsPage() {
    const html = `
      <div class="ai-settings-page">
        <div class="container">
          <h1>AI Settings</h1>
          <p>AI settings functionality coming soon in later steps</p>
          <button class="btn btn-secondary" data-spa-link data-path="/">
            ← Back to Home
          </button>
        </div>
      </div>
    `;

    this.router.renderContent(html, { title: 'AI Settings' });
  }

  renderWorkspaceDemoPage() {
    const html = `
      <div class="workspace-demo-page">
        <div class="container">
          <h1>Workspace Demo</h1>
          <p>Interactive workspace demo coming soon</p>
          <button class="btn btn-secondary" data-spa-link data-path="/">
            ← Back to Home
          </button>
        </div>
      </div>
    `;

    this.router.renderContent(html, { title: 'Workspace Demo' });
  }

  /**
   * Get fallback landing page HTML if controller isn't ready
   * @returns {string} - Fallback HTML
   */
  getFallbackLandingHTML() {
    return `
      <div class="landing-page">
        <div class="container">
          <div class="hero-section">
            <h1>Welcome to Knowledge Foyer</h1>
            <p>A professional publishing platform for structured feedback</p>
            <div class="hero-actions">
              <button class="btn btn-primary" data-spa-link data-path="/register">Get Started</button>
              <button class="btn btn-secondary" data-spa-link data-path="/login">Sign In</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show fallback error when SPA fails to initialize
   */
  showFallbackError() {
    const container = document.getElementById('spa-content');
    if (container) {
      container.innerHTML = `
        <div class="error-page">
          <div class="error-content">
            <h1>Application Error</h1>
            <p>Failed to load Knowledge Foyer. Please refresh the page.</p>
            <button class="btn btn-primary" onclick="window.location.reload()">
              Refresh Page
            </button>
          </div>
        </div>
      `;
    }
  }

  // ======================
  // UTILITY METHODS
  // ======================

  /**
   * Make API requests with authentication
   * @param {string} url - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise} - Fetch response
   */
  async apiRequest(url, options = {}) {
    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    return fetch(url, defaultOptions);
  }

  /**
   * Show notification to user
   * @param {string} message - Notification message
   * @param {string} type - Notification type (info, success, warning, error)
   */
  showNotification(message, type = 'info') {
    // TODO: Implement toast notifications
    console.log(`📢 ${type.toUpperCase()}: ${message}`);

    // Temporary alert fallback
    if (type === 'error') {
      alert(`Error: ${message}`);
    }
  }

  /**
   * Dispatch custom events
   * @param {string} eventName - Event name
   * @param {Object} detail - Event detail data
   */
  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  }

  /**
   * Get SPA state for debugging
   * @returns {Object} - Current SPA state
   */
  getState() {
    return {
      isInitialized: this.isInitialized,
      currentUser: this.currentUser,
      currentRoute: this.router?.getCurrentRoute(),
      authStatus: this.auth?.isAuthenticated()
    };
  }

  /**
   * Clean up SPA manager
   */
  destroy() {
    if (this.landingPage?.destroy) {
      this.landingPage.destroy();
    }

    // TODO: Destroy other components

    console.log('🧹 SPA Manager destroyed');
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.SPAManager = SPAManager;
}