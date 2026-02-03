/* Knowledge Foyer - Article Editor Component */
/* Handles article editing interface, preview, save/publish, and auto-save */

class ArticleEditor {
    constructor(articleId, mcpClient) {
        this.articleId = articleId;
        this.mcpClient = mcpClient;
        this.currentMode = 'edit'; // 'edit' or 'preview'
        this.hasUnsavedChanges = false;
        this.autoSaveTimer = null;
        this.lastSaveContent = '';

        // DOM elements
        this.titleInput = document.getElementById('articleTitleInput');
        this.editor = document.getElementById('articleEditor');
        this.preview = document.getElementById('articlePreview');
        this.editMode = document.getElementById('editMode');
        this.previewMode = document.getElementById('previewMode');
        this.editModeButton = document.getElementById('editModeButton');
        this.previewModeButton = document.getElementById('previewModeButton');

        // Action buttons
        this.saveButton = document.getElementById('saveButton');
        this.publishButton = document.getElementById('publishButton');
        this.previewToggle = document.getElementById('previewToggle');
        this.fullscreenToggle = document.getElementById('fullscreenToggle');

        // Status elements
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.versionNumber = document.getElementById('versionNumber');
        this.wordCount = document.getElementById('wordCount');

        // Article data
        this.articleData = null;
        this.markdownRenderer = new MarkdownRenderer();

        this.init();
    }

    async init() {
        console.log('📝 Initializing article editor for article:', this.articleId);

        // Setup event handlers
        this.setupEventHandlers();

        // Load article data
        if (this.articleId && this.articleId !== 'new') {
            await this.loadArticle();
        } else {
            this.setupNewArticle();
        }

        // Start auto-save timer
        this.startAutoSave();

        console.log('✅ Article editor ready');
    }

    setupEventHandlers() {
        // Title input
        if (this.titleInput) {
            this.titleInput.addEventListener('input', () => {
                this.markUnsaved();
                this.updateWordCount();
            });
        }

        // Editor content
        if (this.editor) {
            this.editor.addEventListener('input', () => {
                this.markUnsaved();
                this.updateWordCount();

                // Update preview if in preview mode
                if (this.currentMode === 'preview') {
                    this.updatePreview();
                }
            });

            // Handle tab key for indentation
            this.editor.addEventListener('keydown', (event) => {
                if (event.key === 'Tab') {
                    event.preventDefault();
                    const start = this.editor.selectionStart;
                    const end = this.editor.selectionEnd;

                    // Insert tab character
                    this.editor.value = this.editor.value.substring(0, start) + '\t' + this.editor.value.substring(end);
                    this.editor.selectionStart = this.editor.selectionEnd = start + 1;

                    this.markUnsaved();
                }

                // Ctrl+S for save
                if (event.ctrlKey && event.key === 's') {
                    event.preventDefault();
                    this.saveArticle();
                }
            });
        }

        // Mode toggle buttons
        if (this.editModeButton) {
            this.editModeButton.addEventListener('click', () => {
                this.switchMode('edit');
            });
        }

        if (this.previewModeButton) {
            this.previewModeButton.addEventListener('click', () => {
                this.switchMode('preview');
            });
        }

        // Action buttons
        if (this.saveButton) {
            this.saveButton.addEventListener('click', () => {
                this.saveArticle();
            });
        }

        if (this.publishButton) {
            this.publishButton.addEventListener('click', () => {
                this.publishArticle();
            });
        }

        if (this.previewToggle) {
            this.previewToggle.addEventListener('click', () => {
                const newMode = this.currentMode === 'edit' ? 'preview' : 'edit';
                this.switchMode(newMode);
            });
        }

        if (this.fullscreenToggle) {
            this.fullscreenToggle.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        // Prevent data loss on page unload
        window.addEventListener('beforeunload', (event) => {
            if (this.hasUnsavedChanges) {
                event.preventDefault();
                event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    }

    async loadArticle() {
        try {
            console.log('📖 Loading article data...');

            const articleData = await this.mcpClient.getArticle(this.articleId);

            if (articleData) {
                this.articleData = articleData;
                this.populateEditor();
                this.updateUI();
                this.updateWordCount();

                // Store current content for comparison
                this.lastSaveContent = this.getCurrentContent();

            } else {
                throw new Error('Article not found');
            }

        } catch (error) {
            console.error('❌ Failed to load article:', error);
            window.app.showNotification('Failed to load article. Please try again.', 'error');
        }
    }

    setupNewArticle() {
        console.log('📄 Setting up new article...');

        this.articleData = {
            id: null,
            title: '',
            content: '',
            status: 'draft',
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        this.updateUI();
        this.updateWordCount();

        // Focus on title input
        if (this.titleInput) {
            this.titleInput.focus();
        }
    }

    populateEditor() {
        if (!this.articleData) return;

        if (this.titleInput) {
            this.titleInput.value = this.articleData.title || '';
        }

        if (this.editor) {
            this.editor.value = this.articleData.content || '';
        }

        // Update breadcrumb
        const breadcrumbTitle = document.getElementById('articleTitle');
        if (breadcrumbTitle) {
            breadcrumbTitle.textContent = this.articleData.title || 'Untitled Article';
        }
    }

    updateUI() {
        if (!this.articleData) return;

        // Update status
        if (this.statusText) {
            this.statusText.textContent = this.capitalizeFirst(this.articleData.status);
        }

        if (this.statusIndicator) {
            this.statusIndicator.className = `status-indicator status-${this.articleData.status}`;
        }

        // Update version
        if (this.versionNumber) {
            this.versionNumber.textContent = this.articleData.version || 1;
        }

        // Update publish button state
        if (this.publishButton) {
            if (this.articleData.status === 'published') {
                this.publishButton.textContent = '✏️ Update';
                this.publishButton.title = 'Publish new version';
            } else {
                this.publishButton.textContent = '🚀 Publish';
                this.publishButton.title = 'Publish for review';
            }
        }
    }

    switchMode(mode) {
        if (mode === this.currentMode) return;

        this.currentMode = mode;

        if (mode === 'edit') {
            this.editMode.style.display = 'block';
            this.previewMode.style.display = 'none';
            this.editModeButton.classList.add('active');
            this.previewModeButton.classList.remove('active');

            if (this.previewToggle) {
                this.previewToggle.textContent = '👁️ Preview';
            }

            // Focus on editor
            if (this.editor) {
                this.editor.focus();
            }

        } else if (mode === 'preview') {
            this.updatePreview();
            this.editMode.style.display = 'none';
            this.previewMode.style.display = 'block';
            this.editModeButton.classList.remove('active');
            this.previewModeButton.classList.add('active');

            if (this.previewToggle) {
                this.previewToggle.textContent = '✏️ Edit';
            }
        }
    }

    updatePreview() {
        if (!this.preview || !this.markdownRenderer) return;

        const title = this.titleInput ? this.titleInput.value.trim() : '';
        const content = this.editor ? this.editor.value : '';

        let previewHtml = '';

        if (title) {
            previewHtml += `<h1 class="article-preview-title">${this.escapeHtml(title)}</h1>`;
        }

        if (content) {
            previewHtml += this.markdownRenderer.renderWithIds(content);
        } else {
            previewHtml += '<p class="article-preview-empty">Start writing your article content...</p>';
        }

        this.preview.innerHTML = previewHtml;
    }

    updateWordCount() {
        if (!this.wordCount) return;

        const title = this.titleInput ? this.titleInput.value : '';
        const content = this.editor ? this.editor.value : '';
        const combinedText = title + ' ' + content;

        const wordCount = this.markdownRenderer ?
            this.markdownRenderer.getWordCount(combinedText) :
            this.fallbackWordCount(combinedText);

        this.wordCount.textContent = wordCount;
    }

    fallbackWordCount(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    getCurrentContent() {
        return {
            title: this.titleInput ? this.titleInput.value.trim() : '',
            content: this.editor ? this.editor.value : ''
        };
    }

    markUnsaved() {
        if (!this.hasUnsavedChanges) {
            this.hasUnsavedChanges = true;
            this.updateSaveButton();
        }
    }

    markSaved() {
        this.hasUnsavedChanges = false;
        this.lastSaveContent = this.getCurrentContent();
        this.updateSaveButton();
    }

    updateSaveButton() {
        if (!this.saveButton) return;

        if (this.hasUnsavedChanges) {
            this.saveButton.textContent = '💾 Save*';
            this.saveButton.classList.add('has-changes');
        } else {
            this.saveButton.textContent = '💾 Save';
            this.saveButton.classList.remove('has-changes');
        }
    }

    startAutoSave() {
        // Auto-save every 30 seconds if there are changes
        this.autoSaveTimer = setInterval(() => {
            if (this.hasUnsavedChanges) {
                console.log('💾 Auto-saving...');
                this.saveArticle(true);
            }
        }, 30000);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    async saveArticle(isAutoSave = false) {
        const currentContent = this.getCurrentContent();

        // Don't save if no actual changes
        if (JSON.stringify(currentContent) === JSON.stringify(this.lastSaveContent)) {
            if (!isAutoSave) {
                window.app.showNotification('No changes to save', 'info');
            }
            return;
        }

        try {
            this.setSavingState(true);

            if (this.articleId && this.articleId !== 'new') {
                // Update existing article
                const result = await this.mcpClient.updateArticle(this.articleId, {
                    title: currentContent.title,
                    content: currentContent.content
                });

                if (result) {
                    this.articleData = { ...this.articleData, ...result };
                    this.updateUI();
                    this.markSaved();

                    if (!isAutoSave) {
                        window.app.showNotification('Article saved successfully!', 'success');
                    }
                }

            } else {
                // Create new article
                const result = await this.mcpClient.callTool('create_article', {
                    title: currentContent.title,
                    content: currentContent.content
                });

                if (result && result.article) {
                    this.articleData = result.article;
                    this.articleId = result.article.id;
                    this.updateUI();
                    this.markSaved();

                    // Update URL without page reload
                    const newUrl = `/article-editor.html?id=${this.articleId}`;
                    history.replaceState(null, '', newUrl);

                    window.app.showNotification('Article created successfully!', 'success');
                }
            }

        } catch (error) {
            console.error('❌ Failed to save article:', error);
            window.app.showNotification('Failed to save article. Please try again.', 'error');

        } finally {
            this.setSavingState(false);
        }
    }

    async publishArticle() {
        // Ensure article is saved first
        if (this.hasUnsavedChanges) {
            await this.saveArticle();
        }

        if (!this.articleData || !this.articleData.id) {
            window.app.showNotification('Please save the article before publishing', 'error');
            return;
        }

        try {
            this.setPublishingState(true);

            const result = await this.mcpClient.callTool('publish_article', {
                article_id: this.articleData.id
            });

            if (result) {
                this.articleData.status = 'published';
                this.articleData.version = result.version || this.articleData.version + 1;
                this.updateUI();

                window.app.showNotification('Article published successfully!', 'success');
            }

        } catch (error) {
            console.error('❌ Failed to publish article:', error);
            window.app.showNotification('Failed to publish article. Please try again.', 'error');

        } finally {
            this.setPublishingState(false);
        }
    }

    setSavingState(isSaving) {
        if (this.saveButton) {
            this.saveButton.disabled = isSaving;
            if (isSaving) {
                this.saveButton.textContent = '💾 Saving...';
            } else {
                this.updateSaveButton();
            }
        }
    }

    setPublishingState(isPublishing) {
        if (this.publishButton) {
            this.publishButton.disabled = isPublishing;
            if (isPublishing) {
                this.publishButton.textContent = '🚀 Publishing...';
            } else {
                this.updateUI(); // Reset button text
            }
        }
    }

    toggleFullscreen() {
        const container = document.getElementById('editorContainer');
        const exitButton = document.getElementById('exitFullscreen');

        if (!document.fullscreenElement) {
            // Enter fullscreen
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }

            if (exitButton) {
                exitButton.style.display = 'block';
            }

        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Public methods
    getArticleData() {
        return this.articleData;
    }

    hasChanges() {
        return this.hasUnsavedChanges;
    }

    destroy() {
        console.log('🗑️ Destroying article editor...');
        this.stopAutoSave();

        // Remove event listeners if needed
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
}

// Export for use in other modules
window.ArticleEditor = ArticleEditor;