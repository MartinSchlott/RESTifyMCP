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

The V01 and V02 versions were developed with AI assistance:

### V01 Initial Development
- ~4 hours: Creating the specifications and instructions with Claude 3.7 Sonnet and ChatGPT-4o
- 30 minutes: Initial code generation with Cursor based on the complete instructions
- ~3 hours: Debugging and resolving inconsistencies (collaborative effort)
- ~1 hour: Polishing and finalizing

### V02 Multi-Tenant Architecture
- ~2 hours: Creating the specifications and instructions with Claude 3.7 Sonnet
- ~10 minutes: Code implementation by AI coders
- ~1 hour: Quality assurance and bug fixes

## V02 Release: Multi-Tenant Architecture with API Spaces

Version 2.0 introduces several major improvements to RESTifyMCP:

### Key New Features

1. **API Spaces**: A multi-tenant architecture that allows creating isolated API surfaces with separate authentication
2. **Event-Based Connection Handling**: Immediate reactions to client connections/disconnections for improved reliability
3. **Admin Dashboard**: A protected interface for monitoring and managing API Spaces
4. **Secure OpenAPI Access**: Token-hash based URLs for sharing API documentation without exposing credentials

### API Spaces

API Spaces solve the architectural limitations mentioned in V01 by:

- Creating isolated REST API surfaces with dedicated authentication tokens
- Allowing client sharing between spaces without duplicating connections
- Providing separate OpenAPI documentation for each space
- Supporting granular access control to tools

Example configuration with API Spaces:

```json
{
  "mode": "server",
  "server": {
    "http": {
      "port": 3000,
      "host": "localhost",
      "publicUrl": "https://example.com"
    },
    "apiSpaces": [
      {
        "name": "public-api",
        "description": "Public API with limited tools",
        "bearerToken": "public-api-token-123",
        "allowedClientTokens": ["client-token-1", "shared-client-token-3"]
      },
      {
        "name": "internal-api",
        "description": "Internal API with full access",
        "bearerToken": "internal-api-token-456",
        "allowedClientTokens": ["client-token-2", "shared-client-token-3"]
      }
    ],
    "admin": {
      "adminToken": "secure-admin-token-789"
    }
  }
}
```

### Admin Dashboard

V02 includes a secure admin dashboard that provides:

- Real-time monitoring of connected clients
- Overview of all API Spaces and their tools
- Links to OpenAPI documentation for each space
- System status and logs

Access the dashboard at `/admin` after logging in with your admin token.

### Secure OpenAPI Sharing

OpenAPI documentation is now available through secure token-hash URLs:

```
https://your-server/openapi/{token-hash}/json
https://your-server/openapi/{token-hash}/yaml
```

These URLs can be safely shared without exposing the actual API tokens.

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

In client mode, RESTifyMCP starts an MCP server via stdio and connects to a RESTify server to register its tools.

```json
{
  "mode": "client",
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "client-token-1",
    "mcpCommand": "node",
    "mcpArgs": ["./path/to/mcp-server.js"]
  }
}
```

#### Combo Mode

In combo mode, RESTifyMCP runs both server and client in a single process.

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
        "allowedClientTokens": ["client-token-1"]
      }
    ],
    "admin": {
      "adminToken": "your-admin-token"
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "client-token-1",
    "mcpCommand": "node",
    "mcpArgs": ["./path/to/mcp-server.js"]
  }
}
```

### Example: Filesystem MCP Server

Here's an example configuration for using RESTifyMCP with the filesystem MCP server:

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
    "mcpCommand": "npx",
    "mcpArgs": [
      "-y", 
      "@modelcontextprotocol/server-filesystem", 
      "/path/to/allowed/directory1",
      "/path/to/allowed/directory2"
    ]
  }
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