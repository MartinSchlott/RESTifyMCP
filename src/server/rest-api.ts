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
import { ClientRegistration, ToolRequest, ToolResponse, APISpace } from '../shared/types.js';
import { APISpaceManager } from './api-space-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AdminService } from './admin-service.js';
import cookieParser from 'cookie-parser';

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
  getHttpServer(): Server | null;
  subscribeToConnectionEvents(wsServer: any): void;
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
  private readonly apiSpaceManager: APISpaceManager;
  private readonly adminService: AdminService;
  private server: any | null = null;

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
    toolInvoker: ToolInvoker,
    apiSpaceManager: APISpaceManager,
    adminService: AdminService
  ) {
    this.app = express();
    this.port = port;
    this.host = host;
    this.clientRegistrations = clientRegistrations;
    this.authService = authService;
    this.openApiGenerator = openApiGenerator;
    this.toolInvoker = toolInvoker;
    this.apiSpaceManager = apiSpaceManager;
    this.adminService = adminService;
    
    // Set up ConsoleLogger to forward logs to SSE
    ConsoleLogger.setLogHandler((level, component, message) => {
      ExpressRESTApiService.addLogEntry(
        level.toString(), 
        `[${component}] ${message}`
      );
    });
    
    logger.info('ExpressRESTApiService created');
  }

  /**
   * Set up Express routes
   */
  setupRoutes(): void {
    logger.info('Setting up Express routes');

    // Body parser for JSON and cookies
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());

    // Admin routes
    this.setupAdminRoutes();

    // OpenAPI specification in JSON format for specific API Space
    this.app.get('/openapi/:tokenHash/json', (req: Request, res: Response) => {
      const tokenHash = req.params.tokenHash;
      const apiSpace = this.adminService.getAPISpaceByTokenHash(tokenHash);
      if (!apiSpace) {
        res.status(404).json({
          error: 'API Space not found',
          code: 'API_SPACE_NOT_FOUND'
        });
        return;
      }
      res.json(this.getOpenApiSpecForSpace(apiSpace));
    });

    // OpenAPI specification in YAML format for specific API Space
    this.app.get('/openapi/:tokenHash/yaml', (req: Request, res: Response) => {
      const tokenHash = req.params.tokenHash;
      const apiSpace = this.adminService.getAPISpaceByTokenHash(tokenHash);
      if (!apiSpace) {
        res.status(404).json({
          error: 'API Space not found',
          code: 'API_SPACE_NOT_FOUND'
        });
        return;
      }
      res.type('text/yaml').send(yamlDump(this.getOpenApiSpecForSpace(apiSpace)));
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

    // Tool invocation endpoint with API Space support
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
   * Set up admin routes
   */
  private setupAdminRoutes(): void {
    // Login page
    this.app.get('/login', (req: Request, res: Response) => {
      if (this.adminService.validateSession(req)) {
        res.redirect('/admin');
        return;
      }

      try {
        const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static', 'login.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        res.send(html);
      } catch (error) {
        logger.error(`Error reading login template: ${(error as Error).message}`);
        res.status(500).send('Error loading login page');
      }
    });

    // Login handler
    this.app.post('/login', (req: Request, res: Response) => {
      const { adminToken } = req.body;
      
      if (this.adminService.validateAdminToken(adminToken)) {
        this.adminService.createSession(res);
        res.redirect('/admin');
      } else {
        try {
          const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static', 'login.html');
          let html = fs.readFileSync(templatePath, 'utf8');
          
          // Add script to show error message
          const errorScript = `
            <script>
              document.addEventListener('DOMContentLoaded', function() {
                const errorElement = document.getElementById('error-message');
                if (errorElement) {
                  errorElement.textContent = 'Invalid admin token';
                  errorElement.style.display = 'block';
                }
              });
            </script>
          `;
          
          // Insert the script before the closing body tag
          html = html.replace('</body>', `${errorScript}</body>`);
          res.send(html);
        } catch (error) {
          logger.error(`Error reading login template: ${(error as Error).message}`);
          res.status(500).send('Error loading login page');
        }
      }
    });

    // Logout handler
    this.app.get('/logout', (req: Request, res: Response) => {
      res.clearCookie('adminSession');
      res.redirect('/login');
    });

    // Admin dashboard
    this.app.get('/admin', 
      (req: Request, res: Response, next: NextFunction) => this.adminService.requireAuth(req, res, next),
      async (req: Request, res: Response) => {
        try {
          const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static', 'admin-dashboard.html');
          let html = fs.readFileSync(templatePath, 'utf8');
          
          // Get dashboard data
          const data = await this.adminService.generateDashboardData();
          
          // Replace simple placeholders
          html = html
            .replace('{{apiSpacesCount}}', data.apiSpacesCount.toString())
            .replace('{{connectedClientsCount}}', data.connectedClientsCount.toString())
            .replace('{{totalToolsCount}}', data.totalToolsCount.toString())
            .replace('{{uptime}}', data.uptime);
          
          // Handle the API Spaces section with Handlebars-style templates
          // First, extract the template between {{#apiSpaces}} and {{/apiSpaces}}
          const apiSpacesRegex = /{{#apiSpaces}}([\s\S]*?){{\/apiSpaces}}/;
          const apiSpacesMatch = html.match(apiSpacesRegex);
          
          if (apiSpacesMatch) {
            const apiSpaceTemplate = apiSpacesMatch[1];
            let apiSpacesHtml = '';
            
            // For each API space, apply the template
            for (const space of data.apiSpaces) {
              let spaceHtml = apiSpaceTemplate
                .replace(/{{name}}/g, space.name || '')
                .replace(/{{description}}/g, space.description || '')
                .replace(/{{clientCount}}/g, space.clientCount.toString())
                .replace(/{{toolCount}}/g, space.toolCount.toString())
                .replace(/{{tokenHash}}/g, space.tokenHash);
              
              // Handle the clients section
              const clientsRegex = /{{#clients}}([\s\S]*?){{\/clients}}/;
              const clientsMatch = spaceHtml.match(clientsRegex);
              
              if (clientsMatch) {
                const clientTemplate = clientsMatch[1];
                let clientsHtml = '';
                
                // For each client, apply the template
                for (const client of space.clients) {
                  let clientHtml = clientTemplate
                    .replace(/{{id}}/g, client.id)
                    .replace(/{{connectionStatus}}/g, client.connectionStatus)
                    .replace(/{{toolCount}}/g, client.toolCount.toString());
                  
                  clientsHtml += clientHtml;
                }
                
                // Replace the clients section
                spaceHtml = spaceHtml.replace(clientsRegex, clientsHtml);
              }
              
              apiSpacesHtml += spaceHtml;
            }
            
            // Replace the API spaces section
            html = html.replace(apiSpacesRegex, apiSpacesHtml);
          }
          
          res.send(html);
        } catch (error) {
          logger.error(`Error generating admin dashboard: ${(error as Error).message}`);
          res.status(500).send('Error loading admin dashboard');
        }
      }
    );

    // Admin API endpoints
    this.app.get('/api/admin/stats',
      (req: Request, res: Response, next: NextFunction) => this.adminService.requireAuth(req, res, next),
      async (req: Request, res: Response) => {
        try {
          const data = await this.adminService.generateDashboardData();
          
          // Generate API Spaces HTML
          let apiSpacesHtml = '';
          
          // Read the template file to extract the API Space template
          const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static', 'admin-dashboard.html');
          const html = fs.readFileSync(templatePath, 'utf8');
          
          // Extract the template between {{#apiSpaces}} and {{/apiSpaces}}
          const apiSpacesRegex = /{{#apiSpaces}}([\s\S]*?){{\/apiSpaces}}/;
          const apiSpacesMatch = html.match(apiSpacesRegex);
          
          if (apiSpacesMatch) {
            const apiSpaceTemplate = apiSpacesMatch[1];
            
            // For each API space, apply the template
            for (const space of data.apiSpaces) {
              let spaceHtml = apiSpaceTemplate
                .replace(/{{name}}/g, space.name || '')
                .replace(/{{description}}/g, space.description || '')
                .replace(/{{clientCount}}/g, space.clientCount.toString())
                .replace(/{{toolCount}}/g, space.toolCount.toString())
                .replace(/{{tokenHash}}/g, space.tokenHash);
              
              // Handle the clients section
              const clientsRegex = /{{#clients}}([\s\S]*?){{\/clients}}/;
              const clientsMatch = spaceHtml.match(clientsRegex);
              
              if (clientsMatch) {
                const clientTemplate = clientsMatch[1];
                let clientsHtml = '';
                
                // For each client, apply the template
                for (const client of space.clients) {
                  let clientHtml = clientTemplate
                    .replace(/{{id}}/g, client.id)
                    .replace(/{{connectionStatus}}/g, client.connectionStatus)
                    .replace(/{{toolCount}}/g, client.toolCount.toString());
                  
                  clientsHtml += clientHtml;
                }
                
                // Replace the clients section
                spaceHtml = spaceHtml.replace(clientsRegex, clientsHtml);
              }
              
              apiSpacesHtml += spaceHtml;
            }
          }
          
          // Add the HTML to the response
          res.json({
            ...data,
            apiSpacesHtml
          });
        } catch (error) {
          logger.error(`Error generating admin stats: ${(error as Error).message}`);
          res.status(500).json({ error: 'Failed to generate stats' });
        }
    });
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
      
      // Get API Space from bearer token
      const apiSpace = this.authService.getRequestAPISpace(req);
      if (!apiSpace) {
        res.status(401).json({
          error: 'Unauthorized - Invalid API Space token',
          code: 'INVALID_API_SPACE_TOKEN'
        });
        return;
      }
      
      // Find the client that has this tool and is allowed in this API Space
      const clientId = await this.findClientForTool(toolName, bearerToken, apiSpace);
      if (!clientId) {
        logger.warn(`No client found for tool ${toolName} in API Space ${apiSpace.name}`);
        res.status(404).json({
          error: `Tool ${toolName} not found in API Space ${apiSpace.name}`,
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
   * Get the OpenAPI specification for a specific API Space
   */
  private getOpenApiSpecForSpace(apiSpace: APISpace): Record<string, any> {
    // Filter client registrations to only include clients allowed in this API Space
    const filteredRegistrations = new Map<string, ClientRegistration>();
    
    logger.debug(`Filtering clients for API Space ${apiSpace.name}`);
    logger.debug(`Total clients: ${this.clientRegistrations.size}`);
    logger.debug(`Client IDs: ${Array.from(this.clientRegistrations.keys()).join(', ')}`);
    
    for (const [clientId, registration] of this.clientRegistrations.entries()) {
      logger.debug(`Checking if client ${clientId} with token ${registration.bearerToken} is allowed in space ${apiSpace.name}`);
      logger.debug(`Space ${apiSpace.name} allowed tokens: ${JSON.stringify(apiSpace.allowedClientTokens)}`);
      
      const isAllowed = this.apiSpaceManager.isClientAllowedInSpace(clientId, apiSpace.name);
      logger.debug(`Client ${clientId} is ${isAllowed ? 'allowed' : 'not allowed'} in space ${apiSpace.name}`);
      
      if (isAllowed) {
        filteredRegistrations.set(clientId, registration);
      }
    }
    
    logger.debug(`Filtered clients: ${filteredRegistrations.size}`);
    
    return this.openApiGenerator.generateSpec(filteredRegistrations, apiSpace);
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
   * Stop the REST API service
   */
  async stop(): Promise<void> {
    logger.info('Stopping REST API service');
    
    // Close SSE connections
    this.closeSseConnections();
    
    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        // Set a timeout to force close if it takes too long
        const timeout = setTimeout(() => {
          logger.warn('HTTP server close timeout, forcing close');
          resolve();
        }, 2000);
        
        this.server.close((err?: Error) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error closing HTTP server: ${err.message}`, err);
            reject(err);
          } else {
            logger.info('HTTP server closed');
            resolve();
          }
        });
      });
      
      this.server = null;
    }
    
    logger.info('REST API service stopped');
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
   * Find a client that provides a specific tool in an API Space
   */
  private async findClientForTool(
    toolName: string,
    bearerToken: string,
    apiSpace: APISpace
  ): Promise<string | null> {
    // Find all clients that have this tool and are allowed in the API Space
    const matchingClients: string[] = [];
    
    for (const [clientId, client] of this.clientRegistrations.entries()) {
      // Skip disconnected clients
      if (client.connectionStatus !== 'connected') {
        continue;
      }
      
      // Skip clients not allowed in this API Space
      if (!this.apiSpaceManager.isClientAllowedInSpace(clientId, apiSpace.name)) {
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
   * Subscribe to WebSocket connection events
   */
  subscribeToConnectionEvents(wsServer: any): void {
    wsServer.onClientConnect((clientId: string) => {
      logger.info(`Client ${clientId} connected`);
      // Update client registration status
      const client = this.clientRegistrations.get(clientId);
      if (client) {
        client.connectionStatus = 'connected';
        client.lastSeen = new Date();
      }
    });

    wsServer.onClientDisconnect((clientId: string) => {
      logger.info(`Client ${clientId} disconnected`);
      // Update client registration status
      const client = this.clientRegistrations.get(clientId);
      if (client) {
        client.connectionStatus = 'disconnected';
        client.lastSeen = new Date();
      }
    });
  }
} 