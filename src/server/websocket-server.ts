/**
 * WebSocket Server for RESTifyMCP
 * 
 * This module handles WebSocket communication with RESTify clients.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { 
  ClientRegistration, 
  MessageType, 
  WebSocketMessage,
  RegistrationMessage,
  ToolRequestMessage,
  ToolResponseMessage,
  ErrorMessage,
  MCPToolDefinition
} from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError, generateId, generateClientIdFromToken, safeJsonParse } from '../shared/utils.js';
import { ToolInvoker } from './rest-api.js';
import { Server } from 'http';

// Set up logger
const logger = new ConsoleLogger('WebSocketServer', LogLevel.INFO);

/**
 * WebSocket Server interface
 */
export interface WSServerInterface {
  start(httpServer: Server): Promise<void>;
  stop(): Promise<void>;
  getRegisteredClients(): Map<string, ClientRegistration>;
  sendToolRequest(clientId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Represents a pending tool request
 */
interface PendingRequest {
  clientId: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * WebSocket Server implementation
 */
export class WSServer implements WSServerInterface, ToolInvoker {
  private readonly serverToken: string;
  private readonly clients: Map<string, ClientRegistration>;
  private readonly connections: Map<string, WebSocket>;
  private readonly pendingRequests: Map<string, PendingRequest>;
  private wss: WebSocketServer | null = null;
  private readonly requestTimeout: number;
  private httpServer: Server | null = null;

  /**
   * Create a new WebSocket server
   * 
   * @param serverToken - The server token for authentication
   * @param clientsMap - Optional map of client registrations
   * @param requestTimeout - Timeout for requests in milliseconds
   */
  constructor(
    serverToken: string,
    clientsMap?: Map<string, ClientRegistration>,
    requestTimeout = 30000 // Default timeout: 30 seconds
  ) {
    this.serverToken = serverToken;
    this.clients = clientsMap || new Map<string, ClientRegistration>();
    this.connections = new Map<string, WebSocket>();
    this.pendingRequests = new Map();
    this.requestTimeout = requestTimeout;
    logger.info('WebSocketServer created');
  }

  /**
   * Start the WebSocket server
   */
  async start(httpServer: Server): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.httpServer = httpServer;
        this.wss = new WebSocketServer({ 
          server: httpServer,
          path: '/client' // Specific path for client WebSocket connections
        });
        
        this.wss.on('listening', () => {
          logger.info('WebSocket server started on HTTP server');
          resolve();
        });
        
        this.wss.on('connection', (ws: WebSocket, request: any) => {
          this.handleConnection(ws, request);
        });
        
        this.wss.on('error', (error: Error) => {
          logger.error(`WebSocket server error: ${error.message}`, error);
          reject(error);
        });
        
        // If the WebSocket server is already listening because the HTTP server is, resolve immediately
        if (httpServer.listening) {
          logger.info('WebSocket server attached to running HTTP server');
          resolve();
        }
      } catch (error) {
        logger.error('Failed to start WebSocket server', error as Error);
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.wss) {
        // Cancel all pending requests
        for (const [requestId, request] of this.pendingRequests.entries()) {
          clearTimeout(request.timeout);
          request.reject(new RESTifyMCPError('Server shutdown', 'SERVER_SHUTDOWN'));
          this.pendingRequests.delete(requestId);
        }
        
        // Close all connections
        for (const ws of this.connections.values()) {
          ws.close();
        }
        
        this.wss.close((error) => {
          if (error) {
            logger.error(`Error stopping WebSocket server: ${error.message}`, error);
            reject(error);
          } else {
            logger.info('WebSocket server stopped');
            resolve();
          }
        });
      } else {
        logger.info('WebSocket server was not running');
        resolve();
      }
    });
  }

  /**
   * Get the map of registered clients
   * @returns Map of client registrations
   */
  getRegisteredClients(): Map<string, ClientRegistration> {
    return this.clients;
  }

  /**
   * Send a tool request to a client
   * @param clientId ID of the client
   * @param toolName Name of the tool to invoke
   * @param args Tool arguments
   * @returns Tool result
   */
  async invokeToolOnClient(
    clientId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Make sure client exists and is connected
    const client = this.clients.get(clientId);
    if (!client) {
      throw new RESTifyMCPError(`Client ${clientId} not found`, 'CLIENT_NOT_FOUND');
    }
    
    if (client.connectionStatus !== 'connected') {
      throw new RESTifyMCPError(
        `Client ${clientId} is not connected (status: ${client.connectionStatus})`,
        'CLIENT_DISCONNECTED'
      );
    }
    
    // Make sure client has the requested tool
    const hasTool = client.tools.some(tool => tool.name === toolName);
    if (!hasTool) {
      throw new RESTifyMCPError(
        `Tool ${toolName} not available on client ${clientId}`,
        'TOOL_NOT_AVAILABLE'
      );
    }
    
    // Get client's WebSocket connection
    const ws = this.connections.get(clientId);
    if (!ws) {
      throw new RESTifyMCPError(
        `No WebSocket connection for client ${clientId}`,
        'NO_CONNECTION'
      );
    }
    
    // Send the request and wait for response
    return this.sendToolRequest(clientId, toolName, args);
  }

  /**
   * Send a tool request to a client
   * @param clientId ID of the client
   * @param toolName Name of the tool to invoke
   * @param args Tool arguments
   * @returns Promise that resolves with the tool result
   */
  async sendToolRequest(
    clientId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const ws = this.connections.get(clientId);
    if (!ws) {
      throw new RESTifyMCPError('Client not connected', 'CLIENT_NOT_CONNECTED');
    }
    
    // Create a unique request ID
    const requestId = generateId();
    
    // Create the message
    const message: WebSocketMessage = {
      type: MessageType.TOOL_REQUEST,
      payload: {
        requestId,
        toolName,
        args
      } as ToolRequestMessage
    };
    
    logger.debug(`Sending tool request ${requestId} to client ${clientId}: ${toolName}`);
    
    // Create a promise that will be resolved when the response is received
    return new Promise<unknown>((resolve, reject) => {
      // Set a timeout to reject the promise if no response is received
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new RESTifyMCPError(`Tool request timed out: ${toolName}`, 'REQUEST_TIMEOUT'));
        }
      }, this.requestTimeout);
      
      // Store the promise handlers and timeout with client ID
      this.pendingRequests.set(requestId, {
        clientId,
        resolve,
        reject,
        timeout
      });
      
      // Send the message
      ws.send(JSON.stringify(message), (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(new RESTifyMCPError(`Failed to send tool request: ${error.message}`, 'SEND_ERROR'));
        }
      });
    });
  }

  /**
   * Handle a new WebSocket connection
   * @param ws WebSocket connection
   * @param request The HTTP request for the WebSocket upgrade
   */
  private handleConnection(ws: WebSocket, request: any): void {
    // Generate a temporary ID for the connection
    const tempId = generateId();
    logger.info(`New WebSocket connection: ${tempId}`);
    
    // Extract bearer token from URL query parameters
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    
    // Validate token - strict enforcement
    if (!token) {
      logger.warn(`WebSocket connection ${tempId} rejected: No authentication token provided`);
      this.sendError(ws, 'Authentication required', 'AUTH_REQUIRED');
      ws.close(1008, 'Authentication required');
      return;
    }
    
    // Check if token matches server token or any client token
    let clientId: string | null = null;
    
    if (token === this.serverToken) {
      // This is a server-to-server connection
      logger.info(`Server authenticated with server token: ${tempId}`);
    } else {
      // Check if this token belongs to a registered client
      for (const [id, client] of this.clients.entries()) {
        if (client.bearerToken === token) {
          clientId = id;
          break;
        }
      }
      
      if (!clientId) {
        logger.warn(`WebSocket connection ${tempId} rejected: Invalid token`);
        this.sendError(ws, 'Invalid authentication token', 'AUTH_FAILED');
        ws.close(1008, 'Authentication failed');
        return;
      }
      
      logger.info(`Client authenticated: ${clientId}`);
      
      // Update client status
      const client = this.clients.get(clientId);
      if (client) {
        client.connectionStatus = 'connected';
        client.lastSeen = new Date();
      }
    }
    
    // Store connection with its authenticated client ID
    this.connections.set(tempId, ws);
    
    // Associate this connection with the client
    if (clientId) {
      // Update client's assigned connection ID
      const client = this.clients.get(clientId);
      if (client) {
        client.connectionId = tempId;
      }
    }
    
    // Set up message handler
    ws.on('message', (data: Buffer) => {
      this.handleMessage(ws, tempId, data);
    });
    
    // Set up close handler
    ws.on('close', () => {
      this.handleClose(tempId);
    });
    
    // Set up error handler
    ws.on('error', (error: Error) => {
      logger.error(`WebSocket error for ${tempId}: ${error.message}`, error);
      ws.close();
    });
    
    // Set up ping/pong for keep-alive
    ws.on('pong', () => {
      this.handlePong(tempId);
    });
    
    // Start ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Handle a WebSocket message
   * @param ws WebSocket connection
   * @param connectionId Connection ID
   * @param data Message data
   */
  private handleMessage(ws: WebSocket, connectionId: string, data: Buffer): void {
    try {
      // Parse the message
      const message = safeJsonParse(data.toString()) as WebSocketMessage;
      if (!message || !message.type) {
        this.sendError(ws, 'Invalid message format', 'INVALID_MESSAGE');
        return;
      }
      
      // Handle based on message type
      switch (message.type) {
        case MessageType.REGISTER:
          this.handleRegister(ws, connectionId, message.payload as RegistrationMessage);
          break;
        
        case MessageType.UNREGISTER:
          this.handleUnregister(connectionId);
          break;
        
        case MessageType.TOOL_RESPONSE:
          this.handleToolResponse(message.payload as ToolResponseMessage);
          break;
        
        case MessageType.PING:
          this.sendPong(ws);
          break;
        
        default:
          logger.warn(`Unknown message type: ${message.type}`);
          this.sendError(ws, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE_TYPE');
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', error as Error);
      this.sendError(ws, 'Error processing message', 'MESSAGE_PROCESSING_ERROR');
    }
  }

  /**
   * Handle a client registration
   * @param ws WebSocket connection
   * @param connectionId Connection ID
   * @param payload Registration payload
   */
  private handleRegister(ws: WebSocket, connectionId: string, payload: RegistrationMessage): void {
    const { clientId, bearerToken, tools } = payload;
    
    // Validate bearer token
    if (bearerToken !== this.serverToken) {
      logger.warn(`Registration rejected: Invalid token for client ${clientId}`);
      this.sendError(ws, 'Invalid bearer token', 'INVALID_TOKEN');
      return;
    }
    
    // Verify client ID is derived from bearer token
    const expectedClientId = generateClientIdFromToken(bearerToken);
    if (clientId !== expectedClientId) {
      logger.warn(`Registration rejected: Invalid client ID for token. Expected ${expectedClientId}, got ${clientId}`);
      this.sendError(ws, 'Invalid client ID for token', 'INVALID_CLIENT_ID');
      return;
    }
    
    logger.info(`Client registered: ${clientId} with ${tools.length} tools`);
    
    // Update client registration
    const clientRegistration: ClientRegistration = {
      clientId,
      bearerToken,
      tools,
      connectionStatus: 'connected',
      lastSeen: new Date().toISOString()
    };
    
    // Update client maps
    this.clients.set(clientId, clientRegistration);
    this.connections.set(clientId, ws);
    
    // If this was a reconnection, clear any existing connection
    for (const [id, connection] of this.connections.entries()) {
      if (id !== clientId && id !== connectionId && connection === ws) {
        this.connections.delete(id);
      }
    }
    
    // Send acknowledgement
    const ackMessage: WebSocketMessage = {
      type: MessageType.REGISTER,
      payload: { success: true }
    };
    
    ws.send(JSON.stringify(ackMessage));
  }

  /**
   * Handle a client unregistration
   * @param connectionId Connection ID
   */
  private handleUnregister(connectionId: string): void {
    // Find the client ID for this connection
    let clientId: string | null = null;
    
    for (const [id, connection] of this.connections.entries()) {
      if (id === connectionId) {
        clientId = id;
        break;
      }
    }
    
    if (clientId) {
      logger.info(`Client unregistered: ${clientId}`);
      
      // Update client status
      const client = this.clients.get(clientId);
      if (client) {
        client.connectionStatus = 'disconnected';
        client.lastSeen = new Date().toISOString();
      }
      
      // Remove from connections map
      this.connections.delete(clientId);
    }
  }

  /**
   * Handle a tool response from a client
   * @param payload Tool response payload
   */
  private handleToolResponse(payload: ToolResponseMessage): void {
    const { requestId, result, error } = payload;
    
    // Find the pending request
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      logger.warn(`Received response for unknown request: ${requestId}`);
      return;
    }
    
    // Clear timeout and remove from pending requests
    clearTimeout(request.timeout);
    this.pendingRequests.delete(requestId);
    
    // Resolve or reject the promise
    if (error) {
      request.reject(new RESTifyMCPError(error, 'TOOL_EXECUTION_ERROR'));
    } else {
      request.resolve(result);
    }
  }

  /**
   * Handle a WebSocket closure
   * @param connectionId Connection ID
   */
  private handleClose(connectionId: string): void {
    // Find the client ID for this connection
    let clientId: string | null = null;
    
    for (const [id, connection] of this.connections.entries()) {
      if (id === connectionId) {
        clientId = id;
        break;
      }
    }
    
    if (clientId) {
      logger.info(`WebSocket closed for client: ${clientId}`);
      
      // Update client status
      const client = this.clients.get(clientId);
      if (client) {
        client.connectionStatus = 'disconnected';
        client.lastSeen = new Date().toISOString();
      }
      
      // Remove from connections map
      this.connections.delete(clientId);
      
      // Cancel all pending requests for this client
      for (const [requestId, request] of this.pendingRequests.entries()) {
        if (request.clientId === clientId) {
          clearTimeout(request.timeout);
          request.reject(new RESTifyMCPError(
            `Client disconnected during tool execution`,
            'CLIENT_DISCONNECTED'
          ));
          this.pendingRequests.delete(requestId);
        }
      }
    }
  }

  /**
   * Handle a pong message from a client
   * @param connectionId Connection ID
   */
  private handlePong(connectionId: string): void {
    // Find the client ID for this connection
    for (const [clientId, connection] of this.connections.entries()) {
      if (clientId === connectionId) {
        // Update last seen timestamp
        const client = this.clients.get(clientId);
        if (client) {
          client.lastSeen = new Date().toISOString();
        }
        break;
      }
    }
  }

  /**
   * Send an error message to a client
   * @param ws WebSocket connection
   * @param message Error message
   * @param code Error code
   */
  private sendError(ws: WebSocket, message: string, code: string): void {
    const errorMessage: WebSocketMessage = {
      type: MessageType.ERROR,
      payload: {
        message,
        code
      } as ErrorMessage
    };
    
    ws.send(JSON.stringify(errorMessage));
  }

  /**
   * Send a pong message to a client
   * @param ws WebSocket connection
   */
  private sendPong(ws: WebSocket): void {
    const pongMessage: WebSocketMessage = {
      type: MessageType.PONG,
      payload: { timestamp: Date.now() }
    };
    
    ws.send(JSON.stringify(pongMessage));
  }
} 