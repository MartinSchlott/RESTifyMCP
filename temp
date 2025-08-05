# OpenAPI Integration for RESTifyMCP Client

## Problem Statement

The RESTifyMCP client currently only supports MCP servers via stdio communication. Users need to expose external REST APIs as MCP tools to bridge the gap between REST-based services and MCP-compatible tools.

## Core Requirements

### Functional Requirements
1. **OpenAPI Discovery**: Fetch OpenAPI specification from configured URLs at startup
2. **Tool Generation**: Convert OpenAPI endpoints to MCP tool definitions
3. **HTTP Proxy**: Route MCP tool calls to appropriate REST API endpoints
4. **Multi-Server Support**: Support multiple OpenAPI servers per client configuration
5. **Graceful Degradation**: Continue operation if OpenAPI fetch fails for specific servers

### Technical Constraints
- **Authentication**: One bearer token per OpenAPI server (not per endpoint)
- **Parameter Mapping**: Direct OpenAPI schema → MCP parameter conversion
- **Response Handling**: Return complete HTTP response body, approximate status mapping
- **Caching**: One-time fetch at startup, no retry mechanism
- **Error Handling**: Log errors but continue with other servers

## Architectural Approach

### Integration Strategy

The OpenAPI servers will be integrated as **additional server types** in the existing `MCPManager` architecture. This maintains the current pattern where multiple "servers" can be managed simultaneously.

**Why this approach**: The existing `MCPManager` already handles multiple server types and provides the tool routing infrastructure. Adding OpenAPI servers as a new server type preserves architectural consistency.

### Data Flow Architecture

```
OpenAPI Config → OpenAPIServerManager → MCPToolDefinition[] → MCPManager → WebSocket Registration
```

**Key architectural decisions**:
- OpenAPI servers are treated as "virtual MCP servers" 
- Tool requests route through existing `MCPManager.callTool()` infrastructure
- WebSocket communication remains unchanged

### Component Responsibilities

#### OpenAPIServerManager
- **Fetches** OpenAPI specifications with bearer token authentication
- **Parses** OpenAPI schema and converts to `MCPToolDefinition[]`
- **Implements** `callTool()` interface for HTTP request routing
- **Handles** parameter mapping and response processing

#### MCPManager Integration
- **Registers** OpenAPI servers alongside MCP stdio servers
- **Routes** tool calls to appropriate server type
- **Maintains** existing tool provider mapping

## Implementation Constraints

### OpenAPI Parsing Rules
- **Filter**: Exclude all `/openapi*` endpoints from tool generation
- **Naming**: Use `operationId` if present, otherwise last path segment
- **Parameters**: Direct schema conversion with JSON Schema → MCP parameter mapping

### HTTP Request Handling
- **Method Mapping**: All MCP tools use POST, map to appropriate HTTP method
- **Parameter Distribution**: Body parameters → request body, query parameters → URL params
- **Authentication**: Bearer token from config for all requests to that server

### Error Handling Philosophy
- **OpenAPI Fetch Failures**: Log error, mark server as failed, continue with others
- **HTTP Request Failures**: Return error response through MCP tool response mechanism
- **No Retry Logic**: User must restart client for OpenAPI configuration changes

## Configuration Schema

```typescript
interface OpenAPIServerConfig {
  id: string;                    // Unique identifier for this OpenAPI server
  openApiUrl: string;            // URL to fetch OpenAPI specification
  bearerToken?: string;          // Authentication token for this server
  baseUrl?: string;              // Optional base URL if different from openApiUrl
}
```

**Configuration integration**: Add `openApiServers?: OpenAPIServerConfig[]` to existing `ClientConfig`

## Technical Implementation Plan

### Phase 1: Core Infrastructure
1. **Extend types.ts**: Add `OpenAPIServerConfig` and related interfaces
2. **Create OpenAPIServerManager**: Implement OpenAPI fetching and parsing
3. **HTTP client integration**: Add request routing capabilities

### Phase 2: MCPManager Integration  
1. **Extend MCPManager**: Add support for OpenAPI server type
2. **Tool registration**: Integrate OpenAPI tools into existing registration flow
3. **Error handling**: Implement graceful degradation for failed OpenAPI servers

### Phase 3: Parameter Mapping
1. **Schema conversion**: Implement OpenAPI schema → MCP parameter conversion
2. **Request routing**: Map MCP tool calls to appropriate HTTP requests
3. **Response processing**: Handle HTTP responses and convert to MCP format

## Critical Design Decisions

### Why OpenAPI as Virtual MCP Servers
The existing `MCPManager` architecture already handles multiple server types and provides tool routing. Adding OpenAPI servers as a new server type preserves this pattern and avoids architectural inconsistency.

### Why No Retry Mechanism
OpenAPI specifications are configuration, not runtime data. If the specification changes, the user should restart the client to pick up new endpoints. This prevents complex state management and keeps the system predictable.

### Why Direct Parameter Mapping
OpenAPI JSON Schema and MCP parameters are structurally compatible. Direct mapping preserves the original API contract while enabling MCP tool integration.

## Integration Points

### Existing Components to Extend
- **types.ts**: Add OpenAPI configuration interfaces
- **mcp-manager.ts**: Add OpenAPI server support alongside stdio servers  
- **client/index.ts**: Initialize OpenAPI servers during startup

### New Components to Create
- **openapi-server-manager.ts**: OpenAPI fetching, parsing, and HTTP routing
- **openapi-parser.ts**: Schema conversion utilities
- **http-client.ts**: HTTP request handling for OpenAPI endpoints

## Success Criteria

1. **Functional**: OpenAPI endpoints appear as MCP tools in RESTifyMCP API
2. **Reliable**: Failed OpenAPI servers don't prevent other servers from working
3. **Consistent**: OpenAPI tools follow same patterns as MCP stdio tools
4. **Maintainable**: Implementation follows existing architectural patterns

## Risk Mitigation

### OpenAPI Specification Changes
**Risk**: OpenAPI spec changes require client restart
**Mitigation**: Clear documentation that OpenAPI config is static

### HTTP Method Mapping Complexity  
**Risk**: MCP tools are POST-only, but OpenAPI supports multiple methods
**Mitigation**: Use HTTP method from OpenAPI spec, default to POST

### Parameter Type Mismatches
**Risk**: Complex OpenAPI schemas may not map cleanly to MCP parameters
**Mitigation**: Start with simple schemas, add complexity incrementally

## Implementation Priority

1. **Core OpenAPI fetching and parsing** (highest priority)
2. **Basic HTTP request routing** (highest priority)  
3. **Parameter mapping and schema conversion** (medium priority)
4. **Advanced error handling and edge cases** (lower priority)
5. **Performance optimizations and caching** (future enhancement)
