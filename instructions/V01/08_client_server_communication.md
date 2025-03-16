# RESTifyMCP: Client-Server Communication

This document describes the communication between RESTifyMCP clients and the RESTifyMCP server, which occurs via WebSockets.

## Communication Model

The communication between RESTifyMCP clients and the RESTifyMCP server is bidirectional via WebSockets. There are two main communication flows:

1. **Client Registration and Tool Management**: RESTifyMCP clients register with the server and inform it about the MCP tools they provide.

2. **Tool Invocation Forwarding**: The RESTifyMCP server forwards tool invocation requests from API users to the appropriate RESTifyMCP client.

## WebSocket Connection

The WebSocket connection is established as follows:

### 1. Connection Establishment

The client initiates a WebSocket connection to the server:

```
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Authorization: Bearer a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

### 2. Authentication

The server authenticates the client based on the Bearer token in the header and accepts the WebSocket connection if the token is valid.

### 3. Initial Handshake Messages

After a successful connection, the client sends a registration message:

```json
{
  "type": "register",
  "tools": [
    {
      "name": "readFile",
      "description": "Read a file from the filesystem",
      "parameters": {
        "path": {
          "type": "string",
          "description": "Path to the file",
          "required": true
        }
      },
      "returns": {
        "schema": {
          "type": "object",
          "properties": {
            "content": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "name": "listDirectory",
      "description": "List directory contents",
      "parameters": {
        "path": {
          "type": "string",
          "description": "Path to the directory",
          "required": true
        }
      },
      "returns": {
        "schema": {
          "type": "object",
          "properties": {
            "files": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  ]
}
```

### 4. Server Response

The server responds with a confirmation:

```json
{
  "type": "registered",
  "clientId": "7f8d9e0a",
  "status": "success"
}
```

## Message Types

WebSocket communication uses different message types for various purposes:

### 1. Client-to-Server Messages

| Type | Description | Data Structure |
|------|-------------|----------------|
| `register` | Client registers with its tools | `{ type: "register", tools: Tool[] }` |
| `deregister` | Client unregisters | `{ type: "deregister" }` |
| `toolResponse` | Response to a tool invocation | `{ type: "toolResponse", requestId: string, result: any }` |
| `error` | Error message | `{ type: "error", requestId?: string, message: string, code: string }` |
| `ping` | Heartbeat for connection check | `{ type: "ping", timestamp: number }` |

### 2. Server-to-Client Messages

| Type | Description | Data Structure |
|------|-------------|----------------|
| `registered` | Registration confirmation | `{ type: "registered", clientId: string, status: string }` |
| `toolCall` | Request to invoke a tool | `{ type: "toolCall", toolName: string, parameters: object, requestId: string }` |
| `pong` | Response to ping | `{ type: "pong", timestamp: number }` |

## Tool Invocation Workflow

When a tool is invoked via the REST API, RESTifyMCP processes the request as follows:

### 1. API User Calls a Tool

An API user calls a tool via the REST API:

```
POST /tools/7f8d9e0a/readFile HTTP/1.1
Host: example.com
Authorization: Bearer a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
Content-Type: application/json

{
  "path": "/var/data/example.txt"
}
```

### 2. Server Forwards Request to Client

The server identifies the responsible client using the client ID (`7f8d9e0a`) and sends a WebSocket message:

```json
{
  "type": "toolCall",
  "toolName": "readFile",
  "parameters": {
    "path": "/var/data/example.txt"
  },
  "requestId": "abc123"
}
```

### 3. Client Executes Tool and Responds

The client calls the tool in the MCP server and sends the result back:

```json
{
  "type": "toolResponse",
  "requestId": "abc123",
  "result": {
    "content": "This is the content of example.txt"
  }
}
```

### 4. Server Responds to API User

The server forwards the result to the original API user:

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "content": "This is the content of example.txt"
}
```

## Error Handling

When errors occur during tool invocation, the client sends an error message:

```json
{
  "type": "error",
  "requestId": "abc123",
  "message": "File not found",
  "code": "FILE_NOT_FOUND"
}
```

The server translates this into an HTTP error response:

```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "File not found",
  "code": "FILE_NOT_FOUND"
}
```

## Connection Management

### 1. Connection Loss

If the WebSocket connection is lost:

1. The client automatically attempts to reconnect.
2. After a successful reconnection, it sends the registration message again.
3. The server recognizes the client based on the Bearer token.

### 2. Heartbeat Mechanism

To ensure the connection remains active:

1. The client periodically (e.g., every 30 seconds) sends a `ping` message.
2. The server responds with a `pong` message.
3. If the client does not receive a response, it attempts to re-establish the connection.

```json
// Client sends
{
  "type": "ping",
  "timestamp": 1678559842123
}

// Server responds
{
  "type": "pong",
  "timestamp": 1678559842123
}
```

### 3. Graceful Shutdown

Upon proper termination, the client sends a `deregister` message:

```json
{
  "type": "deregister"
}
```

The server removes the client from its registry and closes the WebSocket connection.

## Authentication and Security

The WebSocket connection is secured with Bearer token authentication:

1. The client sends its Bearer token in the Authorization header during the WebSocket upgrade.
2. The server validates the token before accepting the connection.
3. All messages after connection establishment do not require additional authentication.

Security measures:

1. The WebSocket connection should use WSS (WebSocket Secure), requiring TLS/SSL.
2. Token rotation: Regularly changing Bearer tokens for added security.
3. WebSocket messages should be validated to prevent injection attacks.

## Implementation Notes

WebSocket communication can be implemented using the following libraries:

- **Server-side**: The `ws` library can be integrated with Express.
- **Client-side**: Either `ws` or the WebSocket API in Node.js environments.