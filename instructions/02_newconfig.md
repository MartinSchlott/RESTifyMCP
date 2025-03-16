# RESTifyMCP V02 - New Server Configuration

## Introducing API Spaces: Multi-Tenant Architecture for RESTifyMCP

The original RESTifyMCP implementation (V01) had a single flat authentication system with bearer tokens, which presented several limitations:

1. **No Client Isolation**: All clients were merged into a single API
2. **No Access Control Granularity**: Tokens provided all-or-nothing access
3. **Limited Multi-Client Strategy**: Architectural limitations for production use cases

V02 addresses these limitations by introducing the concept of **API Spaces**.

## What are API Spaces?

API Spaces provide a multi-tenant architecture where each space:

1. Represents a distinct REST API endpoint with its own bearer token
2. Contains a specific set of allowed client tools
3. Can share clients with other API Spaces
4. Has its own OpenAPI documentation

## New Configuration Structure

The server configuration has been redesigned to support API Spaces:

```json
{
  "mode": "server",
  "server": {
    "http": {
      "port": 3000,
      "host": "localhost",
      "publicUrl": "http://localhost:3000"
    },
    "apiSpaces": [
      {
        "name": "main-api",
        "description": "Main access point for all services",
        "bearerToken": "main-api-token-123",
        "allowedClientTokens": ["client-token-1", "client-token-2", "shared-client-token-3"]
      },
      {
        "name": "testing-api",
        "description": "Separate access point for testing purposes",
        "bearerToken": "test-api-token-456",
        "allowedClientTokens": ["test-client-token", "shared-client-token-3"]
      }
    ],
    "logging": {
      "level": "info",
      "format": "json"
    }
  }
}
```

## Key Benefits

### 1. Proper Client Isolation
Each API Space creates a separate REST API surface, with its own OpenAPI documentation that only includes the tools from the clients allowed in that space.

### 2. Flexible Client Sharing
The same client can be shared across multiple API Spaces, allowing for reuse of tools without duplicating connections.

### 3. Enhanced Security Model
- Server now requires at least one API Space with a defined bearer token
- Each API Space has its own access control list of allowed clients
- Clients remain passive and are unaware of which API Spaces they belong to

### 4. Improved OpenAPI Generation
Each API Space generates its own dedicated OpenAPI documentation, containing only the tools available in that space, resulting in cleaner, more focused API specs.

## Implementation Notes

The revised architecture maintains backward compatibility by:
1. Supporting a default API Space if only the old configuration format is provided
2. Preserving the client connection mechanism (clients don't need to change)

This approach solves the architectural limitations mentioned in the V01 README while keeping the core simplicity of the original design.

## Usage Scenarios

### Scenario 1: Public vs. Private APIs
Create separate API Spaces for public-facing tools and internal-only tools, with different authentication tokens.

### Scenario 2: Partner Access
Create dedicated API Spaces for different partners, each with access to a specific subset of available tools.

### Scenario 3: Testing and Production
Maintain separate API Spaces for testing and production environments while sharing the same underlying client connections.

## Next Steps

The implementation should focus on:
1. Maintaining the passive nature of clients
2. Creating proper isolation of tool invocation between API Spaces
3. Generating separate OpenAPI documentation for each API Space
4. Ensuring clear error messages when accessing with invalid tokens