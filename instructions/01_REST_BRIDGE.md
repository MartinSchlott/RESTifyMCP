# OpenAPI Integration for RESTifyMCP Client

## Overview

RESTifyMCP now supports integrating external REST APIs via OpenAPI specifications. This allows you to expose REST API endpoints as MCP tools, making them available through the RESTifyMCP bridge.

## Features

- **OpenAPI Specification Parsing**: Automatically fetches and parses OpenAPI specifications
- **POST-Only Support**: Only POST endpoints are converted to tools (simplified approach)
- **JSON Body Parameters**: Only `application/json` request bodies are supported
- **Bearer Token Authentication**: Optional authentication for both OpenAPI fetching and API calls
- **Error Handling**: Graceful degradation when OpenAPI servers are unavailable
- **Complex Schema Filtering**: Automatically skips endpoints with complex schemas (oneOf, allOf, anyOf)

## Configuration

### OpenAPI Server Configuration

Add `openApiServers` to your client configuration:

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
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
      }
    ],
    "openApiServers": [
      {
        "id": "petstore",
        "openApiUrl": "https://petstore3.swagger.io/api/v3/openapi.json"
      },
      {
        "id": "weather",
        "openApiUrl": "https://api.openweathermap.org/data/2.5/openapi.json",
        "bearerToken": "your-weather-api-key"
      }
    ]
  }
}
```

### Configuration Fields

- **id**: Unique identifier for the OpenAPI server
- **openApiUrl**: URL to the OpenAPI specification (JSON format)
- **bearerToken**: Optional bearer token for authentication (used for both fetching OpenAPI spec and API calls)

## How It Works

### 1. OpenAPI Parsing

When the client starts:

1. Fetches OpenAPI specification from the provided URL
2. Filters for POST endpoints only
3. Checks for `application/json` request body
4. Skips endpoints with complex schemas (oneOf, allOf, anyOf)
5. Converts OpenAPI schemas to MCP tool parameters
6. Generates tool names from `operationId` or path segments

### 2. Tool Name Generation

- **Primary**: Uses `operationId` from OpenAPI specification
- **Fallback**: Uses the last segment of the path (e.g., `/api/users` → `users`)

### 3. Parameter Conversion

OpenAPI schemas are converted to MCP-compatible parameters:

```json
// OpenAPI Schema
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "User name"
    },
    "email": {
      "type": "string",
      "format": "email"
    }
  },
  "required": ["name"]
}

// MCP Tool Parameters
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "User name"
    },
    "email": {
      "type": "string",
      "format": "email"
    }
  },
  "required": ["name"]
}
```

### 4. Tool Invocation

When a tool is called:

1. Determines which OpenAPI server provides the tool
2. Reconstructs the original path from stored metadata
3. Makes HTTP POST request to the REST API
4. Returns the complete response body
5. Handles errors by returning error response object

## Error Handling

### OpenAPI Fetch Errors

If fetching the OpenAPI specification fails:
- Error is logged
- Server status is set to 'error'
- Client continues with other servers
- No retry attempts (user must restart client)

### API Call Errors

HTTP errors (4xx, 5xx) are returned as error response objects:

```json
{
  "error": true,
  "status": 400,
  "statusText": "Bad Request",
  "data": {
    "message": "Invalid input"
  }
}
```

## Limitations

### Current Limitations (MVP)

1. **POST-Only**: Only POST endpoints are supported
2. **JSON Body Only**: Only `application/json` request bodies
3. **No Query/Path Parameters**: Only request body parameters
4. **No Complex Schemas**: Skips oneOf, allOf, anyOf schemas
5. **No Caching**: OpenAPI spec is fetched once at startup
6. **Simple Path Reconstruction**: Assumes tool name matches path segment

### Future Enhancements

1. **GET Support**: Add support for GET endpoints
2. **Query Parameters**: Support for query and path parameters
3. **Complex Schemas**: Handle oneOf, allOf, anyOf schemas
4. **Caching**: Cache OpenAPI specifications with TTL
5. **Better Path Mapping**: More sophisticated path reconstruction
6. **Response Schema**: Use OpenAPI response schemas for validation

## Example Usage

### Petstore API Integration

```json
{
  "id": "petstore",
  "openApiUrl": "https://petstore3.swagger.io/api/v3/openapi.json"
}
```

This will create tools like:
- `addPet` (from operationId)
- `updatePet` (from operationId)
- `findPetsByStatus` (from operationId)

### Weather API Integration

```json
{
  "id": "weather",
  "openApiUrl": "https://api.openweathermap.org/data/2.5/openapi.json",
  "bearerToken": "your-api-key"
}
```

## Logging

The OpenAPI integration provides detailed logging:

- **Info**: Server initialization and tool discovery
- **Debug**: Skipped endpoints and tool creation
- **Warn**: Schema issues (e.g., unresolved $ref)
- **Error**: Fetch failures and API call errors

## Security Considerations

1. **Bearer Tokens**: Store securely, not in version control
2. **HTTPS**: Use HTTPS URLs for production APIs
3. **API Keys**: Rotate API keys regularly
4. **Access Control**: Use API Space tokens to control access

## Troubleshooting

### Common Issues

1. **OpenAPI Fetch Fails**
   - Check URL accessibility
   - Verify bearer token (if required)
   - Check network connectivity

2. **No Tools Discovered**
   - Verify API has POST endpoints
   - Check for `application/json` request bodies
   - Look for complex schemas in logs

3. **Tool Calls Fail**
   - Verify bearer token for API calls
   - Check API endpoint availability
   - Review request/response format

### Debug Mode

Enable debug logging to see detailed information:

```typescript
const logger = new ConsoleLogger('OpenAPIServerManager', LogLevel.DEBUG);
```

## Integration with Existing Features

The OpenAPI integration works seamlessly with existing RESTifyMCP features:

- **Multi-Server Support**: Mix MCP and OpenAPI servers
- **Combo Mode**: Use both server and client modes
- **API Spaces**: Control access through bearer tokens
- **WebSocket Communication**: Real-time tool registration
- **OpenAPI Generation**: Tools appear in generated documentation
