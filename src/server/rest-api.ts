/**
 * REST API Server for RESTifyMCP
 * 
 * This module handles HTTP requests and provides REST API endpoints.
 */
import express, { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { dump as yamlDump } from 'js-yaml';
import { AuthService } from './auth.js';
import { OpenApiGenerator } from './openapi-generator.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError, generateId } from '../shared/utils.js';
import { ClientRegistration, ToolRequest, ToolResponse } from '../shared/types.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Set up logger
const logger = new ConsoleLogger('RESTApiService', LogLevel.INFO);

/**
 * Interface for handling tool invocations
 */
export interface ToolInvoker {
  invokeToolOnClient(
    clientId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown>;
}

/**
 * REST API Service interface
 */
export interface RESTApiService {
  setupRoutes(): void;
  handleToolRequest(req: Request, res: Response): Promise<void>;
  getOpenApiSpec(): Record<string, any>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Express-based REST API Service implementation
 */
export class ExpressRESTApiService implements RESTApiService {
  private readonly app: Express;
  private readonly port: number;
  private readonly host: string;
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  private readonly authService: AuthService;
  private readonly openApiGenerator: OpenApiGenerator;
  private readonly toolInvoker: ToolInvoker;
  private server: any | null = null;
  private _clientCleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Create a new ExpressRESTApiService
   * @param port Port to listen on
   * @param host Host to bind to
   * @param clientRegistrations Map of client registrations
   * @param authService Authentication service
   * @param openApiGenerator OpenAPI generator
   * @param toolInvoker Tool invoker
   */
  constructor(
    port: number,
    host: string,
    clientRegistrations: Map<string, ClientRegistration>,
    authService: AuthService,
    openApiGenerator: OpenApiGenerator,
    toolInvoker: ToolInvoker
  ) {
    this.app = express();
    this.port = port;
    this.host = host;
    this.clientRegistrations = clientRegistrations;
    this.authService = authService;
    this.openApiGenerator = openApiGenerator;
    this.toolInvoker = toolInvoker;
    
    // Set up ConsoleLogger to forward logs to SSE
    ConsoleLogger.setLogHandler((level, component, message) => {
      ExpressRESTApiService.addLogEntry(
        level.toString(), 
        `[${component}] ${message}`
      );
    });
    
    // Start client cleanup interval
    this.startClientCleanupInterval();
    
    logger.info('ExpressRESTApiService created');
  }

  /**
   * Set up Express routes
   */
  setupRoutes(): void {
    logger.info('Setting up Express routes');

    // Body parser for JSON
    this.app.use(express.json());

    // Individual route handlers
    // OpenAPI specification in JSON format
    this.app.get('/openapi.json', (req: Request, res: Response) => {
      res.json(this.getOpenApiSpec());
    });

    // OpenAPI specification in YAML format
    this.app.get('/openapi.yaml', (req: Request, res: Response) => {
      res.type('text/yaml').send(yamlDump(this.getOpenApiSpec()));
    });

    // Info dashboard page
    this.app.get('/info', (req: Request, res: Response) => {
      res.type('text/html').send(this.generateInfoPageHtml());
    });
    
    // Stats API for dynamic dashboard updates
    this.app.get('/api/stats', (req: Request, res: Response) => {
      // Generate updated stats and HTML snippets
      const clientsCount = this.clientRegistrations.size;
      let toolsCount = 0;
      
      // Count total tools across all clients
      for (const client of this.clientRegistrations.values()) {
        if (client.connectionStatus === 'connected') {
          toolsCount += client.tools.length;
        }
      }
      
      // Generate client table HTML - same format as in generateInfoPageHtml
      let clientTableHtml = '';
      for (const [clientId, client] of this.clientRegistrations.entries()) {
        const statusClass = client.connectionStatus === 'connected' ? 'status-connected' : 'status-disconnected';
        clientTableHtml += `
          <tr>
            <td>${clientId.substring(0, 8)}...</td>
            <td class="${statusClass}">${client.connectionStatus}</td>
            <td>${client.tools.length}</td>
            <td>${new Date(client.lastSeen).toLocaleString()}</td>
          </tr>
        `;
      }

      // Generate tool table HTML - same format as in generateInfoPageHtml
      let toolTableHtml = '';
      for (const client of this.clientRegistrations.values()) {
        if (client.connectionStatus === 'connected') {
          for (const tool of client.tools) {
            toolTableHtml += `
              <tr>
                <td>${tool.name}</td>
                <td>${tool.description.substring(0, 100)}${tool.description.length > 100 ? '...' : ''}</td>
              </tr>
            `;
          }
        }
      }
      
      res.json({
        clientsCount,
        toolsCount,
        clientTableHtml,
        toolTableHtml
      });
    });
    
    // SSE endpoint for log streaming
    this.app.get('/logs/events', (req: Request, res: Response) => {
      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Check if server is shutting down
      if (ExpressRESTApiService.isShuttingDown) {
        res.write(`data: ${JSON.stringify({ level: 'info', message: 'Server is shutting down' })}\n\n`);
        res.end();
        return;
      }
      
      // Send initial logs
      ExpressRESTApiService.recentLogs.forEach(log => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      });
      
      // Function to send new log entries
      const sendLog = (log: any) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      };
      
      // Subscribe to log events
      const unsubscribe = this.subscribeToLogs(sendLog);
      
      // Clean up on connection close
      req.on('close', () => {
        unsubscribe();
      });
    });

    // Tool invocation endpoint
    this.app.post(
      '/api/tools/:toolName',
      (req: Request, res: Response, next: NextFunction) => this.authService.authenticateRequest(req, res, next),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          await this.handleToolRequest(req, res);
        } catch (error) {
          next(error);
        }
      }
    );

    // CORS middleware - use type assertion to appease TypeScript
    // We know this is a valid Express middleware, but the types are tricky
    const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      next();
    };
    this.app.use(corsMiddleware as express.RequestHandler);

    // 404 handler - use type assertion
    const notFoundHandler = (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        code: 'NOT_FOUND'
      });
    };
    this.app.use(notFoundHandler as express.RequestHandler);

    // Error handler - use type assertion
    const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error(`Express error: ${err.message}`, err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    };
    this.app.use(errorHandler);

    logger.info('Express routes set up');
  }

  /**
   * Handle a tool invocation request
   * @param req Express request
   * @param res Express response
   */
  async handleToolRequest(req: Request, res: Response): Promise<void> {
    const toolName = req.params.toolName;
    const bearerToken = (req as any).bearerToken;
    
    try {
      logger.info(`Tool request received for ${toolName}`);
      
      // Find the client that has this tool
      const clientId = await this.findClientForTool(toolName, bearerToken);
      if (!clientId) {
        logger.warn(`No client found for tool ${toolName}`);
        res.status(404).json({
          error: `Tool ${toolName} not found`,
          code: 'TOOL_NOT_FOUND'
        });
        return;
      }
      
      // Get tool arguments from body or query parameters
      const args = this.extractArguments(req);
      
      // Call the tool on the client
      logger.debug(`Invoking tool ${toolName} on client ${clientId}`);
      const result = await this.toolInvoker.invokeToolOnClient(clientId, toolName, args);
      
      // Return the result
      const response: ToolResponse = {
        result
      };
      
      res.json(response);
    } catch (error) {
      logger.error(`Error handling tool request for ${toolName}`, error as Error);
      
      if (error instanceof RESTifyMCPError) {
        res.status(500).json({
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          error: `Error invoking tool ${toolName}`,
          code: 'TOOL_INVOCATION_ERROR'
        });
      }
    }
  }

  /**
   * Get the OpenAPI specification
   * @returns OpenAPI specification
   */
  getOpenApiSpec(): Record<string, any> {
    return this.openApiGenerator.generateSpec(this.clientRegistrations);
  }

  /**
   * Start the REST API server
   */
  start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.setupRoutes();
        
        this.server = this.app.listen(this.port, this.host, () => {
          logger.info(`REST API server listening on ${this.host}:${this.port}`);
          resolve();
        });
        
        this.server.on('error', (error: Error) => {
          logger.error(`Server error: ${error.message}`, error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start REST API server', error as Error);
        reject(error);
      }
    });
  }

  /**
   * Stop the REST API server
   */
  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Close all SSE connections first
      this.closeSseConnections();
      
      // Clear any intervals we've set
      if (this._clientCleanupInterval) {
        clearInterval(this._clientCleanupInterval);
      }
      
      if (this.server) {
        this.server.close((error: Error | undefined) => {
          if (error) {
            logger.error(`Error stopping server: ${error.message}`, error);
            reject(error);
          } else {
            logger.info('REST API server stopped');
            resolve();
          }
        });
      } else {
        logger.info('REST API server was not running');
        resolve();
      }
    });
  }

  /**
   * Get the HTTP server instance
   * 
   * @returns The HTTP server instance or null if not started
   */
  getHttpServer(): any {
    return this.server;
  }

  /**
   * Close SSE connections
   */
  private closeSseConnections(): void {
    logger.info('Closing all SSE connections');
    // Clear all log listeners
    ExpressRESTApiService.logListeners.clear();
    
    // Set a flag to show server is shutting down
    ExpressRESTApiService.isShuttingDown = true;
  }

  /**
   * Find a client that provides a specific tool
   * @param toolName Name of the tool
   * @param bearerToken Bearer token
   * @returns Client ID if found, null otherwise
   */
  private async findClientForTool(toolName: string, bearerToken: string): Promise<string | null> {
    // Find all clients that have this tool
    const matchingClients: string[] = [];
    
    for (const [clientId, client] of this.clientRegistrations.entries()) {
      // Skip disconnected clients
      if (client.connectionStatus !== 'connected') {
        continue;
      }
      
      // Check if client has the tool
      const hasTool = client.tools.some(tool => tool.name === toolName);
      if (hasTool) {
        matchingClients.push(clientId);
      }
    }
    
    if (matchingClients.length === 0) {
      return null;
    }
    
    // If there's only one client, use it
    if (matchingClients.length === 1) {
      return matchingClients[0];
    }
    
    // If there are multiple clients, use the one associated with the token
    const clientIdFromToken = this.authService.getClientIdFromToken(bearerToken);
    if (clientIdFromToken && matchingClients.includes(clientIdFromToken)) {
      return clientIdFromToken;
    }
    
    // Otherwise, use the first matching client
    return matchingClients[0];
  }

  /**
   * Extract tool arguments from request
   * @param req Express request
   * @returns Tool arguments
   */
  private extractArguments(req: Request): Record<string, unknown> {
    // Combine body and query parameters
    const args: Record<string, unknown> = {
      ...req.query,
      ...req.body
    };
    
    return args;
  }

  /**
   * Generate HTML for the info page
   * @returns HTML string
   */
  private generateInfoPageHtml(): string {
    const clientsCount = this.clientRegistrations.size;
    let toolsCount = 0;
    
    // Count total tools across all clients
    for (const client of this.clientRegistrations.values()) {
      if (client.connectionStatus === 'connected') {
        toolsCount += client.tools.length;
      }
    }
    
    // Generate client table HTML
    let clientTableHtml = '';
    for (const [clientId, client] of this.clientRegistrations.entries()) {
      const statusClass = client.connectionStatus === 'connected' ? 'status-connected' : 'status-disconnected';
      clientTableHtml += `
        <tr>
          <td>${clientId.substring(0, 8)}...</td>
          <td class="${statusClass}">${client.connectionStatus}</td>
          <td>${client.tools.length}</td>
          <td>${new Date(client.lastSeen).toLocaleString()}</td>
        </tr>
      `;
    }

    // Generate tool table HTML
    let toolTableHtml = '';
    for (const client of this.clientRegistrations.values()) {
      if (client.connectionStatus === 'connected') {
        for (const tool of client.tools) {
          toolTableHtml += `
            <tr>
              <td>${tool.name}</td>
              <td>${tool.description.substring(0, 100)}${tool.description.length > 100 ? '...' : ''}</td>
            </tr>
          `;
        }
      }
    }
    
    try {
      // Read the HTML template file - using URL and fileURLToPath for ESM compatibility
      const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static', 'info-dashboard.html');
      let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
      
      // Replace placeholders with dynamic content
      htmlTemplate = htmlTemplate
        .replace('{{clientsCount}}', clientsCount.toString())
        .replace('{{toolsCount}}', toolsCount.toString())
        .replace('{{clientTableHtml}}', clientTableHtml)
        .replace('{{toolTableHtml}}', toolTableHtml);
      
      return htmlTemplate;
    } catch (error) {
      logger.error(`Error reading info dashboard template: ${(error as Error).message}`);
      
      // Return a simple error page if template can't be loaded
      return `
        <html>
          <body>
            <h1>Error Loading Dashboard</h1>
            <p>Could not load dashboard template: ${(error as Error).message}</p>
            <p>Please check server logs for more information.</p>
          </body>
        </html>
      `;
    }
  }

  /**
   * In-memory store for recent logs (for SSE)
   */
  private static recentLogs: { timestamp: number; level: string; message: string }[] = [];
  private static logListeners: Set<(log: any) => void> = new Set();
  private static isShuttingDown: boolean = false;

  /**
   * Add a log entry to the recent logs
   */
  private static addLogEntry(level: string, message: string): void {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message: `[${new Date().toISOString()}] [${level}] ${message}`
    };
    
    // Keep only the most recent 100 logs
    ExpressRESTApiService.recentLogs.push(logEntry);
    if (ExpressRESTApiService.recentLogs.length > 100) {
      ExpressRESTApiService.recentLogs.shift();
    }
    
    // Notify all listeners
    ExpressRESTApiService.logListeners.forEach(listener => {
      listener(logEntry);
    });
  }

  /**
   * Subscribe to log events
   */
  private subscribeToLogs(callback: (log: any) => void): () => void {
    ExpressRESTApiService.logListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      ExpressRESTApiService.logListeners.delete(callback);
    };
  }

  /**
   * Set up interval to clean up disconnected clients
   * Removes clients that have been disconnected for more than 1 minute
   */
  private startClientCleanupInterval(): void {
    const CLEANUP_INTERVAL_MS = 60000; // 1 minute
    const DISCONNECTED_TIMEOUT_MS = 60000; // 1 minute
    
    this._clientCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [clientId, client] of this.clientRegistrations.entries()) {
        // Only clean up disconnected clients
        if (client.connectionStatus === 'disconnected') {
          // Convert lastSeen to number if it's not already
          const lastSeen = typeof client.lastSeen === 'number' ? 
            client.lastSeen : new Date(client.lastSeen).getTime();
          const disconnectedTime = now - lastSeen;
          
          // If client has been disconnected for more than the timeout, remove it
          if (disconnectedTime > DISCONNECTED_TIMEOUT_MS) {
            this.clientRegistrations.delete(clientId);
            cleanedCount++;
            logger.info(`Cleaned up disconnected client: ${clientId}`);
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} disconnected clients`);
      }
    }, CLEANUP_INTERVAL_MS);
  }
} 