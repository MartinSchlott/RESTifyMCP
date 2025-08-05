/**
 * OpenAPI Server Manager
 * 
 * This module manages OpenAPI servers and converts their endpoints to MCP tools.
 */
import { OpenAPIServerConfig, MCPToolDefinition } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError } from '../shared/utils.js';

// Set up logger
const logger = new ConsoleLogger('OpenAPIServerManager', LogLevel.INFO);

/**
 * MCP Tool Definition with additional OpenAPI metadata
 */
interface OpenAPIToolDefinition extends MCPToolDefinition {
  path: string;  // Store the original OpenAPI path
}

/**
 * State of an OpenAPI server
 */
interface OpenAPIServerState {
  id: string;
  config: OpenAPIServerConfig;
  tools: OpenAPIToolDefinition[];
  status: 'initializing' | 'connected' | 'disconnected' | 'error';
  error?: Error;
}

/**
 * OpenAPI specification types
 */
interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * OpenAPI path operation
 */
interface OpenAPIPathOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: any;
      };
    };
  };
  responses?: {
    '200'?: {
      content?: {
        'application/json'?: {
          schema?: any;
        };
      };
    };
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Manager interface for OpenAPI servers
 */
export interface OpenAPIServerManagerInterface {
  // Initialize all configured OpenAPI servers
  initialize(): Promise<void>;
  
  // Get all available tools from all connected OpenAPI servers
  getAllTools(): MCPToolDefinition[];
  
  // Call a tool on an appropriate OpenAPI server
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  
  // Get server state
  getServerState(serverId: string): OpenAPIServerState | undefined;
}

/**
 * OpenAPI Server Manager for handling multiple OpenAPI servers
 */
export class OpenAPIServerManager implements OpenAPIServerManagerInterface {
  private readonly serverConfigs: OpenAPIServerConfig[];
  private readonly servers: Map<string, OpenAPIServerState> = new Map();
  private readonly toolProviderMap: Map<string, string> = new Map();
  
  /**
   * Create a new OpenAPI Server Manager
   * @param serverConfigs Array of OpenAPI server configurations
   */
  constructor(serverConfigs: OpenAPIServerConfig[]) {
    this.serverConfigs = serverConfigs;
    logger.info(`OpenAPIServerManager created with ${serverConfigs.length} server configurations`);
  }
  
  /**
   * Initialize all configured OpenAPI servers
   */
  async initialize(): Promise<void> {
    logger.info('Initializing OpenAPI servers');
    
    // Initialize server states
    for (const config of this.serverConfigs) {
      this.servers.set(config.id, {
        id: config.id,
        config,
        tools: [],
        status: 'initializing'
      });
    }
    
    // Initialize all servers
    await this.initializeAllServers();
  }
  
  /**
   * Initialize all OpenAPI servers
   */
  private async initializeAllServers(): Promise<void> {
    logger.info('Initializing all OpenAPI servers');
    
    const initPromises = Array.from(this.servers.values()).map(server => 
      this.initializeServer(server.id).catch(error => {
        logger.error(`Failed to initialize OpenAPI server ${server.id}`, error);
        // Update server state with error
        const serverState = this.servers.get(server.id);
        if (serverState) {
          serverState.status = 'error';
          serverState.error = error as Error;
        }
      })
    );
    
    await Promise.allSettled(initPromises);
    
    // Update tool provider map
    this.updateToolProviderMap();
    
    const connectedServers = Array.from(this.servers.values()).filter(s => s.status === 'connected');
    logger.info(`Successfully initialized ${connectedServers.length} OpenAPI servers`);
  }
  
  /**
   * Initialize a single OpenAPI server
   */
  private async initializeServer(serverId: string): Promise<void> {
    const serverState = this.servers.get(serverId);
    if (!serverState) {
      throw new RESTifyMCPError(`Server ${serverId} not found`, 'SERVER_NOT_FOUND');
    }
    
    logger.info(`Initializing OpenAPI server: ${serverId}`);
    
    try {
      // Fetch OpenAPI specification
      const spec = await this.fetchOpenAPISpec(serverState.config);
      
      // Parse tools from OpenAPI specification
      const tools = this.parseToolsFromOpenAPISpec(spec, serverState.config);
      
      // Update server state
      serverState.tools = tools;
      serverState.status = 'connected';
      
      logger.info(`OpenAPI server ${serverId} initialized with ${tools.length} tools`);
    } catch (error) {
      serverState.status = 'error';
      serverState.error = error as Error;
      throw error;
    }
  }
  
  /**
   * Fetch OpenAPI specification from URL
   */
  private async fetchOpenAPISpec(config: OpenAPIServerConfig): Promise<OpenAPISpec> {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    
    if (config.bearerToken) {
      headers['Authorization'] = `Bearer ${config.bearerToken}`;
    }
    
    try {
      const response = await fetch(config.openApiUrl, { headers });
      
      if (!response.ok) {
        throw new RESTifyMCPError(
          `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
          'OPENAPI_FETCH_ERROR'
        );
      }
      
      const spec = await response.json() as OpenAPISpec;
      
      if (!spec.openapi || !spec.paths) {
        throw new RESTifyMCPError('Invalid OpenAPI specification', 'INVALID_OPENAPI_SPEC');
      }
      
      return spec;
    } catch (error) {
      if (error instanceof RESTifyMCPError) {
        throw error;
      }
      throw new RESTifyMCPError(
        `Failed to fetch OpenAPI spec: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'OPENAPI_FETCH_ERROR'
      );
    }
  }
  
  /**
   * Parse tools from OpenAPI specification
   */
  private parseToolsFromOpenAPISpec(spec: OpenAPISpec, config: OpenAPIServerConfig): OpenAPIToolDefinition[] {
    const tools: OpenAPIToolDefinition[] = [];
    
    for (const [path, operations] of Object.entries(spec.paths)) {
      // Only process POST operations
      const postOperation = operations.post;
      if (!postOperation) {
        logger.debug(`Skipping ${path} - not POST`);
        continue;
      }
      
      // Check if operation has application/json request body
      const requestBody = postOperation.requestBody;
      if (!requestBody?.content?.['application/json']?.schema) {
        logger.debug(`Skipping ${path} - no application/json request body`);
        continue;
      }
      
      // Check for complex schemas (oneOf, allOf, anyOf)
      const schema = requestBody.content['application/json'].schema;
      if (this.hasComplexSchema(schema)) {
        logger.debug(`Skipping ${path} - has complex schema (oneOf/allOf/anyOf)`);
        continue;
      }
      
      // Generate tool name
      const toolName = postOperation.operationId || this.generateToolNameFromPath(path);
      
      // Create tool definition - use schema 1:1 like MCP servers
      const tool: OpenAPIToolDefinition = {
        name: toolName,
        description: postOperation.description || postOperation.summary || `POST ${path}`,
        parameters: schema, // 1:1 transfer like MCP servers
        path: path // Store the path
      };
      
      tools.push(tool);
      logger.debug(`Created tool: ${toolName} for ${path}`);
    }
    
    return tools;
  }
  
  /**
   * Check if schema has complex structures
   */
  private hasComplexSchema(schema: any): boolean {
    if (!schema || typeof schema !== 'object') {
      return false;
    }
    
    // Check for oneOf, allOf, anyOf
    if (schema.oneOf || schema.allOf || schema.anyOf) {
      return true;
    }
    
    // Recursively check properties
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (this.hasComplexSchema(prop)) {
          return true;
        }
      }
    }
    
    // Check items for arrays
    if (schema.items && this.hasComplexSchema(schema.items)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate tool name from path
   */
  private generateToolNameFromPath(path: string): string {
    // Remove leading slash and split by slashes
    const segments = path.replace(/^\//, '').split('/');
    
    // Get the last non-empty segment
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i] && segments[i] !== '') {
        return segments[i];
      }
    }
    
    // Fallback
    return 'default';
  }
  
  
  /**
   * Convert a single schema property
   */
  private convertSchemaProperty(schema: any): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    // Type
    if (schema.type) {
      result.type = schema.type;
    }
    
    // Description
    if (schema.description) {
      result.description = schema.description;
    }
    
    // Enum
    if (schema.enum) {
      result.enum = schema.enum;
    }
    
    // Default
    if (schema.default !== undefined) {
      result.default = schema.default;
    }
    
    // Format
    if (schema.format) {
      result.format = schema.format;
    }
    
    // Pattern
    if (schema.pattern) {
      result.pattern = schema.pattern;
    }
    
    // Minimum/Maximum
    if (schema.minimum !== undefined) {
      result.minimum = schema.minimum;
    }
    if (schema.maximum !== undefined) {
      result.maximum = schema.maximum;
    }
    
    // MinLength/MaxLength
    if (schema.minLength !== undefined) {
      result.minLength = schema.minLength;
    }
    if (schema.maxLength !== undefined) {
      result.maxLength = schema.maxLength;
    }
    
    return result;
  }
  
  /**
   * Update tool provider map
   */
  private updateToolProviderMap(): void {
    this.toolProviderMap.clear();
    
    for (const [serverId, server] of this.servers) {
      if (server.status === 'connected') {
        for (const tool of server.tools) {
          this.toolProviderMap.set(tool.name, serverId);
        }
      }
    }
    
    logger.debug(`Updated tool provider map with ${this.toolProviderMap.size} tools`);
  }
  
  /**
   * Get all available tools from all connected OpenAPI servers
   */
  getAllTools(): MCPToolDefinition[] {
    const allTools: MCPToolDefinition[] = [];
    
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        // Convert OpenAPIToolDefinition to MCPToolDefinition by removing the path field
        for (const tool of server.tools) {
          const { path, ...mcpTool } = tool;
          allTools.push(mcpTool);
        }
      }
    }
    
    return allTools;
  }
  
  /**
   * Call a tool on an appropriate OpenAPI server
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const serverId = this.toolProviderMap.get(toolName);
    if (!serverId) {
      throw new RESTifyMCPError(`Tool ${toolName} not found`, 'TOOL_NOT_FOUND');
    }
    
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new RESTifyMCPError(`Server ${serverId} is not available`, 'SERVER_NOT_AVAILABLE');
    }
    
    // Find the tool to get the path
    const tool = server.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new RESTifyMCPError(`Tool ${toolName} not found in server ${serverId}`, 'TOOL_NOT_FOUND');
    }
    
    return this.callOpenAPITool(server.config, tool.path, args);
  }
  
  /**
   * Call an OpenAPI tool
   */
  private async callOpenAPITool(config: OpenAPIServerConfig, path: string, args: Record<string, unknown>): Promise<unknown> {
    const url = new URL(path, config.openApiUrl).toString();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    if (config.bearerToken) {
      headers['Authorization'] = `Bearer ${config.bearerToken}`;
    }
    
    logger.info(`=== OPENAPI TOOL CALL ===`);
    logger.info(`URL: ${url}`);
    logger.info(`Path: ${path}`);
    logger.info(`Headers: ${JSON.stringify(headers)}`);
    logger.info(`Args: ${JSON.stringify(args)}`);
    logger.info(`Args type: ${typeof args}`);
    logger.info(`Args keys: ${Object.keys(args).join(', ')}`);
    logger.info(`=== END OPENAPI TOOL CALL ===`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(args)
      });
      
      const responseText = await response.text();
      let responseData: unknown;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // If response is not JSON, return as string
        responseData = responseText;
      }
      
      logger.info(`=== OPENAPI RESPONSE ===`);
      logger.info(`Status: ${response.status}`);
      logger.info(`Status Text: ${response.statusText}`);
      logger.info(`Response Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
      logger.info(`Response Text: ${responseText}`);
      logger.info(`Response Data: ${JSON.stringify(responseData)}`);
      logger.info(`=== END OPENAPI RESPONSE ===`);
      
      if (response.ok) {
        return responseData;
      } else {
        // Return error response
        return {
          error: true,
          status: response.status,
          statusText: response.statusText,
          data: responseData
        };
      }
    } catch (error) {
      logger.error(`=== OPENAPI ERROR ===`);
      logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error(`Error type: ${typeof error}`);
      logger.error(`Error details: ${JSON.stringify(error)}`);
      logger.error(`=== END OPENAPI ERROR ===`);
      
      throw new RESTifyMCPError(
        `Failed to call OpenAPI tool ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'OPENAPI_CALL_ERROR'
      );
    }
  }
  
  /**
   * Get server state
   */
  getServerState(serverId: string): OpenAPIServerState | undefined {
    return this.servers.get(serverId);
  }
} 