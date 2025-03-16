# RESTifyMCP: MCP Server Integration

This document describes how RESTifyMCP interacts with and manages MCP servers via Stdio.

## MCP Server Lifecycle

RESTifyMCP starts and manages MCP servers as child processes in client mode. The lifecycle consists of the following phases:

### 1. Starting the MCP Server

The MCP server is started as a child process with:

- The configured executable path (`executablePath`)
- Optional arguments (`args`)
- Environment variables (`env`)
- An optional working directory (`cwd`)

Example of process creation (concept code):

```typescript
// Note: This is pseudocode for illustration purposes
import { spawn } from 'child_process';

const process = spawn(config.mcpServer.executablePath, config.mcpServer.args || [], {
  env: { ...process.env, ...config.mcpServer.env },
  cwd: config.mcpServer.cwd || process.cwd(),
  stdio: ['pipe', 'pipe', 'inherit'] // stdin, stdout, stderr
});
```

Stdio is used for communication with the MCP server:
- `stdin`: For sending requests to the MCP server
- `stdout`: For receiving responses from the MCP server
- `stderr`: Redirected to the main process log to capture errors

### 2. Establishing Connection to the MCP Server

After starting the process, a connection is established using the MCP SDK:

```typescript
// Note: This is pseudocode for illustration purposes
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const transport = new StdioClientTransport({
  input: process.stdout, // MCP server stdout -> Client input
  output: process.stdin,  // Client output -> MCP server stdin
});

const client = new Client(
  { name: 'restifymcp-client', version: '1.0.0' },
  { capabilities: { prompts: {}, resources: {}, tools: {} } }
);

await client.connect(transport);
```

### 3. Retrieving MCP Tools

After a successful connection, RESTifyMCP retrieves available tools from the MCP server:

```typescript
// Note: This is pseudocode for illustration purposes
const tools = await client.listTools();
```

The MCP SDK provides a list of tools with their names, descriptions, parameters, and return types.

### 4. Monitoring the MCP Server Process

RESTifyMCP monitors the MCP server process for unexpected termination or faulty states:

```typescript
// Note: This is pseudocode for illustration purposes
process.on('error', (error) => {
  log('ERROR', `MCP server process error: ${error.message}`);
  // Recovery actions could be implemented here
});

process.on('exit', (code) => {
  log('INFO', `MCP server process exited with code ${code}`);
  // Restart or cleanup could be performed here
});
```

### 5. Graceful Shutdown

When RESTifyMCP shuts down, the MCP server is also properly terminated:

```typescript
// Note: This is pseudocode for illustration purposes
async function shutdown() {
  try {
    await client.disconnect();
    process.kill(); // Send SIGTERM signal to child process
    
    // Optional: Wait until process exits (with timeout)
    const exitPromise = new Promise((resolve) => {
      process.once('exit', resolve);
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout')), 5000);
    });
    
    await Promise.race([exitPromise, timeoutPromise]);
  } catch (error) {
    log('ERROR', `Failed to shutdown MCP server gracefully: ${error.message}`);
    process.kill('SIGKILL'); // Force termination
  }
}
```

## Tool Invocation Workflow

When a tool is called via the REST API, RESTifyMCP processes the request as follows:

1. **Receiving the request from the REST client**:
   - The REST API receives a POST request to the corresponding endpoint
   - Parameters are extracted from the request body

2. **Forwarding the request to the MCP server**:
   - RESTifyMCP uses the MCP SDK to call the appropriate tool
   - Parameters are passed to the tool

   ```typescript
   // Note: This is pseudocode for illustration purposes
   const result = await client.callTool({
     name: toolName,
     arguments: requestBody
   });
   ```

3. **Returning the response to the REST client**:
   - The result from the MCP server is returned to the REST client
   - Errors are handled accordingly

## Error Handling

RESTifyMCP implements robust error handling for MCP server integration:

### Server Start Failures

If the MCP server cannot be started (e.g., executable not found):
- The error is logged
- The client is not registered with the RESTify server
- The client attempts to restart at configurable intervals

### Communication Errors

If communication with the MCP server fails:
- The error is logged
- The affected request returns an error
- In severe cases, an MCP server restart may be considered

### Unexpected Server Termination

If the MCP server unexpectedly terminates:
- RESTifyMCP attempts to restart the server
- During the restart, incoming requests return a temporary error
- Once restarted, normal operation resumes

## MCP Server Configuration

The MCP server is configured via the RESTifyMCP configuration file. The following parameters can be adjusted:

- **executablePath**: Path to the executable MCP server (required)
- **args**: Command-line arguments for the MCP server (optional)
- **env**: Environment variables for the MCP server (optional)
- **cwd**: Working directory for the MCP server (optional)

These parameters provide flexibility for different MCP server implementations and requirements.

## Example: Integrating an MCP File Server

A typical example is integrating an MCP file server that provides access to local files:

1. Configuration:
   ```json
   {
     "mode": "client",
     "dataDirectory": "./data",
     "client": {
       "mcpServer": {
         "executablePath": "node",
         "args": ["./mcp-file-server.js", "--basedir", "/var/data"],
         "env": {
           "MCP_DEBUG": "true"
         },
         "cwd": "/opt/mcp-servers"
       },
       "connectToServer": {
         "url": "http://localhost:8080",
         "bearerToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
       }
     }
   }
   ```

2. Functionality:
   - RESTifyMCP starts the file server with the specified parameters
   - The file server registers tools like `readFile`, `writeFile`, `listDirectory`
   - These are exposed as REST endpoints
   - Clients can now access the file system via REST

## Security Considerations

When integrating MCP servers, the following security aspects should be considered:

1. **Process Isolation**: MCP servers run as separate processes but should have the least necessary privileges

2. **Working Directories**: By configuring the `cwd` parameter, access to certain directories can be restricted

3. **Environment Variables**: Sensitive information should not be passed via environment variables stored in plain text within the configuration file

4. **Validation**: All input for MCP tools should be validated before being passed to the MCP server
