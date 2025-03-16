# RESTifyMCP V02 - OpenAPI Generation for API Spaces

## Overview

This document outlines the necessary changes to the OpenAPI generator to support API Spaces. Each API Space should have its own OpenAPI documentation that reflects only the tools available in that specific space.

## Key Requirements

1. Each API Space needs separate OpenAPI documentation
2. Tools should only appear in the documentation of spaces where they're accessible
3. The OpenAPI structure should remain clean and well-organized
4. Documentation should contain space-specific information

## OpenAPI Generator Updates

### Interface Updates

Enhance the OpenAPI generator interface to support API Space filtering:

```typescript
// Modifications to server/openapi-generator.ts

export interface OpenApiGenerator {
  // Updated method signature with optional API Space parameter
  generateSpec(
    clientRegistrations: Map<string, ClientRegistration> | ClientRegistration[],
    apiSpace?: APISpace
  ): Record<string, any>;
}
```

### Implementation Changes

The OpenAPI generator implementation should be modified to filter tools based on API Space:

```typescript
// Conceptual structure for DefaultOpenApiGenerator class

export class DefaultOpenApiGenerator implements OpenApiGenerator {
  private readonly baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  generateSpec(
    clientRegistrations: Map<string, ClientRegistration> | ClientRegistration[],
    apiSpace?: APISpace
  ): Record<string, any> {
    // Implementation notes:
    // 1. If apiSpace is provided, filter the client registrations
    // 2. Only include tools from clients allowed in this API Space
    // 3. Include API Space information in the spec description
    // 4. Generate paths for each tool in the filtered list
  }
  
  // Helper methods for building different parts of the spec
}
```

## Filtering Logic

The filtering logic should respect API Space boundaries:

```typescript
// Conceptual helper method for filtering clients by API Space and connection status

private filterClientsForApiSpace(
  clientRegistrations: Map<string, ClientRegistration> | ClientRegistration[],
  apiSpace: APISpace
): ClientRegistration[] {
  // Implementation notes:
  // 1. Convert clientRegistrations to array if it's a Map
  // 2. Filter clients by connection status - ONLY include connected clients
  // 3. Then filter by API Space - only include those whose tokens are in apiSpace.allowedClientTokens
  // 4. Return the filtered array of clients
  
  // Implementation example (conceptual):
  // return Array.from(clientRegistrationsAsArray)
  //   .filter(client => client.connectionStatus === 'connected')
  //   .filter(client => apiSpace.allowedClientTokens.includes(client.bearerToken));
}
```

## OpenAPI Document Enhancements

The generated OpenAPI document should include information about the API Space:

```
// Example OpenAPI base structure with API Space information

{
  "openapi": "3.0.0",
  "info": {
    "title": "RESTifyMCP API - {apiSpace.name}",
    "description": "{apiSpace.description}\n\nThis API provides access to tools registered with RESTifyMCP.",
    "version": "2.0.0"
  },
  "servers": [
    {
      "url": "{baseUrl}",
      "description": "RESTifyMCP Server"
    }
  ],
  // ... rest of OpenAPI spec
}
```

## Security Definitions

Update the security definitions to reflect the API Space token:

```
// Example security definitions for API Space

"components": {
  "securitySchemes": {
    "bearerAuth": {
      "type": "http",
      "scheme": "bearer",
      "bearerFormat": "JWT",
      "description": "API Space authentication token"
    }
  }
},
"security": [
  {
    "bearerAuth": []
  }
]
```

## Path Generation

Generate paths only for tools available in the current API Space:

```typescript
// Conceptual structure for generatePaths method

private generatePaths(
  clients: ClientRegistration[],
  apiSpace?: APISpace
): Record<string, any> {
  const paths: Record<string, any> = {};
  
  // For each client
  for (const client of clients) {
    // For each tool in the client
    for (const tool of client.tools) {
      // Generate path entry for this tool
      paths[`/api/tools/${tool.name}`] = {
        "post": {
          // Tool metadata, including any API Space specific information
          // Parameters and request body schema
          // Response schema
        }
      };
    }
  }
  
  return paths;
}
```

## OpenAI Compatibility

Ensure the generated OpenAPI documents maintain compatibility with OpenAI's requirements:

1. Keep descriptions under the 300 character limit
2. Include the `x-openai-isConsequential: false` extension
3. Use simplified schema structures

## Implementation Strategy

1. Update the OpenApiGenerator interface to accept an optional APISpace parameter
2. Modify the generateSpec method to filter clients based on API Space
3. Add API Space information to the generated documentation
4. In the REST API service, call the generator with the appropriate API Space
5. Test the documentation for each API Space separately

These changes will ensure that each API Space has its own dedicated OpenAPI documentation, reflecting only the tools available in that space.
