/* Knowledge Foyer - Form Validation Utilities */
/* Client-side validation helpers and form utilities */

class FormValidator {
    constructor() {
        this.rules = {
            username: {
                required: true,
                minLength: 3,
                maxLength: 30,
                pattern: /^[a-zA-Z0-9_]+$/,
                message: 'Username must be 3-30 characters, letters, numbers, and underscores only'
            },
            email: {
                required: true,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address'
            },
            password: {
                required: true,
                minLength: 8,
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                message: 'Password must be at least 8 characters with uppercase, lowercase, number, and symbol'
            },
            displayName: {
                required: true,
                minLength: 2,
                maxLength: 100,
                message: 'Display name must be 2-100 characters'
            }
        };
    }

    validateField(fieldName, value, confirmValue = null) {
        const rule = this.rules[fieldName];

        if (!rule) {
            return { isValid: true };
        }

        // Required check
        if (rule.required && (!value || value.trim().length === 0)) {
            return {
                isValid: false,
                message: `${this.capitalize(fieldName)} is required`
            };
        }

        // Skip other validations if field is empty and not required
        if (!value || value.trim().length === 0) {
            return { isValid: true };
        }

        // Length checks
        if (rule.minLength && value.length < rule.minLength) {
            return {
                isValid: false,
                message: `${this.capitalize(fieldName)} must be at least ${rule.minLength} characters`
            };
        }

        if (rule.maxLength && value.length > rule.maxLength) {
            return {
                isValid: false,
                message: `${this.capitalize(fieldName)} must be no more than ${rule.maxLength} characters`
            };
        }

        // Pattern check
        if (rule.pattern && !rule.pattern.test(value)) {
            return {
                isValid: false,
                message: rule.message || `${this.capitalize(fieldName)} format is invalid`
            };
        }

        // Special case: password confirmation
        if (fieldName === 'confirmPassword' && confirmValue !== null) {
            if (value !== confirmValue) {
                return {
                    isValid: false,
                    message: 'Passwords do not match'
                };
            }
        }

        return { isValid: true };
    }

    validateForm(formData) {
        const errors = {};
        let isValid = true;

        // Validate each field
        Object.keys(this.rules).forEach(fieldName => {
            const value = formData[fieldName];
            const result = this.validateField(fieldName, value);

            if (!result.isValid) {
                errors[fieldName] = result.message;
                isValid = false;
            }
        });

        // Special validation for password confirmation
        if (formData.confirmPassword) {
            const confirmResult = this.validateField(
                'confirmPassword',
                formData.confirmPassword,
                formData.password
            );

            if (!confirmResult.isValid) {
                errors.confirmPassword = confirmResult.message;
                isValid = false;
            }
        }

        return {
            isValid,
            errors
        };
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Real-time validation for better UX
    setupRealTimeValidation(form) {
        const inputs = form.querySelectorAll('input[data-validate]');

        inputs.forEach(input => {
            let timeoutId;

            // Validate on input with debounce
            input.addEventListener('input', () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    this.validateInputField(input);
                }, 300);
            });

            // Validate on blur immediately
            input.addEventListener('blur', () => {
                clearTimeout(timeoutId);
                this.validateInputField(input);
            });
        });
    }

    validateInputField(input) {
        const fieldName = input.getAttribute('data-validate') || input.name;
        const value = input.value;
        let confirmValue = null;

        // Get confirm value for password confirmation
        if (fieldName === 'confirmPassword') {
            const passwordInput = input.form.querySelector('input[name="password"]');
            confirmValue = passwordInput ? passwordInput.value : null;
        }

        const result = this.validateField(fieldName, value, confirmValue);
        this.showFieldValidation(input, result);

        return result.isValid;
    }

    showFieldValidation(input, result) {
        const messageContainer = document.getElementById(`${input.name}-message`);

        if (!messageContainer) return;

        if (result.isValid) {
            input.classList.remove('error');
            input.classList.add('success');
            messageContainer.textContent = '';
            messageContainer.className = 'form-message';
        } else {
            input.classList.remove('success');
            input.classList.add('error');
            messageContainer.textContent = result.message;
            messageContainer.className = 'form-message error';
        }
    }

    clearFieldValidation(input) {
        const messageContainer = document.getElementById(`${input.name}-message`);

        input.classList.remove('error', 'success');

        if (messageContainer) {
            messageContainer.textContent = '';
            messageContainer.className = 'form-message';
        }
    }

    // Password strength indicator
    checkPasswordStrength(password) {
        let score = 0;
        let feedback = [];

        if (password.length >= 8) score += 1;
        else feedback.push('at least 8 characters');

        if (/[a-z]/.test(password)) score += 1;
        else feedback.push('lowercase letter');

        if (/[A-Z]/.test(password)) score += 1;
        else feedback.push('uppercase letter');

        if (/\d/.test(password)) score += 1;
        else feedback.push('number');

        if (/[@$!%*?&]/.test(password)) score += 1;
        else feedback.push('special character');

        let strength;
        if (score < 2) strength = 'weak';
        else if (score < 4) strength = 'medium';
        else strength = 'strong';

        return {
            score,
            strength,
            feedback: feedback.length > 0 ? `Add ${feedback.join(', ')}` : 'Strong password!'
        };
    }

    // Email format validation
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Username validation
    isValidUsername(username) {
        return /^[a-zA-Z0-9_]{3,30}$/.test(username);
    }

    // Sanitize input to prevent XSS
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;

        return input
            .trim()
            .replace(/[<>]/g, '') // Remove angle brackets
            .slice(0, 1000); // Limit length
    }

    // Extract form data safely
    getFormData(form) {
        const formData = new FormData(form);
        const data = {};

        for (const [key, value] of formData.entries()) {
            data[key] = this.sanitizeInput(value);
        }

        return data;
    }
}

// Export for use in other modules
window.FormValidator = FormValidator;