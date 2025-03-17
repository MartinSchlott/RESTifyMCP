/**
 * MCP Manager
 * 
 * This module manages multiple MCP servers.
 */
import { ChildProcess } from 'child_process';
import { MCPServerConfig, MCPToolDefinition } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError } from '../shared/utils.js';
import { MCPStdioClient } from './mcp-stdio.js';

// Set up logger
const logger = new ConsoleLogger('MCPManager', LogLevel.INFO);

/**
 * State of an MCP server
 */
interface MCPServerState {
  id: string;
  config: MCPServerConfig;
  client: MCPStdioClient | null;
  tools: MCPToolDefinition[];
  status: 'initializing' | 'connected' | 'disconnected' | 'error';
  error?: Error;
}

/**
 * Manager interface for multiple MCP servers
 */
export interface MCPManagerInterface {
  // Initialize all configured MCP servers
  initialize(): Promise<void>;
  
  // Start all MCP servers
  startAllServers(): Promise<void>;
  
  // Stop all MCP servers
  stopAllServers(): Promise<void>;
  
  // Call a tool on an appropriate MCP server
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  
  // Get all available tools from all connected MCP servers
  getAllTools(): MCPToolDefinition[];
}

/**
 * MCP Manager for handling multiple MCP servers
 */
export class MCPManager implements MCPManagerInterface {
  private readonly serverConfigs: MCPServerConfig[];
  private readonly servers: Map<string, MCPServerState> = new Map();
  private readonly toolProviderMap: Map<string, string> = new Map();
  
  /**
   * Create a new MCP Manager
   * @param serverConfigs Array of MCP server configurations
   */
  constructor(serverConfigs: MCPServerConfig[]) {
    this.serverConfigs = serverConfigs;
    logger.info(`MCPManager created with ${serverConfigs.length} server configurations`);
  }
  
  /**
   * Initialize all configured MCP servers
   */
  async initialize(): Promise<void> {
    logger.info('Initializing MCP servers');
    
    // Initialize server states
    for (const config of this.serverConfigs) {
      this.servers.set(config.id, {
        id: config.id,
        config,
        client: null,
        tools: [],
        status: 'initializing'
      });
    }
    
    // Start all servers
    await this.startAllServers();
  }
  
  /**
   * Start all MCP servers
   */
  async startAllServers(): Promise<void> {
    logger.info('Starting all MCP servers');
    
    const startPromises = Array.from(this.servers.values()).map(server => 
      this.startServer(server.id).catch(error => {
        logger.error(`Failed to start MCP server ${server.id}`, error);
        // Update server state with error
        const serverState = this.servers.get(server.id);
        if (serverState) {
          serverState.status = 'error';
          serverState.error = error as Error;
        }
      })
    );
    
    await Promise.all(startPromises);
    this.updateToolProviderMap();
    logger.info('All MCP servers started');
  }
  
  /**
   * Start a specific MCP server
   * @param serverId ID of the server to start
   */
  private async startServer(serverId: string): Promise<void> {
    const serverState = this.servers.get(serverId);
    if (!serverState) {
      throw new RESTifyMCPError(`Server ${serverId} not found`, 'SERVER_NOT_FOUND');
    }
    
    logger.info(`Starting MCP server ${serverId}`);
    
    // Create MCP client
    const mcpClient = new MCPStdioClient(
      serverState.config.command,
      serverState.config.args,
      serverState.config.env,
      serverState.config.cwd
    );
    
    // Start MCP server
    await mcpClient.startMCPServer();
    
    // Get tools from MCP server
    const tools = await mcpClient.getAvailableTools();
    logger.info(`Discovered ${tools.length} tools from MCP server ${serverId}`);
    
    // Update server state
    serverState.client = mcpClient;
    serverState.tools = tools;
    serverState.status = 'connected';
    
    logger.info(`MCP server ${serverId} started successfully`);
  }
  
  /**
   * Update the tool provider map with all available tools
   */
  private updateToolProviderMap(): void {
    // Clear existing map
    this.toolProviderMap.clear();
    
    // Map tools to their provider servers
    // First server wins in case of conflicts
    for (const [serverId, serverState] of this.servers.entries()) {
      if (serverState.status === 'connected' && serverState.tools.length > 0) {
        for (const tool of serverState.tools) {
          // Only add the tool if it doesn't already exist in the map
          if (!this.toolProviderMap.has(tool.name)) {
            this.toolProviderMap.set(tool.name, serverId);
          } else {
            // Log a warning for tool name conflict
            const existingProvider = this.toolProviderMap.get(tool.name);
            logger.warn(`Tool name conflict: "${tool.name}" provided by both ${existingProvider} and ${serverId}. Using the one from ${existingProvider}.`);
          }
        }
      }
    }
    
    logger.info(`Tool provider map updated with ${this.toolProviderMap.size} unique tools`);
  }
  
  /**
   * Stop all MCP servers
   */
  async stopAllServers(): Promise<void> {
    logger.info('Stopping all MCP servers');
    
    const stopPromises = Array.from(this.servers.values())
      .filter(server => server.client !== null)
      .map(server => 
        this.stopServer(server.id).catch(error => {
          logger.error(`Error stopping MCP server ${server.id}`, error);
        })
      );
    
    await Promise.all(stopPromises);
    logger.info('All MCP servers stopped');
  }
  
  /**
   * Stop a specific MCP server
   * @param serverId ID of the server to stop
   */
  private async stopServer(serverId: string): Promise<void> {
    const serverState = this.servers.get(serverId);
    if (!serverState || !serverState.client) {
      return;
    }
    
    logger.info(`Stopping MCP server ${serverId}`);
    
    try {
      await serverState.client.stopMCPServer();
      
      // Update server state
      serverState.client = null;
      serverState.status = 'disconnected';
      
      logger.info(`MCP server ${serverId} stopped successfully`);
    } catch (error) {
      logger.error(`Failed to stop MCP server ${serverId}`, error as Error);
      // Update server state with error
      serverState.status = 'error';
      serverState.error = error as Error;
      throw error;
    }
  }
  
  /**
   * Call a tool on an appropriate MCP server
   * @param toolName Name of the tool to call
   * @param args Arguments for the tool
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const serverId = this.toolProviderMap.get(toolName);
    if (!serverId) {
      throw new RESTifyMCPError(`No server provides tool: ${toolName}`, 'TOOL_NOT_FOUND');
    }
    
    const serverState = this.servers.get(serverId);
    if (!serverState || !serverState.client) {
      throw new RESTifyMCPError(`Server ${serverId} not available`, 'SERVER_UNAVAILABLE');
    }
    
    logger.info(`Calling tool ${toolName} on MCP server ${serverId}`);
    
    try {
      return await serverState.client.callTool(toolName, args);
    } catch (error) {
      logger.error(`Error calling tool ${toolName} on MCP server ${serverId}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Get all available tools from all connected MCP servers
   */
  getAllTools(): MCPToolDefinition[] {
    const allTools: MCPToolDefinition[] = [];
    const seenToolNames = new Set<string>();
    
    // Collect tools from all servers
    for (const serverState of this.servers.values()) {
      if (serverState.status === 'connected' && serverState.tools.length > 0) {
        for (const tool of serverState.tools) {
          if (!seenToolNames.has(tool.name)) {
            allTools.push(tool);
            seenToolNames.add(tool.name);
          }
        }
      }
    }
    
    return allTools;
  }
} 