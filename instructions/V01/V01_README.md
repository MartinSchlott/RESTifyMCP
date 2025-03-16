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

The entire project was developed with AI assistance:

- ~4 hours: Creating the specifications and instructions with Claude 3.7 Sonnet and ChatGPT-4o
- 20 minutes: Initial code generation with Cursor based on the complete instructions
- ~3 hours: Debugging and resolving inconsistencies (collaborative effort)
- ~1 hour: Polishing and finalizing

The initial approach of providing all instructions at once (rather than step-by-step) made debugging more challenging, but aligned with the project's goal of testing AI's capabilities with minimal human guidance.

While there are still some implementation quirks that a human developer might have approached differently (such as the Combo mode), the tool works effectively as a proof of concept rather than an MVP. It's already being used with CustomGPTs to test MCP servers in real-world scenarios.

## Recommended Deployment

RESTifyMCP is best deployed on an internet server (like AWS Lightsail) behind an Nginx proxy, which provides:

- Secure access via HTTPS
- Reliable accessibility for CustomGPTs and other services
- Additional security features through Nginx (rate limiting, etc.)

When configuring, pay special attention to secure bearer tokens as these are your primary security feature.

## Current Limitations

While functional as a proof of concept, there are several known technical limitations:

- **Authentication System**: The bearer token implementation is basic and was designed for simple use cases. It lacks proper client isolation.
- **Multi-Client Strategy**: The current approach to handling multiple clients has architectural limitations that would need to be addressed for production use.
- **OpenAPI Generation**: The generated YAML/JSON is a large amalgamation of all connected clients' tools, which lacks proper segmentation.

These limitations don't impact basic testing scenarios but should be considered if adapting this tool for more critical applications. Contributions to improve these areas are welcome.

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
    "auth": {
      "bearerTokens": ["your-secret-token-1", "your-secret-token-2"]
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
    "bearerToken": "your-secret-token",
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
    "auth": {
      "bearerTokens": ["your-secret-token"]
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "your-secret-token",
    "mcpCommand": "node",
    "mcpArgs": ["./path/to/mcp-server.js"]
  }
}
```

### Authentication

RESTifyMCP uses bearer tokens for authentication. You can configure one or more allowed tokens in the server configuration:

```json
"auth": {
  "bearerTokens": ["token1", "token2", "token3"]
}
```

When clients connect, they are associated with one of these tokens. All API requests must include an `Authorization: Bearer <token>` header.

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
    "auth": {
      "bearerTokens": ["your-secure-token-here"]
    }
  },
  "client": {
    "serverUrl": "http://localhost:3000",
    "bearerToken": "your-secure-token-here",
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

### Deployment Tips

When deploying RESTifyMCP behind a reverse proxy like Nginx:

1. Update the `publicUrl` in your RESTifyMCP config to match your domain
2. Use strong, random bearer tokens
3. Consider enabling rate limiting for additional security

## API Documentation

RESTifyMCP automatically generates OpenAPI documentation based on the connected MCP servers and their available tools.

### OpenAPI Specification

Access the generated OpenAPI documentation at:
- JSON format: `http://your-server:port/openapi.json`
- YAML format: `http://your-server:port/openapi.yaml`

These specifications can be imported into tools like Postman or directly used with OpenAI's CustomGPTs.

#### OpenAI Compatibility Features

RESTifyMCP includes special OpenAPI customizations for better integration with OpenAI's products:

- Descriptions are limited to 300 characters (OpenAI requirement)
- Tools include `x-openai-isConsequential: false` to prevent unnecessary confirmation prompts
- Simplified schema structure for more reliable tool usage with CustomGPTs

### Main Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/tools/{toolName}` | Invoke a specific tool with parameters |
| `/info` | Dashboard showing connected clients, available tools, and logs |
| `/openapi.json` | OpenAPI specification in JSON format |
| `/openapi.yaml` | OpenAPI specification in YAML format |
| `/logs/events` | Server-sent events (SSE) stream of server logs |

### Authentication

All API requests require authentication using a Bearer token:

```
Authorization: Bearer your-token-here
```

The token must match one of the configured tokens in your server configuration.

### Invoking Tools

To call a tool, send a POST request to `/api/tools/{toolName}` with the tool parameters as JSON in the request body:

```bash
curl -X POST http://your-server:port/api/tools/read_file \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/file"}'
```

The response will contain the tool's result:

```json
{
  "result": "Content of the file..."
}
```

### Tool Discovery

To discover what tools are available:

1. Check the `/info` dashboard for a visual overview
2. Examine the OpenAPI specification for detailed schema information
3. Use the OpenAPI schema to understand the required parameters for each tool

### Using with CustomGPTs

When setting up a CustomGPT:

1. Use the URL of your RESTifyMCP server's `/openapi.yaml` endpoint as the API schema URL
2. Configure the authentication with your bearer token
3. Test the connection to verify the tools are accessible

The CustomGPT will then be able to use all tools provided by your MCP servers through the RESTifyMCP interface.

## License and Branding

This project's code is licensed under the MIT License - see the LICENSE file for details.

The name "AI-Inquisitor" and any associated logos or branding elements are property of Martin Schlott or Schlott&AI S.L.R. and are not covered by the MIT license. These elements may not be used without explicit permission.

---

*"RESTifyMCP is the bridge between the future of AI tooling protocols and today's widely adopted API standards—created through human-AI collaboration."*

*"// tell OpenAI that this is not a consequential tool (it does not change the state of the world)" - VSC Copilot*