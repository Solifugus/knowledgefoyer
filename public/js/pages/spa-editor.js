/**
 * SPA Article Editor Controller
 *
 * Handles article creation and editing with markdown support, draft saving,
 * preview functionality, and publishing workflow.
 */

class SPAArticleEditor {
  constructor(spa) {
    this.spa = spa;
    this.router = spa?.router;
    this.auth = spa?.auth;
    this.modal = spa?.modal;
    this.mcpClient = spa?.mcpClient;

    // Editor state
    this.isEditing = false;
    this.currentArticle = null;
    this.currentSlug = null;
    this.isDirty = false;
    this.isLoading = false;
    this.error = null;

    // Editor UI state
    this.currentView = 'write'; // 'write', 'preview', 'split'
    this.autoSaveEnabled = true;
    this.lastAutoSave = null;

    // Form data
    this.formData = {
      title: '',
      content: '',
      excerpt: '',
      tags: [],
      status: 'draft',
      publishAt: null
    };

    console.log('✍️ SPAArticleEditor initialized');
  }

  /**
   * Render article editor for creation
   */
  async renderCreateEditor() {
    console.log('✍️ Rendering article creation editor');

    // Check authentication
    if (!this.auth.isAuthenticated()) {
      this.router?.navigate('/login');
      return;
    }

    this.isEditing = false;
    this.currentSlug = null;
    this.resetForm();

    return this.renderHTML();
  }

  /**
   * Render article editor for editing existing article
   */
  async renderEditEditor(slug) {
    console.log('✏️ Rendering article editor for:', slug);

    // Check authentication
    if (!this.auth.isAuthenticated()) {
      this.router?.navigate('/login');
      return;
    }

    this.isEditing = true;
    this.currentSlug = slug;
    this.isLoading = true;

    try {
      // Load article data
      await this.loadArticle(slug);
      return this.renderHTML();
    } catch (error) {
      console.error('❌ Article editing error:', error);
      this.error = error.message;
      return this.renderErrorHTML();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load article data for editing
   */
  async loadArticle(slug) {
    console.log('🔄 Loading article for editing:', slug);

    try {
      // Simulate API call - replace with actual API endpoint
      this.currentArticle = this.getMockArticleData(slug);

      // Populate form with article data
      this.formData = {
        title: this.currentArticle.title,
        content: this.currentArticle.content,
        excerpt: this.currentArticle.excerpt || '',
        tags: [...this.currentArticle.tags],
        status: this.currentArticle.status,
        publishAt: this.currentArticle.publishAt
      };

    } catch (error) {
      console.error('❌ Failed to load article:', error);
      throw error;
    }
  }

  /**
   * Generate main HTML for editor
   */
  renderHTML() {
    if (this.isLoading) {
      return this.renderLoadingHTML();
    }

    if (this.error) {
      return this.renderErrorHTML();
    }

    return `
      <div class="editor-page">
        <div class="editor-container">
          ${this.renderEditorHeader()}
          ${this.renderEditorToolbar()}
          ${this.renderEditorContent()}
          ${this.renderEditorSidebar()}
        </div>
      </div>
    `;
  }

  /**
   * Render editor header with title and actions
   */
  renderEditorHeader() {
    return `
      <header class="editor-header">
        <div class="editor-title-section">
          <input
            type="text"
            class="editor-title-input"
            placeholder="Article title..."
            value="${this.escapeHtml(this.formData.title)}"
            id="article-title"
          >
          <div class="editor-meta">
            ${this.isEditing ? `
              <span class="editing-indicator">Editing: ${this.currentSlug}</span>
            ` : `
              <span class="creating-indicator">New Article</span>
            `}
            ${this.lastAutoSave ? `
              <span class="autosave-status">
                Saved ${this.formatTimeAgo(this.lastAutoSave)}
              </span>
            ` : ''}
          </div>
        </div>

        <div class="editor-actions">
          <button class="btn btn-tertiary" id="preview-btn" data-action="toggle-preview">
            👁️ Preview
          </button>
          <button class="btn btn-secondary" id="save-draft-btn" data-action="save-draft">
            💾 Save Draft
          </button>
          <button class="btn btn-primary" id="publish-btn" data-action="publish">
            ${this.formData.status === 'published' ? '🔄 Update' : '🚀 Publish'}
          </button>
          <button class="btn btn-tertiary" data-action="close-editor">
            ✕ Close
          </button>
        </div>
      </header>
    `;
  }

  /**
   * Render editor toolbar with formatting options
   */
  renderEditorToolbar() {
    return `
      <div class="editor-toolbar">
        <div class="toolbar-section">
          <div class="view-toggle">
            <button class="view-btn ${this.currentView === 'write' ? 'active' : ''}"
                    data-view="write">✍️ Write</button>
            <button class="view-btn ${this.currentView === 'preview' ? 'active' : ''}"
                    data-view="preview">👁️ Preview</button>
            <button class="view-btn ${this.currentView === 'split' ? 'active' : ''}"
                    data-view="split">🔀 Split</button>
          </div>
        </div>

        <div class="toolbar-section">
          <div class="formatting-tools">
            <button class="tool-btn" data-tool="bold" title="Bold (Ctrl+B)">
              <strong>B</strong>
            </button>
            <button class="tool-btn" data-tool="italic" title="Italic (Ctrl+I)">
              <em>I</em>
            </button>
            <button class="tool-btn" data-tool="heading" title="Heading">
              H
            </button>
            <button class="tool-btn" data-tool="link" title="Link">
              🔗
            </button>
            <button class="tool-btn" data-tool="code" title="Code">
              &lt;/&gt;
            </button>
            <button class="tool-btn" data-tool="list" title="List">
              ≡
            </button>
            <button class="tool-btn" data-tool="quote" title="Quote">
              "
            </button>
          </div>
        </div>

        <div class="toolbar-section">
          <div class="word-count">
            <span id="word-count">0 words</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render main editor content area
   */
  renderEditorContent() {
    return `
      <div class="editor-main">
        <div class="editor-content ${this.currentView}">
          <div class="editor-write-panel ${this.currentView === 'preview' ? 'hidden' : ''}">
            <textarea
              class="editor-textarea"
              placeholder="Start writing your article..."
              id="article-content"
            >${this.escapeHtml(this.formData.content)}</textarea>
          </div>

          <div class="editor-preview-panel ${this.currentView === 'write' ? 'hidden' : ''}">
            <div class="preview-content" id="preview-content">
              ${this.renderMarkdown(this.formData.content)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render editor sidebar with article settings
   */
  renderEditorSidebar() {
    return `
      <aside class="editor-sidebar">
        <div class="sidebar-section">
          <h3>Article Settings</h3>

          <div class="setting-group">
            <label for="article-status">Status</label>
            <select id="article-status" class="setting-input">
              <option value="draft" ${this.formData.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="published" ${this.formData.status === 'published' ? 'selected' : ''}>Published</option>
              <option value="archived" ${this.formData.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          </div>

          <div class="setting-group">
            <label for="article-excerpt">Excerpt</label>
            <textarea
              id="article-excerpt"
              class="setting-input"
              placeholder="Brief description of your article..."
              rows="3"
            >${this.escapeHtml(this.formData.excerpt)}</textarea>
          </div>

          <div class="setting-group">
            <label for="article-tags">Tags</label>
            <div class="tags-input-container">
              <div class="current-tags">
                ${this.formData.tags.map(tag => `
                  <span class="tag-chip">
                    ${this.escapeHtml(tag)}
                    <button class="tag-remove" data-tag="${this.escapeHtml(tag)}">×</button>
                  </span>
                `).join('')}
              </div>
              <input
                type="text"
                id="article-tags"
                class="setting-input tag-input"
                placeholder="Add tags (press Enter)"
              >
            </div>
            <small class="setting-help">Press Enter to add a tag. Use relevant keywords to help readers discover your article.</small>
          </div>
        </div>

        <div class="sidebar-section">
          <h3>Publishing Options</h3>

          <div class="setting-group">
            <label class="checkbox-label">
              <input type="checkbox" id="auto-save" ${this.autoSaveEnabled ? 'checked' : ''}>
              Enable auto-save
            </label>
          </div>

          <div class="setting-group">
            <label for="publish-date">Publish Date</label>
            <input
              type="datetime-local"
              id="publish-date"
              class="setting-input"
              ${this.formData.publishAt ? `value="${this.formData.publishAt}"` : ''}
            >
            <small class="setting-help">Leave blank to publish immediately</small>
          </div>
        </div>

        <div class="sidebar-section">
          <h3>Article Stats</h3>
          <div class="stats-list">
            <div class="stat-item">
              <span class="stat-label">Words:</span>
              <span class="stat-value" id="word-count-sidebar">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Characters:</span>
              <span class="stat-value" id="char-count">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Reading time:</span>
              <span class="stat-value" id="reading-time">0 min</span>
            </div>
          </div>
        </div>

        ${this.isEditing ? `
          <div class="sidebar-section">
            <h3>Article History</h3>
            <div class="history-list">
              <div class="history-item">
                <div class="history-version">Version 2</div>
                <div class="history-date">Today, 3:45 PM</div>
              </div>
              <div class="history-item">
                <div class="history-version">Version 1</div>
                <div class="history-date">Yesterday, 2:15 PM</div>
              </div>
            </div>
            <button class="btn btn-small btn-tertiary">View Full History</button>
          </div>
        ` : ''}
      </aside>
    `;
  }

  /**
   * Set up event handlers after DOM is ready
   */
  setupEventHandlers() {
    console.log('🎯 Setting up editor event handlers...');

    // Title input
    const titleInput = document.getElementById('article-title');
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        this.formData.title = e.target.value;
        this.markDirty();
      });
    }

    // Content textarea
    const contentTextarea = document.getElementById('article-content');
    if (contentTextarea) {
      contentTextarea.addEventListener('input', (e) => {
        this.formData.content = e.target.value;
        this.updateWordCount();
        this.updatePreview();
        this.markDirty();
      });

      // Handle keyboard shortcuts
      contentTextarea.addEventListener('keydown', (e) => {
        this.handleKeyboardShortcuts(e);
      });
    }

    // Action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleAction(action);
      });
    });

    // View toggle buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.dataset.view;
        this.switchView(view);
      });
    });

    // Formatting tools
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = e.target.dataset.tool;
        this.applyFormatting(tool);
      });
    });

    // Settings inputs
    this.setupSettingsHandlers();

    // Tag input
    this.setupTagHandlers();

    // Auto-save
    this.setupAutoSave();

    // Initial word count update
    this.updateWordCount();
    this.updatePreview();

    console.log('✅ Editor event handlers ready');
  }

  /**
   * Set up settings input handlers
   */
  setupSettingsHandlers() {
    // Status select
    const statusSelect = document.getElementById('article-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.formData.status = e.target.value;
        this.markDirty();
      });
    }

    // Excerpt textarea
    const excerptTextarea = document.getElementById('article-excerpt');
    if (excerptTextarea) {
      excerptTextarea.addEventListener('input', (e) => {
        this.formData.excerpt = e.target.value;
        this.markDirty();
      });
    }

    // Publish date
    const publishDateInput = document.getElementById('publish-date');
    if (publishDateInput) {
      publishDateInput.addEventListener('change', (e) => {
        this.formData.publishAt = e.target.value;
        this.markDirty();
      });
    }

    // Auto-save checkbox
    const autoSaveCheckbox = document.getElementById('auto-save');
    if (autoSaveCheckbox) {
      autoSaveCheckbox.addEventListener('change', (e) => {
        this.autoSaveEnabled = e.target.checked;
      });
    }
  }

  /**
   * Set up tag input handlers
   */
  setupTagHandlers() {
    const tagInput = document.getElementById('article-tags');
    if (tagInput) {
      tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const tag = e.target.value.trim();
          if (tag && !this.formData.tags.includes(tag)) {
            this.addTag(tag);
            e.target.value = '';
          }
        }
      });
    }

    // Tag remove buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-remove')) {
        const tag = e.target.dataset.tag;
        this.removeTag(tag);
      }
    });
  }

  /**
   * Set up auto-save functionality
   */
  setupAutoSave() {
    setInterval(() => {
      if (this.autoSaveEnabled && this.isDirty) {
        this.autoSave();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          this.applyFormatting('bold');
          break;
        case 'i':
          e.preventDefault();
          this.applyFormatting('italic');
          break;
        case 's':
          e.preventDefault();
          this.saveDraft();
          break;
      }
    }
  }

  /**
   * Switch editor view mode
   */
  switchView(view) {
    console.log('👁️ Switching to view:', view);

    this.currentView = view;

    // Update view buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Update content panels
    const writePanel = document.querySelector('.editor-write-panel');
    const previewPanel = document.querySelector('.editor-preview-panel');
    const editorContent = document.querySelector('.editor-content');

    if (writePanel && previewPanel && editorContent) {
      editorContent.className = `editor-content ${view}`;

      writePanel.classList.toggle('hidden', view === 'preview');
      previewPanel.classList.toggle('hidden', view === 'write');

      if (view === 'preview' || view === 'split') {
        this.updatePreview();
      }
    }
  }

  /**
   * Apply text formatting
   */
  applyFormatting(tool) {
    const textarea = document.getElementById('article-content');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    let replacement = '';

    switch (tool) {
      case 'bold':
        replacement = `**${selectedText}**`;
        break;
      case 'italic':
        replacement = `*${selectedText}*`;
        break;
      case 'heading':
        replacement = `## ${selectedText}`;
        break;
      case 'link':
        replacement = `[${selectedText}](url)`;
        break;
      case 'code':
        replacement = selectedText.includes('\n') ?
          `\`\`\`\n${selectedText}\n\`\`\`` :
          `\`${selectedText}\``;
        break;
      case 'list':
        replacement = selectedText.split('\n').map(line => `- ${line}`).join('\n');
        break;
      case 'quote':
        replacement = selectedText.split('\n').map(line => `> ${line}`).join('\n');
        break;
    }

    // Replace selected text
    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);

    // Update cursor position
    const newCursorPos = start + replacement.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);

    // Update form data
    this.formData.content = textarea.value;
    this.updateWordCount();
    this.updatePreview();
    this.markDirty();
  }

  /**
   * Handle action button clicks
   */
  handleAction(action) {
    console.log('🎬 Handling editor action:', action);

    switch (action) {
      case 'save-draft':
        this.saveDraft();
        break;
      case 'publish':
        this.publish();
        break;
      case 'toggle-preview':
        this.switchView(this.currentView === 'preview' ? 'write' : 'preview');
        break;
      case 'close-editor':
        this.closeEditor();
        break;
      default:
        console.log('🚧 Action not implemented yet:', action);
    }
  }

  /**
   * Add tag to article
   */
  addTag(tag) {
    if (!this.formData.tags.includes(tag)) {
      this.formData.tags.push(tag);
      this.markDirty();
      this.updateTagsDisplay();
    }
  }

  /**
   * Remove tag from article
   */
  removeTag(tag) {
    this.formData.tags = this.formData.tags.filter(t => t !== tag);
    this.markDirty();
    this.updateTagsDisplay();
  }

  /**
   * Update tags display in sidebar
   */
  updateTagsDisplay() {
    const tagsContainer = document.querySelector('.current-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = this.formData.tags.map(tag => `
        <span class="tag-chip">
          ${this.escapeHtml(tag)}
          <button class="tag-remove" data-tag="${this.escapeHtml(tag)}">×</button>
        </span>
      `).join('');
    }
  }

  /**
   * Update word count and reading time
   */
  updateWordCount() {
    const words = this.countWords(this.formData.content);
    const chars = this.formData.content.length;
    const readingTime = Math.ceil(words / 200); // 200 words per minute

    // Update toolbar word count
    const wordCountEl = document.getElementById('word-count');
    if (wordCountEl) {
      wordCountEl.textContent = `${words} words`;
    }

    // Update sidebar stats
    const wordCountSidebarEl = document.getElementById('word-count-sidebar');
    const charCountEl = document.getElementById('char-count');
    const readingTimeEl = document.getElementById('reading-time');

    if (wordCountSidebarEl) wordCountSidebarEl.textContent = words;
    if (charCountEl) charCountEl.textContent = chars;
    if (readingTimeEl) readingTimeEl.textContent = `${readingTime} min`;
  }

  /**
   * Update preview content
   */
  updatePreview() {
    const previewContent = document.getElementById('preview-content');
    if (previewContent) {
      previewContent.innerHTML = this.renderMarkdown(this.formData.content);
    }
  }

  /**
   * Mark editor as dirty (needs saving)
   */
  markDirty() {
    this.isDirty = true;
  }

  /**
   * Auto-save draft
   */
  async autoSave() {
    console.log('💾 Auto-saving draft...');
    try {
      // TODO: Implement auto-save API call
      this.isDirty = false;
      this.lastAutoSave = new Date();
      this.updateAutoSaveStatus();
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
    }
  }

  /**
   * Save draft manually
   */
  async saveDraft() {
    console.log('💾 Saving draft...');

    try {
      // TODO: Implement draft save API call
      this.isDirty = false;
      this.lastAutoSave = new Date();
      this.updateAutoSaveStatus();

      // Show success feedback
      this.showNotification('Draft saved successfully!', 'success');

    } catch (error) {
      console.error('❌ Failed to save draft:', error);
      this.showNotification('Failed to save draft', 'error');
    }
  }

  /**
   * Publish article
   */
  async publish() {
    console.log('🚀 Publishing article...');

    if (!this.formData.title.trim()) {
      this.showNotification('Please add a title before publishing', 'error');
      return;
    }

    if (!this.formData.content.trim()) {
      this.showNotification('Please add content before publishing', 'error');
      return;
    }

    try {
      // TODO: Implement publish API call
      this.formData.status = 'published';
      this.isDirty = false;

      this.showNotification('Article published successfully!', 'success');

      // Redirect to article view
      setTimeout(() => {
        const slug = this.isEditing ? this.currentSlug : this.generateSlug(this.formData.title);
        this.router?.navigate(`/article/${slug}`);
      }, 2000);

    } catch (error) {
      console.error('❌ Failed to publish article:', error);
      this.showNotification('Failed to publish article', 'error');
    }
  }

  /**
   * Close editor with unsaved changes check
   */
  closeEditor() {
    if (this.isDirty) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to close the editor?');
      if (!confirmed) return;
    }

    this.router?.navigate('/dashboard');
  }

  /**
   * Update auto-save status display
   */
  updateAutoSaveStatus() {
    const statusEl = document.querySelector('.autosave-status');
    if (statusEl && this.lastAutoSave) {
      statusEl.textContent = `Saved ${this.formatTimeAgo(this.lastAutoSave)}`;
    }
  }

  /**
   * Show notification to user
   */
  showNotification(message, type = 'info') {
    // Simple notification implementation
    alert(message);
  }

  /**
   * Reset form to initial state
   */
  resetForm() {
    this.formData = {
      title: '',
      content: '',
      excerpt: '',
      tags: [],
      status: 'draft',
      publishAt: null
    };
    this.isDirty = false;
    this.lastAutoSave = null;
  }

  // Utility methods

  countWords(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  generateSlug(title) {
    return title.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substr(0, 50);
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
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.*)$/gm, '<p>$1</p>')
      .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>');
  }

  renderLoadingHTML() {
    return `
      <div class="editor-page">
        <div class="editor-container">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading article...</p>
          </div>
        </div>
      </div>
    `;
  }

  renderErrorHTML() {
    return `
      <div class="editor-page">
        <div class="editor-container">
          <div class="error-state">
            <h1>Editor Error</h1>
            <p>${this.error || 'Failed to load editor.'}</p>
            <button class="btn btn-primary" data-spa-link data-path="/dashboard">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Mock data method (replace with API call)
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

Start with a solid foundation that works without JavaScript, then enhance the experience progressively.`,
      excerpt: 'Learn how to build scalable web applications using modern JavaScript patterns and best practices.',
      tags: ['javascript', 'web-development', 'architecture', 'scalability'],
      status: 'draft',
      publishAt: null,
      author: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        username: 'jsexpert',
        displayName: 'Alex Chen'
      },
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-20T14:45:00Z'
    };
  }
}

// Make available globally
window.SPAArticleEditor = SPAArticleEditor;

console.log('✍️ SPAArticleEditor class loaded');