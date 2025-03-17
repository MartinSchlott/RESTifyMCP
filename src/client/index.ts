/**
 * RESTifyMCP Client Module
 * 
 * This module implements the client mode of RESTifyMCP.
 */

import { ClientConfig, MCPServerConfig, MCPToolDefinition, ValidatedConfig } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError, generateClientIdFromToken } from '../shared/utils.js';
import { MCPStdioClient } from './mcp-stdio.js';
import { WSClient } from './websocket-client.js';
import { MCPManager } from './mcp-manager.js';

// Set up logger
const logger = new ConsoleLogger('Client', LogLevel.INFO);

/**
 * RESTifyClient class
 */
export default class RESTifyClient {
  private readonly config: ValidatedConfig;
  private readonly clientId: string;
  private mcpClient: MCPStdioClient | null = null;
  private mcpManager: MCPManager | null = null;
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
      
      // Get tools from MCP server(s)
      const tools = await this.initializeMCPServers(this.config.client);
      logger.info(`Discovered ${tools.length} tools from MCP server(s)`);
      
      // Create WebSocket client
      this.wsClient = new WSClient(
        this.config.client.serverUrl,
        this.clientId,
        this.config.client.bearerToken
      );
      
      // Set tool handler
      this.wsClient.setToolHandler(async (toolName, args, requestId) => {
        logger.info(`Invoking tool ${toolName} (${requestId})`);
        
        // Use MCPManager if available, otherwise fall back to single MCPClient
        if (this.mcpManager) {
          return this.mcpManager.callTool(toolName, args);
        } else if (this.mcpClient) {
          return this.mcpClient.callTool(toolName, args);
        } else {
          throw new RESTifyMCPError('No MCP client or manager available', 'MCP_NOT_INITIALIZED');
        }
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
   * Initialize MCP servers based on configuration
   * @param clientConfig Client configuration
   * @returns List of available tools
   */
  private async initializeMCPServers(clientConfig: ClientConfig): Promise<MCPToolDefinition[]> {
    // Check if we have multi-server configuration
    if (clientConfig.mcpServers && clientConfig.mcpServers.length > 0) {
      logger.info(`Initializing ${clientConfig.mcpServers.length} MCP servers`);
      
      // Create and initialize MCPManager
      this.mcpManager = new MCPManager(clientConfig.mcpServers);
      await this.mcpManager.initialize();
      
      // Get all tools from the manager
      return this.mcpManager.getAllTools();
    } else if (clientConfig.mcpCommand) {
      // Legacy single-server mode
      logger.info(`Initializing single MCP server: ${clientConfig.mcpCommand}`);
      
      // Create MCP client
      this.mcpClient = new MCPStdioClient(
        clientConfig.mcpCommand,
        clientConfig.mcpArgs || []
      );
      
      // Start MCP server
      await this.mcpClient.startMCPServer();
      
      // Get tools from MCP server
      return this.mcpClient.getAvailableTools();
    } else {
      throw new RESTifyMCPError('No MCP server configuration provided', 'CONFIG_ERROR');
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
    
    // Stop MCP servers
    if (this.mcpManager) {
      try {
        await this.mcpManager.stopAllServers();
      } catch (error) {
        logger.error('Error stopping MCP servers', error as Error);
      }
    } else if (this.mcpClient) {
      try {
        await this.mcpClient.stopMCPServer();
      } catch (error) {
        logger.error('Error stopping MCP server', error as Error);
      }
    }
  }
} 