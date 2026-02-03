/* Knowledge Foyer - Registration Page JavaScript */
/* Handles registration form validation and submission */

class RegistrationPage {
    constructor() {
        this.form = null;
        this.validator = new FormValidator();
        this.submitButton = null;
        this.isSubmitting = false;

        this.init();
    }

    init() {
        console.log('📝 Registration page initializing...');

        this.form = document.getElementById('registerForm');
        this.submitButton = document.getElementById('submitButton');

        if (this.form) {
            this.setupFormValidation();
            this.setupFormSubmission();
            this.setupPasswordStrength();
            this.setupUsernameAvailabilityCheck();
        }

        console.log('✅ Registration page ready');
    }

    setupFormValidation() {
        // Add data-validate attributes for real-time validation
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach(input => {
            input.setAttribute('data-validate', input.name);
        });

        // Setup real-time validation
        this.validator.setupRealTimeValidation(this.form);

        // Validate form on input changes
        this.form.addEventListener('input', (event) => {
            this.validateFormState();
        });

        // Validate on blur
        this.form.addEventListener('blur', (event) => {
            if (event.target.matches('input')) {
                this.validator.validateInputField(event.target);
            }
        }, true);
    }

    setupFormSubmission() {
        this.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleFormSubmit();
        });
    }

    setupPasswordStrength() {
        const passwordInput = document.getElementById('password');
        const passwordHelp = document.getElementById('password-help');

        if (passwordInput && passwordHelp) {
            passwordInput.addEventListener('input', () => {
                const password = passwordInput.value;

                if (password.length > 0) {
                    const strength = this.validator.checkPasswordStrength(password);
                    this.updatePasswordStrengthIndicator(passwordHelp, strength);
                } else {
                    passwordHelp.textContent = 'At least 8 characters with a mix of letters, numbers, and symbols';
                    passwordHelp.className = 'form-message info';
                }
            });
        }
    }

    updatePasswordStrengthIndicator(element, strength) {
        element.textContent = strength.feedback;

        // Update class based on strength
        element.className = 'form-message';

        if (strength.strength === 'weak') {
            element.classList.add('error');
        } else if (strength.strength === 'medium') {
            element.classList.add('warning');
        } else {
            element.classList.add('success');
        }
    }

    setupUsernameAvailabilityCheck() {
        const usernameInput = document.getElementById('username');
        let checkTimeout;

        if (usernameInput) {
            usernameInput.addEventListener('input', () => {
                clearTimeout(checkTimeout);

                // Only check if username looks valid
                if (this.validator.isValidUsername(usernameInput.value)) {
                    checkTimeout = setTimeout(() => {
                        this.checkUsernameAvailability(usernameInput.value);
                    }, 500);
                }
            });
        }
    }

    async checkUsernameAvailability(username) {
        try {
            const response = await window.app.apiRequest(`/api/auth/check-username?username=${encodeURIComponent(username)}`);

            if (response && response.ok) {
                const data = await response.json();
                const usernameInput = document.getElementById('username');
                const messageContainer = document.getElementById('username-message');

                if (data.available) {
                    if (messageContainer) {
                        messageContainer.textContent = '✓ Username available';
                        messageContainer.className = 'form-message success';
                    }
                    usernameInput.classList.remove('error');
                    usernameInput.classList.add('success');
                } else {
                    if (messageContainer) {
                        messageContainer.textContent = 'Username already taken';
                        messageContainer.className = 'form-message error';
                    }
                    usernameInput.classList.remove('success');
                    usernameInput.classList.add('error');
                }
            }
        } catch (error) {
            console.error('Username availability check failed:', error);
        }
    }

    validateFormState() {
        const formData = this.validator.getFormData(this.form);
        const validation = this.validator.validateForm(formData);

        // Update submit button state
        if (this.submitButton) {
            this.submitButton.disabled = !validation.isValid || this.isSubmitting;
        }

        return validation.isValid;
    }

    async handleFormSubmit() {
        if (this.isSubmitting) return;

        // Clear previous messages
        this.clearMessages();

        // Get and validate form data
        const formData = this.validator.getFormData(this.form);
        const validation = this.validator.validateForm(formData);

        if (!validation.isValid) {
            this.showErrors(validation.errors);
            return;
        }

        // Show loading state
        this.setSubmittingState(true);

        try {
            const response = await window.app.apiRequest('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            if (response && response.ok) {
                const result = await response.json();
                this.showSuccess('Registration successful! Please check your email to verify your account.');

                // Reset form
                this.form.reset();
                this.clearAllValidationStates();

                // Optionally redirect after a delay
                setTimeout(() => {
                    window.location.href = '/login?registered=true';
                }, 3000);

            } else {
                const error = await response.json();
                this.showError(error.message || 'Registration failed. Please try again.');
            }

        } catch (error) {
            console.error('Registration error:', error);
            this.showError('Network error. Please check your connection and try again.');

        } finally {
            this.setSubmittingState(false);
        }
    }

    setSubmittingState(isSubmitting) {
        this.isSubmitting = isSubmitting;

        if (this.submitButton) {
            this.submitButton.disabled = isSubmitting;

            if (isSubmitting) {
                this.submitButton.classList.add('loading');
                this.submitButton.textContent = 'Creating Account...';
            } else {
                this.submitButton.classList.remove('loading');
                this.submitButton.textContent = 'Create Account';
            }
        }

        // Disable form inputs during submission
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach(input => {
            input.disabled = isSubmitting;
        });
    }

    showSuccess(message) {
        const successElement = document.getElementById('success-message');
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
            successElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    showError(message) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    showErrors(errors) {
        // Show field-specific errors
        Object.keys(errors).forEach(fieldName => {
            const input = this.form.querySelector(`[name="${fieldName}"]`);
            if (input) {
                input.classList.add('error');
                const messageContainer = document.getElementById(`${fieldName}-message`);
                if (messageContainer) {
                    messageContainer.textContent = errors[fieldName];
                    messageContainer.className = 'form-message error';
                }
            }
        });

        // Show general error
        this.showError('Please fix the errors above and try again.');
    }

    clearMessages() {
        const errorElement = document.getElementById('error-message');
        const successElement = document.getElementById('success-message');

        if (errorElement) {
            errorElement.style.display = 'none';
            errorElement.textContent = '';
        }

        if (successElement) {
            successElement.style.display = 'none';
            successElement.textContent = '';
        }
    }

    clearAllValidationStates() {
        const inputs = this.form.querySelectorAll('input');
        inputs.forEach(input => {
            this.validator.clearFieldValidation(input);
        });
    }
}

// Initialize registration page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for app and validator to initialize
    const checkDependencies = () => {
        if (window.app && window.FormValidator) {
            window.registrationPage = new RegistrationPage();
        } else {
            setTimeout(checkDependencies, 10);
        }
    };
    checkDependencies();
});