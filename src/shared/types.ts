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
 * Server Configuration
 */
export interface ServerConfig {
  http: {
    port: number;
    host: string;
    publicUrl?: string;
  };
  auth: {
    bearerTokens: string[];
  };
}

/**
 * Server Configuration Legacy (for backward compatibility)
 */
export interface ServerConfigLegacy {
  port: number;
  host: string;
  bearerToken: string;
}

/**
 * Client Configuration
 */
export interface ClientConfig {
  serverUrl: string;
  bearerToken: string;
  mcpCommand: string;
  mcpArgs: string[];
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