# OpenAPI Server Integration

## Overview

RESTifyMCP v1.1.0 introduces **OpenAPI Server Integration**, allowing clients to expose local REST API servers as MCP tools. This feature bridges the gap between existing REST APIs and MCP-based workflows.

## Features

### Core Capabilities

- **Dynamic Tool Discovery**: Automatically fetches OpenAPI specifications and converts endpoints to MCP tools
- **Bearer Token Authentication**: Support for authenticated OpenAPI server access
- **Schema Compatibility**: Proper handling of OpenAPI schemas with `additionalProperties` for CustomGPT compatibility
- **Error Resilience**: Graceful handling of OpenAPI fetch failures without affecting other MCP servers

### Supported Endpoints

- **HTTP Methods**: Only POST endpoints are converted to MCP tools
- **Content Types**: Only `application/json` request bodies are supported
- **Schema Complexity**: Complex schemas (oneOf, allOf, anyOf) are automatically filtered out

### Tool Naming

- **Primary**: Uses `operationId` if available in the OpenAPI specification
- **Fallback**: Uses the last path segment (e.g., `/api/users/create` → `create`)

## Configuration

### OpenAPI Server Configuration

```json
{
  "id": "assembly",
  "openApiUrl": "http://localhost:3003/assembly/openapi",
  "bearerToken": "optional-auth-token"
}
```

**Parameters:**
- `id`: Unique identifier for the OpenAPI server
- `openApiUrl`: URL to the OpenAPI specification (JSON format)
- `bearerToken`: Optional bearer token for authenticated access

### Client Configuration

Add `openApiServers` array to your client configuration:

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
        "id": "assembly",
        "openApiUrl": "http://localhost:3003/assembly/openapi",
        "bearerToken": "assembly-auth-token"
      }
    ]
  }
}
```

## Implementation Details

### Architecture

1. **OpenAPIServerManager**: Manages the lifecycle of configured OpenAPI servers
2. **Schema Conversion**: Converts OpenAPI schemas to MCP-compatible formats
3. **Tool Registration**: Registers converted tools with the RESTifyMCP server
4. **Error Handling**: Graceful degradation if OpenAPI servers are unavailable

### Schema Handling

OpenAPI schemas are transferred **1:1** to maintain compatibility:

```typescript
// OpenAPI Schema
{
  "type": "object",
  "properties": {
    "uri": {"type": "string"},
    "params": {
      "type": "object",
      "properties": {},
      "additionalProperties": true
    }
  }
}

// MCP Schema (identical)
{
  "type": "object",
  "properties": {
    "uri": {"type": "string"},
    "params": {
      "type": "object",
      "properties": {},
      "additionalProperties": true
    }
  }
}
```

### CustomGPT Compatibility

The implementation specifically handles `additionalProperties` to ensure CustomGPT compatibility:

- **Preserves** `additionalProperties: true` in nested objects
- **Maintains** `properties: {}` structure for proper parameter validation
- **Ensures** CustomGPT can send empty objects without `UnrecognizedKwargsError`

## Usage Examples

### Basic OpenAPI Integration

```json
{
  "mode": "client",
  "client": {
    "serverUrl": "https://restifymcp.schlott.ai",
    "bearerToken": "your-client-token",
    "openApiServers": [
      {
        "id": "assembly",
        "openApiUrl": "http://localhost:3003/assembly/openapi"
      }
    ]
  }
}
```

### Combined MCP + OpenAPI

```json
{
  "mode": "combo",
  "server": {
    "http": {
      "port": 3000,
      "host": "localhost",
      "publicUrl": "http://example.com"
    },
    "apiSpaces": [
      {
        "name": "default",
        "description": "Default API Space",
        "bearerToken": "your-secure-token",
        "allowedClientTokens": ["client-token"]
      }
    ]
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "client-token",
    "mcpServers": [
      {
        "id": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
      }
    ],
    "openApiServers": [
      {
        "id": "weather",
        "openApiUrl": "https://api.weatherapi.com/v1/swagger.json"
      }
    ]
  }
}
```

## Error Handling

### OpenAPI Fetch Failures

If an OpenAPI server is unavailable:

1. **Logs the error** with details about the failure
2. **Continues operation** with remaining MCP servers
3. **Does not crash** the entire client
4. **Requires restart** to retry OpenAPI fetching

### Schema Compatibility Issues

- **Complex schemas** (oneOf, allOf, anyOf) are automatically filtered out
- **Unsupported content types** are ignored
- **Invalid OpenAPI specs** are logged and skipped

## Debugging

### Logging

The OpenAPI integration provides comprehensive logging:

```
[INFO] [OpenAPIServerManager] Initializing OpenAPI server: assembly
[INFO] [OpenAPIServerManager] OpenAPI server assembly initialized with 7 tools
[INFO] [OpenAPIServerManager] Successfully initialized 1 OpenAPI servers
```

### Common Issues

1. **OpenAPI URL not accessible**: Check network connectivity and server status
2. **Authentication failures**: Verify bearer token is correct
3. **Schema conversion errors**: Check OpenAPI specification format
4. **Tool registration failures**: Verify RESTifyMCP server is running

## Limitations

### Current Limitations

- **POST only**: Only POST endpoints are converted to MCP tools
- **JSON only**: Only `application/json` request bodies are supported
- **No query parameters**: Query parameters are not supported
- **No path parameters**: Path parameters are not supported
- **No headers**: Custom headers are not supported

### Future Enhancements

- **GET support**: Convert GET endpoints to MCP tools
- **Query parameter support**: Handle query parameters in tool calls
- **Path parameter support**: Handle path parameters in tool calls
- **Header support**: Support custom headers in tool calls
- **Response schema**: Use response schemas for better tool documentation

## Migration Guide

### From v1.0.0 to v1.1.0

1. **No breaking changes** to existing MCP server configurations
2. **Optional feature**: OpenAPI integration is opt-in
3. **Backward compatible**: All existing functionality remains unchanged

### Adding OpenAPI Servers

1. **Add configuration**: Add `openApiServers` array to client config
2. **Restart client**: Restart the RESTifyMCP client
3. **Verify tools**: Check that OpenAPI tools are registered
4. **Test functionality**: Test tool calls through the REST API

## Troubleshooting

### OpenAPI Tools Not Appearing

1. **Check logs**: Look for OpenAPI initialization messages
2. **Verify URL**: Ensure OpenAPI URL is accessible
3. **Check authentication**: Verify bearer token if required
4. **Restart client**: Restart the RESTifyMCP client

### Tool Calls Failing

1. **Check OpenAPI spec**: Verify the endpoint exists and is POST
2. **Check request body**: Ensure it matches the OpenAPI schema
3. **Check authentication**: Verify bearer token for the OpenAPI server
4. **Check logs**: Look for detailed error messages

### CustomGPT Integration Issues

1. **Verify schema**: Check that `additionalProperties` is preserved
2. **Test with curl**: Test the endpoint directly with curl
3. **Check OpenAPI spec**: Ensure the OpenAPI spec is valid
4. **Update OpenAPI spec**: Fix any issues in the source OpenAPI specification
