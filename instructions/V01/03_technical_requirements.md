# RESTifyMCP: Technical Requirements

## Programming Language and Runtime Environment

- **Language:** TypeScript (strictly typed, no use of `any`)
- **Runtime:** Node.js (latest LTS version)
- **Compilation:** TypeScript should be compiled with strict options

## Dependencies

RESTifyMCP may only use the following external dependencies:

| Dependency | Version | Purpose |
|------------|---------|---------|
| express | ^4.18.x | REST API server |
| commander | ^11.x.x | CLI argument parsing |
| zod | ^3.22.x | Schema validation |
| openapi3-ts | ^4.1.x | OpenAPI specification generation |
| uuid | ^9.0.x | Unique ID generation |
| @modelcontextprotocol/sdk | * | Official MCP SDK |

Additionally, only native Node.js modules may be used, such as:
- `crypto`
- `child_process`
- `fs/promises`
- `path`
- `util`
- `events`

If an additional dependency is required, it must be explicitly documented and justified.

## Architectural Constraints

1. **Strict Module Separation**:
   - No cyclic dependencies between modules
   - Modules may only import from `shared/` or their own subdirectories

2. **Validation**:
   - All user inputs (configuration files, HTTP requests) must be validated using Zod
   - Configuration schema must be strictly followed

3. **Error Handling**:
   - Explicit error handling for all operations
   - No unhandled exceptions
   - All errors must be logged

4. **Logging**:
   - Standardized logging format: `[ISO_TIMESTAMP] [LEVEL] MESSAGE`
   - Levels should include at least INFO, WARN, and ERROR

## Performance Requirements

1. **Response Time**:
   - REST API response time should be minimal
   - Overhead from the proxy function should remain under 100ms

2. **Concurrent Requests**:
   - The server should support multiple concurrent requests
   - Client connections should remain persistent

## Security Requirements

1. **Authentication**:
   - Bearer token-based authentication for all API endpoints
   - Tokens should have a minimum length of 32 characters

2. **Input Validation**:
   - All inputs must be validated to prevent injection attacks
   - Path traversal in file accesses must be prevented

## MVP Limitations

The Minimum Viable Product (MVP) is limited to:

1. **MCP Functions**:
   - Support only for function calls (tools)
   - No support for messages, streams, or other MCP features

2. **Transport**:
   - Support only for stdio-based MCP servers
   - No support for WebSockets or other transport protocols

3. **Authentication**:
   - Only Bearer token authentication
   - No support for OAuth, API keys, or other authentication methods

4. **Scaling**:
   - Local operation with a limited number of clients
   - No automatic scaling or clustering features
