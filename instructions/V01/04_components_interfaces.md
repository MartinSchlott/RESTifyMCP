# RESTifyMCP: Components and Interfaces

## Main Components

RESTifyMCP consists of the following main components, which are used depending on the operating mode:

### 1. Shared Components

#### `shared/config.ts`
- Responsible for loading and validating the configuration file
- Provides typed configuration data for other components
- Uses Zod for schema validation

```typescript
// Interface
export interface ConfigService {
  loadConfig(path: string): Promise<ValidatedConfig>;
  validateConfig(config: unknown): ValidatedConfig;
}

export type ValidatedConfig = {
  mode: "server" | "client" | "combo";
  server?: ServerConfig;
  client?: ClientConfig;
  dataDirectory: string;
};
```

#### `shared/types.ts`
- Contains common TypeScript type definitions
- Defines interfaces for MCP tool definitions
- Defines interfaces for REST API requests and responses

```typescript
// Example interfaces
export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns: unknown;
}

export interface ClientRegistration {
  clientId: string;
  bearerToken: string;
  tools: MCPToolDefinition[];
}
```

#### `shared/utils.ts`
- Provides utility functions for logging, error handling, etc.
- Implements a standardized logging format

```typescript
// Logging interface
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
}
```

### 2. Server Components

#### `server/index.ts`
- Main entry point for server mode
- Initializes and configures the REST server
- Manages client registrations

```typescript
// Interface
export interface RESTifyServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerClient(clientId: string, tools: MCPToolDefinition[]): void;
  unregisterClient(clientId: string): void;
}
```

#### `server/rest-api.ts`
- Implements the Express-based REST API
- Defines routes for OpenAPI specification and tool invocations
- Forwards requests to the appropriate clients

```typescript
// Interface
export interface RESTApiService {
  setupRoutes(): void;
  handleToolRequest(req: Request, res: Response): Promise<void>;
  getOpenApiSpec(): object;
}
```

#### `server/auth.ts`
- Manages Bearer token authentication
- Validates incoming requests

```typescript
// Interface
export interface AuthService {
  validateBearerToken(token: string): boolean;
  getClientIdFromToken(token: string): string | null;
  authenticateRequest(req: Request, res: Response, next: NextFunction): void;
}
```

#### `server/openapi-generator.ts`
- Dynamically generates OpenAPI specifications
- Converts MCP tool definitions into OpenAPI paths

```typescript
// Interface
export interface OpenApiGenerator {
  generateSpec(clients: Map<string, ClientRegistration>): object;
  generatePathForTool(clientId: string, tool: MCPToolDefinition): object;
}
```

### 3. Client Components

#### `client/index.ts`
- Main entry point for client mode
- Manages connection to the RESTify server
- Registers MCP tools with the server

```typescript
// Interface
export interface RESTifyClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerToolsWithServer(tools: MCPToolDefinition[]): Promise<void>;
  callTool(toolName: string, args: object): Promise<unknown>;
}
```

#### `client/mcp-stdio.ts`
- Starts and manages the MCP server as a child process
- Communicates with the MCP server via stdio
- Uses the MCP SDK for standardized communication

```typescript
// Interface
export interface MCPStdioClient {
  startMCPServer(): Promise<void>;
  stopMCPServer(): Promise<void>;
  getAvailableTools(): Promise<MCPToolDefinition[]>;
  callTool(name: string, args: object): Promise<unknown>;
}
```

### 4. Combo Components

#### `combo/index.ts`
- Implements combo mode
- Links client and server components within a single process

```typescript
// Interface
export interface RESTifyCombo {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

## Data Exchange and Communication

### 1. Client-Server Communication
- RESTify Client → RESTify Server: HTTP POST with Bearer token authentication
- RESTify Server → RESTify Client: HTTP response with JSON data

### 2. MCP Communication
- RESTify Client → MCP Server: stdio-based communication using the MCP protocol
- MCP Server → RESTify Client: stdio-based responses

### 3. REST API Communication
- API Client → RESTify Server: HTTP requests (GET, POST) with Bearer token
- RESTify Server → API Client: HTTP responses with JSON data or OpenAPI specification

## Persistence

RESTifyMCP persistently stores the following data in the configured data directory:

1. **Client Registrations**
   - Mapping of client IDs to registered tool definitions
   - Format: JSON file

2. **Generated OpenAPI Specifications**
   - One OpenAPI specification per Bearer token
   - Format: JSON or YAML

3. **Server State**
   - Active client connections
   - Format: JSON file

Persistence is implemented using simple filesystem operations to avoid dependencies on databases.
