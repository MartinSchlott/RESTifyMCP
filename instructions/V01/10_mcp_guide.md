# RESTifyMCP: MCP SDK Integration Guide

## Overview

This document provides detailed guidance for integrating the Model Context Protocol (MCP) SDK into RESTifyMCP. The current implementation uses a mock client in `src/client/mcp-stdio.ts` which needs to be replaced with a proper integration of the official MCP SDK.

The MCP (Model Context Protocol) is an open standard designed by Anthropic that lets you build servers exposing data and functionality to AI applications in a secure, standardized way. Think of it like a web API designed specifically for Large Language Model (LLM) interactions.

## MCP SDK Information

- **Package Name**: `@modelcontextprotocol/sdk`
- **Current Version**: 1.6.1 (as of March 2025)
- **License**: MIT
- **Repository**: [GitHub - modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Documentation**: [Model Context Protocol Documentation](https://modelcontextprotocol.io/docs)

## Installation

Install the MCP SDK using npm:

```bash
npm install @modelcontextprotocol/sdk
```

## TypeScript Configuration

To ensure proper compatibility with the MCP SDK, configure your `tsconfig.json` as follows:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "target": "ES2020"
    // ...other options
  }
}
```

This configuration ensures compatibility with ESM imports and the SDK's module structure.

## Key Components for RESTifyMCP

### Required Imports

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
```

Note the `.js` extension in the import paths, which is required for ESM compatibility.

### Connecting to an MCP Server

Replace the mock client implementation in `src/client/mcp-stdio.ts` with the following pattern:

```typescript
// Create a transport that communicates with the MCP server via stdio
const transport = new StdioClientTransport({
  command: "node",                   // Or other executable that starts the MCP server
  args: ["path/to/mcp-server.js"],   // Arguments to pass to the command
  env: { ...process.env },           // Important: inherit environment variables
  shell: false,                      // Set to true if needed for PATH resolution
  stderr: "pipe"                     // Capture server stderr for logging
});

// Create an MCP client with appropriate capabilities
const client = new Client(
  { name: "restifymcp-client", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// Connect to the MCP server
await client.connect(transport);
```

### Fetching Available Tools

The MCP SDK provides a standard way to retrieve available tools:

```typescript
async function getAvailableTools() {
  try {
    const toolList = await client.listTools();
    return toolList.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema,
      returns: tool.outputSchema
    }));
  } catch (error) {
    logger.error('Failed to get tools from MCP server', error);
    throw new RESTifyMCPError(
      `Failed to get tools: ${error.message}`,
      'MCP_GET_TOOLS_ERROR'
    );
  }
}
```

### Calling a Tool

To invoke a tool on the MCP server:

```typescript
async function callTool(name, args) {
  try {
    const result = await client.callTool({
      name: name,
      arguments: args
    });
    
    // Check for error in result
    if (result.isError) {
      throw new Error(result.content?.[0]?.text || 'Unknown error');
    }
    
    // Process the result content
    // The content is typically an array of content items
    // Each item has a type (e.g., "text") and corresponding data
    return result.content;
  } catch (error) {
    logger.error(`Failed to call tool ${name}`, error);
    throw new RESTifyMCPError(
      `Failed to call tool ${name}: ${error.message}`,
      'MCP_TOOL_ERROR'
    );
  }
}
```

## Understanding MCP Components

MCP has three main components that servers can provide:

1. **Tools**: Functions the AI can invoke to perform actions, calculations, or call external APIs. Similar to POST endpoints in REST.
2. **Resources**: Read-only data that the server provides to the AI. Similar to GET endpoints in REST.
3. **Prompts**: Pre-defined templates for structuring AI interactions.

RESTifyMCP primarily focuses on exposing Tools through REST APIs, but understanding all components helps with integration.

## Error Handling and Reconnection

The MCP SDK does not automatically handle reconnection when the server process exits. Implement the following patterns:

### Monitor Process State

```typescript
// If the transport exposes the child process
transport.process.on('exit', (code, signal) => {
  logger.warn(`MCP server process exited with code ${code} and signal ${signal}`);
  // Implement reconnection logic
});
```

### Implement Reconnection Strategy

```typescript
async function ensureConnected() {
  let retryCount = 0;
  const maxRetries = 5;
  
  while (retryCount < maxRetries) {
    try {
      // Create a new transport and connect
      const transport = new StdioClientTransport({/* config */});
      await client.connect(transport);
      logger.info('Successfully reconnected to MCP server');
      return true;
    } catch (error) {
      retryCount++;
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff
      logger.warn(`Reconnection attempt ${retryCount} failed. Retrying in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  logger.error('Failed to reconnect to MCP server after multiple attempts');
  return false;
}
```

### Standardized Error Handling

The MCP protocol includes standardized error structures. The SDK provides an `McpError` class and predefined error codes (such as `ErrorCode.ToolNotFound`) for common situations. When a tool call fails, the error will be propagated to the client through the protocol.

### Wrap All MCP Calls in Try-Catch

All interactions with the MCP server should handle exceptions:

```typescript
try {
  await client.connect(transport);
  // Further operations
} catch (error) {
  logger.error('MCP operation failed', error);
  // Handle the error appropriately
}
```

## Example MCP Server Configuration

RESTifyMCP is designed to work with various MCP servers. Here's an example configuration for using the official filesystem MCP server:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/martinschlott/Documents/MyProjects", "/Users/martinschlott/Documents/MyWritings"]
    }
  }
}
```

This configuration would start an MCP server that provides file system access to the specified directories.

For RESTifyMCP, you would integrate this by:

```typescript
const transport = new StdioClientTransport({
  command: config.mcpServers.filesystem.command,
  args: config.mcpServers.filesystem.args,
  env: { ...process.env },
  shell: true  // Recommended for npx commands
});
```

## Testing Your Implementation

1. Start with a simple integration that just connects to the MCP server and lists tools
2. Verify tool definitions are correctly retrieved and mapped
3. Test calling a simple tool with minimal arguments
4. Test error cases (invalid tool name, invalid arguments)
5. Test reconnection by forcibly terminating the MCP server process

## Performance Considerations

### Efficient Data Handling

- **Stream Large Data**: For large content, consider breaking it into smaller chunks rather than loading everything into memory at once.
- **Efficient Parsing**: When dealing with data formats (JSON, XML, etc.), parse and format only what you need.
- **Avoid Redundant Computation**: Cache results within a single session if appropriate.
- **Parallelize Where Possible**: If one tool call logically can perform independent sub-tasks, run them in parallel using Promise.all.

### Resource Optimization

- **Connection Reuse**: Reuse connections to external services rather than opening new ones on each request.
- **Memory Management**: Dispose of large objects after use to avoid memory leaks in long-running servers.
- **Throttling**: Consider implementing rate limiting for tools that call external APIs with their own limits.

### Reducing Latency

- **Locality**: For lowest latency, run the server as close to the client as possible (ideally on the same machine).
- **Warm Start**: Initialize frequently used components at startup to avoid latency on first use.
- **Optimize Request-Response Cycle**: Design your tools to minimize the number of round trips required.
- **Monitoring**: Implement timing logs to measure how long each request takes and identify bottlenecks.

## Best Practices

1. **Initialize Once**: Create the client and establish the connection once at startup.
2. **Validate Tool Names**: Before calling a tool, verify it exists in the available tools list.
3. **Handle All Errors**: Catch and appropriately handle exceptions at every step.
4. **Implement Timeouts**: Consider implementing request timeouts for tools that may hang.
5. **Verify Environment**: Ensure the MCP server has the necessary environment variables.
6. **Monitor Stderr**: Capture and log the server's stderr output for debugging.
7. **Structure and Modularity**: For complex servers, organize your code with separate modules for different tools.
8. **Use Zod for Validation**: Take advantage of Zod schemas for robust input validation in your tools.
9. **State Management**: MCP servers are typically stateless between requests. If you maintain server-side state, ensure it's properly managed.
10. **Testing Isolation**: Test your server components in isolation before full integration.

## Common Issues and Solutions

### "ERR_MODULE_NOT_FOUND" or Import Errors
- Ensure `.js` extensions are included in import paths
- Verify `tsconfig.json` has correct module resolution settings

### Process Launch Failures
- Check if the command and arguments are correct
- Pass the parent environment or ensure PATH is properly set
- Try with `shell: true` if using commands like `npx`

### Connection Timeouts
- Verify the MCP server starts correctly (check stderr)
- Check for network restrictions if using a remote server
- Increase connection timeout if needed

### Tool Invocation Errors
- Verify the tool exists and parameters match the schema
- Log the full error response for debugging
- Check the server implementation for any tool-specific requirements

## Resources and Links

Here are some valuable resources for MCP SDK development:

1. [Official TypeScript SDK Repository](https://github.com/modelcontextprotocol/typescript-sdk) - The source code, examples, and documentation for the MCP TypeScript SDK.

2. [MCP Documentation Site](https://modelcontextprotocol.io/docs) - Official documentation covering the MCP specification, concepts, and usage guides.

3. [Hackteam - Build Your First MCP Server](https://hackteam.io/blog/build-your-first-mcp-server-with-typescript-in-under-10-minutes/) - A step-by-step tutorial on building an MCP server with TypeScript.

4. [Anthropic MCP: Developer's Thoughts](https://dev.to/dbolotov/anthropic-mcp-developers-thoughts-3dkk) - Insights and best practices from a developer working with MCP.

5. [Red Hat Developer Blog on MCP](https://developers.redhat.com/blog/2025/01/22/quick-look-mcp-large-language-models-and-nodejs) - A practical look at MCP with Node.js, including code examples and use cases.

6. [MCP Inspector Tool](https://github.com/modelcontextprotocol/inspector) - A debugging tool that can simulate a client and visualize MCP requests/responses.
