/**
 * Common TypeScript type definitions for RESTifyMCP
 */

/**
 * MCP Tool Definition
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns?: unknown;
}

/**
 * Client Registration
 */
export interface ClientRegistration {
  clientId: string;
  bearerToken: string;
  tools: MCPToolDefinition[];
  connectionStatus: 'connected' | 'disconnected';
  lastSeen: string | Date; // ISO timestamp or Date object
  connectionId?: string; // ID of the current WebSocket connection
}

/**
 * Validated Configuration
 */
export interface ValidatedConfig {
  mode: 'server' | 'client' | 'combo';
  server?: ServerConfig;
  client?: ClientConfig;
}

/**
 * API Space Interface
 * Represents an isolated API namespace with its own authentication
 */
export interface APISpace {
  // Unique name for the API Space
  name: string;
  
  // Optional description
  description?: string;
  
  // Bearer token for accessing this API Space
  bearerToken: string;
  
  // List of client tokens allowed in this space
  allowedClientTokens: string[];
}

/**
 * Admin Configuration
 */
export interface AdminConfig {
  // Admin token for accessing the dashboard
  adminToken: string;
}

/**
 * Server Configuration
 */
export interface ServerConfig {
  http: {
    port: number;
    host: string;
    publicUrl?: string;
  };
  
  // API Spaces replace the simple bearerTokens array
  apiSpaces: APISpace[];
  
  // Admin configuration
  admin?: AdminConfig;
  
  // Optional logging configuration
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'text' | 'json';
  };
}

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  // Unique ID for the MCP server (for internal reference only)
  id: string;
  
  // The command to execute
  command: string;
  
  // Arguments for the command
  args: string[];
  
  // Optional environment variables
  env?: Record<string, string>;
  
  // Optional working directory
  cwd?: string;
}

/**
 * Client Configuration
 */
export interface ClientConfig {
  serverUrl: string;
  bearerToken: string;
  
  // For backward compatibility
  mcpCommand?: string;
  mcpArgs?: string[];
  
  // New field for multi-server support
  mcpServers?: MCPServerConfig[];
}

/**
 * REST API Tool Request
 */
export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * REST API Tool Response
 */
export interface ToolResponse {
  result: unknown;
}

/**
 * WebSocket Message Types
 */
export enum MessageType {
  REGISTER = 'register',
  UNREGISTER = 'unregister',
  TOOL_REQUEST = 'tool_request',
  TOOL_RESPONSE = 'tool_response',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong'
}

/**
 * WebSocket Message
 */
export interface WebSocketMessage {
  type: MessageType;
  payload: unknown;
}

/**
 * Registration Message
 */
export interface RegistrationMessage {
  clientId: string;
  bearerToken: string;
  tools: MCPToolDefinition[];
}

/**
 * Tool Request Message
 */
export interface ToolRequestMessage {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tool Response Message
 */
export interface ToolResponseMessage {
  requestId: string;
  result: unknown;
  error?: string;
}

/**
 * Error Message
 */
export interface ErrorMessage {
  message: string;
  code: string;
} 