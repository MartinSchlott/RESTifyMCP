# RESTifyMCP V02 - Server Implementation for API Spaces

## Overview

This document outlines the necessary changes to the server implementation to support the new API Spaces feature. The main goal is to modify the existing server components to handle multiple isolated API surfaces with separate authentication.

## Required Components

### 1. API Space Manager

Create a new manager class to handle API Space relationships:

```typescript
// server/api-space-manager.ts

export interface APISpaceManager {
  /**
   * Initialize or update the manager with API Spaces
   */
  initialize(apiSpaces: APISpace[]): void;
  
  /**
   * Get all API Spaces a client belongs to
   */
  getSpacesForClient(clientToken: string): APISpace[];
  
  /**
   * Get API Space by its token
   */
  getSpaceByToken(spaceToken: string): APISpace | null;
  
  /**
   * Check if a client is allowed in a specific API Space
   */
  isClientAllowedInSpace(clientToken: string, spaceToken: string): boolean;
  
  /**
   * Get all client tokens that belong to a space
   */
  getClientTokensForSpace(spaceName: string): string[];
  
  /**
   * Get all available space tokens
   */
  getAllSpaceTokens(): string[];
}
```

Implementation notes:
- Use Maps to efficiently track relationships between spaces and clients
- Store client tokens to space names mapping
- Store space names to space definitions mapping
- Store space tokens to space names for quick lookups

### 2. Authentication Service Updates

Modify the `BearerAuthService` to work with API Spaces:

```typescript
// Changes to server/auth.ts

export interface AuthService {
  // Existing methods
  validateBearerToken(token: string): boolean;
  getClientIdFromToken(token: string): string | null;
  authenticateRequest(req: Request, res: Response, next: NextFunction): void;
  
  // New methods
  getRequestAPISpace(req: Request): APISpace | null;
  getValidClientTokensForRequest(req: Request): string[];
}
```

Implementation notes:
- Update the constructor to receive `APISpaceManager` instead of token arrays
- Validate tokens against API Spaces first, then clients
- Store the API Space in the request object if the token matches a space
- Provide methods to get the current API Space and valid client tokens for a request

### 3. RESTifyServer Class Updates

Update the main server class to use API Spaces:

```typescript
// Changes to server/index.ts

export default class RESTifyServer {
  // Add new property
  private apiSpaceManager: APISpaceManager | null = null;
  
  // Other existing properties
  // ...
}
```

Implementation notes:
- Initialize the `APISpaceManager` during server startup
- Validate that at least one API Space is configured
- Use the first API Space's token for WebSocket server initialization
- Pass the API Space manager to the authentication service and REST API service

### 4. WebSocket Server Enhancements

The WebSocket server needs significant updates to handle connection events:

```typescript
export interface WebSocketEventEmitter {
  // Register callbacks for connection events
  onClientConnect(callback: (clientId: string) => void): void;
  onClientDisconnect(callback: (clientId: string) => void): void;
}

export class WSServer implements ToolInvoker, WebSocketEventEmitter {
  // Add event handling capabilities
  private connectListeners: Set<(clientId: string) => void> = new Set();
  private disconnectListeners: Set<(clientId: string) => void> = new Set();
  
  // Implement event registration methods
  onClientConnect(callback: (clientId: string) => void): void {
    // Register connect listener
  }
  
  onClientDisconnect(callback: (clientId: string) => void): void {
    // Register disconnect listener
  }
  
  // Update connection handling methods to emit events
  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    // Regular connection handling
    // ...
    // Emit connect event
  }
  
  private handleClose(clientId: string): void {
    // Update client status
    // Emit disconnect event immediately
  }
}
```

Implementation notes:
- Emit events immediately when connection status changes
- Continue using a single token for client connections
- Optionally validate that clients connecting have membership in at least one API Space
- Client registrations remain unaware of API Spaces (keeping clients passive)

## Integration Approach

1. During server initialization, create the API Space Manager first
2. Pass it to the Auth Service and REST API Service
3. When clients connect via WebSocket, validate them normally
4. When HTTP requests come in, identify which API Space they belong to
5. For each API Space, expose only the tools from clients allowed in that space

This approach maintains the passive nature of clients while enabling multi-tenant APIs.
