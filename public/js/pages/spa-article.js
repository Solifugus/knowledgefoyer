/**
 * SPA Article Page Controller
 *
 * Handles article viewing with integrated feedback system, version history,
 * and collaborative curation features.
 */

class SPAArticlePage {
  constructor(spa) {
    this.spa = spa;
    this.router = spa?.router;
    this.auth = spa?.auth;
    this.modal = spa?.modal;
    this.mcpClient = spa?.mcpClient;

    // Article state
    this.currentArticle = null;
    this.currentSlug = null;
    this.feedbackData = {
      positive: [],
      negative: [],
      unranked: []
    };
    this.isLoading = false;
    this.error = null;

    // UI state
    this.showVersionHistory = false;
    this.currentCurationIndex = 0;

    console.log('📖 SPAArticlePage initialized');
  }

  /**
   * Render article page for given slug
   */
  async renderArticle(slug) {
    console.log('📄 Rendering article:', slug);

    this.currentSlug = slug;
    this.isLoading = true;

    try {
      // Load article data
      await this.loadArticle(slug);

      // Generate and return HTML
      return this.renderHTML();
    } catch (error) {
      console.error('❌ Article rendering error:', error);
      this.error = error.message;
      return this.renderErrorHTML();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load article data from API
   */
  async loadArticle(slug) {
    console.log('🔄 Loading article data:', slug);

    try {
      // Simulate API call - replace with actual API endpoint
      this.currentArticle = this.getMockArticleData(slug);

      // Load feedback data
      await this.loadFeedbackData();

    } catch (error) {
      console.error('❌ Failed to load article:', error);
      throw error;
    }
  }

  /**
   * Load feedback data for current article
   */
  async loadFeedbackData() {
    console.log('💭 Loading feedback data...');

    try {
      // Simulate MCP call - replace with actual MCP tool call
      const mockFeedback = this.getMockFeedbackData();

      this.feedbackData = {
        positive: mockFeedback.filter(f => f.sentiment === 'positive' && f.isRanked),
        negative: mockFeedback.filter(f => f.sentiment === 'negative' && f.isRanked),
        unranked: mockFeedback.filter(f => !f.isRanked)
      };

    } catch (error) {
      console.error('❌ Failed to load feedback:', error);
      this.feedbackData = { positive: [], negative: [], unranked: [] };
    }
  }

  /**
   * Generate main HTML for article page
   */
  renderHTML() {
    if (this.isLoading) {
      return this.renderLoadingHTML();
    }

    if (this.error || !this.currentArticle) {
      return this.renderErrorHTML();
    }

    return `
      <div class="article-page">
        <div class="article-container">
          ${this.renderBreadcrumb()}
          ${this.renderArticleHeader()}
          ${this.renderArticleContent()}
          ${this.renderFeedbackSection()}
          ${this.renderVersionHistory()}
        </div>
      </div>
    `;
  }

  /**
   * Render breadcrumb navigation
   */
  renderBreadcrumb() {
    return `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="#/" data-spa-link data-path="/">Home</a></li>
          <li><span aria-current="page">${this.currentArticle.title}</span></li>
        </ol>
      </nav>
    `;
  }

  /**
   * Render article header section
   */
  renderArticleHeader() {
    const article = this.currentArticle;
    const isOwner = this.auth.isAuthenticated() &&
                   this.auth.getCurrentUser()?.username === article.author.username;

    return `
      <header class="article-header">
        <div class="article-meta">
          <span class="article-version">Version ${article.currentVersion}</span>
          <time class="article-date" datetime="${article.publishedAt}">
            Published ${this.formatDate(article.publishedAt)}
          </time>
          ${article.updatedAt !== article.publishedAt ? `
            <time class="article-updated" datetime="${article.updatedAt}">
              Updated ${this.formatDate(article.updatedAt)}
            </time>
          ` : ''}
        </div>

        <h1 class="article-title">${this.escapeHtml(article.title)}</h1>

        <div class="article-author">
          <span>By </span>
          <a href="#/@${article.author.username}" class="author-link" data-spa-link data-path="/@${article.author.username}">
            ${this.escapeHtml(article.author.displayName)}
          </a>
          ${article.author.isVerified ? '<span class="verified-badge" title="Verified author">✓</span>' : ''}
        </div>

        <div class="article-tags">
          ${article.tags.map(tag => `
            <span class="tag tag-clickable" data-tag="${this.escapeHtml(tag)}" role="button" tabindex="0">
              ${this.escapeHtml(tag)}
            </span>
          `).join('')}
        </div>

        ${isOwner ? `
          <div class="article-actions">
            <button class="btn btn-secondary" id="edit-article-btn">
              ✏️ Edit Article
            </button>
            <button class="btn btn-tertiary" id="version-history-btn">
              📚 Version History
            </button>
          </div>
        ` : ''}
      </header>
    `;
  }

  /**
   * Render article content section
   */
  renderArticleContent() {
    const article = this.currentArticle;

    return `
      <main class="article-content">
        ${article.content.length > 2000 ? this.renderTableOfContents() : ''}
        <div class="article-body">
          ${this.renderMarkdown(article.content)}
        </div>
      </main>
    `;
  }

  /**
   * Render table of contents for long articles
   */
  renderTableOfContents() {
    // Extract headings from content for TOC
    const headings = this.extractHeadings(this.currentArticle.content);

    if (headings.length < 2) return '';

    return `
      <nav class="table-of-contents">
        <h3>Table of Contents</h3>
        <ol>
          ${headings.map(heading => `
            <li class="toc-level-${heading.level}">
              <a href="#${heading.id}">${this.escapeHtml(heading.text)}</a>
            </li>
          `).join('')}
        </ol>
      </nav>
    `;
  }

  /**
   * Render feedback section with ranked and unranked feedback
   */
  renderFeedbackSection() {
    const isAuthenticated = this.auth.isAuthenticated();
    const canSubmitFeedback = isAuthenticated; // All authenticated users can provide feedback

    return `
      <section class="feedback-section" id="feedback">
        <h2>Community Feedback</h2>

        ${canSubmitFeedback ? `
          <div class="feedback-actions">
            <button class="btn btn-primary" id="add-feedback-btn">
              💭 Add Feedback
            </button>
          </div>
        ` : `
          <div class="feedback-prompt">
            <p>
              <a href="#/login" data-spa-link data-path="/login">Sign in</a>
              to provide feedback and help improve this article.
            </p>
          </div>
        `}

        ${this.renderRankedFeedback()}
        ${isAuthenticated ? this.renderFeedbackCuration() : ''}
      </section>
    `;
  }

  /**
   * Render ranked feedback columns
   */
  renderRankedFeedback() {
    return `
      <div class="feedback-columns">
        <div class="feedback-column feedback-positive">
          <h3>Most Useful Positive Feedback</h3>
          <div class="feedback-list">
            ${this.feedbackData.positive.length > 0 ?
              this.feedbackData.positive.map(feedback => this.renderFeedbackItem(feedback)).join('') :
              '<p class="feedback-empty">No positive feedback yet. Be the first to share what works well!</p>'
            }
          </div>
        </div>

        <div class="feedback-column feedback-negative">
          <h3>Most Useful Negative Feedback</h3>
          <div class="feedback-list">
            ${this.feedbackData.negative.length > 0 ?
              this.feedbackData.negative.map(feedback => this.renderFeedbackItem(feedback)).join('') :
              '<p class="feedback-empty">No constructive feedback yet. Help the author improve their work!</p>'
            }
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render individual feedback item
   */
  renderFeedbackItem(feedback, showRankingControls = false) {
    const user = this.auth.getCurrentUser();
    const isOwn = user && feedback.author.id === user.id;

    return `
      <div class="feedback-item" data-feedback-id="${feedback.id}">
        <div class="feedback-header">
          <span class="feedback-author">
            ${this.escapeHtml(feedback.author.displayName)}
          </span>
          <time class="feedback-date" datetime="${feedback.createdAt}">
            ${this.formatDate(feedback.createdAt)}
          </time>
          ${feedback.isAddressed ? '<span class="feedback-addressed" title="Addressed in article update">✅</span>' : ''}
        </div>

        <div class="feedback-content">
          ${this.escapeHtml(feedback.content)}
        </div>

        <div class="feedback-footer">
          <div class="feedback-stats">
            <span class="feedback-useful" title="Marked as useful">
              👍 ${feedback.usefulCount}
            </span>
            <span class="feedback-not-useful" title="Not useful">
              👎 ${feedback.notUsefulCount}
            </span>
          </div>

          ${showRankingControls ? `
            <div class="feedback-ranking-controls">
              <button class="btn btn-small btn-positive" data-action="rank-positive" data-feedback-id="${feedback.id}">
                Useful Positive
              </button>
              <button class="btn btn-small btn-negative" data-action="rank-negative" data-feedback-id="${feedback.id}">
                Useful Negative
              </button>
              <button class="btn btn-small btn-tertiary" data-action="rank-ignore" data-feedback-id="${feedback.id}">
                Not Useful
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render feedback curation section for authenticated users
   */
  renderFeedbackCuration() {
    const unrankedCount = this.feedbackData.unranked.length;

    if (unrankedCount === 0) {
      return `
        <div class="feedback-curation">
          <h3>Help Curate Feedback</h3>
          <p class="curation-complete">
            🎉 All feedback has been curated! Thank you for helping improve the community.
          </p>
        </div>
      `;
    }

    const currentFeedback = this.feedbackData.unranked[this.currentCurationIndex];
    const progress = Math.round(((this.currentCurationIndex + 1) / unrankedCount) * 100);

    return `
      <div class="feedback-curation">
        <h3>Help Curate (${unrankedCount} remaining)</h3>
        <div class="curation-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <span class="progress-text">${this.currentCurationIndex + 1} of ${unrankedCount}</span>
        </div>

        <div class="curation-item">
          ${this.renderFeedbackItem(currentFeedback, true)}
        </div>
      </div>
    `;
  }

  /**
   * Render version history panel (collapsible)
   */
  renderVersionHistory() {
    if (!this.showVersionHistory) return '';

    return `
      <section class="version-history" id="version-history">
        <h3>Version History</h3>
        <div class="version-list">
          ${this.currentArticle.versions.map(version => `
            <div class="version-item ${version.version === this.currentArticle.currentVersion ? 'current-version' : ''}">
              <div class="version-header">
                <span class="version-number">Version ${version.version}</span>
                <time class="version-date" datetime="${version.createdAt}">
                  ${this.formatDate(version.createdAt)}
                </time>
              </div>
              <div class="version-summary">
                ${this.escapeHtml(version.summary)}
              </div>
              ${version.addressedFeedback.length > 0 ? `
                <div class="version-feedback">
                  <span>Addressed feedback:</span>
                  ${version.addressedFeedback.map(f => `
                    <span class="addressed-feedback-preview">${this.escapeHtml(f.preview)}</span>
                  `).join(', ')}
                </div>
              ` : ''}
              ${version.version !== this.currentArticle.currentVersion ? `
                <button class="btn btn-small btn-tertiary" data-action="view-version" data-version="${version.version}">
                  View This Version
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Render loading state
   */
  renderLoadingHTML() {
    return `
      <div class="article-page">
        <div class="article-container">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading article...</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderErrorHTML() {
    return `
      <div class="article-page">
        <div class="article-container">
          <div class="error-state">
            <h1>Article Not Found</h1>
            <p>${this.error || 'The requested article could not be found.'}</p>
            <button class="btn btn-primary" data-spa-link data-path="/">
              ← Return to Home
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event handlers after DOM is ready
   */
  setupEventHandlers() {
    console.log('🎯 Setting up article page event handlers...');

    // Add feedback button
    const addFeedbackBtn = document.getElementById('add-feedback-btn');
    if (addFeedbackBtn) {
      addFeedbackBtn.addEventListener('click', () => this.showFeedbackModal());
    }

    // Edit article button
    const editArticleBtn = document.getElementById('edit-article-btn');
    if (editArticleBtn) {
      editArticleBtn.addEventListener('click', () => this.editArticle());
    }

    // Version history toggle
    const versionHistoryBtn = document.getElementById('version-history-btn');
    if (versionHistoryBtn) {
      versionHistoryBtn.addEventListener('click', () => this.toggleVersionHistory());
    }

    // Tag click handlers
    document.querySelectorAll('.tag-clickable').forEach(tag => {
      tag.addEventListener('click', (e) => {
        const tagName = e.target.dataset.tag;
        this.router?.navigate(`/tag/${tagName}`);
      });

      tag.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const tagName = e.target.dataset.tag;
          this.router?.navigate(`/tag/${tagName}`);
        }
      });
    });

    // Feedback ranking controls
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const feedbackId = e.target.dataset.feedbackId;
        const version = e.target.dataset.version;

        switch (action) {
          case 'rank-positive':
            this.rankFeedback(feedbackId, 'positive');
            break;
          case 'rank-negative':
            this.rankFeedback(feedbackId, 'negative');
            break;
          case 'rank-ignore':
            this.rankFeedback(feedbackId, 'ignore');
            break;
          case 'view-version':
            this.viewVersion(version);
            break;
        }
      });
    });

    console.log('✅ Article page event handlers ready');
  }

  /**
   * Show feedback submission modal
   */
  showFeedbackModal() {
    // TODO: Implement feedback modal
    console.log('💭 Showing feedback modal for article:', this.currentSlug);
    alert('Feedback submission coming soon!');
  }

  /**
   * Edit current article
   */
  editArticle() {
    console.log('✏️ Editing article:', this.currentSlug);
    this.router?.navigate(`/edit/${this.currentSlug}`);
  }

  /**
   * Toggle version history visibility
   */
  toggleVersionHistory() {
    this.showVersionHistory = !this.showVersionHistory;

    // Re-render the page with updated state
    const container = document.querySelector('.article-page');
    if (container) {
      container.innerHTML = this.renderHTML().match(/<div class="article-container">([\s\S]*)<\/div>/)[1];
      this.setupEventHandlers();
    }
  }

  /**
   * Rank feedback item
   */
  async rankFeedback(feedbackId, ranking) {
    console.log('⭐ Ranking feedback:', feedbackId, ranking);

    try {
      // TODO: Implement MCP tool call for feedback ranking
      // await this.mcpClient?.call('rank_feedback', { feedback_id: feedbackId, ranking });

      // Update local state and UI
      this.moveToNextCuration();

    } catch (error) {
      console.error('❌ Failed to rank feedback:', error);
    }
  }

  /**
   * Move to next item in curation queue
   */
  moveToNextCuration() {
    this.currentCurationIndex++;

    // Re-render curation section
    const curationSection = document.querySelector('.feedback-curation');
    if (curationSection) {
      curationSection.outerHTML = this.renderFeedbackCuration();
      this.setupEventHandlers();
    }
  }

  /**
   * View specific version of article
   */
  viewVersion(version) {
    console.log('📚 Viewing version:', version);
    this.router?.navigate(`/article/${this.currentSlug}?version=${version}`);
  }

  // Utility methods

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderMarkdown(content) {
    // Simple markdown rendering - replace with proper markdown parser
    return content
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.*)$/gm, '<p>$1</p>');
  }

  extractHeadings(content) {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headings = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

      headings.push({ level, text, id });
    }

    return headings;
  }

  // Mock data methods (replace with API calls)

  getMockArticleData(slug) {
    return {
      id: '550e8400-e29b-41d4-a716-446655440001',
      slug: slug,
      title: 'Building Scalable Web Applications with Modern JavaScript',
      content: `# Introduction

Building scalable web applications requires careful planning and the right technological choices. In this article, we'll explore modern JavaScript patterns and architectural decisions that can help you create maintainable, performant applications.

## Core Principles

### 1. Modularity and Separation of Concerns

Modern JavaScript applications benefit greatly from modular architecture. By breaking down your application into discrete, reusable components, you create a system that's easier to test, maintain, and scale.

**Key benefits:**
- Improved code organization
- Better testability
- Enhanced reusability
- Easier debugging

### 2. Progressive Enhancement

Start with a solid foundation that works without JavaScript, then enhance the experience progressively. This ensures your application remains accessible and functional even when JavaScript fails or is unavailable.

## Implementation Strategies

### Component-Based Architecture

\\\`\\\`\\\`javascript
class ArticleComponent {
  constructor(element) {
    this.element = element;
    this.init();
  }

  init() {
    this.setupEventHandlers();
    this.render();
  }
}
\\\`\\\`\\\`

## Performance Considerations

Performance should be a primary concern from the beginning of development, not an afterthought. Key areas to focus on include:

- Bundle size optimization
- Lazy loading strategies
- Efficient DOM manipulation
- Memory management

## Conclusion

Building scalable web applications is a complex endeavor that requires thoughtful planning and execution. By following these principles and patterns, you can create applications that grow with your needs while maintaining performance and maintainability.`,
      author: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        username: 'jsexpert',
        displayName: 'Alex Chen',
        isVerified: true
      },
      tags: ['javascript', 'web-development', 'architecture', 'scalability'],
      publishedAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-20T14:45:00Z',
      currentVersion: 2,
      versions: [
        {
          version: 1,
          createdAt: '2024-01-15T10:30:00Z',
          summary: 'Initial publication',
          addressedFeedback: []
        },
        {
          version: 2,
          createdAt: '2024-01-20T14:45:00Z',
          summary: 'Added performance section and code examples',
          addressedFeedback: [
            { id: 'fb1', preview: 'Add more concrete examples...' },
            { id: 'fb3', preview: 'Consider performance implications...' }
          ]
        }
      ]
    };
  }

  getMockFeedbackData() {
    return [
      {
        id: 'fb1',
        content: 'Great article! The modularity section really helped me understand how to structure my React components better.',
        author: { id: 'u1', displayName: 'Sarah Johnson' },
        createdAt: '2024-01-16T09:15:00Z',
        sentiment: 'positive',
        isRanked: true,
        isAddressed: true,
        usefulCount: 24,
        notUsefulCount: 1
      },
      {
        id: 'fb2',
        content: 'Could you add more examples of state management patterns? The current examples are helpful but more variety would be great.',
        author: { id: 'u2', displayName: 'Mike Rodriguez' },
        createdAt: '2024-01-16T14:22:00Z',
        sentiment: 'negative',
        isRanked: true,
        isAddressed: false,
        usefulCount: 18,
        notUsefulCount: 2
      },
      {
        id: 'fb3',
        content: 'The performance section is excellent. Have you considered discussing bundle splitting strategies?',
        author: { id: 'u3', displayName: 'Emma Wilson' },
        createdAt: '2024-01-17T11:30:00Z',
        sentiment: 'positive',
        isRanked: true,
        isAddressed: true,
        usefulCount: 15,
        notUsefulCount: 0
      },
      {
        id: 'fb4',
        content: 'This article helped me refactor our legacy codebase. The component-based approach made a huge difference.',
        author: { id: 'u4', displayName: 'David Kim' },
        createdAt: '2024-01-18T16:45:00Z',
        sentiment: 'positive',
        isRanked: false,
        isAddressed: false,
        usefulCount: 0,
        notUsefulCount: 0
      },
      {
        id: 'fb5',
        content: 'The introduction feels a bit vague. Maybe start with a concrete problem that the article solves?',
        author: { id: 'u5', displayName: 'Lisa Zhang' },
        createdAt: '2024-01-19T08:20:00Z',
        sentiment: 'negative',
        isRanked: false,
        isAddressed: false,
        usefulCount: 0,
        notUsefulCount: 0
      }
    ];
  }
}

// Make available globally
window.SPAArticlePage = SPAArticlePage;

console.log('📖 SPAArticlePage class loaded');