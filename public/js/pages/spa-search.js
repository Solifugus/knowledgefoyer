/**
 * Knowledge Foyer - Search and Discovery System
 * Step 9: Advanced search functionality with filtering, sorting, and content discovery
 */

class SPASearchPage {
    constructor(manager) {
        this.manager = manager;
        this.currentQuery = '';
        this.currentFilters = {
            type: 'all', // all, articles, authors, tags
            tags: [],
            authors: [],
            dateRange: 'all', // all, today, week, month, year
            sortBy: 'relevance' // relevance, date, popularity, rating
        };
        this.currentPage = 1;
        this.resultsPerPage = 20;
        this.searchResults = [];
        this.searchStats = {
            total: 0,
            articles: 0,
            authors: 0,
            tags: 0
        };
        this.isLoading = false;
        this.searchHistory = [];
        this.popularTags = [];
        this.trendingAuthors = [];
    }

    /**
     * Render the search page
     */
    async renderSearchPage(query = '') {
        try {
            this.currentQuery = query || '';
            await this.loadInitialData();

            const content = this.renderSearchContent();
            this.manager.setMainContent(content);
            this.setupEventHandlers();

            // Perform search if query provided
            if (this.currentQuery) {
                await this.performSearch();
            }

            // Update page title
            document.title = this.currentQuery
                ? `Search: ${this.currentQuery} - Knowledge Foyer`
                : 'Search & Discover - Knowledge Foyer';

        } catch (error) {
            console.error('Failed to render search page:', error);
            this.manager.setMainContent(this.renderErrorState());
        }
    }

    /**
     * Load initial data for search page
     */
    async loadInitialData() {
        try {
            // Load popular tags and trending authors
            const [tagsResponse, authorsResponse] = await Promise.all([
                this.manager.mockAPI.getPopularTags(),
                this.manager.mockAPI.getTrendingAuthors()
            ]);

            this.popularTags = tagsResponse;
            this.trendingAuthors = authorsResponse;

            // Load search history from localStorage
            this.searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');

        } catch (error) {
            console.error('Failed to load search data:', error);
            // Continue with empty data
        }
    }

    /**
     * Render search page content
     */
    renderSearchContent() {
        return `
            <div class="search-page">
                ${this.renderSearchHeader()}
                ${this.renderSearchFilters()}
                ${this.renderSearchBody()}
            </div>
        `;
    }

    /**
     * Render search header with search box
     */
    renderSearchHeader() {
        return `
            <div class="search-header">
                <div class="search-header-content">
                    <h1 class="search-title">
                        ${this.currentQuery ? 'Search Results' : 'Discover Content'}
                    </h1>

                    <div class="search-box-container">
                        <div class="search-box">
                            <input
                                type="text"
                                class="search-input"
                                placeholder="Search articles, authors, or topics..."
                                value="${this.currentQuery}"
                                id="main-search-input"
                            >
                            <button class="search-submit" id="search-submit-btn">
                                <span class="search-icon">🔍</span>
                            </button>
                        </div>

                        <div class="search-suggestions" id="search-suggestions" style="display: none;">
                            <!-- Dynamic suggestions will be inserted here -->
                        </div>
                    </div>

                    ${this.currentQuery ? this.renderSearchStats() : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render search statistics
     */
    renderSearchStats() {
        return `
            <div class="search-stats">
                <div class="search-stats-main">
                    Found <strong>${this.searchStats.total.toLocaleString()}</strong> results for
                    "<span class="search-query">${this.currentQuery}</span>"
                </div>
                <div class="search-stats-breakdown">
                    <span class="stat-item">${this.searchStats.articles} articles</span>
                    <span class="stat-item">${this.searchStats.authors} authors</span>
                    <span class="stat-item">${this.searchStats.tags} tags</span>
                </div>
            </div>
        `;
    }

    /**
     * Render search filters and sorting
     */
    renderSearchFilters() {
        return `
            <div class="search-filters" ${!this.currentQuery ? 'style="display: none;"' : ''}>
                <div class="search-filters-content">
                    <!-- Content Type Filter -->
                    <div class="filter-group">
                        <label class="filter-label">Type</label>
                        <div class="filter-options">
                            <button class="filter-btn ${this.currentFilters.type === 'all' ? 'active' : ''}"
                                    data-filter="type" data-value="all">
                                All Results
                            </button>
                            <button class="filter-btn ${this.currentFilters.type === 'articles' ? 'active' : ''}"
                                    data-filter="type" data-value="articles">
                                Articles
                            </button>
                            <button class="filter-btn ${this.currentFilters.type === 'authors' ? 'active' : ''}"
                                    data-filter="type" data-value="authors">
                                Authors
                            </button>
                            <button class="filter-btn ${this.currentFilters.type === 'tags' ? 'active' : ''}"
                                    data-filter="type" data-value="tags">
                                Tags
                            </button>
                        </div>
                    </div>

                    <!-- Date Range Filter -->
                    <div class="filter-group">
                        <label class="filter-label">Date</label>
                        <select class="filter-select" data-filter="dateRange">
                            <option value="all" ${this.currentFilters.dateRange === 'all' ? 'selected' : ''}>
                                All time
                            </option>
                            <option value="today" ${this.currentFilters.dateRange === 'today' ? 'selected' : ''}>
                                Today
                            </option>
                            <option value="week" ${this.currentFilters.dateRange === 'week' ? 'selected' : ''}>
                                This week
                            </option>
                            <option value="month" ${this.currentFilters.dateRange === 'month' ? 'selected' : ''}>
                                This month
                            </option>
                            <option value="year" ${this.currentFilters.dateRange === 'year' ? 'selected' : ''}>
                                This year
                            </option>
                        </select>
                    </div>

                    <!-- Sort Options -->
                    <div class="filter-group">
                        <label class="filter-label">Sort by</label>
                        <select class="filter-select" data-filter="sortBy">
                            <option value="relevance" ${this.currentFilters.sortBy === 'relevance' ? 'selected' : ''}>
                                Relevance
                            </option>
                            <option value="date" ${this.currentFilters.sortBy === 'date' ? 'selected' : ''}>
                                Most recent
                            </option>
                            <option value="popularity" ${this.currentFilters.sortBy === 'popularity' ? 'selected' : ''}>
                                Most popular
                            </option>
                            <option value="rating" ${this.currentFilters.sortBy === 'rating' ? 'selected' : ''}>
                                Highest rated
                            </option>
                        </select>
                    </div>

                    <!-- Clear Filters -->
                    <div class="filter-group">
                        <button class="filter-clear-btn" id="clear-filters-btn">
                            Clear Filters
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render search body content
     */
    renderSearchBody() {
        if (this.currentQuery && this.searchResults.length === 0 && !this.isLoading) {
            return this.renderNoResults();
        }

        if (this.currentQuery) {
            return `
                <div class="search-results">
                    ${this.isLoading ? this.renderLoadingState() : this.renderResults()}
                    ${!this.isLoading && this.searchResults.length > 0 ? this.renderPagination() : ''}
                </div>
            `;
        }

        return this.renderDiscoveryContent();
    }

    /**
     * Render discovery content (when no search query)
     */
    renderDiscoveryContent() {
        return `
            <div class="discovery-content">
                <div class="discovery-grid">
                    <!-- Popular Tags -->
                    <div class="discovery-section">
                        <h2 class="discovery-section-title">Popular Topics</h2>
                        <div class="tag-cloud">
                            ${this.popularTags.map(tag => `
                                <button class="tag-cloud-item" data-tag="${tag.name}">
                                    <span class="tag-name">${tag.name}</span>
                                    <span class="tag-count">${tag.count}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Trending Authors -->
                    <div class="discovery-section">
                        <h2 class="discovery-section-title">Trending Authors</h2>
                        <div class="author-list">
                            ${this.trendingAuthors.map(author => `
                                <div class="author-card">
                                    <img class="author-avatar" src="${author.avatar}" alt="${author.displayName}">
                                    <div class="author-info">
                                        <div class="author-name">${author.displayName}</div>
                                        <div class="author-stats">${author.articleCount} articles • ${author.followerCount} followers</div>
                                    </div>
                                    <button class="author-follow-btn" data-author-id="${author.id}">
                                        Follow
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Recent Searches -->
                    ${this.searchHistory.length > 0 ? `
                        <div class="discovery-section">
                            <h2 class="discovery-section-title">Recent Searches</h2>
                            <div class="search-history">
                                ${this.searchHistory.slice(0, 10).map(item => `
                                    <button class="search-history-item" data-query="${item.query}">
                                        <span class="search-history-icon">🕒</span>
                                        <span class="search-history-text">${item.query}</span>
                                        <span class="search-history-count">${item.results} results</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Quick Actions -->
                    <div class="discovery-section">
                        <h2 class="discovery-section-title">Quick Actions</h2>
                        <div class="quick-actions">
                            <a href="#/create" class="quick-action-btn" data-spa-link>
                                <span class="quick-action-icon">✍️</span>
                                <span class="quick-action-text">Create Article</span>
                            </a>
                            <a href="#/dashboard" class="quick-action-btn" data-spa-link>
                                <span class="quick-action-icon">📊</span>
                                <span class="quick-action-text">My Dashboard</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render search results
     */
    renderResults() {
        if (!this.searchResults.length) {
            return this.renderNoResults();
        }

        return `
            <div class="results-list">
                ${this.searchResults.map(result => this.renderResultItem(result)).join('')}
            </div>
        `;
    }

    /**
     * Render individual search result
     */
    renderResultItem(result) {
        switch (result.type) {
            case 'article':
                return this.renderArticleResult(result);
            case 'author':
                return this.renderAuthorResult(result);
            case 'tag':
                return this.renderTagResult(result);
            default:
                return '';
        }
    }

    /**
     * Render article search result
     */
    renderArticleResult(article) {
        return `
            <div class="result-item result-article">
                <div class="result-header">
                    <h3 class="result-title">
                        <a href="#/article/${article.slug}" class="result-link" data-spa-link>
                            ${this.highlightText(article.title)}
                        </a>
                    </h3>
                    <div class="result-meta">
                        <span class="result-author">by ${article.author.displayName}</span>
                        <span class="result-date">${this.formatDate(article.publishedAt)}</span>
                        <span class="result-reading-time">${article.readingTime} min read</span>
                    </div>
                </div>

                <div class="result-excerpt">
                    ${this.highlightText(article.excerpt)}
                </div>

                <div class="result-footer">
                    <div class="result-tags">
                        ${article.tags.slice(0, 3).map(tag => `
                            <span class="result-tag">${tag}</span>
                        `).join('')}
                        ${article.tags.length > 3 ? `<span class="result-tag-more">+${article.tags.length - 3}</span>` : ''}
                    </div>
                    <div class="result-stats">
                        <span class="result-stat">
                            <span class="stat-icon">💬</span>
                            ${article.feedbackCount}
                        </span>
                        <span class="result-stat">
                            <span class="stat-icon">👁️</span>
                            ${article.views}
                        </span>
                        <span class="result-stat">
                            <span class="stat-icon">⭐</span>
                            ${article.rating.toFixed(1)}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render author search result
     */
    renderAuthorResult(author) {
        return `
            <div class="result-item result-author">
                <div class="result-author-header">
                    <img class="result-author-avatar" src="${author.avatar}" alt="${author.displayName}">
                    <div class="result-author-info">
                        <h3 class="result-title">
                            <a href="#/author/${author.username}" class="result-link" data-spa-link>
                                ${this.highlightText(author.displayName)}
                            </a>
                        </h3>
                        <div class="result-author-username">@${author.username}</div>
                        <div class="result-author-bio">
                            ${this.highlightText(author.bio)}
                        </div>
                    </div>
                </div>

                <div class="result-author-stats">
                    <div class="result-stat">
                        <span class="stat-number">${author.articleCount}</span>
                        <span class="stat-label">Articles</span>
                    </div>
                    <div class="result-stat">
                        <span class="stat-number">${author.followerCount}</span>
                        <span class="stat-label">Followers</span>
                    </div>
                    <div class="result-stat">
                        <span class="stat-number">${author.totalViews.toLocaleString()}</span>
                        <span class="stat-label">Total Views</span>
                    </div>
                </div>

                <button class="result-follow-btn" data-author-id="${author.id}">
                    ${author.isFollowing ? 'Following' : 'Follow'}
                </button>
            </div>
        `;
    }

    /**
     * Render tag search result
     */
    renderTagResult(tag) {
        return `
            <div class="result-item result-tag">
                <div class="result-tag-content">
                    <h3 class="result-title">
                        <a href="#/tag/${tag.slug}" class="result-link" data-spa-link>
                            ${this.highlightText(tag.name)}
                        </a>
                    </h3>
                    <div class="result-tag-description">
                        ${tag.description ? this.highlightText(tag.description) : 'No description available'}
                    </div>
                    <div class="result-tag-stats">
                        <span class="result-stat">${tag.articleCount} articles</span>
                        <span class="result-stat">${tag.followerCount} followers</span>
                    </div>
                </div>
                <button class="result-tag-follow-btn" data-tag-id="${tag.id}">
                    ${tag.isFollowing ? 'Following' : 'Follow'}
                </button>
            </div>
        `;
    }

    /**
     * Render no results state
     */
    renderNoResults() {
        return `
            <div class="no-results">
                <div class="no-results-content">
                    <div class="no-results-icon">🔍</div>
                    <h2 class="no-results-title">No results found</h2>
                    <p class="no-results-message">
                        We couldn't find anything matching "<strong>${this.currentQuery}</strong>".
                        Try adjusting your search terms or filters.
                    </p>
                    <div class="no-results-suggestions">
                        <h3>Suggestions:</h3>
                        <ul>
                            <li>Check your spelling</li>
                            <li>Try more general terms</li>
                            <li>Remove some filters</li>
                            <li>Browse popular topics instead</li>
                        </ul>
                    </div>
                    <button class="btn btn-primary" id="browse-topics-btn">
                        Browse Popular Topics
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render pagination
     */
    renderPagination() {
        const totalPages = Math.ceil(this.searchStats.total / this.resultsPerPage);

        if (totalPages <= 1) return '';

        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        let pagination = '<div class="pagination">';

        // Previous button
        pagination += `
            <button class="pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}"
                    data-page="${this.currentPage - 1}"
                    ${this.currentPage === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
        `;

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            pagination += `
                <button class="pagination-btn pagination-number ${i === this.currentPage ? 'active' : ''}"
                        data-page="${i}">
                    ${i}
                </button>
            `;
        }

        // Next button
        pagination += `
            <button class="pagination-btn ${this.currentPage === totalPages ? 'disabled' : ''}"
                    data-page="${this.currentPage + 1}"
                    ${this.currentPage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        `;

        pagination += '</div>';

        return pagination;
    }

    /**
     * Render loading state
     */
    renderLoadingState() {
        return `
            <div class="search-loading">
                <div class="loading-spinner"></div>
                <p class="loading-text">Searching...</p>
            </div>
        `;
    }

    /**
     * Render error state
     */
    renderErrorState() {
        return `
            <div class="search-error">
                <h1>Search Unavailable</h1>
                <p>We're having trouble with search right now. Please try again later.</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    Refresh Page
                </button>
            </div>
        `;
    }

    /**
     * Set up event handlers
     */
    setupEventHandlers() {
        // Search input and submit
        const searchInput = document.getElementById('main-search-input');
        const searchBtn = document.getElementById('search-submit-btn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch();
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
        }

        // Filter buttons and selects
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterChange(e));
        });

        document.querySelectorAll('.filter-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleFilterChange(e));
        });

        // Clear filters
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }

        // Pagination
        document.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePageChange(e));
        });

        // Discovery interactions
        document.querySelectorAll('.tag-cloud-item').forEach(tag => {
            tag.addEventListener('click', (e) => this.handleTagClick(e));
        });

        document.querySelectorAll('.search-history-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleHistoryClick(e));
        });

        // Follow buttons
        document.querySelectorAll('.author-follow-btn, .result-follow-btn, .result-tag-follow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFollowClick(e));
        });

        // Browse topics button
        const browseTopicsBtn = document.getElementById('browse-topics-btn');
        if (browseTopicsBtn) {
            browseTopicsBtn.addEventListener('click', () => this.clearSearch());
        }
    }

    /**
     * Handle search input (for suggestions)
     */
    async handleSearchInput(event) {
        const query = event.target.value;

        if (query.length >= 2) {
            await this.showSearchSuggestions(query);
        } else {
            this.hideSearchSuggestions();
        }
    }

    /**
     * Handle search submission
     */
    async handleSearch() {
        const searchInput = document.getElementById('main-search-input');
        const query = searchInput?.value?.trim();

        if (!query) return;

        this.currentQuery = query;
        this.currentPage = 1;

        // Update URL
        this.manager.router.navigate(`/search?q=${encodeURIComponent(query)}`);

        await this.performSearch();
        this.addToSearchHistory(query);
    }

    /**
     * Perform the actual search
     */
    async performSearch() {
        if (!this.currentQuery) return;

        this.isLoading = true;
        this.updateSearchResults();

        try {
            const searchParams = {
                query: this.currentQuery,
                filters: this.currentFilters,
                page: this.currentPage,
                perPage: this.resultsPerPage
            };

            const results = await this.manager.mockAPI.searchContent(searchParams);

            this.searchResults = results.items;
            this.searchStats = results.stats;

            this.isLoading = false;
            this.updateSearchResults();

        } catch (error) {
            console.error('Search failed:', error);
            this.isLoading = false;
            this.manager.showNotification('Search failed. Please try again.', 'error');
        }
    }

    /**
     * Handle filter changes
     */
    async handleFilterChange(event) {
        const filterType = event.target.dataset.filter;
        const filterValue = event.target.dataset.value || event.target.value;

        if (filterType === 'type') {
            // Update filter button states
            document.querySelectorAll('.filter-btn[data-filter="type"]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === filterValue);
            });
        }

        this.currentFilters[filterType] = filterValue;
        this.currentPage = 1;

        if (this.currentQuery) {
            await this.performSearch();
        }
    }

    /**
     * Clear all filters
     */
    async clearFilters() {
        this.currentFilters = {
            type: 'all',
            tags: [],
            authors: [],
            dateRange: 'all',
            sortBy: 'relevance'
        };
        this.currentPage = 1;

        // Reset UI
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === 'all');
        });
        document.querySelectorAll('.filter-select').forEach(select => {
            select.value = select.querySelector('option').value;
        });

        if (this.currentQuery) {
            await this.performSearch();
        }
    }

    /**
     * Handle page changes
     */
    async handlePageChange(event) {
        const page = parseInt(event.target.dataset.page);
        if (page && page !== this.currentPage && page > 0) {
            this.currentPage = page;
            await this.performSearch();

            // Scroll to top of results
            document.querySelector('.search-results')?.scrollIntoView({
                behavior: 'smooth'
            });
        }
    }

    /**
     * Handle tag clicks in discovery
     */
    handleTagClick(event) {
        const tagName = event.target.dataset.tag;
        if (tagName) {
            const searchInput = document.getElementById('main-search-input');
            if (searchInput) {
                searchInput.value = tagName;
                this.handleSearch();
            }
        }
    }

    /**
     * Handle search history clicks
     */
    handleHistoryClick(event) {
        const query = event.target.dataset.query;
        if (query) {
            const searchInput = document.getElementById('main-search-input');
            if (searchInput) {
                searchInput.value = query;
                this.handleSearch();
            }
        }
    }

    /**
     * Handle follow button clicks
     */
    async handleFollowClick(event) {
        event.preventDefault();

        if (!this.manager.auth.isAuthenticated()) {
            this.manager.modal.showLogin();
            return;
        }

        const btn = event.target;
        const authorId = btn.dataset.authorId;
        const tagId = btn.dataset.tagId;

        try {
            btn.disabled = true;

            if (authorId) {
                const isFollowing = btn.textContent.trim() === 'Following';
                await (isFollowing
                    ? this.manager.mockAPI.unfollowAuthor(authorId)
                    : this.manager.mockAPI.followAuthor(authorId)
                );
                btn.textContent = isFollowing ? 'Follow' : 'Following';
            } else if (tagId) {
                const isFollowing = btn.textContent.trim() === 'Following';
                await (isFollowing
                    ? this.manager.mockAPI.unfollowTag(tagId)
                    : this.manager.mockAPI.followTag(tagId)
                );
                btn.textContent = isFollowing ? 'Follow' : 'Following';
            }

        } catch (error) {
            console.error('Follow action failed:', error);
            this.manager.showNotification('Action failed. Please try again.', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    /**
     * Show search suggestions
     */
    async showSearchSuggestions(query) {
        try {
            const suggestions = await this.manager.mockAPI.getSearchSuggestions(query);
            const suggestionsContainer = document.getElementById('search-suggestions');

            if (suggestions.length > 0 && suggestionsContainer) {
                suggestionsContainer.innerHTML = suggestions.map(suggestion => `
                    <button class="search-suggestion" data-suggestion="${suggestion.text}">
                        <span class="suggestion-icon">${suggestion.type === 'tag' ? '🏷️' : suggestion.type === 'author' ? '👤' : '📄'}</span>
                        <span class="suggestion-text">${suggestion.text}</span>
                        ${suggestion.type === 'tag' ? `<span class="suggestion-count">${suggestion.count}</span>` : ''}
                    </button>
                `).join('');

                suggestionsContainer.style.display = 'block';

                // Add click handlers
                suggestionsContainer.querySelectorAll('.search-suggestion').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const searchInput = document.getElementById('main-search-input');
                        searchInput.value = e.target.dataset.suggestion;
                        this.handleSearch();
                        this.hideSearchSuggestions();
                    });
                });
            }
        } catch (error) {
            console.error('Failed to load suggestions:', error);
        }
    }

    /**
     * Hide search suggestions
     */
    hideSearchSuggestions() {
        const suggestionsContainer = document.getElementById('search-suggestions');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    /**
     * Update search results display
     */
    updateSearchResults() {
        const searchBody = document.querySelector('.search-page');
        if (searchBody) {
            // Find and update just the search body section
            const newContent = this.renderSearchBody();
            const searchBodyElement = searchBody.querySelector('.search-results') ||
                                   searchBody.querySelector('.discovery-content') ||
                                   searchBody.querySelector('.no-results');

            if (searchBodyElement && searchBodyElement.parentNode) {
                searchBodyElement.outerHTML = newContent;
                this.setupResultsEventHandlers();
            }
        }
    }

    /**
     * Set up event handlers for dynamically updated results
     */
    setupResultsEventHandlers() {
        // Re-bind pagination
        document.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePageChange(e));
        });

        // Re-bind follow buttons
        document.querySelectorAll('.result-follow-btn, .result-tag-follow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFollowClick(e));
        });
    }

    /**
     * Add to search history
     */
    addToSearchHistory(query) {
        const historyItem = {
            query,
            timestamp: Date.now(),
            results: this.searchStats.total
        };

        // Remove existing entry with same query
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);

        // Add to beginning
        this.searchHistory.unshift(historyItem);

        // Keep only last 20 searches
        this.searchHistory = this.searchHistory.slice(0, 20);

        // Save to localStorage
        localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
    }

    /**
     * Clear search and return to discovery
     */
    clearSearch() {
        this.currentQuery = '';
        const searchInput = document.getElementById('main-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        this.manager.router.navigate('/search');
    }

    /**
     * Highlight search terms in text
     */
    highlightText(text) {
        if (!this.currentQuery || !text) return text;

        const regex = new RegExp(`(${this.currentQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

        return date.toLocaleDateString();
    }
}

// Export for SPA Manager
window.SPASearchPage = SPASearchPage;