/* Knowledge Foyer - Core Application JavaScript */
/* Main SPA controller and global utilities */

class KnowledgeFoyerApp {
    constructor() {
        this.currentPage = null;
        this.isAuthenticated = false;
        this.user = null;
        this.mcpClient = null;

        this.init();
    }

    async init() {
        console.log('🚀 Knowledge Foyer initializing...');

        // Check authentication status
        await this.checkAuthStatus();

        // Initialize mobile menu
        this.initMobileMenu();

        // Initialize global event handlers
        this.initGlobalEvents();

        console.log('✅ Knowledge Foyer initialized');
    }

    async checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        console.log('🔐 checkAuthStatus called, token:', token ? 'present' : 'null');

        if (token) {
            try {
                console.log('🔐 Verifying token with /api/auth/me...');
                // Verify token is still valid
                const response = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                console.log('🔐 Auth verification response status:', response.status);

                if (response.ok) {
                    const userData = await response.json();
                    this.isAuthenticated = true;
                    this.user = userData.user;
                    console.log('👤 User authenticated:', this.user.username);
                } else {
                    console.log('❌ Token invalid, removing from localStorage');
                    // Token invalid, remove it
                    localStorage.removeItem('authToken');
                }
            } catch (error) {
                console.error('❌ Auth check failed:', error);
                console.log('❌ Removing token due to error');
                localStorage.removeItem('authToken');
            }
        } else {
            console.log('🔐 No token found in localStorage');
        }
    }

    initMobileMenu() {
        const mobileMenuButton = document.querySelector('.mobile-menu-button');
        const mobileMenu = document.querySelector('.mobile-menu');

        if (mobileMenuButton && mobileMenu) {
            mobileMenuButton.addEventListener('click', () => {
                const isOpen = mobileMenuButton.classList.contains('open');

                if (isOpen) {
                    this.closeMobileMenu();
                } else {
                    this.openMobileMenu();
                }
            });

            // Close menu when clicking outside
            document.addEventListener('click', (event) => {
                if (!mobileMenuButton.contains(event.target) && !mobileMenu.contains(event.target)) {
                    this.closeMobileMenu();
                }
            });

            // Close menu on escape key
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.closeMobileMenu();
                }
            });
        }
    }

    openMobileMenu() {
        const mobileMenuButton = document.querySelector('.mobile-menu-button');
        const mobileMenu = document.querySelector('.mobile-menu');

        mobileMenuButton.classList.add('open');
        mobileMenu.classList.add('open');
        document.body.classList.add('no-scroll');

        // Focus management for accessibility
        const firstLink = mobileMenu.querySelector('.mobile-nav-link');
        if (firstLink) {
            firstLink.focus();
        }
    }

    closeMobileMenu() {
        const mobileMenuButton = document.querySelector('.mobile-menu-button');
        const mobileMenu = document.querySelector('.mobile-menu');

        mobileMenuButton.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.classList.remove('no-scroll');
    }

    initGlobalEvents() {
        // Handle authentication state changes
        window.addEventListener('auth-change', (event) => {
            this.isAuthenticated = event.detail.isAuthenticated;
            this.user = event.detail.user;

            if (this.isAuthenticated) {
                console.log('🔐 User logged in:', this.user.username);
            } else {
                console.log('👋 User logged out');
            }
        });

        // Handle navigation events
        window.addEventListener('navigate', (event) => {
            this.navigate(event.detail.path);
        });

        // Handle smooth scrolling for anchor links
        document.addEventListener('click', (event) => {
            if (event.target.matches('a[href^="#"]')) {
                event.preventDefault();
                const targetId = event.target.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    }

    // Navigation helper (for future SPA implementation)
    navigate(path) {
        console.log('🧭 Navigating to:', path);
        // For now, use regular navigation
        // In the future, this will handle SPA routing
        window.location.href = path;
    }

    // API request helper with auth
    async apiRequest(endpoint, options = {}) {
        const token = localStorage.getItem('authToken');

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        try {
            const response = await fetch(endpoint, finalOptions);

            // Handle 401 unauthorized
            if (response.status === 401 && this.isAuthenticated) {
                this.logout();
                return null;
            }

            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Authentication methods
    async login(credentials) {
        console.log('🔐 App.login called with:', credentials);
        try {
            // Map email to identifier for backend API compatibility
            const loginData = {
                identifier: credentials.email,
                password: credentials.password
            };

            // Include remember_me if provided
            if (credentials.remember_me) {
                loginData.remember_me = credentials.remember_me;
            }

            console.log('🔐 Sending login request with data:', { ...loginData, password: '[HIDDEN]' });

            const response = await this.apiRequest('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify(loginData)
            });

            console.log('🔐 Login response status:', response?.status);

            if (response.ok) {
                const data = await response.json();
                console.log('🔐 Full response data:', data);
                console.log('🔐 Tokens:', data.tokens);
                console.log('🔐 Access token:', data.tokens?.access_token);

                localStorage.setItem('authToken', data.tokens.access_token);
                console.log('🔐 Token stored, checking localStorage:', localStorage.getItem('authToken'));

                this.isAuthenticated = true;
                this.user = data.user;

                // Dispatch auth change event
                window.dispatchEvent(new CustomEvent('auth-change', {
                    detail: { isAuthenticated: true, user: this.user }
                }));

                return { success: true, user: this.user };
            } else {
                const error = await response.json();
                return { success: false, error: error.message };
            }
        } catch (error) {
            console.error('Login failed:', error);
            return { success: false, error: 'Network error' };
        }
    }

    logout() {
        localStorage.removeItem('authToken');
        this.isAuthenticated = false;
        this.user = null;

        // Dispatch auth change event
        window.dispatchEvent(new CustomEvent('auth-change', {
            detail: { isAuthenticated: false, user: null }
        }));

        // Redirect to home
        window.location.href = '/';
    }

    // Utility methods
    showNotification(message, type = 'info') {
        console.log(`📢 ${type.toUpperCase()}: ${message}`);

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification-card notification-card-${type}`;
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '9999';
        notification.style.maxWidth = '400px';

        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    // Error handling
    handleError(error, context = 'Unknown') {
        console.error(`❌ Error in ${context}:`, error);
        this.showNotification(`Something went wrong in ${context}. Please try again.`, 'error');
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new KnowledgeFoyerApp();
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('💥 Global error:', event.error);
    if (window.app) {
        window.app.handleError(event.error, 'Global');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Unhandled promise rejection:', event.reason);
    if (window.app) {
        window.app.handleError(event.reason, 'Promise');
    }
});