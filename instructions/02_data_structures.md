# RESTifyMCP V02 - Data Structures for API Spaces

## Overview

This document describes the necessary data structures for implementing the API Spaces feature in RESTifyMCP V02. These structures will enable multi-tenant functionality while maintaining backward compatibility with existing clients.

## Existing Architecture Analysis

The current implementation uses a flat authentication model with a list of bearer tokens. Clients connect and register their tools, and all tools are merged into a single API surface. This design limits the ability to provide isolated API surfaces for different consumers.

## New Type Definitions

### APISpace Interface

Define a new interface for API Space management:

```typescript
/**
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
```

### Updated ServerConfig

Modify the existing ServerConfig interface to use API Spaces:

```typescript
/**
 * Server Configuration with API Spaces
 */
export interface ServerConfig {
  http: {
    port: number;
    host: string;
    publicUrl?: string;
  };
  
  // API Spaces replace the simple bearerTokens array
  apiSpaces: APISpace[];
  
  // Optional logging configuration
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'text' | 'json';
  };
}
```

## Relationship Management

To efficiently manage the relationships between clients and API Spaces, implement a helper class or structure:

```typescript
/**
 * Manages the relationships between clients and API Spaces
 */
export class APISpaceManager {
  // Maps client tokens to the API Space names they belong to
  private clientTokenToSpaces: Map<string, Set<string>> = new Map();
  
  // Maps API Space names to their full definitions
  private spaceNameToSpace: Map<string, APISpace> = new Map();
  
  // Maps API Space tokens to their names for quick lookup
  private spaceTokenToName: Map<string, string> = new Map();
  
  /**
   * Initialize from server configuration
   */
  constructor(apiSpaces: APISpace[]) {
    this.initialize(apiSpaces);
  }
  
  /**
   * Initialize or update the manager with API Spaces
   */
  initialize(apiSpaces: APISpace[]): void {
    // Implementation details...
  }
  
  /**
   * Get all API Spaces a client belongs to
   */
  getSpacesForClient(clientToken: string): APISpace[] {
    // Implementation details...
  }
  
  /**
   * Get API Space by its token
   */
  getSpaceByToken(spaceToken: string): APISpace | null {
    // Implementation details...
  }
  
  /**
   * Check if a client is allowed in a specific API Space
   */
  isClientAllowedInSpace(clientToken: string, spaceToken: string): boolean {
    // Implementation details...
  }
  
  /**
   * Get all client tokens that belong to a space
   */
  getClientTokensForSpace(spaceName: string): string[] {
    // Implementation details...
  }
}
```

## Implementation Strategy

1. Create the new interfaces in `shared/types.ts`
2. Implement the APISpaceManager in a new file `server/api-space-manager.ts`
3. Update the config validation to handle the new structure

The server should validate that at least one API Space is defined, ensuring proper isolation of client tools and authentication.

**Note**: No backward compatibility is required as we're implementing a clean upgrade to the new version.
