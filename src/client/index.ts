/**
 * RESTifyMCP Client Module
 * 
 * This module implements the client mode of RESTifyMCP.
 */

import { ValidatedConfig } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError, generateClientIdFromToken } from '../shared/utils.js';
import { MCPStdioClient } from './mcp-stdio.js';
import { WSClient } from './websocket-client.js';

// Set up logger
const logger = new ConsoleLogger('Client', LogLevel.INFO);

/**
 * RESTifyClient class
 */
export default class RESTifyClient {
  private readonly config: ValidatedConfig;
  private readonly clientId: string;
  private mcpClient: MCPStdioClient | null = null;
  private wsClient: WSClient | null = null;
  
  /**
   * Create a new RESTifyClient instance
   * @param config Validated configuration
   */
  constructor(config: ValidatedConfig) {
    this.config = config;
    
    if (!this.config.client || !this.config.client.bearerToken) {
      throw new RESTifyMCPError('Bearer token must be defined in client configuration', 'MISSING_TOKEN');
    }
    
    // Generate client ID from the bearer token
    this.clientId = generateClientIdFromToken(this.config.client.bearerToken);
    logger.info(`RESTifyClient created with ID: ${this.clientId}`);
  }
  
  /**
   * Start the client
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting RESTifyClient');
      
      // Initialize client components
      if (!this.config.client) {
        throw new RESTifyMCPError('Client configuration required', 'CONFIG_ERROR');
      }
      
      // Create MCP client
      this.mcpClient = new MCPStdioClient(
        this.config.client.mcpCommand,
        this.config.client.mcpArgs
      );
      
      // Start MCP server
      await this.mcpClient.startMCPServer();
      
      // Get tools from MCP server
      const tools = await this.mcpClient.getAvailableTools();
      logger.info(`Discovered ${tools.length} tools from MCP server`);
      
      // Create WebSocket client
      this.wsClient = new WSClient(
        this.config.client.serverUrl,
        this.clientId,
        this.config.client.bearerToken
      );
      
      // Set tool handler
      this.wsClient.setToolHandler(async (toolName, args, requestId) => {
        if (!this.mcpClient) {
          throw new RESTifyMCPError('MCP client not initialized', 'MCP_NOT_INITIALIZED');
        }
        
        logger.info(`Invoking tool ${toolName} (${requestId})`);
        return this.mcpClient.callTool(toolName, args);
      });
      
      // Connect to WebSocket server
      await this.wsClient.connect();
      
      // Register tools with server
      await this.wsClient.registerTools(tools);
      
      logger.info('RESTifyClient started successfully');
    } catch (error) {
      logger.error('Failed to start RESTifyClient', error as Error);
      await this.cleanup();
      throw error;
    }
  }
  
  /**
   * Stop the client
   */
  async stop(): Promise<void> {
    logger.info('Stopping RESTifyClient');
    await this.cleanup();
    logger.info('RESTifyClient stopped');
  }
  
  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Disconnect from WebSocket server
    if (this.wsClient) {
      try {
        await this.wsClient.disconnect();
      } catch (error) {
        logger.error('Error disconnecting from WebSocket server', error as Error);
      }
    }
    
    // Stop MCP server
    if (this.mcpClient) {
      try {
        await this.mcpClient.stopMCPServer();
      } catch (error) {
        logger.error('Error stopping MCP server', error as Error);
      }
    }
  }
} 