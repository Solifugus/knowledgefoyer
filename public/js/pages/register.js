/* Knowledge Foyer - Registration Page Controller */
/* Handles user registration with enhanced validation and UX */

class RegistrationPage {
    constructor() {
        this.validator = new FormValidator();
        this.isLoading = false;
        this.form = document.getElementById('registerForm');

        // Form elements
        this.usernameInput = document.getElementById('username');
        this.emailInput = document.getElementById('email');
        this.displayNameInput = document.getElementById('displayName');
        this.passwordInput = document.getElementById('password');
        this.confirmPasswordInput = document.getElementById('confirmPassword');
        this.agreeToTermsCheckbox = document.getElementById('agreeToTerms');
        this.newsletterOptInCheckbox = document.getElementById('newsletterOptIn');
        this.registerButton = document.getElementById('registerButton');
        this.formStatus = document.getElementById('formStatus');
        this.loadingOverlay = document.getElementById('authLoading');
        this.successModal = document.getElementById('successModal');

        // Password toggles
        this.passwordToggle = document.getElementById('passwordToggle');
        this.confirmPasswordToggle = document.getElementById('confirmPasswordToggle');

        // Password strength elements
        this.passwordStrengthBar = document.getElementById('passwordStrengthBar');
        this.passwordStrengthFill = document.getElementById('passwordStrengthFill');
        this.passwordStrengthText = document.getElementById('passwordStrengthText');

        // Debounced validation functions
        this.debouncedCheckUsername = this.debounce(this.checkUsernameAvailability.bind(this), 500);
        this.debouncedCheckEmail = this.debounce(this.checkEmailAvailability.bind(this), 500);

        this.init();
    }

    async init() {
        console.log('📝 Initializing registration page...');

        // Check if user is already authenticated
        if (window.app && window.app.isAuthenticated) {
            console.log('👤 User already authenticated, redirecting...');
            window.location.href = '/dashboard';
            return;
        }

        // Setup event handlers
        this.setupEventHandlers();

        // Setup real-time validation
        this.setupRealTimeValidation();

        // Focus username field
        if (this.usernameInput) {
            this.usernameInput.focus();
        }

        console.log('✅ Registration page ready');
    }

    setupEventHandlers() {
        // Form submission
        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleRegistration();
            });
        }

        // Password visibility toggles
        if (this.passwordToggle) {
            this.passwordToggle.addEventListener('click', () => {
                this.togglePasswordVisibility('password');
            });
        }

        if (this.confirmPasswordToggle) {
            this.confirmPasswordToggle.addEventListener('click', () => {
                this.togglePasswordVisibility('confirmPassword');
            });
        }

        // Real-time username availability
        if (this.usernameInput) {
            this.usernameInput.addEventListener('input', () => {
                this.clearFieldError('username');
                this.updateRegisterButton();
                this.debouncedCheckUsername();
            });

            this.usernameInput.addEventListener('blur', () => {
                this.validateUsername();
            });
        }

        // Real-time email availability
        if (this.emailInput) {
            this.emailInput.addEventListener('input', () => {
                this.clearFieldError('email');
                this.updateRegisterButton();
                this.debouncedCheckEmail();
            });

            this.emailInput.addEventListener('blur', () => {
                this.validateEmail();
            });
        }

        // Display name validation
        if (this.displayNameInput) {
            this.displayNameInput.addEventListener('input', () => {
                this.clearFieldError('displayName');
                this.updateRegisterButton();
            });

            this.displayNameInput.addEventListener('blur', () => {
                this.validateDisplayName();
            });
        }

        // Password strength checking
        if (this.passwordInput) {
            this.passwordInput.addEventListener('input', () => {
                this.clearFieldError('password');
                this.updatePasswordStrength();
                this.validatePasswordMatch();
                this.updateRegisterButton();
            });

            this.passwordInput.addEventListener('blur', () => {
                this.validatePassword();
            });
        }

        // Password confirmation
        if (this.confirmPasswordInput) {
            this.confirmPasswordInput.addEventListener('input', () => {
                this.clearFieldError('confirmPassword');
                this.validatePasswordMatch();
                this.updateRegisterButton();
            });

            this.confirmPasswordInput.addEventListener('blur', () => {
                this.validatePasswordMatch();
            });
        }

        // Terms checkbox
        if (this.agreeToTermsCheckbox) {
            this.agreeToTermsCheckbox.addEventListener('change', () => {
                this.updateRegisterButton();
            });
        }

        // Success modal handlers
        const continueToLogin = document.getElementById('continueToLogin');
        if (continueToLogin) {
            continueToLogin.addEventListener('click', () => {
                window.location.href = '/login';
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });

        // Handle authentication state changes
        window.addEventListener('auth-change', (event) => {
            if (event.detail.isAuthenticated) {
                // User registered and logged in successfully
                window.location.href = '/dashboard';
            }
        });
    }

    setupRealTimeValidation() {
        // Setup validation for all form fields
        const inputs = [
            this.usernameInput,
            this.emailInput,
            this.displayNameInput,
            this.passwordInput,
            this.confirmPasswordInput
        ];

        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    // Clear any previous validation styling on input
                    input.classList.remove('error', 'valid');
                });
            }
        });
    }

    async handleRegistration() {
        if (this.isLoading) {
            console.log('🔄 Registration already in progress');
            return;
        }

        // Validate form
        if (!this.validateForm()) {
            return;
        }

        const formData = this.getFormData();

        console.log('📝 Attempting registration for:', formData.username);

        try {
            this.setLoadingState(true);
            this.clearFormErrors();

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccessModal(result.user);
            } else {
                this.handleRegistrationError(result.error || 'Registration failed');
            }

        } catch (error) {
            console.error('❌ Registration error:', error);
            this.handleRegistrationError('Network error. Please check your connection and try again.');

        } finally {
            this.setLoadingState(false);
        }
    }

    validateForm() {
        let isValid = true;

        // Validate all fields
        if (!this.validateUsername()) isValid = false;
        if (!this.validateEmail()) isValid = false;
        if (!this.validateDisplayName()) isValid = false;
        if (!this.validatePassword()) isValid = false;
        if (!this.validatePasswordMatch()) isValid = false;
        if (!this.validateTermsAgreement()) isValid = false;

        return isValid;
    }

    validateUsername() {
        const username = this.usernameInput ? this.usernameInput.value.trim() : '';
        const result = this.validator.validateField('username', username);

        if (result.isValid) {
            this.showFieldSuccess('username');
        } else {
            this.showFieldError('username', result.message);
        }

        return result.isValid;
    }

    validateEmail() {
        const email = this.emailInput ? this.emailInput.value.trim() : '';
        const result = this.validator.validateField('email', email);

        if (result.isValid) {
            this.showFieldSuccess('email');
        } else {
            this.showFieldError('email', result.message);
        }

        return result.isValid;
    }

    validateDisplayName() {
        const displayName = this.displayNameInput ? this.displayNameInput.value.trim() : '';
        const result = this.validator.validateField('displayName', displayName);

        if (result.isValid) {
            this.showFieldSuccess('displayName');
        } else {
            this.showFieldError('displayName', result.message);
        }

        return result.isValid;
    }

    validatePassword() {
        const password = this.passwordInput ? this.passwordInput.value : '';
        const result = this.validator.validateField('password', password);

        if (result.isValid) {
            this.showFieldSuccess('password');
        } else {
            this.showFieldError('password', result.message);
        }

        return result.isValid;
    }

    validatePasswordMatch() {
        if (!this.passwordInput || !this.confirmPasswordInput) return true;

        const password = this.passwordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;

        if (!confirmPassword) return true; // Don't validate empty confirm field

        const isMatch = password === confirmPassword;

        if (isMatch) {
            this.showFieldSuccess('confirmPassword');
        } else {
            this.showFieldError('confirmPassword', 'Passwords do not match');
        }

        return isMatch;
    }

    validateTermsAgreement() {
        const agreed = this.agreeToTermsCheckbox ? this.agreeToTermsCheckbox.checked : false;

        if (!agreed) {
            this.showFormStatus('You must agree to the Terms of Service to continue', 'error');
            return false;
        }

        return true;
    }

    async checkUsernameAvailability() {
        if (!this.usernameInput) return;

        const username = this.usernameInput.value.trim();

        if (!username || !this.validator.isValidUsername(username)) {
            return;
        }

        try {
            const response = await fetch('/api/auth/check-username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username })
            });

            if (response.ok) {
                const data = await response.json();

                if (!data.available) {
                    this.showFieldError('username', 'Username is already taken');
                } else if (this.validator.isValidUsername(username)) {
                    this.showFieldSuccess('username');
                }
            }

        } catch (error) {
            console.error('❌ Username check failed:', error);
            // Don't show error to user for availability check failures
        }
    }

    async checkEmailAvailability() {
        if (!this.emailInput) return;

        const email = this.emailInput.value.trim();

        if (!email || !this.validator.isValidEmail(email)) {
            return;
        }

        try {
            const response = await fetch('/api/auth/check-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email })
            });

            if (response.ok) {
                const data = await response.json();

                if (!data.available) {
                    this.showFieldError('email', 'Email is already registered');
                } else if (this.validator.isValidEmail(email)) {
                    this.showFieldSuccess('email');
                }
            }

        } catch (error) {
            console.error('❌ Email check failed:', error);
            // Don't show error to user for availability check failures
        }
    }

    updatePasswordStrength() {
        if (!this.passwordInput || !this.passwordStrengthFill || !this.passwordStrengthText) {
            return;
        }

        const password = this.passwordInput.value;

        if (!password) {
            this.passwordStrengthFill.style.width = '0%';
            this.passwordStrengthText.textContent = 'Password strength will appear here';
            this.passwordStrengthBar.className = 'password-strength-bar';
            return;
        }

        const strength = this.validator.checkPasswordStrength(password);
        const percentage = (strength.score / 5) * 100;

        this.passwordStrengthFill.style.width = `${percentage}%`;
        this.passwordStrengthText.textContent = `${this.capitalizeFirst(strength.strength)} - ${strength.feedback}`;

        // Update color classes
        this.passwordStrengthBar.className = `password-strength-bar strength-${strength.strength}`;
        this.passwordStrengthFill.className = `password-strength-fill strength-${strength.strength}`;
    }

    togglePasswordVisibility(fieldName) {
        const input = document.getElementById(fieldName);
        const toggle = document.getElementById(`${fieldName}Toggle`);

        if (!input || !toggle) return;

        const isPassword = input.type === 'password';

        if (isPassword) {
            input.type = 'text';
            toggle.textContent = '🙈';
            toggle.setAttribute('aria-label', 'Hide password');
        } else {
            input.type = 'password';
            toggle.textContent = '👁️';
            toggle.setAttribute('aria-label', 'Show password');
        }
    }

    updateRegisterButton() {
        if (!this.registerButton) return;

        const hasUsername = this.usernameInput && this.usernameInput.value.trim();
        const hasEmail = this.emailInput && this.emailInput.value.trim();
        const hasDisplayName = this.displayNameInput && this.displayNameInput.value.trim();
        const hasPassword = this.passwordInput && this.passwordInput.value.length >= 8;
        const hasConfirmPassword = this.confirmPasswordInput && this.confirmPasswordInput.value;
        const hasAgreedToTerms = this.agreeToTermsCheckbox && this.agreeToTermsCheckbox.checked;

        const allFieldsValid = hasUsername && hasEmail && hasDisplayName &&
                              hasPassword && hasConfirmPassword && hasAgreedToTerms;

        this.registerButton.disabled = !allFieldsValid || this.isLoading;
    }

    setLoadingState(loading) {
        this.isLoading = loading;

        if (this.registerButton) {
            if (loading) {
                this.registerButton.textContent = '🔄 Creating Account...';
                this.registerButton.disabled = true;
            } else {
                this.registerButton.textContent = '🚀 Create Account';
                this.updateRegisterButton();
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

    getFormData() {
        return {
            username: this.usernameInput ? this.usernameInput.value.trim() : '',
            email: this.emailInput ? this.emailInput.value.trim() : '',
            displayName: this.displayNameInput ? this.displayNameInput.value.trim() : '',
            password: this.passwordInput ? this.passwordInput.value : '',
            agreeToTerms: this.agreeToTermsCheckbox ? this.agreeToTermsCheckbox.checked : false,
            newsletterOptIn: this.newsletterOptInCheckbox ? this.newsletterOptInCheckbox.checked : false
        };
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
            inputElement.classList.remove('valid');
        }
    }

    showFieldSuccess(fieldName) {
        const errorElement = document.getElementById(`${fieldName}Error`);
        const inputElement = document.getElementById(fieldName);

        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }

        if (inputElement) {
            inputElement.classList.remove('error');
            inputElement.classList.add('valid');
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
            inputElement.classList.remove('error', 'valid');
        }
    }

    clearFormErrors() {
        ['username', 'email', 'displayName', 'password', 'confirmPassword'].forEach(fieldName => {
            this.clearFieldError(fieldName);
        });
        this.hideFormStatus();
    }

    showFormStatus(message, type = 'info') {
        if (!this.formStatus) return;

        this.formStatus.textContent = message;
        this.formStatus.className = `form-status form-status-${type}`;
        this.formStatus.style.display = 'block';

        // Auto-hide non-error messages
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

    showSuccessModal(user) {
        console.log('✅ Registration successful for user:', user.username);

        if (this.successModal) {
            this.successModal.style.display = 'flex';
        }

        // Focus the continue button
        const continueButton = document.getElementById('continueToLogin');
        if (continueButton) {
            setTimeout(() => continueButton.focus(), 100);
        }
    }

    handleRegistrationError(errorMessage) {
        console.error('❌ Registration failed:', errorMessage);

        // Check for specific error types
        if (errorMessage.toLowerCase().includes('username')) {
            this.showFieldError('username', 'Username is already taken or invalid');
        } else if (errorMessage.toLowerCase().includes('email')) {
            this.showFieldError('email', 'Email is already registered or invalid');
        } else {
            this.showFormStatus(errorMessage, 'error');
        }
    }

    handleKeyboardShortcuts(event) {
        // Enter key submits form when focused on form elements
        if (event.key === 'Enter' && this.isFormElement(event.target)) {
            event.preventDefault();
            this.handleRegistration();
        }

        // Escape key closes success modal
        if (event.key === 'Escape' && this.successModal && this.successModal.style.display !== 'none') {
            this.successModal.style.display = 'none';
        }
    }

    // Utility methods
    isFormElement(element) {
        const formTags = ['input', 'textarea', 'select', 'button'];
        return formTags.includes(element.tagName.toLowerCase());
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize the page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we have the registration form
    if (document.getElementById('registerForm')) {
        window.registrationPage = new RegistrationPage();
    }
});

// Handle browser back button
window.addEventListener('popstate', () => {
    // Refresh authentication state if user navigates back
    if (window.app) {
        window.app.checkAuthStatus();
    }
});