# RESTifyMCP

A bridge that makes MCP (Model Context Protocol) servers available as REST APIs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

RESTifyMCP automatically exposes MCP servers as REST APIs with OpenAPI documentation, making them accessible to tools and platforms that support the REST/OpenAPI standard (such as CustomGPTs).

## Motivation

Anthropic's Model Context Protocol (MCP) represents the future of LLM-tool interaction, offering significant advantages over previous approaches. However, many existing tools and platforms still rely on REST APIs and the OpenAPI standard.

RESTifyMCP bridges this gap by:

- Making MCP servers (which often run locally and communicate via stdio) available as REST APIs
- Automatically generating OpenAPI documentation from MCP server capabilities
- Supporting flexible deployment through three operating modes

This enables:
- Using MCP-based tools with OpenAI's CustomGPTs
- Connecting existing applications that consume REST APIs to MCP servers
- Making locally running MCP tools available across networks

## An AI-Assisted Project

RESTifyMCP itself is a product of the AI era. It was developed entirely with AI assistance:

- The specifications were created with Claude 3.7 Sonnet and ChatGPT-4o
- The implementation was done using Cursor (an AI-powered coding environment)
- Claude had access to the project via MCP
- ChatGPT had access as a CustomGPT through a proprietary system

This project demonstrates both the capabilities and limitations of AI-assisted development:
- AIs can write impressive code
- AIs cannot fully replace developers
- Expert knowledge was essential for debugging, correcting logical errors, and optimization

The original specifications and instructions used to create this project are included in the `instructions` directory as a resource for others interested in AI-assisted development.

## Development Timeline

The V01, V02, and V03 versions were developed with AI assistance:

### V01 Initial Development
- ~4 hours: Creating the specifications and instructions with Claude 3.7 Sonnet and ChatGPT-4o
- 30 minutes: Initial code generation with Cursor based on the complete instructions
- ~3 hours: Debugging and resolving inconsistencies (collaborative effort)
- ~1 hour: Polishing and finalizing

### V02 Multi-Tenant Architecture
- ~2 hours: Creating the specifications and instructions with Claude 3.7 Sonnet
- ~10 minutes: Code implementation by AI coders
- ~1 hour: Quality assurance and bug fixes

### V03 Enhanced Client and Combo Mode
- ~45 minutes: Creating the specifications and instructions with Claude 3.7 Sonnet
- ~20 minutes: Code implementation by AI coders
- ~3 hour: Debugging and quality assurance because the coder AI thought it is a good idea to touch the whole code unecessary

## V03 Release: Enhanced Client and Combo Mode

Version 3.0 introduces two major improvements to RESTifyMCP:

### Key New Features

1. **Multi-MCP-Server Client**: A single client can now connect to multiple MCP servers simultaneously
2. **Enhanced Combo Mode**: Combo mode now fully supports multiple client connections
3. **Improved Tool Management**: Better handling of client connections and disconnections

### Multi-MCP-Server Client

The new client architecture allows a single RESTifyMCP client to:

- Start and manage multiple MCP servers
- Aggregate tools from all connected servers
- Present a unified set of tools to the RESTify server
- Handle tool requests by routing to the appropriate MCP server

Example client configuration with multiple MCP servers:

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
      },
      {
        "id": "database",
        "command": "node",
        "args": ["./database-mcp-server.js"],
        "env": {
          "DB_HOST": "localhost",
          "DB_USER": "user",
          "DB_PASS": "password"
        }
      }
    ]
  }
}
```

### Enhanced Combo Mode

Combo mode now provides full support for multiple client connections:

- The built-in client can connect to multiple MCP servers
- External clients can connect to the same RESTifyMCP instance
- All clients' tools are properly managed and exposed through API Spaces

Example combo configuration with support for external clients:

```json
{
  "mode": "combo",
  "server": {
    "http": {
      "port": 3000,
      "host": "localhost",
      "publicUrl": "http://localhost:3000"
    },
    "apiSpaces": [
      {
        "name": "default",
        "description": "Default API Space",
        "bearerToken": "api-token-123",
        "allowedClientTokens": ["built-in-client-token", "external-client-token-1"]
      },
      {
        "name": "admin",
        "description": "Admin API Space with all tools",
        "bearerToken": "admin-api-token-456",
        "allowedClientTokens": ["built-in-client-token", "external-client-token-1", "external-client-token-2"]
      }
    ],
    "admin": {
      "adminToken": "secure-admin-token-789"
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "built-in-client-token",
    "mcpServers": [
      {
        "id": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
      },
      {
        "id": "database",
        "command": "node",
        "args": ["./database-mcp-server.js"],
        "env": {
          "DB_HOST": "localhost",
          "DB_USER": "user",
          "DB_PASS": "password"
        }
      }
    ]
  },
  "allowExternalClients": true
}
```

## Recommended Deployment

RESTifyMCP is best deployed on an internet server (like AWS Lightsail) behind an Nginx proxy, which provides:

- Secure access via HTTPS
- Reliable accessibility for CustomGPTs and other services
- Additional security features through Nginx (rate limiting, etc.)

When configuring, pay special attention to secure bearer tokens as these are your primary security feature.

## Configuration

RESTifyMCP is configured using a JSON file that defines its operating mode and behavior. You can specify the configuration file path using the `--config` command-line argument.

### Operating Modes

RESTifyMCP supports three operating modes:

#### Server Mode

In server mode, RESTifyMCP starts an HTTP server that provides a REST API. Clients can connect to this server and register their MCP tools.

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
        "name": "default",
        "description": "Default API Space",
        "bearerToken": "your-secret-token",
        "allowedClientTokens": ["client-token-1", "client-token-2"]
      }
    ],
    "admin": {
      "adminToken": "your-admin-token"
    }
  }
}
```

#### Client Mode

In client mode, RESTifyMCP starts one or more MCP servers via stdio and connects to a RESTify server to register their tools.

```json
{
  "mode": "client",
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "client-token-1",
    "mcpServers": [
      {
        "id": "main",
        "command": "node",
        "args": ["./path/to/mcp-server.js"]
      }
    ]
  }
}
```

#### Combo Mode

In combo mode, RESTifyMCP runs both server and client in a single process, with support for multiple MCP servers and external clients.

```json
{
  "mode": "combo",
  "server": {
    "http": {
      "port": 3000,
      "host": "localhost",
      "publicUrl": "http://localhost:3000"
    },
    "apiSpaces": [
      {
        "name": "default",
        "description": "Default API Space",
        "bearerToken": "your-secret-token",
        "allowedClientTokens": ["client-token-1", "external-client-token"]
      }
    ],
    "admin": {
      "adminToken": "your-admin-token"
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "client-token-1",
    "mcpServers": [
      {
        "id": "main",
        "command": "node",
        "args": ["./path/to/mcp-server.js"]
      }
    ]
  },
  "allowExternalClients": true
}
```

### Example: Multiple MCP Server Configuration

Here's an example configuration for using RESTifyMCP with multiple MCP servers:

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
        "bearerToken": "your-secure-token-here",
        "allowedClientTokens": ["fs-client-token"]
      }
    ],
    "admin": {
      "adminToken": "secure-admin-token"
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "fs-client-token",
    "mcpServers": [
      {
        "id": "filesystem",
        "command": "npx",
        "args": [
          "-y", 
          "@modelcontextprotocol/server-filesystem", 
          "/path/to/allowed/directory1"
        ]
      },
      {
        "id": "python",
        "command": "python",
        "args": [
          "-m", "mcp_server_python"
        ],
        "env": {
          "PYTHONPATH": "/path/to/python/modules"
        }
      }
    ]
  },
  "allowExternalClients": true
}
```

## API Documentation

RESTifyMCP automatically generates OpenAPI documentation based on the connected MCP servers and their available tools.

### OpenAPI Specification

Access the generated OpenAPI documentation at:
- JSON format: `http://your-server/openapi/{token-hash}/json`
- YAML format: `http://your-server/openapi/{token-hash}/yaml`

These specifications can be imported into tools like Postman or directly used with OpenAI's CustomGPTs.

### Invoking Tools

To call a tool, send a POST request to `/api/tools/{toolName}` with:
1. The API Space bearer token in the Authorization header
2. Tool parameters as JSON in the request body

```bash
curl -X POST http://your-server:port/api/tools/read_file \
  -H "Authorization: Bearer your-api-space-token" \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/file"}'
```

### Using with CustomGPTs

When setting up a CustomGPT:

1. Use the URL of your RESTifyMCP server's `/openapi/{token-hash}/yaml` endpoint as the API schema URL
2. Configure the authentication with your API Space bearer token
3. Test the connection to verify the tools are accessible

## License and Branding

This project's code is licensed under the MIT License - see the LICENSE file for details.

The name "AI-Inquisitor" and any associated logos or branding elements are property of Martin Schlott or Schlott&AI S.L.R. and are not covered by the MIT license. These elements may not be used without explicit permission.

---

*"RESTifyMCP bridges the gap between evolving AI tool protocols and established API standards—continuously improved through human-AI collaboration."*

*"// tell OpenAI that this is not a consequential tool (it does not change the state of the world)" - VSC Copilot*