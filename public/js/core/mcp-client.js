/* Knowledge Foyer - MCP WebSocket Client */
/* Real-time communication with backend MCP server */

class MCPClient {
    constructor() {
        this.ws = null;
        this.connectionState = 'disconnected'; // disconnected, connecting, connected
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.eventHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.heartbeatInterval = null;
    }

    async connect() {
        if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
            console.log('🔌 MCP Client already connecting or connected');
            return;
        }

        console.log('🔌 Connecting to MCP server...');
        this.connectionState = 'connecting';

        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                throw new Error('No authentication token available');
            }

            // Get WebSocket port from backend
            const wsPort = await this.getWebSocketPort();
            const wsUrl = `ws://${window.location.hostname}:${wsPort}?token=${token}`;

            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();

            return new Promise((resolve, reject) => {
                this.ws.onopen = () => {
                    console.log('✅ MCP WebSocket connected');
                    this.connectionState = 'connected';
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    this.emit('connected');
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('❌ MCP WebSocket error:', error);
                    this.connectionState = 'disconnected';
                    reject(error);
                };

                // Timeout for connection
                setTimeout(() => {
                    if (this.connectionState === 'connecting') {
                        this.ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
            });

        } catch (error) {
            console.error('❌ MCP connection failed:', error);
            this.connectionState = 'disconnected';
            throw error;
        }
    }

    async getWebSocketPort() {
        try {
            const response = await fetch('/api/websocket-config');
            if (response.ok) {
                const config = await response.json();
                return config.port || 3001;
            }
        } catch (error) {
            console.warn('Could not get WebSocket port, using default 3001');
        }
        return 3001;
    }

    setupEventHandlers() {
        if (!this.ws) return;

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('❌ Failed to parse WebSocket message:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('🔌 MCP WebSocket disconnected:', event.code, event.reason);
            this.connectionState = 'disconnected';
            this.stopHeartbeat();
            this.emit('disconnected', { code: event.code, reason: event.reason });

            // Auto-reconnect unless explicitly closed
            if (event.code !== 1000) {
                this.scheduleReconnect();
            }
        };
    }

    handleMessage(message) {
        console.log('📨 MCP message received:', message.type);

        switch (message.type) {
            case 'welcome':
                this.handleWelcome(message);
                break;

            case 'tool_response':
                this.handleToolResponse(message);
                break;

            case 'event':
                this.handleEvent(message);
                break;

            case 'error':
                this.handleError(message);
                break;

            case 'pong':
                // Heartbeat response
                break;

            default:
                console.warn('❓ Unknown MCP message type:', message.type);
        }
    }

    handleWelcome(message) {
        console.log('🎉 MCP Welcome:', message);
        this.emit('welcome', message);
    }

    handleToolResponse(message) {
        const requestHandler = this.pendingRequests.get(message.request_id);

        if (requestHandler) {
            this.pendingRequests.delete(message.request_id);

            if (message.success) {
                requestHandler.resolve(message.data);
            } else {
                requestHandler.reject(new Error(message.error || 'Tool call failed'));
            }
        } else {
            console.warn('❓ Received response for unknown request:', message.request_id);
        }
    }

    handleEvent(message) {
        console.log('📡 Real-time event:', message.event, message.data);
        this.emit(message.event, message.data);
    }

    handleError(message) {
        console.error('❌ MCP Server error:', message.error);
        this.emit('error', new Error(message.error));
    }

    async callTool(toolName, parameters = {}) {
        if (this.connectionState !== 'connected') {
            throw new Error('MCP client not connected');
        }

        const requestId = `req_${++this.requestId}`;

        const request = {
            type: 'tool_call',
            tool: toolName,
            request_id: requestId,
            args: parameters
        };

        return new Promise((resolve, reject) => {
            // Store the request handler
            this.pendingRequests.set(requestId, { resolve, reject });

            // Set timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Tool call timeout: ${toolName}`));
            }, 30000);

            // Override resolve/reject to clear timeout
            const originalResolve = resolve;
            const originalReject = reject;

            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    originalResolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    originalReject(error);
                }
            });

            // Send the request
            this.ws.send(JSON.stringify(request));
            console.log('📤 MCP tool call:', toolName, parameters);
        });
    }

    // Event emitter functionality
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error('❌ Event handler error:', error);
            }
        });
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.connectionState === 'connected') {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // Ping every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.emit('max_reconnect_attempts');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                console.error('❌ Reconnection failed:', error);
            }
        }, delay);
    }

    disconnect() {
        console.log('🔌 Disconnecting MCP client');

        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close(1000, 'Client disconnecting');
            this.ws = null;
        }

        this.connectionState = 'disconnected';
        this.pendingRequests.clear();
    }

    // Convenience methods for common operations
    async getArticle(articleId) {
        return await this.callTool('get_article', { article_id: articleId });
    }

    async updateArticle(articleId, data) {
        return await this.callTool('update_article', { article_id: articleId, ...data });
    }

    async getFeedback(articleId) {
        return await this.callTool('get_feedback_rankings', { article_id: articleId });
    }

    async submitFeedback(articleId, type, content) {
        return await this.callTool('submit_feedback', {
            article_id: articleId,
            type: type,
            content: content
        });
    }

    async voteFeedback(feedbackId, vote) {
        return await this.callTool('rank_feedback', {
            feedback_id: feedbackId,
            positive_utility: vote
        });
    }

    // Search and discovery methods
    async searchContent(searchParams) {
        // Mock search implementation - would use MCP search tool in production
        return new Promise((resolve) => {
            setTimeout(() => {
                const mockResults = this.generateMockSearchResults(searchParams);
                resolve(mockResults);
            }, 500 + Math.random() * 1000); // Simulate network delay
        });
    }

    async getSearchSuggestions(query) {
        // Mock suggestions implementation
        return new Promise((resolve) => {
            setTimeout(() => {
                const suggestions = this.generateMockSuggestions(query);
                resolve(suggestions);
            }, 200);
        });
    }

    async getPopularTags() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    { name: 'JavaScript', count: 342, slug: 'javascript' },
                    { name: 'React', count: 186, slug: 'react' },
                    { name: 'Node.js', count: 154, slug: 'nodejs' },
                    { name: 'TypeScript', count: 128, slug: 'typescript' },
                    { name: 'Python', count: 97, slug: 'python' },
                    { name: 'Web Development', count: 89, slug: 'web-development' },
                    { name: 'Performance', count: 76, slug: 'performance' },
                    { name: 'Testing', count: 54, slug: 'testing' },
                    { name: 'CSS', count: 43, slug: 'css' },
                    { name: 'Database', count: 38, slug: 'database' }
                ]);
            }, 300);
        });
    }

    async getTrendingAuthors() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        id: 'user_1',
                        username: 'sarah_dev',
                        displayName: 'Sarah Chen',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
                        bio: 'Full-stack developer passionate about performance optimization',
                        articleCount: 23,
                        followerCount: 1200,
                        totalViews: 45000,
                        isFollowing: false
                    },
                    {
                        id: 'user_2',
                        username: 'mike_js',
                        displayName: 'Mike Rodriguez',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
                        bio: 'React expert and open source contributor',
                        articleCount: 18,
                        followerCount: 890,
                        totalViews: 32000,
                        isFollowing: true
                    },
                    {
                        id: 'user_3',
                        username: 'alex_data',
                        displayName: 'Alex Thompson',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
                        bio: 'Data engineer specializing in scalable architectures',
                        articleCount: 15,
                        followerCount: 670,
                        totalViews: 28000,
                        isFollowing: false
                    },
                    {
                        id: 'user_4',
                        username: 'emma_ux',
                        displayName: 'Emma Wilson',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emma',
                        bio: 'UX engineer bridging design and development',
                        articleCount: 12,
                        followerCount: 540,
                        totalViews: 19000,
                        isFollowing: false
                    }
                ]);
            }, 400);
        });
    }

    async followAuthor(authorId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Following author: ${authorId}`);
                resolve({ success: true });
            }, 500);
        });
    }

    async unfollowAuthor(authorId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Unfollowed author: ${authorId}`);
                resolve({ success: true });
            }, 500);
        });
    }

    async followTag(tagId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Following tag: ${tagId}`);
                resolve({ success: true });
            }, 500);
        });
    }

    async unfollowTag(tagId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Unfollowed tag: ${tagId}`);
                resolve({ success: true });
            }, 500);
        });
    }

    // Helper methods for generating mock data
    generateMockSearchResults(searchParams) {
        const { query, filters, page = 1, perPage = 20 } = searchParams;

        // Mock articles data
        const mockArticles = [
            {
                type: 'article',
                id: 'art_1',
                title: 'Building Scalable JavaScript Applications',
                slug: 'building-scalable-javascript-applications',
                excerpt: 'Learn the essential patterns and practices for building large-scale JavaScript applications that can grow with your team and requirements.',
                author: { displayName: 'Sarah Chen', username: 'sarah_dev' },
                publishedAt: '2024-01-15T10:30:00Z',
                readingTime: 8,
                tags: ['JavaScript', 'Architecture', 'Performance'],
                feedbackCount: 23,
                views: 3400,
                rating: 4.7
            },
            {
                type: 'article',
                id: 'art_2',
                title: 'React Performance Optimization Techniques',
                slug: 'react-performance-optimization',
                excerpt: 'Discover proven techniques to optimize React applications for better performance and user experience.',
                author: { displayName: 'Mike Rodriguez', username: 'mike_js' },
                publishedAt: '2024-01-12T14:20:00Z',
                readingTime: 12,
                tags: ['React', 'Performance', 'JavaScript'],
                feedbackCount: 18,
                views: 2890,
                rating: 4.8
            },
            {
                type: 'article',
                id: 'art_3',
                title: 'Database Design Best Practices',
                slug: 'database-design-best-practices',
                excerpt: 'A comprehensive guide to designing efficient and scalable database schemas for modern applications.',
                author: { displayName: 'Alex Thompson', username: 'alex_data' },
                publishedAt: '2024-01-10T09:15:00Z',
                readingTime: 15,
                tags: ['Database', 'Architecture', 'PostgreSQL'],
                feedbackCount: 31,
                views: 4200,
                rating: 4.9
            }
        ];

        const mockAuthors = [
            {
                type: 'author',
                id: 'user_1',
                username: 'sarah_dev',
                displayName: 'Sarah Chen',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
                bio: 'Full-stack developer passionate about performance optimization and scalable architectures',
                articleCount: 23,
                followerCount: 1200,
                totalViews: 45000,
                isFollowing: false
            }
        ];

        const mockTags = [
            {
                type: 'tag',
                id: 'tag_1',
                name: 'JavaScript',
                slug: 'javascript',
                description: 'Articles about JavaScript programming language, frameworks, and best practices',
                articleCount: 342,
                followerCount: 890,
                isFollowing: true
            }
        ];

        // Filter results based on search parameters
        let results = [];

        if (filters.type === 'all' || filters.type === 'articles') {
            results.push(...mockArticles);
        }
        if (filters.type === 'all' || filters.type === 'authors') {
            results.push(...mockAuthors);
        }
        if (filters.type === 'all' || filters.type === 'tags') {
            results.push(...mockTags);
        }

        // Simulate filtering by query
        if (query) {
            results = results.filter(item => {
                const searchText = (item.title || item.displayName || item.name || '').toLowerCase();
                return searchText.includes(query.toLowerCase());
            });
        }

        // Calculate pagination
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        const paginatedResults = results.slice(startIndex, endIndex);

        return {
            items: paginatedResults,
            stats: {
                total: results.length,
                articles: results.filter(r => r.type === 'article').length,
                authors: results.filter(r => r.type === 'author').length,
                tags: results.filter(r => r.type === 'tag').length
            },
            pagination: {
                page,
                perPage,
                totalPages: Math.ceil(results.length / perPage)
            }
        };
    }

    generateMockSuggestions(query) {
        const allSuggestions = [
            { type: 'article', text: 'JavaScript performance' },
            { type: 'article', text: 'React best practices' },
            { type: 'article', text: 'Node.js scaling' },
            { type: 'tag', text: 'JavaScript', count: 342 },
            { type: 'tag', text: 'React', count: 186 },
            { type: 'tag', text: 'Performance', count: 76 },
            { type: 'author', text: 'Sarah Chen' },
            { type: 'author', text: 'Mike Rodriguez' }
        ];

        return allSuggestions
            .filter(suggestion => suggestion.text.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 6);
    }

    // Connection status
    isConnected() {
        return this.connectionState === 'connected';
    }

    getConnectionState() {
        return this.connectionState;
    }
}

// Export for use in other modules
window.MCPClient = MCPClient;