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