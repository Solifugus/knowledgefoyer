/* Knowledge Foyer - Login Page Controller */
/* Handles user authentication and login form */

class LoginPage {
    constructor() {
        this.isLoading = false;
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.passwordToggle = document.getElementById('passwordToggle');
        this.rememberMeCheckbox = document.getElementById('rememberMe');
        this.loginButton = document.getElementById('loginButton');
        this.formStatus = document.getElementById('formStatus');
        this.loadingOverlay = document.getElementById('authLoading');

        this.init();
    }

    async init() {
        console.log('🔐 Initializing login page...');

        // Check if user is already authenticated
        if (window.app && window.app.isAuthenticated) {
            console.log('👤 User already authenticated, redirecting...');
            window.location.href = '/dashboard';
            return;
        }

        // Setup event handlers
        this.setupEventHandlers();

        // Setup form validation
        this.setupValidation();

        // Auto-focus email field
        if (this.emailInput) {
            this.emailInput.focus();
        }

        console.log('✅ Login page ready');
    }

    setupEventHandlers() {
        // Form submission
        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleLogin();
            });
        }

        // Password visibility toggle
        if (this.passwordToggle) {
            this.passwordToggle.addEventListener('click', () => {
                this.togglePasswordVisibility();
            });
        }

        // Real-time validation
        if (this.emailInput) {
            this.emailInput.addEventListener('blur', () => {
                this.validateEmail();
            });

            this.emailInput.addEventListener('input', () => {
                this.clearFieldError('email');
            });
        }

        if (this.passwordInput) {
            this.passwordInput.addEventListener('input', () => {
                this.clearFieldError('password');
                this.updateLoginButton();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // Enter key submits form if focused on form elements
            if (event.key === 'Enter' && this.isFormElement(event.target)) {
                event.preventDefault();
                this.handleLogin();
            }
        });

        // Handle authentication state changes from app.js
        window.addEventListener('auth-change', (event) => {
            if (event.detail.isAuthenticated) {
                // User logged in successfully
                this.handleLoginSuccess(event.detail.user);
            }
        });
    }

    setupValidation() {
        // Update login button state based on form validity
        const updateButton = () => {
            this.updateLoginButton();
        };

        if (this.emailInput) this.emailInput.addEventListener('input', updateButton);
        if (this.passwordInput) this.passwordInput.addEventListener('input', updateButton);
    }

    async handleLogin() {
        if (this.isLoading) {
            console.log('🔄 Login already in progress');
            return;
        }

        // Validate form
        if (!this.validateForm()) {
            return;
        }

        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;
        const rememberMe = this.rememberMeCheckbox ? this.rememberMeCheckbox.checked : false;

        console.log('🔐 Attempting login for:', email);

        try {
            this.setLoadingState(true);
            this.clearFormErrors();

            // Use the app's login method
            const result = await window.app.login({
                email,
                password,
                remember_me: rememberMe
            });

            if (result.success) {
                this.showFormStatus('Login successful! Redirecting...', 'success');

                // Small delay to show success message
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);

            } else {
                this.handleLoginError(result.error);
            }

        } catch (error) {
            console.error('❌ Login error:', error);
            this.handleLoginError('Network error. Please check your connection and try again.');

        } finally {
            this.setLoadingState(false);
        }
    }

    validateForm() {
        let isValid = true;

        // Validate email
        if (!this.validateEmail()) {
            isValid = false;
        }

        // Validate password
        if (!this.validatePassword()) {
            isValid = false;
        }

        return isValid;
    }

    validateEmail() {
        const email = this.emailInput ? this.emailInput.value.trim() : '';

        if (!email) {
            this.showFieldError('email', 'Email address is required');
            return false;
        }

        if (!this.isValidEmail(email)) {
            this.showFieldError('email', 'Please enter a valid email address');
            return false;
        }

        return true;
    }

    validatePassword() {
        const password = this.passwordInput ? this.passwordInput.value : '';

        if (!password) {
            this.showFieldError('password', 'Password is required');
            return false;
        }

        if (password.length < 6) {
            this.showFieldError('password', 'Password must be at least 6 characters');
            return false;
        }

        return true;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    togglePasswordVisibility() {
        if (!this.passwordInput || !this.passwordToggle) return;

        const isPassword = this.passwordInput.type === 'password';

        if (isPassword) {
            this.passwordInput.type = 'text';
            this.passwordToggle.textContent = '🙈';
            this.passwordToggle.setAttribute('aria-label', 'Hide password');
        } else {
            this.passwordInput.type = 'password';
            this.passwordToggle.textContent = '👁️';
            this.passwordToggle.setAttribute('aria-label', 'Show password');
        }
    }

    updateLoginButton() {
        if (!this.loginButton) return;

        const email = this.emailInput ? this.emailInput.value.trim() : '';
        const password = this.passwordInput ? this.passwordInput.value : '';
        const hasRequiredFields = email && password && password.length >= 6;

        this.loginButton.disabled = !hasRequiredFields || this.isLoading;
    }

    setLoadingState(loading) {
        this.isLoading = loading;

        if (this.loginButton) {
            if (loading) {
                this.loginButton.textContent = '🔄 Signing In...';
                this.loginButton.disabled = true;
            } else {
                this.loginButton.textContent = '🚀 Sign In';
                this.updateLoginButton();
            }
        }

        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = loading ? 'flex' : 'none';
        }

        // Disable form inputs during loading
        const inputs = this.form ? this.form.querySelectorAll('input') : [];
        inputs.forEach(input => {
            input.disabled = loading;
        });
    }

    showFieldError(fieldName, message) {
        const errorElement = document.getElementById(`${fieldName}Error`);
        const inputElement = document.getElementById(fieldName);

        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }

        if (inputElement) {
            inputElement.classList.add('error');
        }
    }

    clearFieldError(fieldName) {
        const errorElement = document.getElementById(`${fieldName}Error`);
        const inputElement = document.getElementById(fieldName);

        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }

        if (inputElement) {
            inputElement.classList.remove('error');
        }
    }

    clearFormErrors() {
        this.clearFieldError('email');
        this.clearFieldError('password');
        this.hideFormStatus();
    }

    showFormStatus(message, type = 'info') {
        if (!this.formStatus) return;

        this.formStatus.textContent = message;
        this.formStatus.className = `form-status form-status-${type}`;
        this.formStatus.style.display = 'block';

        // Auto-hide non-error messages after 5 seconds
        if (type !== 'error') {
            setTimeout(() => {
                this.hideFormStatus();
            }, 5000);
        }
    }

    hideFormStatus() {
        if (this.formStatus) {
            this.formStatus.style.display = 'none';
        }
    }

    handleLoginError(errorMessage) {
        console.error('❌ Login failed:', errorMessage);

        // Check for specific error types
        if (errorMessage.toLowerCase().includes('email') ||
            errorMessage.toLowerCase().includes('not found')) {
            this.showFieldError('email', 'Email not found. Please check your email or register.');
        } else if (errorMessage.toLowerCase().includes('password') ||
                   errorMessage.toLowerCase().includes('incorrect')) {
            this.showFieldError('password', 'Incorrect password. Please try again.');
        } else {
            // General error
            this.showFormStatus(errorMessage, 'error');
        }
    }

    handleLoginSuccess(user) {
        console.log('✅ Login successful for user:', user.username);
        this.showFormStatus('Welcome back! Redirecting to your dashboard...', 'success');
    }

    isFormElement(element) {
        const formTags = ['input', 'textarea', 'select', 'button'];
        return formTags.includes(element.tagName.toLowerCase());
    }

    // Pre-fill email if provided in URL (e.g., from registration)
    prefillEmailFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const email = urlParams.get('email');

        if (email && this.emailInput) {
            this.emailInput.value = email;
            this.validateEmail();

            // Focus password field if email is pre-filled
            if (this.passwordInput) {
                this.passwordInput.focus();
            }
        }
    }

    // Handle OAuth or other authentication methods (future enhancement)
    handleAlternativeAuth(provider) {
        console.log('🔗 Alternative authentication:', provider);
        // TODO: Implement OAuth flows if needed
    }
}

// Initialize the page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we have the login form
    if (document.getElementById('loginForm')) {
        window.loginPage = new LoginPage();
    }
});

// Handle browser back button
window.addEventListener('popstate', () => {
    // Refresh authentication state if user navigates back
    if (window.app) {
        window.app.checkAuthStatus();
    }
});