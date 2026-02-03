/* Knowledge Foyer - Dashboard Component */
/* Handles article management, display, and user workspace interactions */

class Dashboard {
    constructor(mcpClient) {
        this.mcpClient = mcpClient;
        this.articles = [];
        this.currentView = 'card'; // 'card' or 'list'
        this.currentSort = 'updated_at';
        this.selectedArticle = null;

        // DOM elements
        this.cardView = document.getElementById('cardView');
        this.listView = document.getElementById('listView');
        this.articlesTableBody = document.getElementById('articlesTableBody');
        this.emptyState = document.getElementById('emptyState');
        this.sortSelect = document.getElementById('sortSelect');

        // View toggle buttons
        this.cardViewButton = document.getElementById('cardViewButton');
        this.listViewButton = document.getElementById('listViewButton');

        // Stats elements
        this.totalArticlesElement = document.getElementById('totalArticles');
        this.publishedArticlesElement = document.getElementById('publishedArticles');
        this.totalProsElement = document.getElementById('totalPros');
        this.needsAttentionElement = document.getElementById('needsAttention');

        // Modal elements
        this.modal = document.getElementById('articleActionModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.editArticleButton = document.getElementById('editArticleButton');
        this.viewArticleButton = document.getElementById('viewArticleButton');
        this.duplicateArticleButton = document.getElementById('duplicateArticleButton');
        this.deleteArticleButton = document.getElementById('deleteArticleButton');

        this.init();
    }

    async init() {
        console.log('📊 Initializing dashboard...');

        // Setup event handlers
        this.setupEventHandlers();

        // Load articles data
        await this.loadArticles();

        // Setup real-time updates
        this.setupRealTimeUpdates();

        console.log('✅ Dashboard ready');
    }

    setupEventHandlers() {
        // View toggle buttons
        if (this.cardViewButton) {
            this.cardViewButton.addEventListener('click', () => {
                this.switchView('card');
            });
        }

        if (this.listViewButton) {
            this.listViewButton.addEventListener('click', () => {
                this.switchView('list');
            });
        }

        // Sort selection
        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', () => {
                this.currentSort = this.sortSelect.value;
                this.renderArticles();
            });
        }

        // Modal handlers
        const modalCloseButton = document.getElementById('modalCloseButton');
        if (modalCloseButton) {
            modalCloseButton.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Close modal when clicking outside
        if (this.modal) {
            this.modal.addEventListener('click', (event) => {
                if (event.target === this.modal) {
                    this.closeModal();
                }
            });
        }

        // Modal action buttons
        if (this.editArticleButton) {
            this.editArticleButton.addEventListener('click', () => {
                this.editArticle(this.selectedArticle);
            });
        }

        if (this.viewArticleButton) {
            this.viewArticleButton.addEventListener('click', () => {
                this.viewArticle(this.selectedArticle);
            });
        }

        if (this.duplicateArticleButton) {
            this.duplicateArticleButton.addEventListener('click', () => {
                this.duplicateArticle(this.selectedArticle);
            });
        }

        if (this.deleteArticleButton) {
            this.deleteArticleButton.addEventListener('click', () => {
                this.deleteArticle(this.selectedArticle);
            });
        }

        // Escape key to close modal
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.modal && this.modal.style.display !== 'none') {
                this.closeModal();
            }
        });
    }

    setupRealTimeUpdates() {
        if (!this.mcpClient) return;

        // Listen for article updates
        this.mcpClient.on('article_updated', (data) => {
            this.handleArticleUpdate(data);
        });

        this.mcpClient.on('feedback_submitted', (data) => {
            this.handleFeedbackUpdate(data);
        });

        this.mcpClient.on('feedback_ranked', (data) => {
            this.handleFeedbackUpdate(data);
        });
    }

    async loadArticles() {
        try {
            console.log('📖 Loading articles...');

            const response = await this.mcpClient.callTool('get_user_articles', {
                include_feedback_stats: true
            });

            if (response && response.articles) {
                this.articles = response.articles;
                this.renderArticles();
                this.updateStats();
            } else {
                this.showEmptyState();
            }

        } catch (error) {
            console.error('❌ Failed to load articles:', error);
            this.showErrorState();
        }
    }

    renderArticles() {
        const sortedArticles = this.sortArticles(this.articles);

        if (sortedArticles.length === 0) {
            this.showEmptyState();
            return;
        }

        this.hideStates();

        if (this.currentView === 'card') {
            this.renderCardView(sortedArticles);
        } else {
            this.renderListView(sortedArticles);
        }
    }

    sortArticles(articles) {
        return [...articles].sort((a, b) => {
            switch (this.currentSort) {
                case 'updated_at':
                    return new Date(b.updated_at) - new Date(a.updated_at);
                case 'created_at':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'feedback_ratio':
                    const ratioA = this.getFeedbackRatio(a);
                    const ratioB = this.getFeedbackRatio(b);
                    return ratioB - ratioA;
                case 'status':
                    const statusOrder = { 'published': 0, 'draft': 1, 'archived': 2 };
                    return statusOrder[a.status] - statusOrder[b.status];
                default:
                    return 0;
            }
        });
    }

    getFeedbackRatio(article) {
        const pros = article.feedback_stats?.pros || 0;
        const cons = article.feedback_stats?.cons || 0;
        const total = pros + cons;
        return total > 0 ? pros / total : 0;
    }

    renderCardView(articles) {
        if (!this.cardView) return;

        this.cardView.innerHTML = articles.map(article => this.createArticleCard(article)).join('');

        // Add event listeners to cards
        this.cardView.querySelectorAll('.article-card').forEach(card => {
            const articleId = card.dataset.articleId;
            const article = articles.find(a => a.id === articleId);

            card.addEventListener('click', (event) => {
                if (!event.target.closest('.article-actions')) {
                    this.editArticle(article);
                }
            });

            // Action buttons
            const actionsButton = card.querySelector('.article-actions-button');
            if (actionsButton) {
                actionsButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.openModal(article);
                });
            }
        });
    }

    renderListView(articles) {
        if (!this.articlesTableBody) return;

        this.articlesTableBody.innerHTML = articles.map(article => this.createArticleRow(article)).join('');

        // Add event listeners to rows
        this.articlesTableBody.querySelectorAll('.article-row').forEach(row => {
            const articleId = row.dataset.articleId;
            const article = articles.find(a => a.id === articleId);

            row.addEventListener('click', (event) => {
                if (!event.target.closest('.article-actions')) {
                    this.editArticle(article);
                }
            });

            // Action buttons
            const actionsButton = row.querySelector('.article-actions-button');
            if (actionsButton) {
                actionsButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.openModal(article);
                });
            }
        });
    }

    createArticleCard(article) {
        const feedbackStats = article.feedback_stats || { pros: 0, cons: 0 };
        const needsAttention = feedbackStats.cons > 5;
        const lastModified = this.formatDate(article.updated_at);

        return `
            <div class="article-card ${needsAttention ? 'needs-attention' : ''}" data-article-id="${article.id}">
                <div class="article-card-header">
                    <div class="article-status">
                        <span class="status-indicator status-${article.status}"></span>
                        <span class="status-text">${this.capitalizeFirst(article.status)}</span>
                    </div>
                    <button class="article-actions-button" aria-label="Article actions">⋯</button>
                </div>

                <div class="article-card-content">
                    <h3 class="article-title">${this.escapeHtml(article.title || 'Untitled Article')}</h3>
                    <p class="article-excerpt">${this.getExcerpt(article.content)}</p>
                </div>

                <div class="article-card-footer">
                    <div class="article-meta">
                        <span class="article-date">${lastModified}</span>
                        <span class="article-word-count">${article.word_count || 0} words</span>
                    </div>

                    <div class="article-feedback">
                        <div class="feedback-stat feedback-stat-pro">
                            <span class="feedback-icon">👍</span>
                            <span class="feedback-count">${feedbackStats.pros}</span>
                        </div>
                        <div class="feedback-stat feedback-stat-con ${needsAttention ? 'high' : ''}">
                            <span class="feedback-icon">👎</span>
                            <span class="feedback-count">${feedbackStats.cons}</span>
                        </div>
                    </div>
                </div>

                ${needsAttention ? '<div class="attention-badge">Needs Attention</div>' : ''}
            </div>
        `;
    }

    createArticleRow(article) {
        const feedbackStats = article.feedback_stats || { pros: 0, cons: 0 };
        const needsAttention = feedbackStats.cons > 5;
        const lastModified = this.formatDate(article.updated_at);

        return `
            <tr class="article-row ${needsAttention ? 'needs-attention' : ''}" data-article-id="${article.id}">
                <td class="article-cell">
                    <div class="article-info">
                        <h4 class="article-title-compact">${this.escapeHtml(article.title || 'Untitled Article')}</h4>
                        <div class="article-meta-compact">
                            <span class="article-word-count">${article.word_count || 0} words</span>
                        </div>
                    </div>
                </td>
                <td class="date-cell">
                    <span class="article-date">${lastModified}</span>
                </td>
                <td class="status-cell">
                    <span class="status-badge status-${article.status}">${this.capitalizeFirst(article.status)}</span>
                </td>
                <td class="feedback-cell">
                    <span class="feedback-count-pro">${feedbackStats.pros}</span>
                </td>
                <td class="feedback-cell">
                    <span class="feedback-count-con ${needsAttention ? 'high' : ''}">${feedbackStats.cons}</span>
                </td>
                <td class="actions-cell">
                    <button class="article-actions-button btn-icon" aria-label="Article actions">⋯</button>
                </td>
            </tr>
        `;
    }

    updateStats() {
        const stats = this.calculateStats(this.articles);

        if (this.totalArticlesElement) {
            this.totalArticlesElement.textContent = stats.total;
        }

        if (this.publishedArticlesElement) {
            this.publishedArticlesElement.textContent = stats.published;
        }

        if (this.totalProsElement) {
            this.totalProsElement.textContent = stats.totalPros;
        }

        if (this.needsAttentionElement) {
            this.needsAttentionElement.textContent = stats.needsAttention;
        }

        // Update attention card visibility
        const needsAttentionCard = document.getElementById('needsAttentionCard');
        if (needsAttentionCard) {
            if (stats.needsAttention > 0) {
                needsAttentionCard.classList.add('visible');
            } else {
                needsAttentionCard.classList.remove('visible');
            }
        }
    }

    calculateStats(articles) {
        return {
            total: articles.length,
            published: articles.filter(a => a.status === 'published').length,
            totalPros: articles.reduce((sum, a) => sum + (a.feedback_stats?.pros || 0), 0),
            needsAttention: articles.filter(a => (a.feedback_stats?.cons || 0) > 5).length
        };
    }

    switchView(viewType) {
        this.currentView = viewType;

        // Update button states
        if (this.cardViewButton && this.listViewButton) {
            if (viewType === 'card') {
                this.cardViewButton.classList.add('active');
                this.listViewButton.classList.remove('active');
                this.cardView.style.display = 'grid';
                this.listView.style.display = 'none';
            } else {
                this.cardViewButton.classList.remove('active');
                this.listViewButton.classList.add('active');
                this.cardView.style.display = 'none';
                this.listView.style.display = 'block';
            }
        }

        this.renderArticles();
    }

    openModal(article) {
        this.selectedArticle = article;

        if (this.modalTitle) {
            this.modalTitle.textContent = article.title || 'Untitled Article';
        }

        if (this.modal) {
            this.modal.style.display = 'flex';
        }

        // Focus management
        if (this.editArticleButton) {
            this.editArticleButton.focus();
        }
    }

    closeModal() {
        this.selectedArticle = null;

        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    editArticle(article) {
        window.location.href = `/article-editor.html?id=${article.id}`;
    }

    viewArticle(article) {
        // Open article in new tab/window
        window.open(`/articles/${article.slug || article.id}`, '_blank');
    }

    async duplicateArticle(article) {
        try {
            const result = await this.mcpClient.callTool('duplicate_article', {
                article_id: article.id
            });

            if (result && result.article) {
                window.app.showNotification('Article duplicated successfully!', 'success');
                await this.loadArticles();
                this.closeModal();
            }

        } catch (error) {
            console.error('❌ Failed to duplicate article:', error);
            window.app.showNotification('Failed to duplicate article. Please try again.', 'error');
        }
    }

    async deleteArticle(article) {
        const confirmed = confirm(`Are you sure you want to delete "${article.title || 'Untitled Article'}"? This action cannot be undone.`);

        if (confirmed) {
            try {
                await this.mcpClient.callTool('delete_article', {
                    article_id: article.id
                });

                window.app.showNotification('Article deleted successfully.', 'success');
                await this.loadArticles();
                this.closeModal();

            } catch (error) {
                console.error('❌ Failed to delete article:', error);
                window.app.showNotification('Failed to delete article. Please try again.', 'error');
            }
        }
    }

    handleArticleUpdate(data) {
        // Update the article in our local array
        const index = this.articles.findIndex(a => a.id === data.article_id);
        if (index !== -1) {
            this.articles[index] = { ...this.articles[index], ...data };
            this.renderArticles();
            this.updateStats();
        }
    }

    handleFeedbackUpdate(data) {
        // Update feedback stats for the article
        const article = this.articles.find(a => a.id === data.article_id);
        if (article) {
            // Reload articles to get updated feedback stats
            this.loadArticles();
        }
    }

    showEmptyState() {
        this.hideStates();
        if (this.emptyState) {
            this.emptyState.style.display = 'flex';
        }
    }

    showErrorState() {
        this.hideStates();
        const errorState = document.getElementById('errorState');
        if (errorState) {
            errorState.style.display = 'flex';
        }
    }

    hideStates() {
        if (this.emptyState) this.emptyState.style.display = 'none';

        const errorState = document.getElementById('errorState');
        if (errorState) errorState.style.display = 'none';
    }

    // Utility methods
    formatDate(dateString) {
        if (!dateString) return 'Unknown';

        if (window.app && window.app.formatDate) {
            return window.app.formatDate(dateString);
        }

        // Fallback formatting
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        }
        return date.toLocaleDateString();
    }

    getExcerpt(content) {
        if (!content) return 'No content yet...';

        const plainText = content.replace(/[#*_~`\[\]()]/g, '').trim();
        return plainText.length > 120 ? plainText.substring(0, 120) + '...' : plainText;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Public methods for external access
    async refresh() {
        console.log('🔄 Refreshing dashboard...');
        await this.loadArticles();
    }

    getArticles() {
        return this.articles;
    }
}

// Export for use in other modules
window.Dashboard = Dashboard;