/**
 * SPA Dashboard Page Controller
 *
 * Handles user dashboard with profile management, article management,
 * analytics, and user settings functionality.
 */

class SPADashboardPage {
  constructor(spa) {
    this.spa = spa;
    this.router = spa?.router;
    this.auth = spa?.auth;
    this.modal = spa?.modal;
    this.mcpClient = spa?.mcpClient;

    // Dashboard state
    this.currentUser = null;
    this.userArticles = [];
    this.userStats = {};
    this.isLoading = false;
    this.error = null;

    // UI state
    this.activeTab = 'overview';
    this.editingProfile = false;

    console.log('📊 SPADashboardPage initialized');
  }

  /**
   * Render dashboard page
   */
  async renderDashboard() {
    console.log('📊 Rendering user dashboard');

    // Check authentication
    if (!this.auth.isAuthenticated()) {
      this.router?.navigate('/login');
      return;
    }

    this.isLoading = true;

    try {
      // Load user data
      await this.loadUserData();

      // Generate and return HTML
      return this.renderHTML();
    } catch (error) {
      console.error('❌ Dashboard rendering error:', error);
      this.error = error.message;
      return this.renderErrorHTML();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load user data and statistics
   */
  async loadUserData() {
    console.log('🔄 Loading user dashboard data...');

    try {
      // Get current user
      this.currentUser = this.auth.getCurrentUser() || this.getMockUserData();

      // Load user articles
      this.userArticles = this.getMockUserArticles();

      // Load user statistics
      this.userStats = this.getMockUserStats();

    } catch (error) {
      console.error('❌ Failed to load user data:', error);
      throw error;
    }
  }

  /**
   * Generate main HTML for dashboard
   */
  renderHTML() {
    if (this.isLoading) {
      return this.renderLoadingHTML();
    }

    if (this.error || !this.currentUser) {
      return this.renderErrorHTML();
    }

    return `
      <div class="dashboard-page">
        <div class="dashboard-container">
          ${this.renderDashboardHeader()}
          ${this.renderDashboardTabs()}
          ${this.renderDashboardContent()}
        </div>
      </div>
    `;
  }

  /**
   * Render dashboard header with user info
   */
  renderDashboardHeader() {
    const user = this.currentUser;

    return `
      <header class="dashboard-header">
        <div class="dashboard-welcome">
          <div class="user-avatar">
            ${user.avatar ? `<img src="${user.avatar}" alt="${user.displayName}" />` :
              `<div class="avatar-placeholder">${user.displayName.charAt(0)}</div>`}
          </div>
          <div class="welcome-content">
            <h1>Welcome back, ${this.escapeHtml(user.displayName)}!</h1>
            <p class="user-subtitle">
              @${user.username}
              ${user.isVerified ? '<span class="verified-badge" title="Verified author">✓</span>' : ''}
            </p>
          </div>
        </div>

        <div class="dashboard-stats-summary">
          <div class="stat-item">
            <span class="stat-number">${this.userStats.totalArticles}</span>
            <span class="stat-label">Articles</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">${this.userStats.totalFeedback}</span>
            <span class="stat-label">Feedback</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">${this.userStats.totalViews}</span>
            <span class="stat-label">Views</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">${this.userStats.followers}</span>
            <span class="stat-label">Followers</span>
          </div>
        </div>
      </header>
    `;
  }

  /**
   * Render dashboard navigation tabs
   */
  renderDashboardTabs() {
    const tabs = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'articles', label: 'My Articles', icon: '📄' },
      { id: 'feedback', label: 'Feedback', icon: '💭' },
      { id: 'analytics', label: 'Analytics', icon: '📈' },
      { id: 'profile', label: 'Profile', icon: '👤' },
      { id: 'settings', label: 'Settings', icon: '⚙️' }
    ];

    return `
      <nav class="dashboard-tabs">
        ${tabs.map(tab => `
          <button class="dashboard-tab ${this.activeTab === tab.id ? 'active' : ''}"
                  data-tab="${tab.id}"
                  aria-pressed="${this.activeTab === tab.id}">
            <span class="tab-icon">${tab.icon}</span>
            <span class="tab-label">${tab.label}</span>
          </button>
        `).join('')}
      </nav>
    `;
  }

  /**
   * Render main dashboard content based on active tab
   */
  renderDashboardContent() {
    switch (this.activeTab) {
      case 'overview':
        return this.renderOverviewTab();
      case 'articles':
        return this.renderArticlesTab();
      case 'feedback':
        return this.renderFeedbackTab();
      case 'analytics':
        return this.renderAnalyticsTab();
      case 'profile':
        return this.renderProfileTab();
      case 'settings':
        return this.renderSettingsTab();
      default:
        return this.renderOverviewTab();
    }
  }

  /**
   * Render overview tab content
   */
  renderOverviewTab() {
    const recent = this.userArticles.slice(0, 3);

    return `
      <div class="dashboard-content overview-content">
        <div class="overview-grid">
          <div class="overview-section">
            <h2>📈 Recent Activity</h2>
            <div class="activity-feed">
              ${this.renderActivityFeed()}
            </div>
          </div>

          <div class="overview-section">
            <h2>📄 Recent Articles</h2>
            <div class="recent-articles">
              ${recent.length > 0 ? recent.map(article => this.renderArticleCard(article)).join('') :
                '<p class="empty-state">No articles yet. <a href="#/create" data-spa-link data-path="/create">Create your first article!</a></p>'}
            </div>
            ${recent.length > 0 ? '<a href="#" class="view-all-link" data-tab="articles">View all articles →</a>' : ''}
          </div>

          <div class="overview-section">
            <h2>💭 Recent Feedback</h2>
            <div class="recent-feedback">
              ${this.renderRecentFeedback()}
            </div>
            <a href="#" class="view-all-link" data-tab="feedback">View all feedback →</a>
          </div>

          <div class="overview-section">
            <h2>🎯 Quick Actions</h2>
            <div class="quick-actions">
              <button class="action-button primary" data-action="create-article">
                ✍️ Write New Article
              </button>
              <button class="action-button secondary" data-action="view-analytics">
                📊 View Analytics
              </button>
              <button class="action-button secondary" data-action="edit-profile">
                ✏️ Edit Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render articles management tab
   */
  renderArticlesTab() {
    return `
      <div class="dashboard-content articles-content">
        <div class="articles-header">
          <h2>📄 My Articles</h2>
          <button class="btn btn-primary" data-action="create-article">
            ✍️ Write New Article
          </button>
        </div>

        <div class="articles-filters">
          <select class="filter-select" id="articles-filter">
            <option value="all">All Articles</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </select>
          <input type="search" class="search-input" placeholder="Search articles..." id="articles-search">
        </div>

        <div class="articles-grid">
          ${this.userArticles.map(article => this.renderArticleManagementCard(article)).join('')}
        </div>

        ${this.userArticles.length === 0 ? `
          <div class="empty-state">
            <h3>No articles yet</h3>
            <p>Start sharing your knowledge with the world!</p>
            <button class="btn btn-primary" data-action="create-article">
              ✍️ Create Your First Article
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render feedback management tab
   */
  renderFeedbackTab() {
    return `
      <div class="dashboard-content feedback-content">
        <h2>💭 Feedback Management</h2>

        <div class="feedback-tabs">
          <button class="feedback-tab active" data-feedback-tab="received">
            📥 Received (${this.userStats.totalFeedback})
          </button>
          <button class="feedback-tab" data-feedback-tab="given">
            📤 Given (${this.userStats.feedbackGiven})
          </button>
          <button class="feedback-tab" data-feedback-tab="pending">
            ⏳ Pending Review (${this.userStats.pendingFeedback})
          </button>
        </div>

        <div class="feedback-management">
          ${this.renderFeedbackManagement()}
        </div>
      </div>
    `;
  }

  /**
   * Render analytics tab
   */
  renderAnalyticsTab() {
    return `
      <div class="dashboard-content analytics-content">
        <h2>📈 Analytics & Insights</h2>

        <div class="analytics-period">
          <select class="period-select">
            <option value="7d">Last 7 days</option>
            <option value="30d" selected>Last 30 days</option>
            <option value="90d">Last 3 months</option>
            <option value="1y">Last year</option>
          </select>
        </div>

        <div class="analytics-grid">
          <div class="analytics-card">
            <h3>📊 Article Performance</h3>
            <div class="metric-large">
              <span class="metric-number">${this.userStats.totalViews}</span>
              <span class="metric-label">Total Views</span>
              <span class="metric-change positive">+${this.userStats.viewsGrowth}%</span>
            </div>
            <div class="sub-metrics">
              <div class="sub-metric">
                <span>Avg. per article:</span>
                <span>${Math.round(this.userStats.totalViews / (this.userStats.totalArticles || 1))}</span>
              </div>
            </div>
          </div>

          <div class="analytics-card">
            <h3>💭 Engagement</h3>
            <div class="metric-large">
              <span class="metric-number">${this.userStats.totalFeedback}</span>
              <span class="metric-label">Total Feedback</span>
              <span class="metric-change positive">+${this.userStats.feedbackGrowth}%</span>
            </div>
            <div class="sub-metrics">
              <div class="sub-metric">
                <span>Positive ratio:</span>
                <span>${this.userStats.positiveFeedbackRatio}%</span>
              </div>
            </div>
          </div>

          <div class="analytics-card">
            <h3>👥 Audience</h3>
            <div class="metric-large">
              <span class="metric-number">${this.userStats.followers}</span>
              <span class="metric-label">Followers</span>
              <span class="metric-change positive">+${this.userStats.followerGrowth}</span>
            </div>
            <div class="sub-metrics">
              <div class="sub-metric">
                <span>Following:</span>
                <span>${this.userStats.following}</span>
              </div>
            </div>
          </div>

          <div class="analytics-card full-width">
            <h3>🏆 Top Performing Articles</h3>
            <div class="top-articles">
              ${this.renderTopArticles()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render profile management tab
   */
  renderProfileTab() {
    const user = this.currentUser;

    return `
      <div class="dashboard-content profile-content">
        <h2>👤 Profile Management</h2>

        <div class="profile-sections">
          <div class="profile-section">
            <h3>Basic Information</h3>
            <form class="profile-form" id="basic-info-form">
              <div class="form-group">
                <label for="display-name">Display Name</label>
                <input type="text" id="display-name" value="${this.escapeHtml(user.displayName)}" ${!this.editingProfile ? 'readonly' : ''}>
              </div>

              <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" value="${user.username}" readonly>
                <small class="form-help">Username cannot be changed</small>
              </div>

              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" value="${user.email}" ${!this.editingProfile ? 'readonly' : ''}>
                ${user.emailVerified ? '<span class="verification-badge">✓ Verified</span>' : '<span class="verification-warning">⚠️ Unverified</span>'}
              </div>

              <div class="form-group">
                <label for="bio">Bio</label>
                <textarea id="bio" rows="4" ${!this.editingProfile ? 'readonly' : ''}>${this.escapeHtml(user.bio || '')}</textarea>
              </div>

              <div class="form-group">
                <label for="website">Website</label>
                <input type="url" id="website" value="${user.website || ''}" ${!this.editingProfile ? 'readonly' : ''}>
              </div>

              <div class="form-actions">
                ${!this.editingProfile ? `
                  <button type="button" class="btn btn-primary" data-action="edit-profile">
                    ✏️ Edit Profile
                  </button>
                ` : `
                  <button type="submit" class="btn btn-primary">
                    💾 Save Changes
                  </button>
                  <button type="button" class="btn btn-secondary" data-action="cancel-edit">
                    Cancel
                  </button>
                `}
              </div>
            </form>
          </div>

          <div class="profile-section">
            <h3>Profile Picture</h3>
            <div class="avatar-section">
              <div class="current-avatar">
                ${user.avatar ? `<img src="${user.avatar}" alt="${user.displayName}" />` :
                  `<div class="avatar-placeholder large">${user.displayName.charAt(0)}</div>`}
              </div>
              <div class="avatar-actions">
                <button class="btn btn-secondary" data-action="upload-avatar">
                  📸 Upload New Photo
                </button>
                ${user.avatar ? `
                  <button class="btn btn-tertiary" data-action="remove-avatar">
                    🗑️ Remove Photo
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="profile-section">
            <h3>Public Profile</h3>
            <div class="public-profile-preview">
              <p>Your public profile URL:</p>
              <div class="profile-url">
                <code>https://knowledgefoyer.com/@${user.username}</code>
                <button class="btn btn-small" data-action="copy-profile-url">Copy</button>
              </div>
              <a href="#/@${user.username}" class="btn btn-secondary" data-spa-link data-path="/@${user.username}">
                👁️ View Public Profile
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render settings tab
   */
  renderSettingsTab() {
    return `
      <div class="dashboard-content settings-content">
        <h2>⚙️ Account Settings</h2>

        <div class="settings-sections">
          <div class="settings-section">
            <h3>🔔 Notifications</h3>
            <form class="settings-form">
              <div class="setting-item">
                <label class="setting-label">
                  <input type="checkbox" checked> Email notifications for new feedback
                </label>
              </div>
              <div class="setting-item">
                <label class="setting-label">
                  <input type="checkbox" checked> Email notifications for new followers
                </label>
              </div>
              <div class="setting-item">
                <label class="setting-label">
                  <input type="checkbox"> Email digest (weekly summary)
                </label>
              </div>
              <button type="submit" class="btn btn-primary">Save Preferences</button>
            </form>
          </div>

          <div class="settings-section">
            <h3>🔐 Privacy & Security</h3>
            <div class="security-actions">
              <button class="btn btn-secondary" data-action="change-password">
                🔑 Change Password
              </button>
              <button class="btn btn-secondary" data-action="export-data">
                📤 Export My Data
              </button>
              <button class="btn btn-tertiary" data-action="two-factor-setup">
                🛡️ Setup Two-Factor Auth
              </button>
            </div>
          </div>

          <div class="settings-section danger-zone">
            <h3>⚠️ Danger Zone</h3>
            <div class="danger-actions">
              <button class="btn btn-danger-outline" data-action="deactivate-account">
                😴 Deactivate Account
              </button>
              <button class="btn btn-danger" data-action="delete-account">
                🗑️ Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render article management card
   */
  renderArticleManagementCard(article) {
    return `
      <div class="article-management-card">
        <div class="article-card-header">
          <h3 class="article-title">
            <a href="#/article/${article.slug}" data-spa-link data-path="/article/${article.slug}">
              ${this.escapeHtml(article.title)}
            </a>
          </h3>
          <span class="article-status status-${article.status}">${article.status}</span>
        </div>

        <div class="article-meta">
          <span class="article-date">
            ${article.status === 'published' ? `Published ${this.formatDate(article.publishedAt)}` :
              `Updated ${this.formatDate(article.updatedAt)}`}
          </span>
          <span class="article-stats">
            ${article.views} views • ${article.feedbackCount} feedback
          </span>
        </div>

        <p class="article-excerpt">${this.escapeHtml(article.excerpt)}</p>

        <div class="article-tags">
          ${article.tags.slice(0, 3).map(tag => `
            <span class="tag">${this.escapeHtml(tag)}</span>
          `).join('')}
          ${article.tags.length > 3 ? `<span class="tag-more">+${article.tags.length - 3}</span>` : ''}
        </div>

        <div class="article-actions">
          <button class="btn btn-small btn-primary" data-action="edit-article" data-slug="${article.slug}">
            ✏️ Edit
          </button>
          <button class="btn btn-small btn-secondary" data-action="view-analytics" data-slug="${article.slug}">
            📊 Analytics
          </button>
          <button class="btn btn-small btn-tertiary" data-action="duplicate-article" data-slug="${article.slug}">
            📋 Duplicate
          </button>
          <div class="dropdown">
            <button class="btn btn-small btn-tertiary dropdown-trigger" data-dropdown="article-${article.id}">
              ⋯
            </button>
            <div class="dropdown-menu" id="article-${article.id}">
              <button data-action="archive-article" data-slug="${article.slug}">Archive</button>
              <button data-action="delete-article" data-slug="${article.slug}" class="danger">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render recent activity feed
   */
  renderActivityFeed() {
    const activities = [
      { type: 'feedback', message: 'Received feedback on "JavaScript Scalability"', time: '2 hours ago' },
      { type: 'article', message: 'Published "Web Performance Guide"', time: '1 day ago' },
      { type: 'follower', message: '3 new followers', time: '2 days ago' },
      { type: 'feedback', message: 'Feedback was ranked as useful', time: '3 days ago' }
    ];

    return `
      <div class="activity-list">
        ${activities.map(activity => `
          <div class="activity-item">
            <div class="activity-icon ${activity.type}">
              ${this.getActivityIcon(activity.type)}
            </div>
            <div class="activity-content">
              <p class="activity-message">${activity.message}</p>
              <span class="activity-time">${activity.time}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Set up event handlers after DOM is ready
   */
  setupEventHandlers() {
    console.log('🎯 Setting up dashboard event handlers...');

    // Tab switching
    document.querySelectorAll('.dashboard-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabId = e.target.closest('.dashboard-tab').dataset.tab;
        this.switchTab(tabId);
      });
    });

    // Quick action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const slug = e.target.dataset.slug;
        this.handleAction(action, slug);
      });
    });

    // View all links
    document.querySelectorAll('.view-all-link[data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = e.target.dataset.tab;
        this.switchTab(tabId);
      });
    });

    // Profile form submission
    const profileForm = document.getElementById('basic-info-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    console.log('✅ Dashboard event handlers ready');
  }

  /**
   * Switch dashboard tab
   */
  switchTab(tabId) {
    console.log('📑 Switching to tab:', tabId);

    this.activeTab = tabId;

    // Re-render the page with new active tab
    const container = document.querySelector('.dashboard-page');
    if (container) {
      container.innerHTML = this.renderHTML().match(/<div class="dashboard-container">([\s\S]*)<\/div>/)[1];
      this.setupEventHandlers();
    }
  }

  /**
   * Handle action button clicks
   */
  handleAction(action, data) {
    console.log('🎬 Handling action:', action, data);

    switch (action) {
      case 'create-article':
        this.router?.navigate('/create');
        break;
      case 'edit-article':
        this.router?.navigate(`/edit/${data}`);
        break;
      case 'view-analytics':
        this.switchTab('analytics');
        break;
      case 'edit-profile':
        this.startProfileEdit();
        break;
      case 'cancel-edit':
        this.cancelProfileEdit();
        break;
      default:
        console.log('🚧 Action not implemented yet:', action);
        alert(`Action "${action}" coming soon!`);
    }
  }

  /**
   * Start profile editing mode
   */
  startProfileEdit() {
    this.editingProfile = true;
    this.switchTab('profile');
  }

  /**
   * Cancel profile editing
   */
  cancelProfileEdit() {
    this.editingProfile = false;
    this.switchTab('profile');
  }

  /**
   * Save profile changes
   */
  saveProfile() {
    // TODO: Implement profile saving
    console.log('💾 Saving profile changes...');
    this.editingProfile = false;
    this.switchTab('profile');
    alert('Profile saved successfully!');
  }

  // Utility methods

  getActivityIcon(type) {
    const icons = {
      feedback: '💭',
      article: '📄',
      follower: '👥',
      view: '👁️'
    };
    return icons[type] || '📋';
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderLoadingHTML() {
    return `
      <div class="dashboard-page">
        <div class="dashboard-container">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading dashboard...</p>
          </div>
        </div>
      </div>
    `;
  }

  renderErrorHTML() {
    return `
      <div class="dashboard-page">
        <div class="dashboard-container">
          <div class="error-state">
            <h1>Dashboard Error</h1>
            <p>${this.error || 'Failed to load dashboard.'}</p>
            <button class="btn btn-primary" onclick="location.reload()">
              🔄 Retry
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Mock data methods (replace with API calls)

  getMockUserData() {
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      username: 'jsexpert',
      email: 'alex@example.com',
      emailVerified: true,
      displayName: 'Alex Chen',
      bio: 'Full-stack developer passionate about web performance and scalability. Sharing knowledge one article at a time.',
      website: 'https://alexchen.dev',
      avatar: null,
      isVerified: true,
      joinedAt: '2023-06-15T10:30:00Z'
    };
  }

  getMockUserArticles() {
    return [
      {
        id: '1',
        slug: 'javascript-scalability',
        title: 'Building Scalable Web Applications with Modern JavaScript',
        excerpt: 'Building scalable web applications requires careful planning and the right technological choices...',
        status: 'published',
        publishedAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-20T14:45:00Z',
        views: 1542,
        feedbackCount: 23,
        tags: ['javascript', 'web-development', 'architecture']
      },
      {
        id: '2',
        slug: 'react-performance-optimization',
        title: 'React Performance Optimization: A Complete Guide',
        excerpt: 'Learn advanced techniques for optimizing React applications for production use...',
        status: 'published',
        publishedAt: '2024-01-10T09:15:00Z',
        updatedAt: '2024-01-10T09:15:00Z',
        views: 892,
        feedbackCount: 15,
        tags: ['react', 'performance', 'optimization']
      },
      {
        id: '3',
        slug: 'typescript-patterns',
        title: 'TypeScript Design Patterns for Large Applications',
        excerpt: 'Explore advanced TypeScript patterns that help maintain large-scale applications...',
        status: 'draft',
        updatedAt: '2024-01-22T16:30:00Z',
        views: 0,
        feedbackCount: 0,
        tags: ['typescript', 'patterns', 'architecture']
      }
    ];
  }

  getMockUserStats() {
    return {
      totalArticles: 12,
      totalViews: 8547,
      totalFeedback: 156,
      feedbackGiven: 89,
      pendingFeedback: 7,
      followers: 234,
      following: 89,
      viewsGrowth: 23,
      feedbackGrowth: 15,
      followerGrowth: 12,
      positiveFeedbackRatio: 78
    };
  }

  renderArticleCard(article) {
    return `
      <div class="article-card-mini">
        <h4><a href="#/article/${article.slug}" data-spa-link data-path="/article/${article.slug}">${this.escapeHtml(article.title)}</a></h4>
        <div class="article-stats-mini">
          ${article.views} views • ${article.feedbackCount} feedback
        </div>
      </div>
    `;
  }

  renderRecentFeedback() {
    const feedback = [
      { author: 'Sarah Johnson', content: 'Great article! The modularity section really helped...', article: 'JavaScript Scalability' },
      { author: 'Mike Rodriguez', content: 'Could you add more examples of state management...', article: 'React Performance' }
    ];

    return feedback.map(f => `
      <div class="feedback-item-mini">
        <div class="feedback-meta">
          <strong>${f.author}</strong> on <em>${f.article}</em>
        </div>
        <p class="feedback-preview">${f.content}</p>
      </div>
    `).join('');
  }

  renderFeedbackManagement() {
    return `
      <div class="feedback-list">
        <div class="feedback-item-management">
          <div class="feedback-header">
            <span class="feedback-author">Sarah Johnson</span>
            <span class="feedback-date">2 days ago</span>
          </div>
          <p class="feedback-content">Great article! The modularity section really helped me understand how to structure my React components better.</p>
          <div class="feedback-actions">
            <button class="btn btn-small btn-primary">Mark as Addressed</button>
            <button class="btn btn-small btn-secondary">Reply</button>
          </div>
        </div>
      </div>
    `;
  }

  renderTopArticles() {
    return `
      <div class="top-articles-list">
        <div class="top-article-item">
          <span class="article-rank">#1</span>
          <div class="article-info">
            <h4>JavaScript Scalability</h4>
            <div class="article-metrics">1,542 views • 23 feedback</div>
          </div>
        </div>
        <div class="top-article-item">
          <span class="article-rank">#2</span>
          <div class="article-info">
            <h4>React Performance</h4>
            <div class="article-metrics">892 views • 15 feedback</div>
          </div>
        </div>
      </div>
    `;
  }
}

// Make available globally
window.SPADashboardPage = SPADashboardPage;

console.log('📊 SPADashboardPage class loaded');