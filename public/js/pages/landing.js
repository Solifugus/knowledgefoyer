/* Knowledge Foyer - Landing Page JavaScript */
/* Handles exposition loading and landing page interactions */

class LandingPage {
    constructor() {
        this.expositions = [];
        this.expositionsContainer = null;

        this.init();
    }

    async init() {
        console.log('🏠 Landing page initializing...');

        this.expositionsContainer = document.getElementById('expositions-container');

        if (this.expositionsContainer) {
            await this.loadExpositions();
        }

        this.initEventHandlers();

        console.log('✅ Landing page ready');
    }

    async loadExpositions() {
        try {
            console.log('📚 Loading expositions...');

            const response = await window.app.apiRequest('/api/expositions?status=published&limit=6');

            if (response && response.ok) {
                const data = await response.json();
                this.expositions = data.expositions || [];
                this.renderExpositions();
            } else {
                // Show placeholder expositions if API fails
                this.renderPlaceholderExpositions();
            }
        } catch (error) {
            console.error('Failed to load expositions:', error);
            this.renderPlaceholderExpositions();
        }
    }

    renderExpositions() {
        if (!this.expositionsContainer) return;

        if (this.expositions.length === 0) {
            this.expositionsContainer.innerHTML = `
                <div class="col-span-full text-center">
                    <div class="card">
                        <h3>No Expositions Yet</h3>
                        <p>Be the first to create a curated collection of articles!</p>
                        <a href="/register" class="btn btn-primary">Get Started</a>
                    </div>
                </div>
            `;
            return;
        }

        const expositionsHTML = this.expositions.map(exposition => this.createExpositionCard(exposition)).join('');
        this.expositionsContainer.innerHTML = expositionsHTML;

        // Add click handlers to exposition cards
        this.expositionsContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.exposition-card');
            if (card) {
                const expositionId = card.dataset.expositionId;
                this.openExposition(expositionId);
            }
        });
    }

    renderPlaceholderExpositions() {
        if (!this.expositionsContainer) return;

        // Show sample expositions for demonstration
        const placeholderExpositions = [
            {
                id: 'demo-1',
                title: 'Tech Ethics & AI Governance',
                description: 'Exploring the intersection of technology, ethics, and responsible AI development in the modern era.',
                author_username: 'alice',
                author_display_name: 'Dr. Alice Chen',
                article_count: 12,
                tags: ['ethics', 'ai', 'technology']
            },
            {
                id: 'demo-2',
                title: 'Climate Technology Innovations',
                description: 'Cutting-edge solutions and breakthrough technologies addressing climate change and sustainability.',
                author_username: 'bob',
                author_display_name: 'Bob Martinez',
                article_count: 8,
                tags: ['climate', 'technology', 'sustainability']
            },
            {
                id: 'demo-3',
                title: 'Remote Work & Digital Transformation',
                description: 'The evolution of remote work cultures, tools, and best practices for distributed teams.',
                author_username: 'carol',
                author_display_name: 'Carol Johnson',
                article_count: 15,
                tags: ['remote-work', 'productivity', 'collaboration']
            }
        ];

        const expositionsHTML = placeholderExpositions.map(exposition => this.createExpositionCard(exposition, true)).join('');
        this.expositionsContainer.innerHTML = expositionsHTML;

        // Add click handlers for demo cards
        this.expositionsContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.exposition-card');
            if (card && card.classList.contains('demo')) {
                window.app.showNotification('This is a demo exposition. Register to explore real content!', 'info');
            }
        });
    }

    createExpositionCard(exposition, isDemo = false) {
        const articleText = exposition.article_count === 1 ? 'article' : 'articles';

        return `
            <div class="exposition-card ${isDemo ? 'demo' : ''}"
                 data-exposition-id="${exposition.id}"
                 role="button"
                 tabindex="0"
                 aria-label="Open exposition: ${exposition.title}">

                <h3 class="exposition-title">${exposition.title}</h3>

                <p class="exposition-description">${exposition.description}</p>

                <div class="exposition-meta">
                    <div>
                        <span class="exposition-author">by @${exposition.author_username}</span>
                        ${isDemo ? '<span style="color: var(--color-warning); font-size: var(--text-xs); margin-left: var(--space-2);">(Demo)</span>' : ''}
                    </div>
                    <span class="exposition-count">
                        ${exposition.article_count} ${articleText}
                    </span>
                </div>

                ${exposition.tags ? `
                    <div style="margin-top: var(--space-3); display: flex; gap: var(--space-1); flex-wrap: wrap;">
                        ${exposition.tags.map(tag => `
                            <span style="background-color: var(--color-slate-100); color: var(--color-slate-600);
                                         padding: var(--space-1) var(--space-2); border-radius: var(--radius);
                                         font-size: var(--text-xs);">#${tag}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    openExposition(expositionId) {
        console.log('📖 Opening exposition:', expositionId);

        if (expositionId.startsWith('demo-')) {
            window.app.showNotification('Demo exposition! Register to explore real collections.', 'info');
            return;
        }

        // Navigate to exposition page
        window.location.href = `/expositions/${expositionId}`;
    }

    initEventHandlers() {
        // Handle keyboard navigation for exposition cards
        document.addEventListener('keydown', (event) => {
            if (event.target.classList.contains('exposition-card') && event.key === 'Enter') {
                event.preventDefault();
                event.target.click();
            }
        });

        // Handle CTA button clicks
        const ctaButtons = document.querySelectorAll('.hero-actions .btn');
        ctaButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                if (button.getAttribute('href') === '/register') {
                    // Track registration intent
                    console.log('📝 User clicked register from landing page');
                }
            });
        });

        // Handle smooth scrolling for explore button
        const exploreButton = document.querySelector('a[href="#expositions"]');
        if (exploreButton) {
            exploreButton.addEventListener('click', (event) => {
                event.preventDefault();
                document.getElementById('expositions').scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            });
        }

        // Add intersection observer for animations (if reduced motion is not preferred)
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.initScrollAnimations();
        }
    }

    initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        // Animate cards as they come into view
        document.querySelectorAll('.card, .exposition-card').forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(card);
        });
    }

    // Method to refresh expositions (for future use)
    async refreshExpositions() {
        if (this.expositionsContainer) {
            this.expositionsContainer.innerHTML = `
                <div class="page-loading">
                    <div class="page-loading-spinner"></div>
                    <p class="page-loading-text">Refreshing expositions...</p>
                </div>
            `;
            await this.loadExpositions();
        }
    }
}

// Initialize landing page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for app to initialize first
    const checkApp = () => {
        if (window.app) {
            window.landingPage = new LandingPage();
        } else {
            setTimeout(checkApp, 10);
        }
    };
    checkApp();
});