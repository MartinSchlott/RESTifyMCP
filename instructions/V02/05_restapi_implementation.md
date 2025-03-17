# RESTifyMCP V02 - REST API Implementation for API Spaces

## Overview

This document outlines the necessary changes to the REST API service to support API Spaces. The goal is to route requests to the appropriate API Space and expose only the tools available in that space.

## Core Requirements

1. Requests should be validated against the API Space token they present
2. Each API Space should have its own OpenAPI documentation
3. Tool invocations should only access tools from clients in the requested API Space
4. URLs should remain clean and consistent across all API Spaces

## REST API Service Updates

### ExpressRESTApiService Modifications

Update the ExpressRESTApiService class to be API Space aware:

```typescript
// Changes to server/rest-api.ts

export class ExpressRESTApiService implements RESTApiService {
  // Add new property
  private readonly apiSpaceManager: APISpaceManager;
  
  // Update constructor
  constructor(
    port: number,
    host: string,
    clientRegistrations: Map<string, ClientRegistration>,
    authService: AuthService,
    openApiGenerator: OpenApiGenerator,
    toolInvoker: ToolInvoker,
    apiSpaceManager: APISpaceManager
  ) {
    // Initialize with API Space Manager
    // Subscribe to client connection events
  }
  
  /**
   * Subscribe to WebSocket server events
   */
  subscribeToConnectionEvents(wsServer: WebSocketEventEmitter): void {
    // Listen for client disconnections
    wsServer.onClientDisconnect((clientId: string) => {
      // When a client disconnects, update internal state
      // No need to wait for cleanup interval
    });
    
    // Listen for client connections
    wsServer.onClientConnect((clientId: string) => {
      // When a client connects, update internal state
    });
  }
  
  // Other existing properties and methods
  // ...
}
```

Implementation notes:
- Store the API Space manager for use in routing and tool invocation
- Update route handlers to be API Space aware

### Updated Route Handlers

Modify the OpenAPI documentation endpoints to be API Space aware:

```typescript
// Conceptual structure for setupRoutes method

setupRoutes(): void {
  // Body parser middleware
  
  // OpenAPI JSON endpoint - now API Space aware
  this.app.get('/openapi.json', 
    (req: Request, res: Response, next: NextFunction) => this.authService.authenticateRequest(req, res, next),
    (req: Request, res: Response) => {
      // Get API Space for this request
      // Generate OpenAPI spec specific to this API Space
      // Return the filtered spec
    }
  );
  
  // OpenAPI YAML endpoint - now API Space aware
  this.app.get('/openapi.yaml',
    (req: Request, res: Response, next: NextFunction) => this.authService.authenticateRequest(req, res, next),
    (req: Request, res: Response) => {
      // Get API Space for this request
      // Generate OpenAPI spec specific to this API Space
      // Convert to YAML and return
    }
  );
  
  // Info dashboard - enhanced with API Space information
  
  // Tool invocation endpoint - API Space aware
  this.app.post(
    '/api/tools/:toolName',
    (req: Request, res: Response, next: NextFunction) => this.authService.authenticateRequest(req, res, next),
    async (req: Request, res: Response, next: NextFunction) => {
      // Handle tool request in the context of the current API Space
    }
  );
  
  // Other endpoints and middleware
}
```

### Tool Invocation Logic

Update the tool invocation logic to respect API Space boundaries:

```typescript
// Conceptual structure for handling tool requests

async handleToolRequest(req: Request, res: Response): Promise<void> {
  const toolName = req.params.toolName;
  const bearerToken = (req as any).bearerToken;
  
  try {
    // 1. Get the API Space for this request
    const apiSpace = this.authService.getRequestAPISpace(req);
    if (!apiSpace) {
      // Handle case where request has a valid token but it's not an API Space token
      // This should not normally happen if routes are properly protected
      return;
    }
    
    // 2. Get the valid client tokens for this API Space
    const validClientTokens = this.authService.getValidClientTokensForRequest(req);
    
    // 3. Find a client in this API Space that has the requested tool
    const clientId = await this.findClientForTool(toolName, validClientTokens);
    
    // 4. If no client found, return 404
    if (!clientId) {
      // Tool not found in this API Space
      return;
    }
    
    // 5. Extract arguments and invoke tool
    const args = this.extractArguments(req);
    const result = await this.toolInvoker.invokeToolOnClient(clientId, toolName, args);
    
    // 6. Return result
    res.json({ result });
  } catch (error) {
    // Error handling
  }
}
```

### Client Selection Logic

Modify the client selection logic to respect API Space boundaries:

```typescript
// Updated method signature
private async findClientForTool(
  toolName: string, 
  validClientTokens: string[]
): Promise<string | null> {
  // Implementation notes:
  // - Only consider clients with tokens in the validClientTokens list
  // - Find all connected clients that have the requested tool AND are in the current API Space
  // - Return the first matching client, or null if none found
}
```

## OpenAPI Documentation Updates

Each API Space should have its own OpenAPI documentation that only includes the tools available in that space:

```typescript
// Conceptual structure for getOpenApiSpec

getOpenApiSpec(apiSpace: APISpace | null): Record<string, any> {
  // If no API Space provided, return empty spec or error
  if (!apiSpace) {
    return this.getEmptyOpenApiSpec();
  }
  
  // Get valid client tokens for this API Space
  const validClientTokens = this.apiSpaceManager.getClientTokensForSpace(apiSpace.name);
  
  // Filter client registrations to only include those in this API Space
  const filteredClients = this.filterClientsByTokens(validClientTokens);
  
  // Generate OpenAPI spec with only these clients
  return this.openApiGenerator.generateSpec(filteredClients, apiSpace);
}
```

## Info Dashboard Enhancements

Update the Info Dashboard to show API Space information:

1. Add an API Spaces section showing all configured spaces
2. For each space, show:
   - Name and description
   - Number of available tools
   - Number of connected clients
3. Add ability to filter tools and clients by API Space

## Implementation Strategy

1. Update the REST API service to receive and store the API Space manager
2. Modify all routes to be API Space aware, checking the token against spaces
3. Update the tool invocation logic to respect API Space boundaries
4. Enhance the OpenAPI generation to filter based on the current API Space
5. Update the info dashboard to show API Space information

This approach ensures that each API Space provides an isolated API surface with its own authentication, documentation, and available tools, while using a shared pool of connected clients.
