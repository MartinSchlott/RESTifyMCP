# RESTifyMCP: Specification

## Documentation Overview

This specification describes the RESTifyMCP project, which makes MCP servers (Model Context Protocol) available as REST APIs.

## Contents

1. [Project Goal and Overview](01_project_overview.md)
   - What is RESTifyMCP?
   - Main Objectives
   - Use Cases
   - Minimum Viable Product (MVP)
   - Technical Foundations

2. [System Architecture](02_system_architecture.md)
   - Operating Modes (Server, Client, Combo)
   - Data Flows
   - Diagrams

3. [Technical Requirements](03_technical_requirements.md)
   - Programming Language and Runtime Environment
   - Dependencies
   - Architectural Constraints
   - Error Handling and Logging
   - MVP Limitations

4. [Components and Interfaces](04_components_interfaces.md)
   - Main Components
   - Interface Definitions
   - Data Exchange and Communication

5. [Configuration Schema](05_configuration_schema.md)
   - JSON Schema
   - Example Configurations
   - Attribute Explanations
   - Validation Requirements

6. [OpenAPI Generation](06_openapi_generation.md)
   - Converting MCP Tools to REST Endpoints
   - OpenAPI Structure
   - Parameter Transformation
   - Retrieving OpenAPI Specification

7. [MCP Server Integration](07_mcp_server_integration.md)
   - MCP Server Lifecycle
   - Tool Invocation Workflow
   - Error Handling
   - MCP Server Configuration

8. [Client-Server Communication](08_client_server_communication.md)
   - WebSocket Connection
   - Message Types
   - Tool Invocation Workflow
   - Error Handling
   - Connection Management

9. [Implementation Guide](09_implementation_guide.md)
   - Overview of Implementation Steps
   - Implementation Phases
   - Recommended Order

10. [MCP SDK Integration Guide](10_mcp_guide.md)
    - MCP SDK Overview
    - Setup and Configuration
    - Key Components for Integration
    - Error Handling and Reconnection
    - Example Server Configuration
    - Testing and Best Practices

11. [OpenAPI Generation for LLM Consumption](11_customgpt_api_guide.md)
    - Key Elements for LLM-Friendly OpenAPI
    - Parameter and Response Design
    - Error Handling Best Practices
    - LLM-Specific Optimizations
    - MCP to OpenAPI Conversion Examples

## Developer Notes

This specification is designed for the implementation of the RESTifyMCP project. It follows a modular approach, allowing the various components to be developed and tested separately.

Please adhere to the rules and guidelines contained in the documents [Cursor-rules-restifymcp.md](../Cursor-rules-restifymcp.md) and [Restifymcp-guidelines.md](../Restifymcp-guidelines.md).

The implementation guide under [09_implementation_guide.md](09_implementation_guide.md) provides a structured roadmap for development and should be used as a starting point.

For detailed guidance on integrating the MCP SDK, refer to [10_mcp_guide.md](10_mcp_guide.md), which provides comprehensive instructions and code examples.

To ensure your generated OpenAPI specifications work effectively with LLMs, review the guidelines in [11_customgpt_api_guide.md](11_customgpt_api_guide.md).
