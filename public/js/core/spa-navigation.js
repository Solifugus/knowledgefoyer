/**
 * Knowledge Foyer - Advanced Navigation System
 * Step 10: Complete SPA navigation with breadcrumbs, transitions, and accessibility
 */

class SPANavigation {
    constructor(manager) {
        this.manager = manager;
        this.breadcrumbs = [];
        this.navigationHistory = [];
        this.pageTransitions = true;
        this.currentPage = null;
        this.loadingStates = new Map();
        this.prefetchQueue = new Set();

        this.setupNavigationSystem();
    }

    /**
     * Initialize the navigation system
     */
    setupNavigationSystem() {
        this.setupBreadcrumbs();
        this.setupPageTransitions();
        this.setupKeyboardNavigation();
        this.setupAccessibility();
        this.setupPrefetching();
        this.setupNavigationEvents();
    }

    /**
     * Set up breadcrumb navigation
     */
    setupBreadcrumbs() {
        // Create breadcrumb container if it doesn't exist
        if (!document.getElementById('breadcrumb-nav')) {
            const breadcrumbNav = document.createElement('nav');
            breadcrumbNav.id = 'breadcrumb-nav';
            breadcrumbNav.className = 'breadcrumb-navigation';
            breadcrumbNav.setAttribute('aria-label', 'Breadcrumb navigation');

            const header = document.getElementById('app-header');
            if (header) {
                header.appendChild(breadcrumbNav);
            }
        }
    }

    /**
     * Update breadcrumb trail based on current route
     */
    updateBreadcrumbs(route, params = {}) {
        const breadcrumbNav = document.getElementById('breadcrumb-nav');
        if (!breadcrumbNav) return;

        const breadcrumbs = this.generateBreadcrumbs(route, params);

        if (breadcrumbs.length <= 1) {
            breadcrumbNav.style.display = 'none';
            return;
        }

        breadcrumbNav.style.display = 'block';
        breadcrumbNav.innerHTML = `
            <ol class="breadcrumb-list" itemscope itemtype="https://schema.org/BreadcrumbList">
                ${breadcrumbs.map((crumb, index) => `
                    <li class="breadcrumb-item ${index === breadcrumbs.length - 1 ? 'current' : ''}"
                        itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                        ${index === breadcrumbs.length - 1 ? `
                            <span class="breadcrumb-current" itemprop="name" aria-current="page">
                                ${crumb.label}
                            </span>
                        ` : `
                            <a href="${crumb.url}" class="breadcrumb-link"
                               itemprop="item" data-spa-link>
                                <span itemprop="name">${crumb.label}</span>
                            </a>
                        `}
                        <meta itemprop="position" content="${index + 1}">
                        ${index < breadcrumbs.length - 1 ? '<span class="breadcrumb-separator" aria-hidden="true">›</span>' : ''}
                    </li>
                `).join('')}
            </ol>
        `;

        // Re-bind SPA links (method not needed for current implementation)
        // this.manager.router.bindSPALinks();
    }

    /**
     * Generate breadcrumb items for a route
     */
    generateBreadcrumbs(route, params) {
        const breadcrumbs = [
            { label: 'Home', url: '#/' }
        ];

        // Route-specific breadcrumb generation
        if (route.startsWith('/dashboard')) {
            breadcrumbs.push({ label: 'Dashboard', url: '#/dashboard' });

            if (route.includes('?tab=')) {
                const tab = new URLSearchParams(route.split('?')[1]).get('tab');
                const tabLabels = {
                    overview: 'Overview',
                    articles: 'My Articles',
                    feedback: 'Feedback',
                    analytics: 'Analytics',
                    profile: 'Profile',
                    settings: 'Settings'
                };
                if (tabLabels[tab]) {
                    breadcrumbs.push({ label: tabLabels[tab], url: `#${route}` });
                }
            }
        } else if (route.startsWith('/article/')) {
            const slug = params.slug || route.split('/')[2];
            breadcrumbs.push({ label: 'Articles', url: '#/search?q=&type=articles' });
            breadcrumbs.push({ label: this.getArticleTitle(slug), url: `#${route}` });
        } else if (route.startsWith('/edit/')) {
            const slug = params.slug || route.split('/')[2];
            breadcrumbs.push({ label: 'Dashboard', url: '#/dashboard' });
            breadcrumbs.push({ label: 'Edit Article', url: `#${route}` });
            breadcrumbs.push({ label: this.getArticleTitle(slug), url: `#${route}` });
        } else if (route === '/create') {
            breadcrumbs.push({ label: 'Dashboard', url: '#/dashboard' });
            breadcrumbs.push({ label: 'Create Article', url: '#/create' });
        } else if (route.startsWith('/search')) {
            breadcrumbs.push({ label: 'Search & Discovery', url: '#/search' });

            if (route.includes('?q=')) {
                const query = new URLSearchParams(route.split('?')[1]).get('q');
                if (query) {
                    breadcrumbs.push({ label: `Results for "${query}"`, url: `#${route}` });
                }
            }
        } else if (route.startsWith('/author/')) {
            const username = params.username || route.split('/')[2];
            breadcrumbs.push({ label: 'Authors', url: '#/search?type=authors' });
            breadcrumbs.push({ label: this.getAuthorName(username), url: `#${route}` });
        } else if (route.startsWith('/tag/')) {
            const tagSlug = params.tagSlug || route.split('/')[2];
            breadcrumbs.push({ label: 'Topics', url: '#/search?type=tags' });
            breadcrumbs.push({ label: this.getTagName(tagSlug), url: `#${route}` });
        }

        return breadcrumbs;
    }

    /**
     * Set up page transitions
     */
    setupPageTransitions() {
        // Add transition container
        const mainContent = document.getElementById('spa-content');
        if (mainContent && !mainContent.querySelector('.page-transition-container')) {
            mainContent.innerHTML = `
                <div class="page-transition-container">
                    ${mainContent.innerHTML}
                </div>
            `;
        }
    }

    /**
     * Animate page transition
     */
    async animatePageTransition(direction = 'forward') {
        if (!this.pageTransitions) return;

        const container = document.querySelector('.page-transition-container');
        if (!container) return;

        // Add transition classes
        container.classList.add('page-transitioning', `transition-${direction}`);

        // Create loading overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'page-loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="page-loading-content">
                <div class="page-loading-spinner"></div>
                <p class="page-loading-text">Loading...</p>
            </div>
        `;
        container.appendChild(loadingOverlay);

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 150));

        return () => {
            container.classList.remove('page-transitioning', `transition-${direction}`);
            if (loadingOverlay.parentNode) {
                loadingOverlay.remove();
            }
        };
    }

    /**
     * Set up keyboard navigation
     */
    setupKeyboardNavigation() {
        document.addEventListener('keydown', (event) => {
            // Skip if user is typing in an input
            if (event.target.matches('input, textarea, [contenteditable]')) {
                return;
            }

            // Global keyboard shortcuts
            if (event.altKey) {
                switch (event.key) {
                    case 'ArrowLeft':
                        event.preventDefault();
                        this.navigateBack();
                        break;
                    case 'ArrowRight':
                        event.preventDefault();
                        this.navigateForward();
                        break;
                    case 'h':
                        event.preventDefault();
                        this.manager.router.navigate('/');
                        break;
                    case 'd':
                        event.preventDefault();
                        if (this.manager.auth.isAuthenticated()) {
                            this.manager.router.navigate('/dashboard');
                        }
                        break;
                    case 's':
                        event.preventDefault();
                        this.manager.router.navigate('/search');
                        break;
                }
            }

            // Focus management
            if (event.key === 'Tab') {
                this.manageFocus(event);
            }

            // Escape key handling
            if (event.key === 'Escape') {
                this.handleEscape();
            }
        });
    }

    /**
     * Set up accessibility features
     */
    setupAccessibility() {
        // Skip links
        this.createSkipLinks();

        // ARIA live regions
        this.createLiveRegions();

        // Focus management
        this.setupFocusManagement();

        // Screen reader announcements
        this.setupScreenReaderAnnouncements();
    }

    /**
     * Create skip links for accessibility
     */
    createSkipLinks() {
        const skipLinks = document.createElement('div');
        skipLinks.className = 'skip-links';
        skipLinks.innerHTML = `
            <a href="#spa-content" class="skip-link">Skip to main content</a>
            <a href="#main-nav" class="skip-link">Skip to navigation</a>
            <a href="#user-menu" class="skip-link">Skip to user menu</a>
        `;
        document.body.insertBefore(skipLinks, document.body.firstChild);
    }

    /**
     * Create ARIA live regions
     */
    createLiveRegions() {
        if (!document.getElementById('aria-live-region')) {
            const liveRegion = document.createElement('div');
            liveRegion.id = 'aria-live-region';
            liveRegion.className = 'sr-only';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            document.body.appendChild(liveRegion);
        }

        if (!document.getElementById('aria-live-assertive')) {
            const assertiveRegion = document.createElement('div');
            assertiveRegion.id = 'aria-live-assertive';
            assertiveRegion.className = 'sr-only';
            assertiveRegion.setAttribute('aria-live', 'assertive');
            assertiveRegion.setAttribute('aria-atomic', 'true');
            document.body.appendChild(assertiveRegion);
        }
    }

    /**
     * Set up focus management
     */
    setupFocusManagement() {
        // Store focus before navigation
        document.addEventListener('spa:before-navigate', () => {
            this.lastFocusElement = document.activeElement;
        });

        // Restore focus after navigation
        document.addEventListener('spa:after-navigate', () => {
            this.restoreFocus();
        });
    }

    /**
     * Restore focus after navigation
     */
    restoreFocus() {
        // Focus the main content area for screen readers
        const mainContent = document.getElementById('spa-content');
        if (mainContent) {
            mainContent.setAttribute('tabindex', '-1');
            mainContent.focus();

            // Remove tabindex after focusing
            setTimeout(() => {
                mainContent.removeAttribute('tabindex');
            }, 100);
        }
    }

    /**
     * Set up screen reader announcements
     */
    setupScreenReaderAnnouncements() {
        // Announce page changes
        document.addEventListener('spa:route-changed', (event) => {
            this.announcePageChange(event.detail);
        });
    }

    /**
     * Announce page change to screen readers
     */
    announcePageChange(routeInfo) {
        const { route, title } = routeInfo;
        const announcement = `Page changed to ${title || this.getPageTitle(route)}`;
        this.announceToScreenReader(announcement);
    }

    /**
     * Announce message to screen reader
     */
    announceToScreenReader(message, assertive = false) {
        const liveRegion = document.getElementById(
            assertive ? 'aria-live-assertive' : 'aria-live-region'
        );

        if (liveRegion) {
            liveRegion.textContent = message;

            // Clear after announcement
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 1000);
        }
    }

    /**
     * Set up intelligent prefetching
     */
    setupPrefetching() {
        // Prefetch on hover
        document.addEventListener('mouseover', (event) => {
            const link = event.target.closest('[data-spa-link]');
            if (link && !this.prefetchQueue.has(link.href)) {
                this.prefetchPage(link.href);
            }
        });

        // Prefetch common routes on idle
        this.prefetchCommonRoutes();
    }

    /**
     * Prefetch a page
     */
    async prefetchPage(url) {
        if (this.prefetchQueue.has(url)) return;
        this.prefetchQueue.add(url);

        try {
            // Extract route from URL
            const route = url.includes('#') ? url.split('#')[1] : '/';

            // Prefetch based on route type
            if (route.startsWith('/article/')) {
                // Prefetch article data
                const slug = route.split('/')[2];
                await this.manager.mockAPI.getArticle(slug);
            } else if (route.startsWith('/search')) {
                // Prefetch popular content
                await Promise.all([
                    this.manager.mockAPI.getPopularTags(),
                    this.manager.mockAPI.getTrendingAuthors()
                ]);
            }
        } catch (error) {
            console.log('Prefetch failed:', error.message);
        }
    }

    /**
     * Prefetch common routes during idle time
     */
    prefetchCommonRoutes() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                this.prefetchPage('#/search');
                if (this.manager.auth.isAuthenticated()) {
                    this.prefetchPage('#/dashboard');
                    this.prefetchPage('#/create');
                }
            });
        }
    }

    /**
     * Set up navigation event listeners
     */
    setupNavigationEvents() {
        // Listen for route changes
        document.addEventListener('spa:route-changed', (event) => {
            const { path, params } = event.detail;
            this.updateBreadcrumbs(path, params);
            this.updateNavigationState(path);
            this.trackPageView(path);
        });

        // Listen for navigation errors
        document.addEventListener('spa:navigation-error', (event) => {
            this.handleNavigationError(event.detail);
        });
    }

    /**
     * Update navigation state
     */
    updateNavigationState(route) {
        // Add to navigation history
        this.navigationHistory.push({
            route,
            timestamp: Date.now(),
            title: document.title
        });

        // Keep history manageable
        if (this.navigationHistory.length > 50) {
            this.navigationHistory.shift();
        }

        // Update current page
        this.currentPage = route;

        // Update active navigation items
        this.updateActiveNavigationItems(route);
    }

    /**
     * Update active navigation items
     */
    updateActiveNavigationItems(route) {
        // Clear all active states
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Set active state based on current route
        if (route === '/') {
            document.querySelector('.nav-link[href="#/"]')?.classList.add('active');
        } else if (route.startsWith('/dashboard')) {
            document.querySelector('.nav-link[href="#/dashboard"]')?.classList.add('active');
        } else if (route.startsWith('/search')) {
            document.querySelector('.nav-link[href="#/search"]')?.classList.add('active');
        } else if (route.startsWith('/create')) {
            document.querySelector('.nav-link[href="#/create"]')?.classList.add('active');
        }
    }

    /**
     * Handle navigation errors
     */
    handleNavigationError(error) {
        console.error('Navigation error:', error);
        this.announceToScreenReader('Navigation failed. Please try again.', true);

        // Show user-friendly error
        if (this.manager.showNotification) {
            this.manager.showNotification(
                'Navigation failed. Please try again or contact support if the problem persists.',
                'error'
            );
        }
    }

    /**
     * Navigate back in history
     */
    navigateBack() {
        if (this.navigationHistory.length > 1) {
            const previousPage = this.navigationHistory[this.navigationHistory.length - 2];
            this.manager.router.navigate(previousPage.route);
        } else {
            window.history.back();
        }
    }

    /**
     * Navigate forward in history
     */
    navigateForward() {
        window.history.forward();
    }

    /**
     * Handle escape key
     */
    handleEscape() {
        // Close modals
        const modal = document.querySelector('.modal.show');
        if (modal) {
            modal.querySelector('.modal-close')?.click();
            return;
        }

        // Close dropdowns
        const dropdown = document.querySelector('.dropdown.show');
        if (dropdown) {
            dropdown.classList.remove('show');
            return;
        }

        // Clear search
        const searchInput = document.querySelector('.search-input:focus');
        if (searchInput) {
            searchInput.blur();
            return;
        }
    }

    /**
     * Manage focus for accessibility
     */
    manageFocus(event) {
        // Trap focus in modals
        const modal = document.querySelector('.modal.show');
        if (modal) {
            const focusableElements = modal.querySelectorAll(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
            );

            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    event.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    event.preventDefault();
                    firstElement.focus();
                }
            }
        }
    }

    /**
     * Track page view for analytics
     */
    trackPageView(route) {
        // Send to analytics service (mock implementation)
        if (window.gtag) {
            window.gtag('config', 'GA_MEASUREMENT_ID', {
                page_path: route,
                page_title: document.title
            });
        }

        // Custom analytics tracking
        this.sendAnalytics('page_view', {
            route,
            title: document.title,
            timestamp: Date.now(),
            user_id: this.manager.auth.getCurrentUser()?.id || 'anonymous'
        });
    }

    /**
     * Send analytics data
     */
    sendAnalytics(event, data) {
        // Mock analytics implementation
        console.log('Analytics:', event, data);

        // In production, this would send to your analytics service
        // Example: fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ event, data }) })
    }

    /**
     * Helper methods for breadcrumb generation
     */
    getArticleTitle(slug) {
        // Mock implementation - would fetch from cache or API
        const mockTitles = {
            'javascript-scalability': 'Building Scalable JavaScript Applications',
            'web-performance-guide': 'Ultimate Web Performance Guide',
            'react-best-practices': 'React Best Practices',
            'node-microservices': 'Node.js Microservices Architecture'
        };
        return mockTitles[slug] || 'Article';
    }

    getAuthorName(username) {
        // Mock implementation
        const mockAuthors = {
            'sarah_dev': 'Sarah Chen',
            'mike_js': 'Mike Rodriguez',
            'alex_data': 'Alex Thompson'
        };
        return mockAuthors[username] || username;
    }

    getTagName(slug) {
        // Mock implementation
        const mockTags = {
            'javascript': 'JavaScript',
            'react': 'React',
            'performance': 'Performance',
            'nodejs': 'Node.js'
        };
        return mockTags[slug] || slug;
    }

    getPageTitle(route) {
        const titles = {
            '/': 'Home',
            '/dashboard': 'Dashboard',
            '/create': 'Create Article',
            '/search': 'Search & Discovery'
        };
        return titles[route] || 'Knowledge Foyer';
    }

    /**
     * Get navigation statistics
     */
    getNavigationStats() {
        return {
            currentPage: this.currentPage,
            historyLength: this.navigationHistory.length,
            prefetchQueueSize: this.prefetchQueue.size,
            transitionsEnabled: this.pageTransitions
        };
    }

    /**
     * Enable or disable page transitions
     */
    setPageTransitions(enabled) {
        this.pageTransitions = enabled;
        localStorage.setItem('spa_page_transitions', enabled.toString());
    }

    /**
     * Clear navigation history
     */
    clearNavigationHistory() {
        this.navigationHistory = [];
        this.prefetchQueue.clear();
    }
}

// Export for SPA Manager
window.SPANavigation = SPANavigation;