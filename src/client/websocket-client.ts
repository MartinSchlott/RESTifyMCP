/**
 * WebSocket Client for RESTifyMCP
 * 
 * This module handles WebSocket communication with the RESTify server.
 */
import WebSocket from 'ws';
import { 
  MCPToolDefinition,
  MessageType,
  WebSocketMessage,
  RegistrationMessage,
  ToolRequestMessage,
  ToolResponseMessage
} from '../shared/types.js';
import { 
  ConsoleLogger, 
  LogLevel, 
  RESTifyMCPError, 
  safeJsonParse, 
  sleep 
} from '../shared/utils.js';

// Set up logger
const logger = new ConsoleLogger('WebSocketClient', LogLevel.INFO);

/**
 * WebSocket client interface
 */
export interface WSClientInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  registerTools(tools: MCPToolDefinition[]): Promise<void>;
  isConnected(): boolean;
  setToolHandler(handler: ToolHandler): void;
}

/**
 * Handler for tool invocations
 */
export type ToolHandler = (
  toolName: string,
  args: Record<string, unknown>,
  requestId: string
) => Promise<unknown>;

/**
 * WebSocket client implementation
 */
export class WSClient implements WSClientInterface {
  private readonly serverUrl: string;
  private readonly clientId: string;
  private readonly bearerToken: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private toolHandler: ToolHandler | null = null;
  private isReconnecting = false;
  private registeredTools: MCPToolDefinition[] = [];

  /**
   * Create a new WebSocket client
   * 
   * @param serverUrl Base server URL (http/https)
   * @param clientId Client ID (must be derived from bearer token)
   * @param bearerToken Bearer token for authentication
   */
  constructor(serverUrl: string, clientId: string, bearerToken: string) {
    if (!bearerToken) {
      throw new RESTifyMCPError('Bearer token is required', 'MISSING_TOKEN');
    }
    
    // Convert HTTP URL to WebSocket URL
    this.serverUrl = serverUrl
      .replace(/^http:\/\//i, 'ws://')
      .replace(/^https:\/\//i, 'wss://');
    
    // Append /client path for the WebSocket endpoint
    const url = new URL(this.serverUrl);
    // Handle paths properly - ensure we don't duplicate slashes
    url.pathname = url.pathname.endsWith('/') 
      ? `${url.pathname}client` 
      : `${url.pathname}/client`;
    
    this.serverUrl = url.toString();
    this.clientId = clientId; // Must be provided and derived from token
    this.bearerToken = bearerToken;
    
    logger.info(`WebSocket client created for server: ${this.serverUrl}`);
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.debug('Already connected');
      return;
    }
    
    // Reset reconnect attempts if this is not a reconnection
    if (!this.isReconnecting) {
      this.reconnectAttempts = 0;
    }
    
    return new Promise<void>((resolve, reject) => {
      logger.info(`Connecting to WebSocket server: ${this.serverUrl}`);
      
      try {
        // Create WebSocket with headers for authentication
        this.ws = new WebSocket(this.serverUrl, {
          headers: {
            'Authorization': `Bearer ${this.bearerToken}`
          }
        });
        
        // Set up connection handler
        this.ws.on('open', () => {
          logger.info('WebSocket connection established');
          
          // Capture reconnecting state before resetting
          const wasReconnecting = this.isReconnecting;
          
          // Determine if this is initial connection or reconnection for logging
          if (wasReconnecting) {
            logger.info('Successfully reconnected to server');
          }
          
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          
          // Set up ping interval for keep-alive
          this.setupPingInterval();
          
          // Register tools if we have any
          if (this.registeredTools.length > 0) {
            this.registerTools(this.registeredTools)
              .then(() => {
                if (wasReconnecting) {
                  logger.info(`Successfully re-registered ${this.registeredTools.length} tools after connection`);
                } else {
                  logger.info(`Registered ${this.registeredTools.length} tools during initial connection`);
                }
                resolve();
              })
              .catch(reject);
          } else {
            resolve();
          }
        });
        
        // Set up message handler
        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });
        
        // Set up error handler
        this.ws.on('error', (error: Error) => {
          logger.error(`WebSocket error: ${error.message}`, error);
          
          // Only reject if this is the initial connection
          if (!this.isReconnecting && this.reconnectAttempts === 0) {
            reject(error);
          }
        });
        
        // Set up close handler
        this.ws.on('close', () => {
          logger.warn('WebSocket connection closed');
          
          // Clear ping interval
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          
          // Attempt to reconnect
          this.attemptReconnect();
        });
      } catch (error) {
        logger.error('Failed to create WebSocket connection', error as Error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  async disconnect(): Promise<void> {
    // Clear reconnect timeout if it exists
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Clear ping interval if it exists
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Close WebSocket if it's open
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Send unregister message
        await this.sendUnregister();
        
        // Close the connection
        this.ws.close();
      }
      
      this.ws = null;
    }
    
    logger.info('Disconnected from WebSocket server');
  }

  /**
   * Register tools with the server
   * @param tools Tools to register
   */
  async registerTools(tools: MCPToolDefinition[]): Promise<void> {
    // Store tools for reconnection
    this.registeredTools = tools;
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot register tools, not connected to server');
      return;
    }
    
    logger.info(`Registering ${tools.length} tools with server`);
    
    // Create registration message
    const message: WebSocketMessage = {
      type: MessageType.REGISTER,
      payload: {
        clientId: this.clientId,
        bearerToken: this.bearerToken,
        tools
      } as RegistrationMessage
    };
    
    // Send registration message
    return new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new RESTifyMCPError('Not connected to server', 'NOT_CONNECTED'));
        return;
      }
      
      this.ws.send(JSON.stringify(message), (error) => {
        if (error) {
          logger.error(`Failed to send registration message: ${error.message}`, error);
          reject(new RESTifyMCPError(
            `Failed to register tools: ${error.message}`,
            'REGISTRATION_ERROR'
          ));
        } else {
          logger.info('Tools registered successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Send an unregister message to the server
   */
  private async sendUnregister(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    logger.info('Sending unregister message to server');
    
    // Create unregister message
    const message: WebSocketMessage = {
      type: MessageType.UNREGISTER,
      payload: {
        clientId: this.clientId
      }
    };
    
    // Send unregister message
    return new Promise<void>((resolve) => {
      if (!this.ws) {
        resolve();
        return;
      }
      
      this.ws.send(JSON.stringify(message), () => {
        // We don't care about errors here, as we're disconnecting anyway
        resolve();
      });
    });
  }

  /**
   * Check if the client is connected to the server
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Set the handler for tool invocations
   * @param handler Tool handler function
   */
  setToolHandler(handler: ToolHandler): void {
    this.toolHandler = handler;
  }

  /**
   * Handle a WebSocket message
   * @param data Message data
   */
  private handleMessage(data: Buffer): void {
    try {
      // Parse the message
      const message = safeJsonParse(data.toString()) as WebSocketMessage | null;
      if (!message || !message.type) {
        logger.warn('Received invalid message format');
        return;
      }
      
      // Handle message based on type
      switch (message.type) {
        case MessageType.REGISTER:
          // Registration acknowledgement
          logger.debug('Received registration acknowledgement');
          break;
        
        case MessageType.TOOL_REQUEST:
          this.handleToolRequest(message.payload as ToolRequestMessage);
          break;
        
        case MessageType.PING:
          this.sendPong();
          break;
        
        case MessageType.PONG:
          // Server responded to our ping - update connection status
          logger.debug('Received pong from server');
          break;
        
        case MessageType.ERROR:
          const errorPayload = message.payload as { message: string, code: string };
          logger.error(`Received error from server: ${errorPayload.message} (${errorPayload.code})`);
          break;
        
        default:
          logger.warn(`Received unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', error as Error);
    }
  }

  /**
   * Handle a tool request from the server
   * @param payload Tool request payload
   */
  private async handleToolRequest(payload: ToolRequestMessage): Promise<void> {
    const { requestId, toolName, args } = payload;
    
    logger.info(`Received tool request: ${toolName} (${requestId})`);
    
    if (!this.toolHandler) {
      logger.error('No tool handler registered');
      this.sendToolResponse(requestId, null, 'No tool handler registered');
      return;
    }
    
    try {
      // Call the tool handler
      const result = await this.toolHandler(toolName, args, requestId);
      
      // Send the response
      this.sendToolResponse(requestId, result);
    } catch (error) {
      // Send error response
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error handling tool request: ${errorMessage}`, error as Error);
      this.sendToolResponse(requestId, null, errorMessage);
    }
  }

  /**
   * Send a tool response to the server
   * @param requestId Request ID
   * @param result Tool result
   * @param error Error message (if any)
   */
  private sendToolResponse(requestId: string, result: unknown, error?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot send tool response for ${requestId}, not connected to server`);
      return;
    }
    
    // Create response message
    const message: WebSocketMessage = {
      type: MessageType.TOOL_RESPONSE,
      payload: {
        requestId,
        result,
        error
      } as ToolResponseMessage
    };
    
    // Send response message
    this.ws.send(JSON.stringify(message), (err) => {
      if (err) {
        logger.error(`Failed to send tool response: ${err.message}`, err);
      } else {
        logger.debug(`Sent tool response for request ${requestId}`);
      }
    });
  }

  /**
   * Send a ping message to the server
   */
  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    logger.debug('Sending ping to server');
    
    // Create ping message
    const message: WebSocketMessage = {
      type: MessageType.PING,
      payload: { timestamp: Date.now() }
    };
    
    // Send ping message
    this.ws.send(JSON.stringify(message), (error) => {
      if (error) {
        logger.warn(`Failed to send ping: ${error.message}`);
      }
    });
  }

  /**
   * Send a pong message to the server
   */
  private sendPong(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    logger.debug('Sending pong to server');
    
    // Create pong message
    const message: WebSocketMessage = {
      type: MessageType.PONG,
      payload: { timestamp: Date.now() }
    };
    
    // Send pong message
    this.ws.send(JSON.stringify(message), (error) => {
      if (error) {
        logger.warn(`Failed to send pong: ${error.message}`);
      }
    });
  }

  /**
   * Set up ping interval for keep-alive
   */
  private setupPingInterval(): void {
    // Clear existing interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Set up ping interval - 30 seconds
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 30000);
  }

  /**
   * Attempt to reconnect to the server
   */
  private attemptReconnect(): void {
    // Don't attempt to reconnect if we're already reconnecting
    if (this.isReconnecting) {
      return;
    }
    
    // Don't attempt to reconnect if we've reached the maximum number of attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Failed to reconnect after ${this.reconnectAttempts} attempts`);
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    // Calculate backoff delay with exponential backoff and jitter
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      60000 // Max 60 seconds
    ) * (0.5 + Math.random());
    
    logger.info(`Attempting to reconnect in ${Math.round(delay / 1000)} seconds (attempt ${this.reconnectAttempts})`);
    
    // Set up reconnect timeout
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
        
        // Additional check to ensure tools are registered after a successful reconnection
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.registeredTools.length > 0) {
          logger.info(`Reconnection successful, ensuring tools are re-registered`);
          try {
            await this.registerTools(this.registeredTools);
            logger.info(`Successfully re-registered ${this.registeredTools.length} tools after reconnection`);
          } catch (registerError) {
            logger.error(`Failed to re-register tools after reconnection: ${(registerError as Error).message}`, registerError as Error);
          }
        }
      } catch (error) {
        logger.error('Reconnection attempt failed', error as Error);
        this.isReconnecting = false;
        this.attemptReconnect();
      }
    }, delay);
  }
} 