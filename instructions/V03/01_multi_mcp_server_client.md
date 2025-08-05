# RESTifyMCP Client Enhancement: Multi-MCP-Server Support

## Concept Overview

The goal is to develop a RESTifyMCP client that can start and manage multiple MCP servers simultaneously. The tools from all MCP servers will be aggregated and provided to the RESTify server as a unified interface.

## New Data Structures

### MCPServerConfig (In shared/types.ts)

```typescript
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
 * Enhanced Client Configuration
 */
export interface ClientConfig {
  serverUrl: string;
  bearerToken: string;
  
  // Replacement for mcpCommand and mcpArgs
  mcpServers: MCPServerConfig[];
}
```

### MCPServerState (In client/mcp-manager.ts)

```typescript
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
```

## New Components

### MCPManager (In client/mcp-manager.ts)

```typescript
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
```

## Tool Provision Workflow

1. All configured MCP servers are initialized on startup
2. The MCPManager retrieves the available tools from each server
3. The tools from all servers are aggregated into a combined list
4. This list is passed to the WebSocket client, which reports it to the RESTify server
5. When a tool is invoked, the MCPManager routes the request to the correct MCP server

## Tool Invocation Workflow

1. The WebSocket client receives a tool request from the server
2. The RESTifyClient forwards it to the MCPManager
3. The MCPManager identifies which MCP server provides the requested tool
4. The MCPManager calls the tool on the correct MCP server
5. The result is returned to the WebSocket client and then to the RESTify server

## Conflict Handling

Since no namespace strategy is implemented, we need to ensure that:

1. In case of tool name conflicts, the tool from the **first loaded** MCP server takes precedence
2. Conflicts are clearly logged so the user is informed

## Error Handling

1. If an MCP server fails during runtime, the other servers remain active
2. Tools from failed servers are removed from the list of available tools
3. The RESTify server is informed about the updated tool list

## Configuration Example

```json
{
  "mode": "client",
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "client-token-1",
    "mcpServers": [
      {
        "id": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
      },
      {
        "id": "data-processor",
        "command": "node",
        "args": ["./data-processor-mcp.js"]
      }
    ]
  }
}
```

## Implementation Strategy

1. Extend type definitions in shared/types.ts
2. Implement the MCPManager in client/mcp-manager.ts
3. Adapt the RESTifyClient to use the MCPManager
4. Update configuration validation
5. Adapt the Combo mode for the new client structure
