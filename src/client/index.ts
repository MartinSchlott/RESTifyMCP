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
import { OpenAPIServerManager } from './openapi-server-manager.js';

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
  private openApiManager: OpenAPIServerManager | null = null;
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
        
        // Try MCPManager first, then OpenAPI manager, then fall back to single MCPClient
        if (this.mcpManager) {
          try {
            return await this.mcpManager.callTool(toolName, args);
          } catch (error) {
            // Tool not found in MCP manager, try OpenAPI manager
            if (this.openApiManager) {
              return await this.openApiManager.callTool(toolName, args);
            }
            throw error;
          }
        } else if (this.openApiManager) {
          try {
            return await this.openApiManager.callTool(toolName, args);
          } catch (error) {
            // Tool not found in OpenAPI manager, try single MCP client
            if (this.mcpClient) {
              return await this.mcpClient.callTool(toolName, args);
            }
            throw error;
          }
        } else if (this.mcpClient) {
          return await this.mcpClient.callTool(toolName, args);
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
    const allTools: MCPToolDefinition[] = [];
    
    // Initialize MCP servers
    if (clientConfig.mcpServers && clientConfig.mcpServers.length > 0) {
      logger.info(`Initializing ${clientConfig.mcpServers.length} MCP servers`);
      
      this.mcpManager = new MCPManager(clientConfig.mcpServers);
      await this.mcpManager.initialize();
      
      const mcpTools = this.mcpManager.getAllTools();
      allTools.push(...mcpTools);
      logger.info(`Discovered ${mcpTools.length} tools from MCP servers`);
    } else if (clientConfig.mcpCommand && clientConfig.mcpArgs) {
      // Legacy single MCP server support
      logger.info('Initializing single MCP server (legacy mode)');
      
      this.mcpClient = new MCPStdioClient(
        clientConfig.mcpCommand,
        clientConfig.mcpArgs
      );
      
      await this.mcpClient.startMCPServer();
      const mcpTools = await this.mcpClient.getAvailableTools();
      allTools.push(...mcpTools);
      logger.info(`Discovered ${mcpTools.length} tools from MCP server`);
    }
    
    // Initialize OpenAPI servers
    if (clientConfig.openApiServers && clientConfig.openApiServers.length > 0) {
      logger.info(`Initializing ${clientConfig.openApiServers.length} OpenAPI servers`);
      
      this.openApiManager = new OpenAPIServerManager(clientConfig.openApiServers);
      await this.openApiManager.initialize();
      
      const openApiTools = this.openApiManager.getAllTools();
      allTools.push(...openApiTools);
      logger.info(`Discovered ${openApiTools.length} tools from OpenAPI servers`);
    }
    
    return allTools;
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
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    logger.info('Cleaning up RESTifyClient resources');
    
    // Stop WebSocket client
    if (this.wsClient) {
      await this.wsClient.disconnect();
      this.wsClient = null;
    }
    
    // Stop MCP manager
    if (this.mcpManager) {
      await this.mcpManager.stopAllServers();
      this.mcpManager = null;
    }
    
    // Stop single MCP client
    if (this.mcpClient) {
      await this.mcpClient.stopMCPServer();
      this.mcpClient = null;
    }
    
    // OpenAPI manager doesn't need cleanup (no persistent connections)
    this.openApiManager = null;
  }
} 