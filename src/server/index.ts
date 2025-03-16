/**
 * RESTifyMCP Server Module
 * 
 * This module implements the server mode of RESTifyMCP.
 */

import { ValidatedConfig, ClientRegistration } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError } from '../shared/utils.js';
import { BearerAuthService } from './auth.js';
import { DefaultOpenApiGenerator } from './openapi-generator.js';
import { ExpressRESTApiService } from './rest-api.js';
import { WSServer } from './websocket-server.js';
import { DefaultAPISpaceManager, APISpaceManager } from './api-space-manager.js';
import { DefaultAdminService, AdminService, AdminServiceConfig } from './admin-service.js';
import { ServerConfig } from '../shared/types.js';
import { AuthService } from './auth.js';
import { OpenApiGenerator } from './openapi-generator.js';
import { RESTApiService } from './rest-api.js';

// Set up logger
const logger = new ConsoleLogger('Server', LogLevel.INFO);

/**
 * RESTifyServer class
 */
export class RESTifyServer {
  private readonly config: ValidatedConfig & { server: ServerConfig };
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  private readonly apiSpaceManager: APISpaceManager;
  private readonly authService: AuthService;
  private readonly openApiGenerator: OpenApiGenerator;
  private readonly adminService: AdminService;
  private readonly wsServer: WSServer;
  private readonly restApiService: RESTApiService;
  
  /**
   * Create a new RESTifyServer instance
   * @param config Validated configuration
   */
  constructor(config: ValidatedConfig & { server: ServerConfig }) {
    this.config = config;
    this.clientRegistrations = new Map();

    // Initialize API Space Manager
    this.apiSpaceManager = new DefaultAPISpaceManager(config.server.apiSpaces);

    // Initialize Auth Service
    this.authService = new BearerAuthService(
      this.apiSpaceManager,
      this.clientRegistrations
    );

    // Initialize OpenAPI Generator
    this.openApiGenerator = new DefaultOpenApiGenerator(
      `http://${config.server.http.host}:${config.server.http.port}`,
      'RESTifyMCP API',
      '2.0.0'
    );

    // Initialize WebSocket Server with the first API Space token for client authentication
    const clientAuthToken = config.server.apiSpaces[0].bearerToken;
    this.wsServer = new WSServer(
      clientAuthToken,
      this.clientRegistrations,
      this.authService
    );

    // Initialize Admin Service
    const adminConfig: AdminServiceConfig = {
      adminToken: config.server.admin?.adminToken ?? generateRandomToken(32)
    };
    this.adminService = new DefaultAdminService(
      adminConfig,
      this.apiSpaceManager,
      this.clientRegistrations
    );

    // Initialize REST API service
    this.restApiService = new ExpressRESTApiService(
      this.config.server.http.port,
      this.config.server.http.host,
      this.clientRegistrations,
      this.authService,
      this.openApiGenerator,
      this.wsServer,
      this.apiSpaceManager,
      this.adminService
    );

    // Subscribe to WebSocket connection events
    this.restApiService.subscribeToConnectionEvents(this.wsServer);

    logger.info('RESTifyServer created');
  }
  
  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting RESTifyServer');
      
      // Initialize server components
      if (!this.config.server) {
        throw new RESTifyMCPError('Server configuration required', 'CONFIG_ERROR');
      }
      
      // Ensure API Spaces are configured
      if (!this.config.server.apiSpaces || this.config.server.apiSpaces.length === 0) {
        throw new RESTifyMCPError('At least one API Space must be defined in server configuration', 'MISSING_API_SPACE');
      }
      
      // Start REST API server
      await this.restApiService.start();
      
      // Get the HTTP server instance from REST API service and start the WebSocket server
      if (this.restApiService && this.wsServer) {
        const httpServer = this.restApiService.getHttpServer();
        if (httpServer) {
          await this.wsServer.start(httpServer);
        } else {
          throw new RESTifyMCPError('HTTP server not available', 'SERVER_ERROR');
        }
      }
      
      logger.info('RESTifyServer started successfully');
    } catch (error) {
      logger.error('Failed to start RESTifyServer', error as Error);
      await this.cleanup();
      throw error;
    }
  }
  
  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    logger.info('Stopping RESTifyServer');
    await this.cleanup();
    logger.info('RESTifyServer stopped');
  }
  
  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Stop REST API service
    if (this.restApiService) {
      try {
        await this.restApiService.stop();
      } catch (error) {
        logger.error('Error stopping REST API service', error as Error);
      }
    }
    
    // Stop WebSocket server
    if (this.wsServer) {
      try {
        await this.wsServer.stop();
      } catch (error) {
        logger.error('Error stopping WebSocket server', error as Error);
      }
    }
  }
}

/**
 * Generate a random token of specified length
 */
function generateRandomToken(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
} 