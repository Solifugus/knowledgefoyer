/**
 * MCP (Model Context Protocol) Server for Knowledge Foyer
 *
 * WebSocket-based MCP server for real-time communication
 * This will be fully implemented in Phase 1
 */

const WebSocket = require('ws');
const { authenticateWebSocket } = require('../middleware/auth');
const { getAvailableTools, executeTool } = require('./tools');
const realTimeService = require('../services/RealTimeService');

/**
 * Create and configure MCP WebSocket server
 */
function createMCPServer(port) {
  console.log('🔌 Setting up MCP WebSocket server...');

  const wss = new WebSocket.Server({
    port,
    verifyClient: async (info) => {
      try {
        // Authenticate WebSocket connection
        await authenticateWebSocket(info.req);
        return true;
      } catch (error) {
        console.log('❌ WebSocket authentication failed:', error.message);
        return false;
      }
    }
  });

  wss.on('connection', async (ws, request) => {
    console.log('🔗 New MCP WebSocket connection established');

    try {
      // Get user info from token
      const user = await authenticateWebSocket(request);

      // Register connection with real-time service
      const connectionId = realTimeService.registerConnection(ws, user);

      // Get available tools
      const availableTools = getAvailableTools();

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Knowledge Foyer MCP Server',
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name
        },
        connection_id: connectionId,
        tools: availableTools,
        version: '0.1.0',
        features: [
          'article_management',
          'version_control',
          'feedback_resolution',
          'social_features',
          'real_time_updates'
        ]
      }));

      // Handle incoming messages
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);

          // Check if it's a real-time message or MCP message
          if (message.type && ['ping', 'typing_start', 'typing_stop', 'presence_update'].includes(message.type)) {
            realTimeService.handleMessage(ws, message);
          } else {
            await handleMCPMessage(ws, message);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          realTimeService.sendToConnection(ws, {
            type: 'error',
            error: 'Invalid message format'
          });
        }
      });

      // Handle connection close
      ws.on('close', () => {
        console.log(`🔗 MCP WebSocket connection closed for user: ${user.username}`);
        realTimeService.unregisterConnection(ws);
      });

      // Handle connection error
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for user ${user.username}:`, error.message);
        realTimeService.unregisterConnection(ws);
      });

      // Send presence update
      realTimeService.sendPresenceUpdate(user.id, 'online');

    } catch (error) {
      console.error('❌ Error setting up WebSocket connection:', error);
      ws.close(1000, 'Authentication failed');
    }
  });

  wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error);
  });

  console.log('✅ MCP WebSocket server initialized successfully');

  // Store reference globally for event broadcasting
  global.mcpServer = wss;

  return wss;
}

/**
 * Handle incoming MCP messages
 */
async function handleMCPMessage(ws, message) {
  console.log(`📨 MCP Message from ${ws.user.username}:`, message.type);

  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'get_capabilities':
      const availableTools = getAvailableTools();
      ws.send(JSON.stringify({
        type: 'capabilities',
        tools: availableTools,
        resources: [
          'article://{article_id}',
          'article://{username}/{slug}',
          'version://{article_id}/{version_number}',
          'profile://{username}'
        ],
        events: [
          'article_updated',
          'article_published',
          'version_created',
          'feedback_received',
          'feedback_resolved',
          'user_followed',
          'user_unfollowed',
          'message_created',
          'message_updated',
          'message_deleted',
          'notifications_updated'
        ]
      }));
      break;

    case 'tool_call':
      await handleToolCall(ws, message);
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${message.type}`,
        request_id: message.request_id
      }));
  }
}

/**
 * Handle MCP tool calls
 */
async function handleToolCall(ws, message) {
  const { tool, args = {}, request_id } = message;

  console.log(`🔧 Tool call: ${tool} from ${ws.user.username}`, args);

  try {
    const response = await executeTool(tool, ws.user, args, request_id);
    ws.send(JSON.stringify(response));

    // Emit events for real-time updates
    if (response.success) {
      await emitToolEvent(ws, tool, args, response.data);
    }
  } catch (error) {
    console.error(`❌ Error handling tool call ${tool}:`, error);
    ws.send(JSON.stringify({
      type: 'tool_response',
      request_id,
      success: false,
      error: 'Internal server error'
    }));
  }
}

/**
 * Emit real-time events based on tool execution
 */
async function emitToolEvent(ws, tool, args, data) {
  try {
    switch (tool) {
      case 'create_article':
        // Broadcast to author's followers when article is created
        if (data.status === 'published') {
          await realTimeService.sendArticlePublishedNotification(data, ws.user.id);
        }
        break;

      case 'update_article':
        // Send update notification to relevant users
        realTimeService.sendToUser(ws.user.id, {
          type: 'article_updated',
          data: {
            article_id: data.id,
            title: data.title,
            version: data.version,
            updated_at: data.updated_at
          }
        });
        break;

      case 'publish_article':
        // Send publication notification to followers
        if (data.status === 'published') {
          await realTimeService.sendArticlePublishedNotification(data, ws.user.id);
        }
        break;

      case 'follow_user':
        // Send follow notification
        await realTimeService.sendFollowNotification(ws.user.id, data.followed_id);
        break;

      case 'unfollow_user':
        // Send unfollow notification
        await realTimeService.sendUnfollowNotification(ws.user.id, args.user_id || args.username);
        break;

      case 'create_message':
        // Send message notification to followers
        await realTimeService.sendMessageNotification(data);
        break;

      case 'update_message':
        // Send update to message viewers
        realTimeService.sendToUser(ws.user.id, {
          type: 'message_updated',
          data: {
            message_id: data.id,
            updated_at: data.updated_at
          }
        });
        break;

      case 'delete_message':
        // Notify about message deletion
        realTimeService.sendToUser(ws.user.id, {
          type: 'message_deleted',
          data: {
            message_id: args.message_id
          }
        });
        break;

      case 'mark_notification_read':
      case 'mark_all_notifications_read':
        // Send notification update to user
        realTimeService.sendToUser(ws.user.id, {
          type: 'notifications_updated',
          data: {
            action: tool === 'mark_notification_read' ? 'single_read' : 'all_read',
            notification_id: args.notification_id || null
          }
        });
        break;

      // Exposition Events
      case 'create_exposition':
        // Send exposition created event to user
        realTimeService.sendToUser(ws.user.id, {
          type: 'exposition_created',
          data: {
            exposition_id: data.id,
            title: data.title,
            slug: data.slug,
            status: data.status,
            created_at: data.created_at
          }
        });
        break;

      case 'publish_exposition':
        // Send exposition published notification to followers
        if (data.status === 'published') {
          try {
            const Follow = require('../models/Follow');
            const followers = await Follow.getFollowers(ws.user.id);
            const followerIds = followers.map(f => f.user_id);

            const notification = {
              type: 'exposition_published',
              data: {
                exposition_id: data.id,
                title: data.title,
                slug: data.slug,
                author_id: ws.user.id,
                author_username: ws.user.username,
                published_at: data.updated_at,
                description: data.description
              }
            };

            realTimeService.sendToUsers(followerIds, notification);
          } catch (error) {
            console.error('Error sending exposition published notification:', error.message);
          }
        }
        break;

      case 'update_exposition':
        // Send update notification to user
        realTimeService.sendToUser(ws.user.id, {
          type: 'exposition_updated',
          data: {
            exposition_id: data.id,
            title: data.title,
            updated_at: data.updated_at
          }
        });
        break;

      case 'add_exposition_criterion':
        // Send criterion added event to user
        realTimeService.sendToUser(ws.user.id, {
          type: 'exposition_criterion_added',
          data: {
            exposition_id: args.exposition_id,
            criterion: data.criterion.toPublicJSON(),
            article_count: data.article_count
          }
        });
        break;

      case 'remove_exposition_criterion':
        // Send criterion removed event to user
        realTimeService.sendToUser(ws.user.id, {
          type: 'exposition_criterion_removed',
          data: {
            criterion_id: args.criterion_id,
            article_count: data.article_count
          }
        });
        break;

      case 'delete_exposition':
        // Send exposition deleted event to user
        realTimeService.sendToUser(ws.user.id, {
          type: 'exposition_deleted',
          data: {
            exposition_id: args.exposition_id
          }
        });
        break;

      default:
        // No specific real-time event for this tool
        break;
    }
  } catch (error) {
    console.error(`Error emitting real-time event for ${tool}:`, error.message);
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcastMessage(wss, message, excludeUser = null) {
  if (!wss || !wss.clients) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.user) {
      if (!excludeUser || client.user.id !== excludeUser.id) {
        client.send(JSON.stringify(message));
      }
    }
  });
}

module.exports = {
  createMCPServer,
  broadcastMessage,
};