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
import { AuthService } from './auth.js';

// Set up logger
const logger = new ConsoleLogger('WebSocketServer', LogLevel.INFO);

/**
 * WebSocket Event Emitter interface
 */
export interface WebSocketEventEmitter {
  // Register callbacks for connection events
  onClientConnect(callback: (clientId: string) => void): void;
  onClientDisconnect(callback: (clientId: string) => void): void;
}

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
export class WSServer implements WSServerInterface, ToolInvoker, WebSocketEventEmitter {
  private readonly clientAuthToken: string;
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  private readonly authService: AuthService;
  private wss: WebSocketServer | null = null;
  private readonly clientConnections: Map<string, WebSocket> = new Map();
  private readonly pendingRequests: Map<string, PendingRequest>;
  private readonly requestTimeout: number;
  private httpServer: Server | null = null;
  
  // Event handling capabilities
  private connectListeners: Set<(clientId: string) => void> = new Set();
  private disconnectListeners: Set<(clientId: string) => void> = new Set();
  
  /**
   * Create a new WebSocket server
   * @param clientAuthToken Token for client authentication
   * @param clientRegistrations Map to store client registrations
   * @param authService Auth service
   * @param requestTimeout Timeout for tool requests in milliseconds
   */
  constructor(
    clientAuthToken: string,
    clientRegistrations: Map<string, ClientRegistration>,
    authService: AuthService,
    requestTimeout = 30000 // Default timeout: 30 seconds
  ) {
    this.clientAuthToken = clientAuthToken;
    this.clientRegistrations = clientRegistrations;
    this.authService = authService;
    this.pendingRequests = new Map<string, PendingRequest>();
    this.requestTimeout = requestTimeout;
    
    logger.info('WebSocket server created');
  }
  
  /**
   * Register a callback for client connect events
   */
  onClientConnect(callback: (clientId: string) => void): void {
    this.connectListeners.add(callback);
  }
  
  /**
   * Register a callback for client disconnect events
   */
  onClientDisconnect(callback: (clientId: string) => void): void {
    this.disconnectListeners.add(callback);
  }
  
  /**
   * Emit a client connect event
   */
  private emitClientConnect(clientId: string): void {
    for (const listener of this.connectListeners) {
      try {
        listener(clientId);
      } catch (error) {
        logger.error(`Error in connect listener: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * Emit a client disconnect event
   */
  private emitClientDisconnect(clientId: string): void {
    for (const listener of this.disconnectListeners) {
      try {
        listener(clientId);
      } catch (error) {
        logger.error(`Error in disconnect listener: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * Start the WebSocket server
   * @param httpServer HTTP server to attach to
   */
  async start(httpServer: Server): Promise<void> {
    try {
      logger.info('Starting WebSocket server');
      
      this.httpServer = httpServer;
      
      // Create WebSocket server
      this.wss = new WebSocketServer({ 
        server: httpServer,
        path: '/ws'
      });
      
      // Set up event handlers
      this.wss.on('connection', (ws, request) => this.handleConnection(ws, request));
      this.wss.on('error', (error) => {
        logger.error(`WebSocket server error: ${error.message}`, error);
      });
      
      logger.info('WebSocket server started');
    } catch (error) {
      logger.error(`Failed to start WebSocket server: ${(error as Error).message}`, error as Error);
      throw new RESTifyMCPError(`Failed to start WebSocket server: ${(error as Error).message}`, 'WS_START_ERROR');
    }
  }
  
  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    try {
      logger.info('Stopping WebSocket server');
      
      // Close all pending requests with an error
      for (const [requestId, request] of this.pendingRequests.entries()) {
        clearTimeout(request.timeout);
        request.reject(new RESTifyMCPError('Server shutting down', 'SERVER_SHUTDOWN'));
        this.pendingRequests.delete(requestId);
      }
      
      // Close all connections
      for (const [connectionId, ws] of this.clientConnections.entries()) {
        try {
          ws.close(1001, 'Server shutting down');
        } catch (error) {
          logger.warn(`Error closing connection ${connectionId}: ${(error as Error).message}`);
        }
      }
      
      // Close the WebSocket server
      if (this.wss) {
        await new Promise<void>((resolve) => {
          if (this.wss) {
            this.wss.close(() => {
              resolve();
            });
          } else {
            resolve();
          }
        });
        this.wss = null;
      }
      
      // Clear maps
      this.clientConnections.clear();
      
      logger.info('WebSocket server stopped');
    } catch (error) {
      logger.error(`Error stopping WebSocket server: ${(error as Error).message}`, error as Error);
      throw new RESTifyMCPError(`Error stopping WebSocket server: ${(error as Error).message}`, 'WS_STOP_ERROR');
    }
  }
  
  /**
   * Get registered clients
   */
  getRegisteredClients(): Map<string, ClientRegistration> {
    return this.clientRegistrations;
  }
  
  /**
   * Invoke a tool on a client
   * @param clientId Client ID
   * @param toolName Tool name
   * @param args Tool arguments
   * @returns Tool result
   */
  async invokeToolOnClient(
    clientId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return this.sendToolRequest(clientId, toolName, args);
  }
  
  /**
   * Send a tool request to a client
   * @param clientId Client ID
   * @param toolName Tool name
   * @param args Tool arguments
   * @returns Tool result
   */
  async sendToolRequest(
    clientId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Check if client exists
    const client = this.clientRegistrations.get(clientId);
    if (!client) {
      throw new RESTifyMCPError(`Client not found: ${clientId}`, 'CLIENT_NOT_FOUND');
    }
    
    // Check if client is connected
    if (client.connectionStatus !== 'connected' || !client.connectionId) {
      throw new RESTifyMCPError(`Client not connected: ${clientId}`, 'CLIENT_NOT_CONNECTED');
    }
    
    // Get client connection
    const connection = this.clientConnections.get(client.connectionId);
    if (!connection) {
      throw new RESTifyMCPError(`Connection not found for client: ${clientId}`, 'CONNECTION_NOT_FOUND');
    }
    
    // Generate request ID
    const requestId = generateId();
    
    // Create tool request message
    const message: WebSocketMessage = {
      type: MessageType.TOOL_REQUEST,
      payload: {
        requestId,
        toolName,
        args
      } as ToolRequestMessage
    };
    
    // Send message
    try {
      connection.send(JSON.stringify(message));
    } catch (error) {
      throw new RESTifyMCPError(`Failed to send tool request: ${(error as Error).message}`, 'SEND_ERROR');
    }
    
    // Create promise for response
    return new Promise<unknown>((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        // Remove request from pending requests
        this.pendingRequests.delete(requestId);
        
        // Reject promise
        reject(new RESTifyMCPError(`Tool request timed out after ${this.requestTimeout}ms`, 'REQUEST_TIMEOUT'));
      }, this.requestTimeout);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        clientId,
        resolve,
        reject,
        timeout
      });
    });
  }
  
  /**
   * Handle a WebSocket connection
   * @param ws WebSocket connection
   * @param request HTTP request
   */
  private handleConnection(ws: WebSocket, request: any): void {
    // Generate connection ID
    const connectionId = generateId();
    
    // Store connection
    this.clientConnections.set(connectionId, ws);
    
    logger.info(`New WebSocket connection: ${connectionId}`);
    
    // Set up event handlers
    ws.on('message', (data) => this.handleMessage(ws, connectionId, data as Buffer));
    ws.on('close', () => this.handleClose(connectionId));
    ws.on('error', (error) => {
      logger.error(`WebSocket error on connection ${connectionId}: ${error.message}`, error);
    });
    ws.on('pong', () => this.handlePong(connectionId));
    
    // Set up ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Send ping message
          const pingMessage: WebSocketMessage = {
            type: MessageType.PING,
            payload: null
          };
          ws.send(JSON.stringify(pingMessage));
          
          // Set a timeout to close the connection if no pong is received
          const pongTimeout = setTimeout(() => {
            logger.warn(`No pong received from connection ${connectionId}, closing`);
            try {
              ws.terminate();
            } catch (error) {
              logger.error(`Error terminating connection ${connectionId}: ${(error as Error).message}`);
            }
          }, 5000); // 5 second timeout
          
          // Store timeout in connection
          (ws as any).pongTimeout = pongTimeout;
        } catch (error) {
          logger.error(`Error sending ping to connection ${connectionId}: ${(error as Error).message}`);
        }
      } else {
        // Connection is not open, clear interval
        clearInterval(pingInterval);
      }
    }, 30000); // 30 second ping interval
    
    // Store ping interval in connection
    (ws as any).pingInterval = pingInterval;
    
    // Store connection ID in connection
    (ws as any).connectionId = connectionId;
  }
  
  /**
   * Handle a WebSocket message
   * @param ws WebSocket connection
   * @param connectionId Connection ID
   * @param data Message data
   */
  private handleMessage(ws: WebSocket, connectionId: string, data: Buffer): void {
    try {
      // Parse message
      const message = safeJsonParse(data.toString()) as WebSocketMessage;
      
      // Handle message based on type
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
        case MessageType.PONG:
          this.handlePong(connectionId);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
          this.sendError(ws, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE_TYPE');
      }
    } catch (error) {
      logger.error(`Error handling message from connection ${connectionId}: ${(error as Error).message}`, error as Error);
      this.sendError(ws, `Error handling message: ${(error as Error).message}`, 'MESSAGE_HANDLING_ERROR');
    }
  }
  
  /**
   * Handle a client registration message
   * @param ws WebSocket connection
   * @param connectionId Connection ID
   * @param payload Registration message payload
   */
  private handleRegister(ws: WebSocket, connectionId: string, payload: RegistrationMessage): void {
    try {
      // Validate payload
      if (!payload.clientId || !payload.bearerToken || !Array.isArray(payload.tools)) {
        throw new RESTifyMCPError('Invalid registration payload', 'INVALID_PAYLOAD');
      }
      
      // Validate token
      if (payload.bearerToken !== this.clientAuthToken) {
        throw new RESTifyMCPError('Invalid bearer token', 'INVALID_TOKEN');
      }
      
      // Generate client ID from token if not provided
      const clientId = payload.clientId || generateClientIdFromToken(payload.bearerToken);
      
      // Check if client already exists
      const existingClient = this.clientRegistrations.get(clientId);
      if (existingClient && existingClient.connectionStatus === 'connected' && existingClient.connectionId !== connectionId) {
        // Client is already connected with a different connection
        logger.warn(`Client ${clientId} is already connected with a different connection, disconnecting old connection`);
        
        // Get old connection
        const oldConnection = this.clientConnections.get(existingClient.connectionId!);
        if (oldConnection) {
          try {
            // Close old connection
            oldConnection.close(1000, 'Client reconnected from another connection');
          } catch (error) {
            logger.error(`Error closing old connection for client ${clientId}: ${(error as Error).message}`);
          }
        }
      }
      
      // Create or update client registration
      const client: ClientRegistration = {
        clientId,
        bearerToken: payload.bearerToken,
        tools: payload.tools,
        connectionStatus: 'connected',
        lastSeen: new Date(),
        connectionId
      };
      
      // Store client registration
      this.clientRegistrations.set(clientId, client);
      
      // Store client ID in connection
      (ws as any).clientId = clientId;
      
      logger.info(`Client registered: ${clientId} with ${payload.tools.length} tools`);
      
      // Emit client connect event
      this.emitClientConnect(clientId);
      
      // Send pong to acknowledge registration
      this.sendPong(ws);
    } catch (error) {
      logger.error(`Error registering client: ${(error as Error).message}`, error as Error);
      this.sendError(ws, `Error registering client: ${(error as Error).message}`, 'REGISTRATION_ERROR');
    }
  }
  
  /**
   * Handle a client unregistration message
   * @param connectionId Connection ID
   */
  private handleUnregister(connectionId: string): void {
    try {
      // Find client by connection ID
      let clientId: string | null = null;
      for (const [id, client] of this.clientRegistrations.entries()) {
        if (client.connectionId === connectionId) {
          clientId = id;
          break;
        }
      }
      
      if (!clientId) {
        logger.warn(`No client found for connection ${connectionId}`);
        return;
      }
      
      // Update client status
      const client = this.clientRegistrations.get(clientId);
      if (client) {
        client.connectionStatus = 'disconnected';
        client.lastSeen = new Date();
        delete client.connectionId;
        
        logger.info(`Client unregistered: ${clientId}`);
        
        // Emit client disconnect event
        this.emitClientDisconnect(clientId);
      }
    } catch (error) {
      logger.error(`Error unregistering client: ${(error as Error).message}`, error as Error);
    }
  }
  
  /**
   * Handle a tool response message
   * @param payload Tool response message payload
   */
  private handleToolResponse(payload: ToolResponseMessage): void {
    try {
      // Validate payload
      if (!payload.requestId) {
        throw new RESTifyMCPError('Invalid tool response payload', 'INVALID_PAYLOAD');
      }
      
      // Get pending request
      const pendingRequest = this.pendingRequests.get(payload.requestId);
      if (!pendingRequest) {
        logger.warn(`No pending request found for request ID: ${payload.requestId}`);
        return;
      }
      
      // Clear timeout
      clearTimeout(pendingRequest.timeout);
      
      // Remove request from pending requests
      this.pendingRequests.delete(payload.requestId);
      
      // Check for error
      if (payload.error) {
        pendingRequest.reject(new RESTifyMCPError(payload.error, 'TOOL_ERROR'));
        return;
      }
      
      // Resolve promise with result
      pendingRequest.resolve(payload.result);
      
      logger.debug(`Tool response received for request ${payload.requestId}`);
    } catch (error) {
      logger.error(`Error handling tool response: ${(error as Error).message}`, error as Error);
    }
  }
  
  /**
   * Handle a WebSocket connection closing
   * @param connectionId Connection ID
   */
  private handleClose(connectionId: string): void {
    try {
      // Get connection
      const connection = this.clientConnections.get(connectionId);
      if (!connection) {
        logger.warn(`Connection not found: ${connectionId}`);
        return;
      }
      
      // Clear ping interval
      if ((connection as any).pingInterval) {
        clearInterval((connection as any).pingInterval);
      }
      
      // Clear pong timeout
      if ((connection as any).pongTimeout) {
        clearTimeout((connection as any).pongTimeout);
      }
      
      // Get client ID
      const clientId = (connection as any).clientId;
      
      // Remove connection
      this.clientConnections.delete(connectionId);
      
      logger.info(`WebSocket connection closed: ${connectionId}`);
      
      // If client ID is set, update client status
      if (clientId) {
        const client = this.clientRegistrations.get(clientId);
        if (client && client.connectionId === connectionId) {
          client.connectionStatus = 'disconnected';
          client.lastSeen = new Date();
          delete client.connectionId;
          
          logger.info(`Client disconnected: ${clientId}`);
          
          // Emit client disconnect event
          this.emitClientDisconnect(clientId);
        }
      }
    } catch (error) {
      logger.error(`Error handling connection close: ${(error as Error).message}`, error as Error);
    }
  }
  
  /**
   * Handle a pong message
   * @param connectionId Connection ID
   */
  private handlePong(connectionId: string): void {
    try {
      // Get connection
      const connection = this.clientConnections.get(connectionId);
      if (!connection) {
        return;
      }
      
      // Clear pong timeout
      if ((connection as any).pongTimeout) {
        clearTimeout((connection as any).pongTimeout);
      }
      
      // Get client ID
      const clientId = (connection as any).clientId;
      
      // If client ID is set, update last seen
      if (clientId) {
        const client = this.clientRegistrations.get(clientId);
        if (client) {
          client.lastSeen = new Date();
        }
      }
    } catch (error) {
      logger.error(`Error handling pong: ${(error as Error).message}`, error as Error);
    }
  }
  
  /**
   * Send an error message to a client
   * @param ws WebSocket connection
   * @param message Error message
   * @param code Error code
   */
  private sendError(ws: WebSocket, message: string, code: string): void {
    try {
      const errorMessage: WebSocketMessage = {
        type: MessageType.ERROR,
        payload: {
          message,
          code
        } as ErrorMessage
      };
      
      ws.send(JSON.stringify(errorMessage));
    } catch (error) {
      logger.error(`Error sending error message: ${(error as Error).message}`, error as Error);
    }
  }
  
  /**
   * Send a pong message to a client
   * @param ws WebSocket connection
   */
  private sendPong(ws: WebSocket): void {
    try {
      const pongMessage: WebSocketMessage = {
        type: MessageType.PONG,
        payload: null
      };
      
      ws.send(JSON.stringify(pongMessage));
    } catch (error) {
      logger.error(`Error sending pong message: ${(error as Error).message}`, error as Error);
    }
  }
} 