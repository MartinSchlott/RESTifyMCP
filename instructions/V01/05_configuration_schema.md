# RESTifyMCP: Configuration Schema

RESTifyMCP is configured using a JSON configuration file, whose path is provided as a command-line argument. The structure of this configuration file varies depending on the operating mode.

## JSON Schema

The following JSON schema defines the structure of the configuration file:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["server", "client", "combo"],
      "description": "Operating mode of RESTifyMCP"
    },
    "dataDirectory": {
      "type": "string",
      "minLength": 1,
      "description": "Directory for persistent data storage"
    },
    "server": {
      "type": "object",
      "properties": {
        "http": {
          "type": "object",
          "properties": {
            "port": {
              "type": "integer",
              "minimum": 1,
              "maximum": 65535,
              "description": "HTTP port to listen on"
            },
            "publicUrl": {
              "type": "string",
              "format": "uri",
              "description": "Publicly accessible URL for the server (used in OpenAPI spec)"
            }
          },
          "required": ["port", "publicUrl"]
        },
        "auth": {
          "type": "object",
          "properties": {
            "bearerTokens": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 32
              },
              "description": "List of valid Bearer tokens for authentication"
            }
          },
          "required": ["bearerTokens"]
        }
      },
      "required": ["http", "auth"]
    },
    "client": {
      "type": "object",
      "properties": {
        "mcpServer": {
          "type": "object",
          "properties": {
            "executablePath": {
              "type": "string",
              "minLength": 1,
              "description": "Path to the MCP server executable"
            },
            "args": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Command-line arguments for the MCP server"
            },
            "env": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              },
              "description": "Environment variables for the MCP server process"
            },
            "cwd": {
              "type": "string",
              "description": "Working directory for the MCP server process"
            }
          },
          "required": ["executablePath"]
        },
        "connectToServer": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "format": "uri",
              "description": "URL of the RESTify server to connect to"
            },
            "bearerToken": {
              "type": "string",
              "minLength": 32,
              "description": "Bearer token for authentication with the server"
            }
          },
          "required": ["url", "bearerToken"]
        }
      },
      "required": ["mcpServer", "connectToServer"]
    }
  },
  "required": ["mode", "dataDirectory"],
  "allOf": [
    {
      "if": {
        "properties": {
          "mode": { "enum": ["server"] }
        }
      },
      "then": {
        "required": ["server"]
      }
    },
    {
      "if": {
        "properties": {
          "mode": { "enum": ["client"] }
        }
      },
      "then": {
        "required": ["client"]
      }
    },
    {
      "if": {
        "properties": {
          "mode": { "enum": ["combo"] }
        }
      },
      "then": {
        "required": ["server", "client"]
      }
    }
  ]
}
```

## Example Configurations

### 1. Server Mode

```json
{
  "mode": "server",
  "dataDirectory": "./data",
  "server": {
    "http": {
      "port": 8080,
      "publicUrl": "http://localhost:8080"
    },
    "auth": {
      "bearerTokens": [
        "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
      ]
    }
  }
}
```

### 2. Client Mode

```json
{
  "mode": "client",
  "dataDirectory": "./data",
  "client": {
    "mcpServer": {
      "executablePath": "node",
      "args": ["./mcp-file-server.js"],
      "env": {
        "MCP_DEBUG": "true"
      },
      "cwd": "./local-mcp-servers"
    },
    "connectToServer": {
      "url": "http://localhost:8080",
      "bearerToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
    }
  }
}
```

### 3. Combo Mode

```json
{
  "mode": "combo",
  "dataDirectory": "./data",
  "server": {
    "http": {
      "port": 8080,
      "publicUrl": "http://localhost:8080"
    },
    "auth": {
      "bearerTokens": [
        "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
      ]
    }
  },
  "client": {
    "mcpServer": {
      "executablePath": "node",
      "args": ["./mcp-file-server.js"],
      "env": {
        "MCP_DEBUG": "true"
      }
    },
    "connectToServer": {
      "url": "http://localhost:8080",
      "bearerToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
    }
  }
}
```

## Attribute Explanations

### Common Attributes

| Attribute | Type | Description | Required |
|-----------|------|-------------|----------|
| `mode` | string | Operating mode: "server", "client", or "combo" | Yes |
| `dataDirectory` | string | Directory for persistent data | Yes |

### Server Configuration

| Attribute | Type | Description | Required |
|-----------|------|-------------|----------|
| `server.http.port` | number | Port for the HTTP server | Yes |
| `server.http.publicUrl` | string | Public URL for the server (for OpenAPI) | Yes |
| `server.auth.bearerTokens` | string[] | List of valid Bearer tokens (min. 32 characters) | Yes |

### Client Configuration

| Attribute | Type | Description | Required |
|-----------|------|-------------|----------|
| `client.mcpServer.executablePath` | string | Path to the executable MCP server | Yes |
| `client.mcpServer.args` | string[] | Command-line arguments for the MCP server | No (Default: []) |
| `client.mcpServer.env` | object | Environment variables for the MCP server | No (Default: {}) |
| `client.mcpServer.cwd` | string | Working directory for the MCP server | No (Default: current directory) |
| `client.connectToServer.url` | string | URL of the RESTify server | Yes |
| `client.connectToServer.bearerToken` | string | Bearer token for authentication with the server | Yes |

## Validation Requirements

- The `mode` determines which configuration sections are required
- Server mode requires the `server` configuration
- Client mode requires the `client` configuration
- Combo mode requires both `server` and `client` configurations
- Bearer tokens must be at least 32 characters long
- Ports must be within the valid range (1-65535)
- URLs must follow a valid URI format

## Configuration Processing

The configuration file should be processed as follows:

1. Load the file from the specified path
2. Parse it as JSON
3. Validate against the schema using Zod or a similar library
4. On error: Output a detailed error message and terminate the program
5. On success: Provide the typed configuration to other components