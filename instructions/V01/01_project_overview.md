# RESTifyMCP: Project Goal and Overview

## What is RESTifyMCP?

RESTifyMCP is a tool that makes MCP (Model Context Protocol) servers available as REST APIs. It acts as a bridge between two important standards:

1. **Model Context Protocol (MCP)**: A standard defined by Anthropic that enables LLMs to communicate with tools in a standardized way. MCP servers provide functionality through a protocol that often communicates via stdio (Standard Input/Output).

2. **OpenAPI/REST**: A widely used standard for web interfaces, supported by many developers and tools.

## Main Objectives

- **Automatic Conversion**: Automatically expose MCP servers, which often run locally and communicate via stdio, as REST APIs.
- **OpenAPI Documentation**: Automatically generate an OpenAPI definition based on MCP server capabilities.
- **Flexible Deployment**: Support various usage scenarios through three operating modes (Server, Client, Combo).

## Use Cases

RESTifyMCP primarily addresses the following issues:

1. **Access to Local MCP Tools**: Many MCP servers run locally or behind firewalls and are only accessible via stdio. RESTifyMCP makes them available via standardized REST APIs.

2. **Integration into Existing Systems**: Systems that already work with REST APIs can easily extend their functionality with MCP tools.

3. **Automated Documentation**: The automatic generation of OpenAPI definitions simplifies the integration and usage of MCP tools.

## Minimum Viable Product (MVP)

The first version of RESTifyMCP focuses on:

- Support for "Bearer" authentication.
- Support only for function calls (tools) within MCP.
- Support only for stdio-based MCP servers.

Future versions may support additional MCP features such as messages, streams, and more.

## Technical Foundations

RESTifyMCP is developed in TypeScript and uses a minimal set of dependencies:
- Express (for the REST server)
- Zod (for validation)
- Commander (for CLI arguments)
- openapi3-ts (for OpenAPI definition)
- uuid (for UID generation)
- Official MCP SDK from Anthropic
