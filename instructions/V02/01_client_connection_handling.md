# RESTifyMCP V02 - Client Connection Handling

## Overview

This document addresses a fundamental design issue in the current implementation: client tools remain in memory and in the API definitions even after clients disconnect. This behavior leads to "ghost tools" that appear available but fail when invoked.

## Current Implementation Issues

The V01 implementation has these limitations:

1. Client registrations remain in memory after disconnection
2. Disconnected clients are only removed after a cleanup interval (60 seconds)
3. Tools from disconnected clients remain in the OpenAPI definition
4. Requests to tools from disconnected clients fail at runtime

## New Requirements

For V02, we need to implement the following behavior:

1. When a client disconnects, its tools should be **immediately** removed from all API Spaces
2. OpenAPI definitions should be generated dynamically and include only currently connected clients
3. The client status should be updated immediately on connection changes
4. No cleanup timer should be necessary for normal operation

## Implementation Changes

### WebSocket Server

Update the WebSocket server to react immediately to disconnections:

```typescript
// Conceptual structure for WebSocket server

export class WSServer implements ToolInvoker {
  // ...
  
  /**
   * Handle a WebSocket connection closing
   */
  private handleClose(clientId: string): void {
    // 1. Update client connection status to 'disconnected'
    // 2. Emit an event or call a callback to notify the system
    // 3. Log the disconnection
    
    // Implementation note: This should trigger immediate removal from API exposures
  }
  
  /**
   * Register a callback for client connection status changes
   */
  onClientStatusChange(callback: (clientId: string, connected: boolean) => void): void {
    // Implementation to register a callback
  }
}
```

### REST API Service

Update the REST API service to only consider connected clients:

```typescript
// Conceptual filtering by connection status

private filterConnectedClients(clients: ClientRegistration[]): ClientRegistration[] {
  return clients.filter(client => client.connectionStatus === 'connected');
}

// Always apply this filter before generating OpenAPI specs or routing requests
```

### OpenAPI Generator

Ensure the OpenAPI generator filters out disconnected clients:

```typescript
generateSpec(
  clientRegistrations: Map<string, ClientRegistration> | ClientRegistration[],
  apiSpace?: APISpace
): Record<string, any> {
  // 1. Convert to array if it's a map
  // 2. Filter to only connected clients
  // 3. Then apply API Space filtering
  // 4. Generate spec with only the remaining clients
}
```

### Client Registration Management

Remove the cleanup interval and rely on immediate updates:

1. Remove the `startClientCleanupInterval` method
2. Clear any existing intervals in the `stop` method
3. Maintain the client registration map but update statuses immediately

## Event-Based Architecture

Implement an event-based approach for connection status changes:

1. WebSocket server emits events when clients connect or disconnect
2. RESTify server subscribes to these events
3. When a client disconnects, the server immediately updates all relevant data structures
4. This replaces the polling/cleanup interval approach

## Implementation Strategy

1. Add connection status event handling to the WebSocket server
2. Create a subscription mechanism for client status changes
3. Ensure the REST API service reacts to these changes
4. Update the OpenAPI generator to filter based on current connection status
5. Remove the cleanup interval mechanism

This approach ensures that the API surface accurately reflects only the currently available tools, eliminating the problem of "ghost tools" and reducing the chance of failed requests.
