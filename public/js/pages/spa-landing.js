/**
 * SPA Landing Page Controller
 *
 * Handles the main landing page with article feed and hero section
 * in the single-page application architecture.
 */

class SPALandingPage {
  constructor() {
    this.articles = [];
    this.isLoading = false;
    this.currentPage = 1;
    this.hasMore = true;

    // Bind methods for event listeners
    // (No methods to bind currently)

    this.init();
  }

  /**
   * Initialize the landing page controller
   */
  init() {
    console.log('🏠 SPA Landing Page controller initializing...');

    // Listen for router page load events
    document.addEventListener('spa:page-loaded', this.handlePageLoad);

    console.log('✅ SPA Landing Page controller ready');
  }

  /**
   * Handle page load event from router
   * @param {CustomEvent} event - Router page load event
   */
  handlePageLoad(event) {
    // Only handle landing page routes
    if (event.detail.path !== '/' && event.detail.path !== '') {
      return;
    }

    console.log('🏠 Loading SPA landing page...');
    this.initializePage();
  }

  /**
   * Initialize landing page content and interactions
   */
  async initializePage() {
    await this.loadArticles();
    this.setupEventHandlers();
    this.initScrollAnimations();
    console.log('✅ SPA Landing page loaded');
  }

  /**
   * Render the landing page HTML content
   * @returns {string} - HTML content for landing page
   */
  renderHTML() {
    return `
      <div class="landing-page">
        <!-- Hero Section -->
        <section class="hero-section">
          <div class="container">
            <div class="hero-content">
              <div class="hero-text">
                <h1 class="hero-title">
                  Welcome to
                  <span class="hero-brand">Knowledge Foyer</span>
                </h1>
                <p class="hero-description">
                  A professional publishing platform where creators share evolving work
                  and receive structured, quality feedback from engaged readers.
                </p>
                <div class="hero-actions">
                  <button class="btn btn-primary btn-large" data-action="register">
                    Start Publishing
                  </button>
                  <button class="btn btn-secondary btn-large" data-action="explore">
                    Explore Articles
                  </button>
                </div>
              </div>

              <div class="hero-visual">
                <div class="hero-illustration">
                  <div class="illustration-card">
                    <div class="card-header">📝 Draft Article</div>
                    <div class="card-content">
                      <div class="card-line"></div>
                      <div class="card-line short"></div>
                    </div>
                  </div>
                  <div class="illustration-arrow">→</div>
                  <div class="illustration-card">
                    <div class="card-header">💬 Feedback</div>
                    <div class="card-content">
                      <div class="feedback-item">
                        <div class="feedback-author">@alex</div>
                        <div class="feedback-text">Great insights!</div>
                      </div>
                    </div>
                  </div>
                  <div class="illustration-arrow">→</div>
                  <div class="illustration-card published">
                    <div class="card-header">🚀 Published</div>
                    <div class="card-content">
                      <div class="card-line"></div>
                      <div class="card-line medium"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Features Section -->
        <section class="features-section">
          <div class="container">
            <div class="features-header">
              <h2>Why Knowledge Foyer?</h2>
              <p>Professional publishing meets collaborative feedback</p>
            </div>

            <div class="features-grid">
              <div class="feature-card" data-animate>
                <div class="feature-icon">📚</div>
                <h3>Structured Publishing</h3>
                <p>Organize your ideas into coherent articles with version control and professional presentation.</p>
              </div>

              <div class="feature-card" data-animate>
                <div class="feature-icon">🎯</div>
                <h3>Quality Feedback</h3>
                <p>Receive detailed, constructive feedback ranked by usefulness from engaged readers.</p>
              </div>

              <div class="feature-card" data-animate>
                <div class="feature-icon">🌐</div>
                <h3>Professional Network</h3>
                <p>Connect with other creators and build your professional presence in your domain.</p>
              </div>

              <div class="feature-card" data-animate>
                <div class="feature-icon">🚀</div>
                <h3>Growth Focused</h3>
                <p>Track engagement, improve your writing, and grow your audience with detailed analytics.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Article Feed Section -->
        <section class="article-feed-section" id="articles-section">
          <div class="container">
            <div class="feed-header">
              <h2>Recent Articles</h2>
              <p>Discover the latest insights from our community</p>
            </div>

            <div class="article-feed" id="article-feed">
              ${this.renderArticleLoadingState()}
            </div>

            <div class="feed-actions">
              <button class="btn btn-secondary" id="load-more-btn" style="display: none;">
                Load More Articles
              </button>
            </div>
          </div>
        </section>

        <!-- CTA Section -->
        <section class="cta-section">
          <div class="container">
            <div class="cta-content">
              <h2>Ready to Share Your Knowledge?</h2>
              <p>Join our community of creators and start building your professional presence.</p>
              <div class="cta-actions">
                <button class="btn btn-primary btn-large" data-action="register">
                  Create Your Account
                </button>
                <button class="btn btn-outline btn-large" data-action="login">
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  /**
   * Load articles from the API
   * @param {boolean} append - Whether to append to existing articles or replace
   */
  async loadArticles(append = false) {
    if (this.isLoading) return;

    this.isLoading = true;
    this.updateLoadingState();

    try {
      console.log('📚 Loading articles...');

      // Use spa app instance for API calls if available
      const spa = window.spa;
      const apiRequest = spa?.apiRequest || this.fallbackApiRequest;

      const response = await apiRequest(`/api/articles?page=${this.currentPage}&limit=6&status=published`);

      let data;
      if (response && response.ok) {
        data = await response.json();
        this.articles = append ? [...this.articles, ...data.articles] : (data.articles || []);
        this.hasMore = data.hasMore || false;
        this.currentPage = append ? this.currentPage + 1 : 2;
      } else {
        // Show demo articles if API fails
        this.articles = this.getDemoArticles();
        this.hasMore = false;
      }

      this.renderArticles();

    } catch (error) {
      console.error('Failed to load articles:', error);
      // Show demo articles on error
      this.articles = this.getDemoArticles();
      this.hasMore = false;
      this.renderArticles();
    } finally {
      this.isLoading = false;
      this.updateLoadingState();
    }
  }

  /**
   * Fallback API request method
   * @param {string} url - API endpoint
   * @returns {Promise} - Fetch promise
   */
  fallbackApiRequest(url) {
    return fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get demo articles for display when API is unavailable
   * @returns {Array} - Demo article data
   */
  getDemoArticles() {
    return [
      {
        id: 'demo-1',
        title: 'Building Resilient Distributed Systems',
        summary: 'Exploring patterns and practices for creating fault-tolerant microservices architecture in modern cloud environments.',
        author_username: 'alice_chen',
        author_display_name: 'Dr. Alice Chen',
        published_at: '2024-01-15T10:30:00Z',
        read_time: 8,
        tags: ['architecture', 'microservices', 'cloud'],
        feedback_count: 12,
        is_demo: true
      },
      {
        id: 'demo-2',
        title: 'The Future of Climate Technology',
        summary: 'An in-depth analysis of breakthrough innovations in renewable energy, carbon capture, and sustainable manufacturing.',
        author_username: 'bob_martinez',
        author_display_name: 'Bob Martinez',
        published_at: '2024-01-14T15:45:00Z',
        read_time: 12,
        tags: ['climate', 'technology', 'sustainability'],
        feedback_count: 8,
        is_demo: true
      },
      {
        id: 'demo-3',
        title: 'Remote Work: Lessons from Three Years',
        summary: 'Key insights about building effective remote teams, maintaining culture, and optimizing productivity in distributed organizations.',
        author_username: 'carol_johnson',
        author_display_name: 'Carol Johnson',
        published_at: '2024-01-13T09:15:00Z',
        read_time: 6,
        tags: ['remote-work', 'management', 'productivity'],
        feedback_count: 15,
        is_demo: true
      }
    ];
  }

  /**
   * Render articles in the feed
   */
  renderArticles() {
    const feedElement = document.getElementById('article-feed');
    const loadMoreBtn = document.getElementById('load-more-btn');

    if (!feedElement) return;

    if (this.articles.length === 0) {
      feedElement.innerHTML = this.renderEmptyState();
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    const articlesHTML = this.articles.map(article => this.createArticleCard(article)).join('');
    feedElement.innerHTML = articlesHTML;

    // Show/hide load more button
    if (loadMoreBtn) {
      loadMoreBtn.style.display = this.hasMore ? 'block' : 'none';
    }

    // Add click handlers
    this.setupArticleClickHandlers();
  }

  /**
   * Create HTML for a single article card
   * @param {Object} article - Article data
   * @returns {string} - Article card HTML
   */
  createArticleCard(article) {
    const publishedDate = new Date(article.published_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const feedbackText = article.feedback_count === 1 ? 'feedback' : 'feedbacks';

    return `
      <article class="article-card ${article.is_demo ? 'demo' : ''}"
               data-article-id="${article.id}"
               data-animate>
        <div class="article-content">
          <h3 class="article-title">
            ${article.title}
            ${article.is_demo ? '<span class="demo-badge">Demo</span>' : ''}
          </h3>

          <p class="article-summary">${article.summary}</p>

          <div class="article-meta">
            <div class="meta-row">
              <span class="article-author">by @${article.author_username}</span>
              <span class="article-date">${publishedDate}</span>
            </div>

            <div class="meta-row">
              <span class="article-read-time">${article.read_time} min read</span>
              <span class="article-feedback">${article.feedback_count} ${feedbackText}</span>
            </div>
          </div>

          ${article.tags && article.tags.length > 0 ? `
            <div class="article-tags">
              ${article.tags.map(tag => `
                <span class="article-tag">#${tag}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="article-actions">
          <button class="btn btn-outline btn-sm" data-action="read" data-article-id="${article.id}">
            Read Article
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Render loading state for articles
   * @returns {string} - Loading state HTML
   */
  renderArticleLoadingState() {
    return `
      <div class="feed-loading">
        <div class="loading-spinner"></div>
        <p class="loading-text">Loading articles...</p>
      </div>
    `;
  }

  /**
   * Render empty state when no articles are found
   * @returns {string} - Empty state HTML
   */
  renderEmptyState() {
    return `
      <div class="feed-empty">
        <div class="empty-icon">📰</div>
        <h3>No Articles Yet</h3>
        <p>Be the first to share your knowledge with the community!</p>
        <button class="btn btn-primary" data-action="register">
          Start Writing
        </button>
      </div>
    `;
  }

  /**
   * Update loading state UI
   */
  updateLoadingState() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      if (this.isLoading) {
        loadMoreBtn.textContent = 'Loading...';
        loadMoreBtn.disabled = true;
      } else {
        loadMoreBtn.textContent = 'Load More Articles';
        loadMoreBtn.disabled = false;
      }
    }
  }

  /**
   * Set up event handlers for the landing page
   */
  setupEventHandlers() {
    // Explore button scroll to articles
    document.addEventListener('click', (event) => {
      if (event.target.hasAttribute('data-action')) {
        const action = event.target.getAttribute('data-action');

        switch (action) {
          case 'explore':
            event.preventDefault();
            this.scrollToArticles();
            break;

          case 'read':
            event.preventDefault();
            const articleId = event.target.getAttribute('data-article-id');
            this.openArticle(articleId);
            break;

          case 'login':
            event.preventDefault();
            this.showLogin();
            break;

          case 'register':
            event.preventDefault();
            this.showRegister();
            break;
        }
      }
    });

    // Load more articles button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        this.loadArticles(true);
      });
    }

    // Infinite scroll (optional)
    this.setupInfiniteScroll();

    // Authentication button handlers
    this.setupAuthHandlers();
  }

  /**
   * Set up article card click handlers
   */
  setupArticleClickHandlers() {
    document.querySelectorAll('.article-card').forEach(card => {
      card.addEventListener('click', (event) => {
        // Don't trigger if clicking on buttons or links
        if (event.target.closest('.article-actions, .btn, a')) return;

        const articleId = card.getAttribute('data-article-id');
        this.openArticle(articleId);
      });

      // Add keyboard support
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const articleId = card.getAttribute('data-article-id');
          this.openArticle(articleId);
        }
      });
    });
  }

  /**
   * Set up infinite scroll for articles
   */
  setupInfiniteScroll() {
    if (!this.hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && this.hasMore && !this.isLoading) {
          this.loadArticles(true);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '100px'
    });

    // Observe the last article or load more button
    const feedElement = document.getElementById('article-feed');
    if (feedElement && feedElement.lastElementChild) {
      observer.observe(feedElement.lastElementChild);
    }

    // Store observer for cleanup
    this.scrollObserver = observer;
  }

  /**
   * Set up authentication-related handlers
   */
  setupAuthHandlers() {
    // Track authentication intent for analytics
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) {
        const action = button.getAttribute('data-action');
        if (action === 'register') {
          console.log('📝 User clicked register from landing page');
          // TODO: Track analytics event
        } else if (action === 'login') {
          console.log('🔑 User clicked login from landing page');
          // TODO: Track analytics event
        }
      }
    });
  }

  /**
   * Show login modal
   */
  showLogin() {
    const spa = window.spa;
    if (spa?.modal) {
      spa.modal.showLogin();
    } else {
      // Fallback to navigation if modal not available
      console.warn('Modal system not available, falling back to page navigation');
      if (spa?.router) {
        spa.router.navigate('/login');
      }
    }
  }

  /**
   * Show registration modal
   */
  showRegister() {
    const spa = window.spa;
    if (spa?.modal) {
      spa.modal.showRegister();
    } else {
      // Fallback to navigation if modal not available
      console.warn('Modal system not available, falling back to page navigation');
      if (spa?.router) {
        spa.router.navigate('/register');
      }
    }
  }

  /**
   * Smooth scroll to articles section
   */
  scrollToArticles() {
    const articlesSection = document.getElementById('articles-section');
    if (articlesSection) {
      articlesSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  /**
   * Open an article
   * @param {string} articleId - Article ID to open
   */
  openArticle(articleId) {
    console.log('📖 Opening article:', articleId);

    if (articleId.startsWith('demo-')) {
      // Show demo notification
      if (window.spa?.showNotification) {
        window.spa.showNotification('Demo article! Register to read full content.', 'info');
      }
      return;
    }

    // Navigate to article page
    if (window.spa?.router) {
      window.spa.router.navigate(`/article/${articleId}`);
    } else {
      window.location.hash = `#/article/${articleId}`;
    }
  }

  /**
   * Initialize scroll animations
   */
  initScrollAnimations() {
    // Skip animations if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target); // Only animate once
        }
      });
    }, observerOptions);

    // Observe elements marked for animation
    document.querySelectorAll('[data-animate]').forEach(element => {
      observer.observe(element);
    });

    // Store observer for cleanup
    this.animationObserver = observer;
  }

  /**
   * Refresh articles (for manual refresh)
   */
  async refreshArticles() {
    this.currentPage = 1;
    this.hasMore = true;
    await this.loadArticles(false);
  }

  /**
   * Clean up event listeners and observers
   */
  destroy() {
    document.removeEventListener('spa:page-loaded', this.handlePageLoad);

    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
    }

    if (this.animationObserver) {
      this.animationObserver.disconnect();
    }

    console.log('🧹 SPA Landing Page controller destroyed');
  }
}

// Initialize when script loads
if (typeof window !== 'undefined') {
  window.SPALandingPage = SPALandingPage;
}

// Create global instance
if (typeof window !== 'undefined' && !window.spaLandingPage) {
  window.spaLandingPage = new SPALandingPage();
}