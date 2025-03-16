# RESTifyMCP: System Architecture

## Operating Modes

RESTifyMCP supports three different operating modes, which are determined by the configuration:

### 1. Server Mode

```
┌─────────────────────────────────┐
│           REST Server           │
│                                 │
│  ┌─────────┐     ┌──────────┐   │
│  │ OpenAPI │     │ RESTify  │   │
│  │ Spec    │◄────┤ REST API │◄──┼───── HTTP requests from clients
│  └─────────┘     └──────────┘   │
│                      ▲          │
│                      │          │
└──────────────────────┼──────────┘
                       │
                       │ Registration of MCP tools
                       │
┌──────────────────────┼──────────┐
│    RESTify Client 1  │          │
│                      ▼          │
│  ┌─────────┐     ┌──────────┐   │
│  │MCP Server│◄───┤MCP Client│   │
│  │ (stdio)  │    │          │   │
│  └─────────┘     └──────────┘   │
└─────────────────────────────────┘
            ...
┌─────────────────────────────────┐
│    RESTify Client N             │
│                                 │
│  ┌─────────┐     ┌──────────┐   │
│  │MCP Server│◄───┤MCP Client│   │
│  │ (stdio)  │    │          │   │
│  └─────────┘     └──────────┘   │
└─────────────────────────────────┘
```

In this mode:
- RESTifyMCP starts an HTTP server that provides a REST API
- Clients can connect using their Bearer token authentication
- The server collects MCP tool definitions from all connected clients
- The server automatically generates an OpenAPI specification
- REST API requests are forwarded to the corresponding MCP client

### 2. Client Mode

```
┌──────────────────────────────────┐
│        RESTify Client            │
│                                  │
│  ┌─────────┐      ┌──────────┐   │
│  │MCP Server│◄────┤MCP Client│   │
│  │ (stdio)  │     │          │───┼──► Connection to RESTify Server
│  └─────────┘      └──────────┘   │
│                                  │
└──────────────────────────────────┘
```

In this mode:
- RESTifyMCP starts an MCP server via stdio (as a child process)
- It connects to this MCP server using the MCP protocol
- It extracts the available tools and their schemas
- It registers these tools with a remote RESTify server

### 3. Combo Mode

```
┌────────────────────────────────────────────────────┐
│                  RESTify Combo                     │
│                                                    │
│  ┌─────────┐      ┌──────────┐     ┌──────────┐    │
│  │MCP Server│◄────┤MCP Client│────►│ RESTify  │◄───┼─── HTTP requests
│  │ (stdio)  │     │          │     │ REST API │    │
│  └─────────┘      └──────────┘     └────┬─────┘    │
│                                         │          │
│                                     ┌───▼────┐     │
│                                     │OpenAPI │     │
│                                     │ Spec   │     │
│                                     └────────┘     │
└────────────────────────────────────────────────────┘
```

In this mode:
- RESTifyMCP runs both server and client modes in a single process
- The client part starts an MCP server via stdio and connects to it
- The server part provides a REST API that accesses the tools of the MCP server
- Everything runs in a single process

## Data Flows

### 1. Initial Registration

When a RESTify client is started:
1. It starts the MCP server as a child process with stdio
2. It connects to the MCP server via the MCP SDK
3. It queries the available tools from the MCP server
4. It sends these tool definitions to the RESTify server
5. The server generates an updated OpenAPI specification

### 2. REST API Request Processing

When a REST API request comes in:
1. The server authenticates the request via the Bearer token
2. It identifies which client provides the requested tool
3. It forwards the request to the appropriate client
4. The client invokes the function in the MCP server
5. The result is sent back to the server and then to the API caller

## Persistence

RESTifyMCP stores certain data persistently:
- Client registrations and their tool definitions
- Generated OpenAPI specifications
- Configuration settings

This data is stored in a configurable directory to enable smooth restarts.