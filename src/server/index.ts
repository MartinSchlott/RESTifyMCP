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

// Set up logger
const logger = new ConsoleLogger('Server', LogLevel.INFO);

/**
 * RESTifyServer class
 */
export default class RESTifyServer {
  private readonly config: ValidatedConfig;
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  private authService: BearerAuthService | null = null;
  private openApiGenerator: DefaultOpenApiGenerator | null = null;
  private wsServer: WSServer | null = null;
  private restApiService: ExpressRESTApiService | null = null;
  
  /**
   * Create a new RESTifyServer instance
   * @param config Validated configuration
   */
  constructor(config: ValidatedConfig) {
    this.config = config;
    this.clientRegistrations = new Map<string, ClientRegistration>();
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
      
      // Ensure bearer tokens are configured
      if (!this.config.server.auth.bearerTokens || this.config.server.auth.bearerTokens.length === 0) {
        throw new RESTifyMCPError('At least one bearer token must be defined in server configuration', 'MISSING_TOKEN');
      }
      
      // Create WebSocket server with the token but without port/host
      this.wsServer = new WSServer(
        this.config.server.auth.bearerTokens[0], // Use the first token for now
        this.clientRegistrations // Pass the shared client registrations map
      );
      
      // Initialize authentication service
      this.authService = new BearerAuthService(
        this.config.server.auth.bearerTokens,
        this.clientRegistrations
      );
      
      // Initialize OpenAPI generator
      const baseUrl = this.config.server.http.publicUrl || 
        `http://${this.config.server.http.host}:${this.config.server.http.port}`;
      this.openApiGenerator = new DefaultOpenApiGenerator(baseUrl);
      
      // Initialize REST API service
      this.restApiService = new ExpressRESTApiService(
        this.config.server.http.port,
        this.config.server.http.host,
        this.clientRegistrations,
        this.authService,
        this.openApiGenerator,
        this.wsServer
      );
      
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