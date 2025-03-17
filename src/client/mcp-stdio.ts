/**
 * MCP Stdio Client
 * 
 * This module communicates with an MCP server via stdio.
 */
import { spawn, ChildProcess } from 'child_process';
import { MCPToolDefinition } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError, timeout } from '../shared/utils.js';

// Import MCP SDK components with .js extension for ESM compatibility
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

// Set up logger
const logger = new ConsoleLogger('MCPStdioClient', LogLevel.INFO);

/**
 * MCP Stdio Client interface
 */
export interface MCPStdioInterface {
  startMCPServer(): Promise<void>;
  stopMCPServer(): Promise<void>;
  getAvailableTools(): Promise<MCPToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * MCP Stdio Client implementation using official MCP SDK
 * This implementation is protocol-agnostic and works with any MCP server
 */
export class MCPStdioClient implements MCPStdioInterface {
  private readonly command: string;
  private readonly args: string[];
  private readonly env?: Record<string, string>;
  private readonly cwd?: string;
  private process: ChildProcess | null = null;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private _availableTools: MCPToolDefinition[] | null = null;
  private connectionDeadline = 10000; // 10 seconds
  private reconnectRetries = 0;
  private readonly maxReconnectRetries = 5;

  /**
   * Create a new MCP Stdio Client
   * @param command Command to run MCP server
   * @param args Arguments for MCP server command
   * @param env Optional environment variables
   * @param cwd Optional working directory
   */
  constructor(
    command: string, 
    args: string[] = [], 
    env?: Record<string, string>,
    cwd?: string
  ) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    logger.info(`MCPStdioClient created for command: ${command} ${args.join(' ')}`);
  }

  /**
   * Start the MCP server process
   */
  async startMCPServer(): Promise<void> {
    if (this.client && this.transport) {
      logger.warn('MCP server process already running');
      return;
    }

    logger.info(`Starting MCP server: ${this.command} ${this.args.join(' ')}`);
    
    try {
      // Prepare environment variables using SDK's getDefaultEnvironment
      const defaultEnv = getDefaultEnvironment();
      const combinedEnv = this.env ? { ...defaultEnv, ...this.env } : defaultEnv;
      
      // Create a transport that communicates with the MCP server via stdio
      this.transport = new StdioClientTransport({
        command: this.command,
        args: this.args,
        env: combinedEnv,
        cwd: this.cwd
      });
      
      // Store process reference for monitoring
      // @ts-ignore - StdioClientTransport does have a process property in runtime
      this.process = this.transport.process;
      
      // Set up error handling for the process
      if (this.process) {
        this.process.on('error', (error) => {
          logger.error(`MCP server process error: ${error.message}`, error);
        });
        
        this.process.on('exit', (code, signal) => {
          logger.info(`MCP server process exited with code ${code} and signal ${signal}`);
          this.process = null;
          
          // Attempt reconnection if not explicitly stopped
          if (this.client) {
            this.attemptReconnect();
          }
        });

        // Log stderr output
        if (this.process.stderr) {
          this.process.stderr.on('data', (data) => {
            logger.debug(`MCP stderr: ${data.toString()}`);
          });
        }
      }
      
      // Create an MCP client with appropriate capabilities
      this.client = new Client(
        { name: "restifymcp-client", version: "1.0.0" },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );
      
      // Connect to the MCP server with timeout
      await timeout(
        this.client.connect(this.transport),
        this.connectionDeadline,
        `Connection to MCP server timed out after ${this.connectionDeadline}ms`
      );
      
      // Reset reconnect retries on successful connection
      this.reconnectRetries = 0;
      
      logger.info('MCP server started successfully');
    } catch (error) {
      // Clean up if startup fails
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      
      this.transport = null;
      this.client = null;
      
      logger.error('Failed to start MCP server', error as Error);
      throw new RESTifyMCPError(
        `Failed to start MCP server: ${(error as Error).message}`,
        'MCP_START_ERROR'
      );
    }
  }

  /**
   * Stop the MCP server process
   */
  async stopMCPServer(): Promise<void> {
    if (!this.process) {
      logger.warn('No MCP server process to stop');
      return;
    }
    
    logger.info('Stopping MCP server');
    
    return new Promise<void>((resolve) => {
      // Set up a timeout for forceful termination
      const killTimeout = setTimeout(() => {
        if (this.process) {
          logger.warn('Forcefully terminating MCP server');
          this.process.kill('SIGKILL');
        }
      }, 5000); // 5 seconds timeout
      
      // Set up exit handler
      const exitHandler = () => {
        clearTimeout(killTimeout);
        this.process = null;
        this.transport = null;
        this.client = null;
        logger.info('MCP server stopped');
        resolve();
      };
      
      // If process already exited
      if (!this.process) {
        exitHandler();
        return;
      }
      
      // Set up one-time exit listener
      this.process.once('exit', exitHandler);
      
      // Try graceful termination first
      this.process.kill('SIGTERM');
    });
  }

  /**
   * Get available tools from the MCP server
   */
  async getAvailableTools(): Promise<MCPToolDefinition[]> {
    try {
      // If tools are already cached, return them
      if (this._availableTools) {
        return this._availableTools;
      }
      
      // Ensure server is running
      if (!this.client) {
        throw new RESTifyMCPError('MCP server not running', 'MCP_NOT_RUNNING');
      }
      
      logger.info('Getting available tools from MCP server');
      
      // Get tools from the client
      const toolList = await this.client.listTools();
      
      // Convert to our internal format
      const convertedTools: MCPToolDefinition[] = toolList.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema,
        returns: tool.outputSchema
      }));
      
      logger.info(`Received ${convertedTools.length} tools from MCP server`);
      
      // Cache the tools
      this._availableTools = convertedTools;
      
      return convertedTools;
    } catch (error) {
      logger.error('Failed to get tools from MCP server', error as Error);
      throw new RESTifyMCPError(
        `Failed to get tools: ${(error as Error).message}`,
        'MCP_GET_TOOLS_ERROR'
      );
    }
  }

  /**
   * Call a tool on the MCP server
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool result
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      // Ensure server is running
      if (!this.client) {
        throw new RESTifyMCPError('MCP server not running', 'MCP_NOT_RUNNING');
      }
      
      logger.info(`Calling tool ${name} on MCP server`);
      logger.debug(`Tool arguments: ${JSON.stringify(args)}`);
      
      // Call the tool using the MCP SDK
      const result = await this.client.callTool({
        name: name,
        arguments: args
      });
      
      // Check for error in result
      if (result.isError) {
        let errorText = 'Unknown error';
        // Safely extract error text from content if available
        if (Array.isArray(result.content) && result.content.length > 0) {
          const firstContent = result.content[0];
          if (firstContent && typeof firstContent === 'object' && 'text' in firstContent) {
            errorText = firstContent.text as string;
          }
        }
        throw new Error(errorText);
      }
      
      // Return the raw content - let the consumer handle the format based on their needs
      logger.debug(`Tool result received`);
      return result.content;
    } catch (error) {
      logger.error(`Failed to call tool ${name}`, error as Error);
      throw new RESTifyMCPError(
        `Failed to call tool ${name}: ${(error as Error).message}`,
        'MCP_TOOL_ERROR'
      );
    }
  }

  /**
   * Attempt to reconnect to the MCP server
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectRetries >= this.maxReconnectRetries) {
      logger.error(`Failed to reconnect to MCP server after ${this.reconnectRetries} attempts`);
      return;
    }
    
    this.reconnectRetries++;
    
    // Exponential backoff with jitter
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectRetries - 1),
      30000 // Max 30 seconds
    ) * (0.5 + Math.random());
    
    logger.info(`Attempting to reconnect in ${Math.round(delay / 1000)} seconds (attempt ${this.reconnectRetries})`);
    
    setTimeout(async () => {
      try {
        await this.startMCPServer();
        logger.info('Successfully reconnected to MCP server');
      } catch (error) {
        logger.error('Reconnection attempt failed', error as Error);
        this.attemptReconnect();
      }
    }, delay);
  }
} 