/* Knowledge Foyer - Article Editor Page Controller */
/* Coordinates article editor, feedback system, and MCP client */

class ArticleEditorPage {
    constructor() {
        this.articleId = null;
        this.mcpClient = null;
        this.articleEditor = null;
        this.feedbackSystem = null;
        this.isLoading = false;

        this.init();
    }

    async init() {
        console.log('📄 Initializing article editor page...');

        try {
            // Show loading state
            this.showLoading(true);

            // Get article ID from URL parameters
            this.articleId = this.getArticleIdFromUrl();

            // Initialize MCP client connection
            await this.initMCPClient();

            // Initialize page components
            await this.initComponents();

            // Setup page-level event handlers
            this.setupEventHandlers();

            // Hide loading state
            this.showLoading(false);

            console.log('✅ Article editor page ready');

        } catch (error) {
            console.error('❌ Failed to initialize article editor page:', error);
            this.showError('Failed to load article editor. Please refresh the page.');
        }
    }

    getArticleIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const articleId = urlParams.get('id');

        console.log('🔗 Article ID from URL:', articleId || 'new');
        return articleId || 'new';
    }

    async initMCPClient() {
        console.log('🔌 Initializing MCP client...');

        this.mcpClient = new MCPClient();

        // Setup connection event handlers
        this.mcpClient.on('connected', () => {
            console.log('✅ MCP client connected');
        });

        this.mcpClient.on('disconnected', (data) => {
            console.log('❌ MCP client disconnected:', data);
            window.app.showNotification('Connection lost. Attempting to reconnect...', 'warning');
        });

        this.mcpClient.on('error', (error) => {
            console.error('❌ MCP client error:', error);
            window.app.showNotification('Connection error. Please check your network.', 'error');
        });

        this.mcpClient.on('max_reconnect_attempts', () => {
            window.app.showNotification('Connection lost. Please refresh the page.', 'error');
        });

        // Connect to server
        await this.mcpClient.connect();
    }

    async initComponents() {
        console.log('🧩 Initializing page components...');

        // Initialize article editor component
        this.articleEditor = new ArticleEditor(this.articleId, this.mcpClient);

        // Initialize feedback system component (only for existing articles)
        if (this.articleId && this.articleId !== 'new') {
            this.feedbackSystem = new FeedbackSystem(this.articleId, this.mcpClient);

            // Make feedback system globally accessible for button clicks
            window.feedbackSystem = this.feedbackSystem;
        } else {
            // Hide feedback columns for new articles
            this.hideFeedbackColumns();
        }

        // Wait a moment for components to initialize
        await this.waitForComponentsReady();

        // Setup inter-component communication
        this.setupComponentCoordination();
    }

    async waitForComponentsReady() {
        // Simple delay to ensure components are ready
        return new Promise(resolve => setTimeout(resolve, 100));
    }

    setupComponentCoordination() {
        // Listen for article creation to show feedback columns
        if (this.articleEditor) {
            // Override the article editor's save method to handle new articles
            const originalSave = this.articleEditor.saveArticle.bind(this.articleEditor);

            this.articleEditor.saveArticle = async (isAutoSave = false) => {
                const wasNew = this.articleId === 'new';

                await originalSave(isAutoSave);

                // If this was a new article and now has an ID, initialize feedback system
                if (wasNew && this.articleEditor.articleData && this.articleEditor.articleData.id) {
                    this.articleId = this.articleEditor.articleData.id;

                    // Show feedback columns
                    this.showFeedbackColumns();

                    // Initialize feedback system
                    this.feedbackSystem = new FeedbackSystem(this.articleId, this.mcpClient);
                    window.feedbackSystem = this.feedbackSystem;

                    console.log('📋 Feedback system enabled for new article');
                }
            };
        }

        // Listen for real-time feedback updates
        if (this.mcpClient) {
            this.mcpClient.on('feedback_submitted', (data) => {
                if (data.article_id === this.articleId) {
                    // Could trigger UI updates or notifications
                    window.app.showNotification('New feedback received!', 'info');
                }
            });
        }
    }

    setupEventHandlers() {
        // Handle fullscreen events
        document.addEventListener('fullscreenchange', () => {
            this.handleFullscreenChange();
        });

        document.addEventListener('webkitfullscreenchange', () => {
            this.handleFullscreenChange();
        });

        document.addEventListener('msfullscreenchange', () => {
            this.handleFullscreenChange();
        });

        // Exit fullscreen button
        const exitFullscreen = document.getElementById('exitFullscreen');
        if (exitFullscreen) {
            exitFullscreen.addEventListener('click', () => {
                this.exitFullscreen();
            });
        }

        // Handle window resize for responsive layout
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });

        // Update user display if authenticated
        this.updateUserDisplay();
    }

    handleFullscreenChange() {
        const exitButton = document.getElementById('exitFullscreen');

        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            // Entered fullscreen
            if (exitButton) {
                exitButton.style.display = 'block';
            }
        } else {
            // Exited fullscreen
            if (exitButton) {
                exitButton.style.display = 'none';
            }
        }
    }

    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    handleResize() {
        // Handle responsive layout changes
        const width = window.innerWidth;
        const feedbackSummary = document.getElementById('feedbackSummary');

        if (width <= 768) {
            // Mobile: show feedback summary
            if (feedbackSummary && this.feedbackSystem) {
                feedbackSummary.style.display = 'block';
                this.updateFeedbackSummary();
            }
        } else {
            // Desktop: hide feedback summary
            if (feedbackSummary) {
                feedbackSummary.style.display = 'none';
            }
        }
    }

    updateFeedbackSummary() {
        if (!this.feedbackSystem) return;

        const counts = this.feedbackSystem.getFeedbackCounts();
        const summaryProsElement = document.getElementById('summaryProsCount');
        const summaryConsElement = document.getElementById('summaryConsCount');

        if (summaryProsElement) summaryProsElement.textContent = counts.pros;
        if (summaryConsElement) summaryConsElement.textContent = counts.cons;
    }

    handleKeyboardShortcuts(event) {
        // Ctrl+S - Save (handled by article editor)
        // Ctrl+Shift+P - Publish
        if (event.ctrlKey && event.shiftKey && event.key === 'P') {
            event.preventDefault();
            if (this.articleEditor) {
                this.articleEditor.publishArticle();
            }
        }

        // Ctrl+Shift+E - Toggle edit/preview
        if (event.ctrlKey && event.shiftKey && event.key === 'E') {
            event.preventDefault();
            if (this.articleEditor) {
                const newMode = this.articleEditor.currentMode === 'edit' ? 'preview' : 'edit';
                this.articleEditor.switchMode(newMode);
            }
        }

        // F11 - Fullscreen (browsers handle this, but we can supplement)
        if (event.key === 'F11') {
            // Let browser handle F11, just update our UI
            setTimeout(() => this.handleFullscreenChange(), 100);
        }

        // Escape - Exit fullscreen
        if (event.key === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement)) {
            this.exitFullscreen();
        }
    }

    showLoading(show) {
        const loadingState = document.getElementById('loadingState');
        const editorContainer = document.getElementById('editorContainer');

        if (show) {
            if (loadingState) loadingState.style.display = 'flex';
            if (editorContainer) editorContainer.style.display = 'none';
        } else {
            if (loadingState) loadingState.style.display = 'none';
            if (editorContainer) editorContainer.style.display = 'block';
        }

        this.isLoading = show;
    }

    showError(message) {
        console.error('❌ Page error:', message);

        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.innerHTML = `
                <div class="page-error">
                    <div class="page-error-icon">❌</div>
                    <p class="page-error-message">${message}</p>
                    <button class="btn btn-primary" onclick="location.reload()">
                        🔄 Retry
                    </button>
                </div>
            `;
        }

        window.app.showNotification(message, 'error');
    }

    hideFeedbackColumns() {
        const prosColumn = document.getElementById('prosColumn');
        const consColumn = document.getElementById('consColumn');
        const articleColumn = document.getElementById('articleColumn');

        if (prosColumn) prosColumn.style.display = 'none';
        if (consColumn) consColumn.style.display = 'none';

        // Make article column full width
        if (articleColumn) {
            articleColumn.style.gridColumn = '1 / -1';
        }
    }

    showFeedbackColumns() {
        const prosColumn = document.getElementById('prosColumn');
        const consColumn = document.getElementById('consColumn');
        const articleColumn = document.getElementById('articleColumn');

        if (prosColumn) prosColumn.style.display = 'flex';
        if (consColumn) consColumn.style.display = 'flex';

        // Reset article column width
        if (articleColumn) {
            articleColumn.style.gridColumn = '';
        }
    }

    updateUserDisplay() {
        if (window.app && window.app.isAuthenticated && window.app.user) {
            const usernameElement = document.getElementById('username');
            const userAvatar = document.getElementById('userAvatar');

            if (usernameElement) {
                usernameElement.textContent = window.app.user.username;
            }

            if (userAvatar) {
                userAvatar.textContent = window.app.user.username.charAt(0).toUpperCase();
            }
        }
    }

    // Public methods for external access
    getArticleEditor() {
        return this.articleEditor;
    }

    getFeedbackSystem() {
        return this.feedbackSystem;
    }

    getMCPClient() {
        return this.mcpClient;
    }

    async refresh() {
        console.log('🔄 Refreshing page data...');

        if (this.articleEditor) {
            await this.articleEditor.loadArticle();
        }

        if (this.feedbackSystem) {
            await this.feedbackSystem.refresh();
        }
    }
}

// Initialize the page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.articleEditorPage = new ArticleEditorPage();
});

// Handle page visibility for connection management
document.addEventListener('visibilitychange', () => {
    if (window.articleEditorPage && window.articleEditorPage.mcpClient) {
        if (document.hidden) {
            // Page hidden - could pause non-essential updates
            console.log('📱 Page hidden');
        } else {
            // Page visible - refresh data if needed
            console.log('📱 Page visible');
            // Could refresh data here if needed
        }
    }
});