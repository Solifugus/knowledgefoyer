/**
 * Modal Component for Knowledge Foyer
 *
 * A reusable modal system with support for authentication forms,
 * confirmation dialogs, and custom content.
 */

class Modal {
  constructor() {
    this.container = null;
    this.activeModal = null;
    this.isOpen = false;
    this.openModals = [];

    this.init();
  }

  /**
   * Initialize the modal system
   */
  init() {
    console.log('🎭 Initializing Modal system...');

    // Find or create modal container
    this.container = document.getElementById('modal-container');
    if (!this.container) {
      this.container = this.createModalContainer();
    }

    // Set up global event listeners
    this.setupEventListeners();

    console.log('✅ Modal system ready');
  }

  /**
   * Create modal container if it doesn't exist
   */
  createModalContainer() {
    const container = document.createElement('div');
    container.id = 'modal-container';
    container.className = 'modal-container';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
    return container;
  }

  /**
   * Set up global event listeners for modal system
   */
  setupEventListeners() {
    // Close modal on backdrop click
    document.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-backdrop')) {
        this.closeTopModal();
      }
    });

    // Close modal on escape key
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        this.closeTopModal();
      }
    });

    // Handle form submissions in modals
    this.container.addEventListener('submit', (event) => {
      const form = event.target.closest('.modal-form');
      if (form) {
        event.preventDefault();
        this.handleFormSubmission(form);
      }
    });

    // Handle button clicks in modals
    this.container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-modal-action]');
      if (button) {
        const action = button.getAttribute('data-modal-action');
        this.handleModalAction(action, button);
      }
    });
  }

  /**
   * Show login modal
   */
  showLogin() {
    const content = this.createLoginForm();
    return this.open('login', 'Sign In to Knowledge Foyer', content, {
      size: 'medium',
      closable: true
    });
  }

  /**
   * Show registration modal
   */
  showRegister() {
    const content = this.createRegistrationForm();
    return this.open('register', 'Join Knowledge Foyer', content, {
      size: 'medium',
      closable: true
    });
  }

  /**
   * Show confirmation dialog
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {Object} options - Dialog options
   */
  showConfirmation(title, message, options = {}) {
    const {
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmStyle = 'primary',
      onConfirm = () => {},
      onCancel = () => {}
    } = options;

    const content = `
      <div class="confirmation-dialog">
        <div class="confirmation-message">
          ${message}
        </div>
        <div class="confirmation-actions">
          <button type="button"
                  class="btn btn-secondary"
                  data-modal-action="cancel">
            ${cancelText}
          </button>
          <button type="button"
                  class="btn btn-${confirmStyle}"
                  data-modal-action="confirm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    return this.open('confirmation', title, content, {
      size: 'small',
      closable: true,
      actions: { onConfirm, onCancel }
    });
  }

  /**
   * Show custom content modal
   * @param {string} id - Modal ID
   * @param {string} title - Modal title
   * @param {string} content - HTML content
   * @param {Object} options - Modal options
   */
  open(id, title, content, options = {}) {
    const {
      size = 'medium',
      closable = true,
      actions = {},
      className = ''
    } = options;

    // Close any existing modal with the same ID
    this.close(id);

    // Create modal HTML
    const modalHTML = `
      <div class="modal-backdrop" data-modal-id="${id}">
        <div class="modal modal-${size} ${className}"
             role="dialog"
             aria-modal="true"
             aria-labelledby="modal-title-${id}">

          <div class="modal-header">
            <h2 class="modal-title" id="modal-title-${id}">${title}</h2>
            ${closable ? `
              <button type="button"
                      class="modal-close"
                      data-modal-action="close"
                      aria-label="Close modal">
                <span aria-hidden="true">&times;</span>
              </button>
            ` : ''}
          </div>

          <div class="modal-body">
            ${content}
          </div>
        </div>
      </div>
    `;

    // Create modal element
    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHTML;
    const modalBackdrop = modalElement.firstElementChild;

    // Store modal data
    const modalData = {
      id,
      element: modalBackdrop,
      options,
      actions
    };

    // Add to container and track
    this.container.appendChild(modalBackdrop);
    this.openModals.push(modalData);

    // Update state
    this.isOpen = true;
    this.activeModal = modalData;
    this.container.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // Focus management
    this.focusModal(modalBackdrop);

    // Animation
    requestAnimationFrame(() => {
      modalBackdrop.classList.add('modal-open');
    });

    return modalData;
  }

  /**
   * Close specific modal by ID
   * @param {string} id - Modal ID to close
   */
  close(id) {
    const modalIndex = this.openModals.findIndex(modal => modal.id === id);
    if (modalIndex === -1) return;

    const modal = this.openModals[modalIndex];
    this.closeModal(modal);
    this.openModals.splice(modalIndex, 1);

    // Update state
    if (this.openModals.length === 0) {
      this.isOpen = false;
      this.activeModal = null;
      this.container.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    } else {
      this.activeModal = this.openModals[this.openModals.length - 1];
    }
  }

  /**
   * Close the top modal
   */
  closeTopModal() {
    if (this.activeModal) {
      this.close(this.activeModal.id);
    }
  }

  /**
   * Close all modals
   */
  closeAll() {
    [...this.openModals].forEach(modal => {
      this.close(modal.id);
    });
  }

  /**
   * Close modal with animation
   * @param {Object} modal - Modal data object
   */
  closeModal(modal) {
    modal.element.classList.remove('modal-open');

    setTimeout(() => {
      if (modal.element.parentNode) {
        modal.element.parentNode.removeChild(modal.element);
      }
    }, 300); // Match CSS animation duration
  }

  /**
   * Handle modal actions
   * @param {string} action - Action name
   * @param {HTMLElement} button - Button element
   */
  handleModalAction(action, button) {
    const modalBackdrop = button.closest('.modal-backdrop');
    const modalId = modalBackdrop?.getAttribute('data-modal-id');
    const modal = this.openModals.find(m => m.id === modalId);

    switch (action) {
      case 'close':
        this.close(modalId);
        break;

      case 'confirm':
        if (modal?.actions?.onConfirm) {
          modal.actions.onConfirm();
        }
        this.close(modalId);
        break;

      case 'cancel':
        if (modal?.actions?.onCancel) {
          modal.actions.onCancel();
        }
        this.close(modalId);
        break;

      case 'switch-to-login':
        this.close('register');
        this.showLogin();
        break;

      case 'switch-to-register':
        this.close('login');
        this.showRegister();
        break;

      default:
        console.warn('Unknown modal action:', action);
    }
  }

  /**
   * Handle form submissions in modals
   * @param {HTMLFormElement} form - Form element
   */
  async handleFormSubmission(form) {
    const formType = form.getAttribute('data-form-type');
    const submitButton = form.querySelector('[type="submit"]');
    const originalText = submitButton.textContent;

    // Show loading state
    submitButton.textContent = 'Loading...';
    submitButton.disabled = true;

    try {
      switch (formType) {
        case 'login':
          await this.handleLoginForm(form);
          break;

        case 'register':
          await this.handleRegistrationForm(form);
          break;

        default:
          console.warn('Unknown form type:', formType);
      }
    } catch (error) {
      console.error('Form submission error:', error);
      this.showFormError(form, error.message || 'An error occurred. Please try again.');
    } finally {
      // Reset button state
      submitButton.textContent = originalText;
      submitButton.disabled = false;
    }
  }

  /**
   * Handle login form submission
   * @param {HTMLFormElement} form - Login form
   */
  async handleLoginForm(form) {
    const formData = new FormData(form);
    const loginData = {
      email: formData.get('email'),
      password: formData.get('password'),
      remember: formData.get('remember') === 'on'
    };

    // Clear previous errors
    this.clearFormErrors(form);

    // Validate form
    const errors = this.validateLoginForm(loginData);
    if (errors.length > 0) {
      this.showFormErrors(form, errors);
      return;
    }

    try {
      // Make API request
      const spa = window.spa;
      const response = await spa.apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginData)
      });

      if (response.ok) {
        const userData = await response.json();

        // Update authentication state
        spa.auth.login(userData);

        // Show success message
        this.showNotification('Welcome back! You have been signed in successfully.', 'success');

        // Close modal
        this.close('login');

        // Navigate to appropriate page
        if (window.location.hash === '#/login') {
          spa.router.navigate('/dashboard');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle registration form submission
   * @param {HTMLFormElement} form - Registration form
   */
  async handleRegistrationForm(form) {
    const formData = new FormData(form);
    const registrationData = {
      username: formData.get('username'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
      displayName: formData.get('displayName'),
      acceptTerms: formData.get('acceptTerms') === 'on'
    };

    // Clear previous errors
    this.clearFormErrors(form);

    // Validate form
    const errors = this.validateRegistrationForm(registrationData);
    if (errors.length > 0) {
      this.showFormErrors(form, errors);
      return;
    }

    try {
      // Make API request
      const spa = window.spa;
      const response = await spa.apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registrationData)
      });

      if (response.ok) {
        const userData = await response.json();

        // Show success message
        this.showNotification('Account created successfully! Please check your email to verify your account.', 'success');

        // Close modal and show login
        this.close('register');

        // Auto-login if the API returns user data, otherwise show login
        if (userData.user) {
          spa.auth.login(userData.user);
          spa.router.navigate('/dashboard');
        } else {
          setTimeout(() => this.showLogin(), 500);
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate login form data
   * @param {Object} data - Login form data
   * @returns {Array} - Array of error messages
   */
  validateLoginForm(data) {
    const errors = [];

    if (!data.email || !data.email.trim()) {
      errors.push({ field: 'email', message: 'Email is required' });
    } else if (!this.isValidEmail(data.email)) {
      errors.push({ field: 'email', message: 'Please enter a valid email address' });
    }

    if (!data.password || !data.password.trim()) {
      errors.push({ field: 'password', message: 'Password is required' });
    }

    return errors;
  }

  /**
   * Validate registration form data
   * @param {Object} data - Registration form data
   * @returns {Array} - Array of error messages
   */
  validateRegistrationForm(data) {
    const errors = [];

    // Username validation
    if (!data.username || !data.username.trim()) {
      errors.push({ field: 'username', message: 'Username is required' });
    } else if (data.username.length < 3) {
      errors.push({ field: 'username', message: 'Username must be at least 3 characters' });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) {
      errors.push({ field: 'username', message: 'Username can only contain letters, numbers, hyphens, and underscores' });
    }

    // Email validation
    if (!data.email || !data.email.trim()) {
      errors.push({ field: 'email', message: 'Email is required' });
    } else if (!this.isValidEmail(data.email)) {
      errors.push({ field: 'email', message: 'Please enter a valid email address' });
    }

    // Password validation
    if (!data.password || !data.password.trim()) {
      errors.push({ field: 'password', message: 'Password is required' });
    } else if (data.password.length < 8) {
      errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
    }

    // Confirm password validation
    if (!data.confirmPassword || !data.confirmPassword.trim()) {
      errors.push({ field: 'confirmPassword', message: 'Please confirm your password' });
    } else if (data.password !== data.confirmPassword) {
      errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
    }

    // Display name validation
    if (!data.displayName || !data.displayName.trim()) {
      errors.push({ field: 'displayName', message: 'Display name is required' });
    }

    // Terms acceptance validation
    if (!data.acceptTerms) {
      errors.push({ field: 'acceptTerms', message: 'You must accept the terms of service' });
    }

    return errors;
  }

  /**
   * Check if email is valid
   * @param {string} email - Email to validate
   * @returns {boolean} - True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Show form errors
   * @param {HTMLFormElement} form - Form element
   * @param {Array} errors - Array of error objects
   */
  showFormErrors(form, errors) {
    errors.forEach(error => {
      const field = form.querySelector(`[name="${error.field}"]`);
      if (field) {
        const fieldGroup = field.closest('.form-group');
        if (fieldGroup) {
          fieldGroup.classList.add('has-error');

          // Remove existing error message
          const existingError = fieldGroup.querySelector('.form-error');
          if (existingError) {
            existingError.remove();
          }

          // Add new error message
          const errorElement = document.createElement('div');
          errorElement.className = 'form-error';
          errorElement.textContent = error.message;
          fieldGroup.appendChild(errorElement);
        }
      }
    });
  }

  /**
   * Show general form error
   * @param {HTMLFormElement} form - Form element
   * @param {string} message - Error message
   */
  showFormError(form, message) {
    let errorContainer = form.querySelector('.form-general-error');

    if (!errorContainer) {
      errorContainer = document.createElement('div');
      errorContainer.className = 'form-general-error';
      form.insertBefore(errorContainer, form.firstChild);
    }

    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
  }

  /**
   * Clear form errors
   * @param {HTMLFormElement} form - Form element
   */
  clearFormErrors(form) {
    // Clear field errors
    form.querySelectorAll('.form-group.has-error').forEach(group => {
      group.classList.remove('has-error');
    });

    form.querySelectorAll('.form-error').forEach(error => {
      error.remove();
    });

    // Clear general error
    const generalError = form.querySelector('.form-general-error');
    if (generalError) {
      generalError.style.display = 'none';
    }
  }

  /**
   * Focus management for accessibility
   * @param {HTMLElement} modal - Modal element
   */
  focusModal(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }

  /**
   * Show notification (delegated to SPA manager)
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   */
  showNotification(message, type) {
    if (window.spa?.showNotification) {
      window.spa.showNotification(message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * Create login form HTML
   * @returns {string} - Login form HTML
   */
  createLoginForm() {
    return `
      <form class="modal-form" data-form-type="login">
        <div class="form-general-error" style="display: none;"></div>

        <div class="form-group">
          <label for="login-email" class="form-label">Email Address</label>
          <input type="email"
                 id="login-email"
                 name="email"
                 class="form-input"
                 placeholder="your.email@example.com"
                 required
                 autocomplete="email">
        </div>

        <div class="form-group">
          <label for="login-password" class="form-label">Password</label>
          <input type="password"
                 id="login-password"
                 name="password"
                 class="form-input"
                 placeholder="Enter your password"
                 required
                 autocomplete="current-password">
        </div>

        <div class="form-group form-checkbox">
          <label class="checkbox-label">
            <input type="checkbox" name="remember" class="checkbox-input">
            <span class="checkbox-mark"></span>
            <span class="checkbox-text">Remember me for 30 days</span>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-full">
            Sign In
          </button>
        </div>

        <div class="form-footer">
          <p class="form-switch">
            Don't have an account?
            <button type="button"
                    class="btn-link"
                    data-modal-action="switch-to-register">
              Create one here
            </button>
          </p>

          <p class="form-switch">
            <button type="button" class="btn-link">
              Forgot your password?
            </button>
          </p>
        </div>
      </form>
    `;
  }

  /**
   * Create registration form HTML
   * @returns {string} - Registration form HTML
   */
  createRegistrationForm() {
    return `
      <form class="modal-form" data-form-type="register">
        <div class="form-general-error" style="display: none;"></div>

        <div class="form-row">
          <div class="form-group">
            <label for="register-username" class="form-label">Username</label>
            <input type="text"
                   id="register-username"
                   name="username"
                   class="form-input"
                   placeholder="yourUsername"
                   required
                   autocomplete="username">
          </div>

          <div class="form-group">
            <label for="register-display-name" class="form-label">Display Name</label>
            <input type="text"
                   id="register-display-name"
                   name="displayName"
                   class="form-input"
                   placeholder="Your Name"
                   required
                   autocomplete="name">
          </div>
        </div>

        <div class="form-group">
          <label for="register-email" class="form-label">Email Address</label>
          <input type="email"
                 id="register-email"
                 name="email"
                 class="form-input"
                 placeholder="your.email@example.com"
                 required
                 autocomplete="email">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="register-password" class="form-label">Password</label>
            <input type="password"
                   id="register-password"
                   name="password"
                   class="form-input"
                   placeholder="Create a password"
                   required
                   autocomplete="new-password"
                   minlength="8">
          </div>

          <div class="form-group">
            <label for="register-confirm-password" class="form-label">Confirm Password</label>
            <input type="password"
                   id="register-confirm-password"
                   name="confirmPassword"
                   class="form-input"
                   placeholder="Confirm password"
                   required
                   autocomplete="new-password">
          </div>
        </div>

        <div class="form-group form-checkbox">
          <label class="checkbox-label">
            <input type="checkbox" name="acceptTerms" class="checkbox-input" required>
            <span class="checkbox-mark"></span>
            <span class="checkbox-text">
              I agree to the <a href="#" class="btn-link">Terms of Service</a>
              and <a href="#" class="btn-link">Privacy Policy</a>
            </span>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-full">
            Create Account
          </button>
        </div>

        <div class="form-footer">
          <p class="form-switch">
            Already have an account?
            <button type="button"
                    class="btn-link"
                    data-modal-action="switch-to-login">
              Sign in here
            </button>
          </p>
        </div>
      </form>
    `;
  }

  /**
   * Destroy modal system and clean up
   */
  destroy() {
    this.closeAll();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    console.log('🧹 Modal system destroyed');
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.Modal = Modal;
}