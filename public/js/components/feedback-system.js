/* Knowledge Foyer - Feedback System Component */
/* Handles pro/con feedback display, submission, and real-time updates */

class FeedbackSystem {
    constructor(articleId, mcpClient) {
        this.articleId = articleId;
        this.mcpClient = mcpClient;
        this.prosData = [];
        this.consData = [];

        // DOM elements
        this.prosContainer = document.getElementById('prosList');
        this.consContainer = document.getElementById('consList');
        this.prosCountElement = document.getElementById('prosCount');
        this.consCountElement = document.getElementById('consCount');

        // Add feedback forms
        this.proTextarea = document.getElementById('proTextarea');
        this.conTextarea = document.getElementById('conTextarea');
        this.submitProButton = document.getElementById('submitProButton');
        this.submitConButton = document.getElementById('submitConButton');

        this.init();
    }

    async init() {
        console.log('📝 Initializing feedback system for article:', this.articleId);

        // Setup event handlers
        this.setupEventHandlers();

        // Load existing feedback
        await this.loadFeedback();

        // Subscribe to real-time updates
        this.setupRealTimeHandlers();

        console.log('✅ Feedback system ready');
    }

    setupEventHandlers() {
        // Pro feedback submission
        if (this.proTextarea && this.submitProButton) {
            this.proTextarea.addEventListener('input', () => {
                this.validateProForm();
            });

            this.submitProButton.addEventListener('click', () => {
                this.submitProFeedback();
            });

            this.proTextarea.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.ctrlKey) {
                    event.preventDefault();
                    this.submitProFeedback();
                }
            });
        }

        // Con feedback submission
        if (this.conTextarea && this.submitConButton) {
            this.conTextarea.addEventListener('input', () => {
                this.validateConForm();
            });

            this.submitConButton.addEventListener('click', () => {
                this.submitConFeedback();
            });

            this.conTextarea.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.ctrlKey) {
                    event.preventDefault();
                    this.submitConFeedback();
                }
            });
        }
    }

    setupRealTimeHandlers() {
        if (!this.mcpClient) return;

        // Listen for feedback updates
        this.mcpClient.on('feedback_ranked', (data) => {
            if (data.article_id === this.articleId) {
                this.updateFeedbackVotes(data.feedback_id, data.votes);
            }
        });

        this.mcpClient.on('feedback_submitted', (data) => {
            if (data.article_id === this.articleId) {
                this.addNewFeedback(data);
            }
        });

        this.mcpClient.on('feedback_resolved', (data) => {
            if (data.article_id === this.articleId) {
                this.markFeedbackResolved(data.feedback_id);
            }
        });
    }

    async loadFeedback() {
        try {
            console.log('📊 Loading feedback for article:', this.articleId);

            const response = await this.mcpClient.getFeedback(this.articleId);

            if (response) {
                this.prosData = response.pros || [];
                this.consData = response.cons || [];

                this.renderFeedback();
                this.updateCounts();
            }

        } catch (error) {
            console.error('❌ Failed to load feedback:', error);
            this.renderEmptyStates();
        }
    }

    renderFeedback() {
        this.renderProFeedback();
        this.renderConFeedback();
    }

    renderProFeedback() {
        if (!this.prosContainer) return;

        if (this.prosData.length === 0) {
            this.prosContainer.innerHTML = `
                <div class="feedback-empty">
                    <div class="feedback-empty-icon">✓</div>
                    <div class="feedback-empty-title">No pros yet</div>
                    <div class="feedback-empty-description">
                        Be the first to highlight what's working well in this article.
                    </div>
                </div>
            `;
            return;
        }

        this.prosContainer.innerHTML = this.prosData
            .map(feedback => this.createFeedbackItem(feedback, 'pro'))
            .join('');
    }

    renderConFeedback() {
        if (!this.consContainer) return;

        if (this.consData.length === 0) {
            this.consContainer.innerHTML = `
                <div class="feedback-empty">
                    <div class="feedback-empty-icon">✗</div>
                    <div class="feedback-empty-title">No cons yet</div>
                    <div class="feedback-empty-description">
                        Share constructive feedback to help improve this article.
                    </div>
                </div>
            `;
            return;
        }

        this.consContainer.innerHTML = this.consData
            .map(feedback => this.createFeedbackItem(feedback, 'con'))
            .join('');
    }

    createFeedbackItem(feedback, type) {
        const isResolved = feedback.status === 'resolved';
        const votedClass = feedback.user_voted ? 'voted' : '';
        const resolvedClass = isResolved ? 'resolved' : '';

        return `
            <div class="feedback-item feedback-item-${type} ${resolvedClass}" data-feedback-id="${feedback.id}">
                ${isResolved ? '<div class="feedback-resolution-badge">Resolved</div>' : ''}

                <div class="feedback-content">
                    ${feedback.content}
                </div>

                <div class="feedback-meta">
                    <div class="feedback-author">
                        <span>@${feedback.author_username}</span>
                        <span class="feedback-date">${this.formatDate(feedback.created_at)}</span>
                    </div>
                </div>

                <div class="feedback-actions">
                    <button class="feedback-vote-button ${votedClass}"
                            data-feedback-id="${feedback.id}"
                            title="Vote this feedback as helpful">
                        👍 <span class="feedback-vote-count">${feedback.vote_count || 0}</span>
                    </button>

                    ${feedback.can_resolve ? `
                        <button class="btn btn-tertiary btn-sm"
                                onclick="window.feedbackSystem.resolveFeedback('${feedback.id}')"
                                title="Mark as addressed">
                            ✓ Resolve
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    validateProForm() {
        const content = this.proTextarea.value.trim();
        const isValid = content.length >= 10 && content.length <= 1000;
        this.submitProButton.disabled = !isValid;
    }

    validateConForm() {
        const content = this.conTextarea.value.trim();
        const isValid = content.length >= 10 && content.length <= 1000;
        this.submitConButton.disabled = !isValid;
    }

    async submitProFeedback() {
        const content = this.proTextarea.value.trim();

        if (!content || content.length < 10) {
            window.app.showNotification('Pro feedback must be at least 10 characters long', 'error');
            return;
        }

        try {
            this.setSubmittingState('pro', true);

            await this.mcpClient.submitFeedback(this.articleId, 'pro', content);

            this.proTextarea.value = '';
            this.submitProButton.disabled = true;

            window.app.showNotification('Pro feedback submitted successfully!', 'success');

            // Reload feedback to get the update
            await this.loadFeedback();

        } catch (error) {
            console.error('❌ Failed to submit pro feedback:', error);
            window.app.showNotification('Failed to submit feedback. Please try again.', 'error');

        } finally {
            this.setSubmittingState('pro', false);
        }
    }

    async submitConFeedback() {
        const content = this.conTextarea.value.trim();

        if (!content || content.length < 10) {
            window.app.showNotification('Con feedback must be at least 10 characters long', 'error');
            return;
        }

        try {
            this.setSubmittingState('con', true);

            await this.mcpClient.submitFeedback(this.articleId, 'con', content);

            this.conTextarea.value = '';
            this.submitConButton.disabled = true;

            window.app.showNotification('Con feedback submitted successfully!', 'success');

            // Reload feedback to get the update
            await this.loadFeedback();

        } catch (error) {
            console.error('❌ Failed to submit con feedback:', error);
            window.app.showNotification('Failed to submit feedback. Please try again.', 'error');

        } finally {
            this.setSubmittingState('con', false);
        }
    }

    setSubmittingState(type, isSubmitting) {
        if (type === 'pro') {
            this.submitProButton.disabled = isSubmitting;
            this.submitProButton.textContent = isSubmitting ? 'Submitting...' : 'Add Pro';
            this.proTextarea.disabled = isSubmitting;
        } else {
            this.submitConButton.disabled = isSubmitting;
            this.submitConButton.textContent = isSubmitting ? 'Submitting...' : 'Add Con';
            this.conTextarea.disabled = isSubmitting;
        }
    }

    async voteFeedback(feedbackId) {
        try {
            await this.mcpClient.voteFeedback(feedbackId, true);
            window.app.showNotification('Vote recorded!', 'success');
        } catch (error) {
            console.error('❌ Failed to vote feedback:', error);
            window.app.showNotification('Failed to vote. Please try again.', 'error');
        }
    }

    async resolveFeedback(feedbackId) {
        try {
            await this.mcpClient.callTool('resolve_feedback', {
                feedback_id: feedbackId,
                article_id: this.articleId
            });

            window.app.showNotification('Feedback marked as resolved!', 'success');
            await this.loadFeedback();

        } catch (error) {
            console.error('❌ Failed to resolve feedback:', error);
            window.app.showNotification('Failed to resolve feedback. Please try again.', 'error');
        }
    }

    updateFeedbackVotes(feedbackId, newVoteCount) {
        const feedbackElement = document.querySelector(`[data-feedback-id="${feedbackId}"]`);
        if (feedbackElement) {
            const voteCountElement = feedbackElement.querySelector('.feedback-vote-count');
            if (voteCountElement) {
                voteCountElement.textContent = newVoteCount;
            }
        }
    }

    addNewFeedback(feedbackData) {
        if (feedbackData.type === 'pro') {
            this.prosData.unshift(feedbackData);
            this.renderProFeedback();
        } else {
            this.consData.unshift(feedbackData);
            this.renderConFeedback();
        }

        this.updateCounts();
        window.app.showNotification('New feedback received!', 'info');
    }

    markFeedbackResolved(feedbackId) {
        // Update local data
        this.prosData = this.prosData.map(feedback =>
            feedback.id === feedbackId ? { ...feedback, status: 'resolved' } : feedback
        );
        this.consData = this.consData.map(feedback =>
            feedback.id === feedbackId ? { ...feedback, status: 'resolved' } : feedback
        );

        // Re-render
        this.renderFeedback();
    }

    updateCounts() {
        const prosCount = this.prosData.filter(f => f.status !== 'resolved').length;
        const consCount = this.consData.filter(f => f.status !== 'resolved').length;

        if (this.prosCountElement) {
            this.prosCountElement.textContent = prosCount;
        }

        if (this.consCountElement) {
            this.consCountElement.textContent = consCount;

            // Add attention class if con count is high
            if (consCount > 5) {
                this.consCountElement.classList.add('high');
            } else {
                this.consCountElement.classList.remove('high');
            }
        }

        // Update summary (for mobile)
        const summaryProsElement = document.getElementById('summaryProsCount');
        const summaryConsElement = document.getElementById('summaryConsCount');

        if (summaryProsElement) summaryProsElement.textContent = prosCount;
        if (summaryConsElement) summaryConsElement.textContent = consCount;
    }

    renderEmptyStates() {
        this.prosData = [];
        this.consData = [];
        this.renderFeedback();
        this.updateCounts();
    }

    formatDate(dateString) {
        if (!dateString) return '';

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
        return date.toLocaleDateString();
    }

    // Public methods for external use
    refresh() {
        return this.loadFeedback();
    }

    getFeedbackCounts() {
        return {
            pros: this.prosData.filter(f => f.status !== 'resolved').length,
            cons: this.consData.filter(f => f.status !== 'resolved').length
        };
    }

    destroy() {
        // Cleanup event handlers if needed
        if (this.mcpClient) {
            this.mcpClient.off('feedback_ranked');
            this.mcpClient.off('feedback_submitted');
            this.mcpClient.off('feedback_resolved');
        }
    }
}

// Global click handler for vote buttons (since they're dynamically created)
document.addEventListener('click', (event) => {
    if (event.target.matches('.feedback-vote-button') ||
        event.target.closest('.feedback-vote-button')) {

        const button = event.target.closest('.feedback-vote-button');
        const feedbackId = button.dataset.feedbackId;

        if (window.feedbackSystem && feedbackId) {
            window.feedbackSystem.voteFeedback(feedbackId);
        }
    }
});

// Export for use in other modules
window.FeedbackSystem = FeedbackSystem;