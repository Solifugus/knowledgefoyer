/* Knowledge Foyer - Dashboard Page Controller */
/* Coordinates dashboard components and manages workspace functionality */

class DashboardPage {
    constructor() {
        this.mcpClient = null;
        this.dashboard = null;
        this.isLoading = false;

        this.init();
    }

    async init() {
        console.log('📊 Initializing dashboard page...');

        try {
            // Check authentication
            if (!window.app || !window.app.isAuthenticated) {
                console.log('🔐 User not authenticated, redirecting...');
                window.location.href = '/login';
                return;
            }

            // Show loading state
            this.showLoading(true);

            // Initialize MCP client connection
            await this.initMCPClient();

            // Initialize dashboard component
            this.initDashboard();

            // Setup page-level event handlers
            this.setupEventHandlers();

            // Update user display
            this.updateUserDisplay();

            // Hide loading state
            this.showLoading(false);

            console.log('✅ Dashboard page ready');

        } catch (error) {
            console.error('❌ Failed to initialize dashboard page:', error);
            this.showError('Failed to load dashboard. Please refresh the page.');
        }
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

    initDashboard() {
        console.log('📊 Initializing dashboard component...');

        this.dashboard = new Dashboard(this.mcpClient);

        // Make dashboard globally accessible for external access
        window.dashboard = this.dashboard;
    }

    setupEventHandlers() {
        // Create Article button
        const createArticleButton = document.getElementById('createArticleButton');
        if (createArticleButton) {
            createArticleButton.addEventListener('click', () => {
                window.location.href = '/article-editor.html';
            });
        }

        // Refresh button
        const refreshButton = document.getElementById('refreshButton');
        if (refreshButton) {
            refreshButton.addEventListener('click', async () => {
                await this.refreshDashboard();
            });
        }

        // Retry button (error state)
        const retryButton = document.getElementById('retryButton');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                location.reload();
            });
        }

        // User menu dropdown
        const userMenuButton = document.getElementById('userMenuButton');
        const userMenuDropdown = document.getElementById('userMenuDropdown');

        if (userMenuButton && userMenuDropdown) {
            userMenuButton.addEventListener('click', () => {
                userMenuDropdown.classList.toggle('open');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (event) => {
                if (!userMenuButton.contains(event.target) && !userMenuDropdown.contains(event.target)) {
                    userMenuDropdown.classList.remove('open');
                }
            });
        }

        // Logout buttons (header and mobile)
        const logoutButtons = document.querySelectorAll('.logout-button');
        logoutButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                this.logout();
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });

        // Handle authentication state changes
        window.addEventListener('auth-change', (event) => {
            if (!event.detail.isAuthenticated) {
                // User logged out
                window.location.href = '/login';
            }
        });

        // Handle page visibility for performance
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
    }

    handleKeyboardShortcuts(event) {
        // Ctrl+N - New article
        if (event.ctrlKey && event.key === 'n') {
            event.preventDefault();
            window.location.href = '/article-editor.html';
        }

        // F5 or Ctrl+R - Refresh (let browser handle, but we can supplement)
        if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
            // Let browser handle refresh
            console.log('🔄 Dashboard refresh via keyboard');
        }

        // Escape - Close any open modals or dropdowns
        if (event.key === 'Escape') {
            const userMenuDropdown = document.getElementById('userMenuDropdown');
            if (userMenuDropdown) {
                userMenuDropdown.classList.remove('open');
            }
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            // Page hidden - could pause non-essential updates
            console.log('📱 Dashboard hidden');
        } else {
            // Page visible - refresh data if needed
            console.log('📱 Dashboard visible');
            // Could refresh dashboard data here if it's been a while
        }
    }

    async refreshDashboard() {
        if (this.isLoading) return;

        try {
            this.setRefreshing(true);

            if (this.dashboard) {
                await this.dashboard.refresh();
            }

            window.app.showNotification('Dashboard refreshed', 'success');

        } catch (error) {
            console.error('❌ Failed to refresh dashboard:', error);
            window.app.showNotification('Failed to refresh dashboard. Please try again.', 'error');

        } finally {
            this.setRefreshing(false);
        }
    }

    setRefreshing(isRefreshing) {
        const refreshButton = document.getElementById('refreshButton');
        if (refreshButton) {
            if (isRefreshing) {
                refreshButton.disabled = true;
                refreshButton.textContent = '🔄 Refreshing...';
            } else {
                refreshButton.disabled = false;
                refreshButton.textContent = '🔄 Refresh';
            }
        }
    }

    logout() {
        const confirmed = confirm('Are you sure you want to sign out?');

        if (confirmed) {
            console.log('👋 Logging out user...');

            if (window.app) {
                window.app.logout();
            } else {
                // Fallback logout
                localStorage.removeItem('authToken');
                window.location.href = '/login';
            }
        }
    }

    updateUserDisplay() {
        if (window.app && window.app.user) {
            const user = window.app.user;

            // Update username displays
            const usernameElements = document.querySelectorAll('#username');
            usernameElements.forEach(element => {
                element.textContent = user.username;
            });

            // Update avatar displays
            const avatarElements = document.querySelectorAll('#userAvatar');
            avatarElements.forEach(element => {
                element.textContent = user.username.charAt(0).toUpperCase();
            });

            // Update page title
            document.title = `${user.username}'s Dashboard - Knowledge Foyer`;
        }
    }

    showLoading(show) {
        const loadingState = document.getElementById('loadingState');
        const dashboardContainer = document.getElementById('dashboardContainer');

        if (show) {
            if (loadingState) loadingState.style.display = 'flex';
            if (dashboardContainer) dashboardContainer.style.display = 'none';
        } else {
            if (loadingState) loadingState.style.display = 'none';
            if (dashboardContainer) dashboardContainer.style.display = 'block';
        }

        this.isLoading = show;
    }

    showError(message) {
        console.error('❌ Dashboard error:', message);

        const loadingState = document.getElementById('loadingState');
        const errorState = document.getElementById('errorState');
        const dashboardContainer = document.getElementById('dashboardContainer');

        if (loadingState) loadingState.style.display = 'none';
        if (dashboardContainer) dashboardContainer.style.display = 'none';
        if (errorState) errorState.style.display = 'flex';

        window.app.showNotification(message, 'error');
    }

    // Analytics and insights methods
    getWorkspaceInsights() {
        if (!this.dashboard) return null;

        const articles = this.dashboard.getArticles();

        return {
            totalArticles: articles.length,
            publishedArticles: articles.filter(a => a.status === 'published').length,
            averageFeedbackRatio: this.calculateAverageFeedbackRatio(articles),
            mostActiveArticle: this.findMostActiveArticle(articles),
            needsAttentionCount: articles.filter(a => (a.feedback_stats?.cons || 0) > 5).length
        };
    }

    calculateAverageFeedbackRatio(articles) {
        const articlesWithFeedback = articles.filter(a => {
            const stats = a.feedback_stats || {};
            return (stats.pros || 0) + (stats.cons || 0) > 0;
        });

        if (articlesWithFeedback.length === 0) return 0;

        const totalRatio = articlesWithFeedback.reduce((sum, article) => {
            const stats = article.feedback_stats || {};
            const pros = stats.pros || 0;
            const cons = stats.cons || 0;
            const total = pros + cons;
            return sum + (total > 0 ? pros / total : 0);
        }, 0);

        return totalRatio / articlesWithFeedback.length;
    }

    findMostActiveArticle(articles) {
        return articles.reduce((most, current) => {
            const currentActivity = (current.feedback_stats?.pros || 0) + (current.feedback_stats?.cons || 0);
            const mostActivity = (most?.feedback_stats?.pros || 0) + (most?.feedback_stats?.cons || 0);

            return currentActivity > mostActivity ? current : most;
        }, null);
    }

    // Public methods for external access
    getDashboard() {
        return this.dashboard;
    }

    getMCPClient() {
        return this.mcpClient;
    }

    async refreshData() {
        return await this.refreshDashboard();
    }
}

// Initialize the page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardPage = new DashboardPage();
});

// Handle browser back button and navigation
window.addEventListener('popstate', () => {
    // Refresh authentication state if user navigates back
    if (window.app) {
        window.app.checkAuthStatus();
    }
});