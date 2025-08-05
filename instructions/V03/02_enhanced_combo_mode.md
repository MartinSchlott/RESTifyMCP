# RESTifyMCP Enhanced Combo Mode: Supporting Multiple Client Connections

## Overview

Currently, the Combo mode of RESTifyMCP combines both server and client functionality in a single process, but only supports a single client (the built-in one). The goal is to enhance the Combo mode to allow additional external clients to connect while maintaining the integrated client functionality.

## Problem Statement

In the current implementation, the Combo mode initializes both the server and a single client. When additional clients try to connect to the same server, there's no mechanism to properly manage these connections as the focus is on the built-in client only.

## Solution Architecture

### Key Changes

1. **Clean Server-Client Separation**: Ensure that the server component of the Combo mode doesn't treat the built-in client differently from external clients.

2. **Connection Management**: Enhance the WSServer to properly manage and track multiple client connections, including the built-in client.

3. **Tool Registration**: Update the tool registration process to seamlessly handle tools from both the built-in client and external clients.

## Required Modifications

### 1. Combo Class Refactoring (In combo/index.ts)

```typescript
/**
 * Enhanced RESTifyCombo class
 */
export default class RESTifyCombo {
  private readonly config: ValidatedConfig;
  private readonly server: RESTifyServer;
  private readonly client: RESTifyClient;
  
  /**
   * Start method with improved initialization sequence
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting RESTifyCombo');
      
      // Start server first
      logger.info('Starting server component...');
      await this.server.start();
      
      // Wait a moment to ensure server is fully initialized
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then start client and connect to the server
      logger.info('Starting client component...');
      await this.client.start();
      
      logger.info('RESTifyCombo started successfully');
    } catch (error) {
      logger.error('Failed to start RESTifyCombo', error as Error);
      await this.stop();
      throw error;
    }
  }
}
```

### 2. WSServer Enhancement (In server/websocket-server.ts)

```typescript
/**
 * Enhanced WebSocket Server to better handle multiple clients
 */
export class WSServer implements WSServerInterface, ToolInvoker, WebSocketEventEmitter {
  // Existing properties
  
  /**
   * Improved client registration handling
   */
  private handleRegister(ws: WebSocket, connectionId: string, payload: RegistrationMessage): void {
    try {
      // Validation logic
      
      // Better handling of client reconnections and multiple clients
      if (existingClient && existingClient.connectionStatus === 'connected' && existingClient.connectionId !== connectionId) {
        // Client is already connected with a different connection
        logger.warn(`Client ${clientId} is already connected with a different connection, disconnecting old connection`);
        
        // Close old connection more gracefully
        this.disconnectClient(existingClient.connectionId!);
      }
      
      // Create or update client registration
      // ...
      
      // Notify listeners about new client connection
      this.emitClientConnect(clientId);
    } catch (error) {
      // Error handling
    }
  }
  
  /**
   * New method to cleanly disconnect a client
   */
  private disconnectClient(connectionId: string): void {
    // Get old connection
    const oldConnection = this.clientConnections.get(connectionId);
    if (oldConnection) {
      try {
        // Close old connection
        oldConnection.close(1000, 'Client reconnected from another connection');
      } catch (error) {
        logger.error(`Error closing connection: ${(error as Error).message}`);
      }
    }
  }
}
```

### 3. RESTifyServer Enhancement (In server/index.ts)

```typescript
/**
 * Enhanced RESTifyServer with better client management
 */
export default class RESTifyServer {
  // Existing properties
  
  /**
   * Improved initialization to ensure server properly handles multiple clients
   */
  private initializeWSServer(): void {
    // Create WebSocket server with proper event handling
    this.wsServer = new WSServer(
      this.firstClientToken, 
      this.clientRegistrations,
      this.authService
    );
    
    // Set up listeners for client connection/disconnection
    this.wsServer.onClientConnect((clientId) => {
      logger.info(`Client connected: ${clientId}`);
      this.updateOpenApiSpec();
    });
    
    this.wsServer.onClientDisconnect((clientId) => {
      logger.info(`Client disconnected: ${clientId}`);
      this.updateOpenApiSpec();
    });
  }
}
```

### 4. Configuration Update (In shared/config.ts)

```typescript
/**
 * Enhanced combo configuration validation
 */
const comboConfigSchema = z.object({
  mode: z.literal('combo'),
  server: serverConfigSchema,
  client: clientConfigSchema,
  allowExternalClients: z.boolean().optional().default(true) // New option
});
```

## Tool Visualization Workflow

1. The built-in client starts and registers its tools with the server
2. External clients can connect and register their tools
3. The server aggregates tools from all connected clients (built-in and external)
4. Each API Space has access to tools based on its configuration (allowedClientTokens)

## Configuration Example

Here is a complete example of a combo configuration with multiple MCP servers in the built-in client and support for external clients:

```json
{
  "mode": "combo",
  "server": {
    "http": {
      "port": 3000,
      "host": "localhost",
      "publicUrl": "http://localhost:3000"
    },
    "apiSpaces": [
      {
        "name": "default",
        "description": "Default API Space",
        "bearerToken": "api-token-123",
        "allowedClientTokens": ["built-in-client-token", "external-client-token-1"]
      },
      {
        "name": "admin",
        "description": "Admin API Space with all tools",
        "bearerToken": "admin-api-token-456",
        "allowedClientTokens": ["built-in-client-token", "external-client-token-1", "external-client-token-2"]
      }
    ],
    "admin": {
      "adminToken": "secure-admin-token-789"
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "built-in-client-token",
    "mcpServers": [
      {
        "id": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
      },
      {
        "id": "database",
        "command": "node",
        "args": ["./database-mcp-server.js"],
        "env": {
          "DB_HOST": "localhost",
          "DB_USER": "user",
          "DB_PASS": "password"
        }
      }
    ]
  },
  "allowExternalClients": true
}
```

## External Client Connection

External clients will connect to the combo instance exactly as they would connect to a standalone server:

```json
{
  "mode": "client",
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "external-client-token-1",
    "mcpServers": [
      {
        "id": "external-tools",
        "command": "node",
        "args": ["./external-mcp-server.js"]
      }
    ]
  }
}
```

## Implementation Strategy

1. Refactor the WSServer to better handle multiple client connections
2. Enhance the RESTifyServer to properly track and manage client connections
3. Update the RESTifyCombo class to ensure clean separation between server and client
4. Add configuration option to explicitly enable/disable external client connections
5. Update logging to provide better visibility into client connections
