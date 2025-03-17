/**
 * RESTifyMCP Combo Module
 * 
 * This module implements the combo mode of RESTifyMCP,
 * which combines both server and client in a single process.
 */

import { ServerConfig, ValidatedConfig } from '../shared/types.js';
import { ConsoleLogger, LogLevel, RESTifyMCPError } from '../shared/utils.js';
import { RESTifyServer } from '../server/index.js';
import RESTifyClient from '../client/index.js';

// Set up logger
const logger = new ConsoleLogger('Combo', LogLevel.INFO);

/**
 * RESTifyCombo class
 */
export default class RESTifyCombo {
  private readonly config: ValidatedConfig;
  private readonly server: RESTifyServer;
  private readonly client: RESTifyClient;
  private readonly allowExternalClients: boolean;
  
  /**
   * Create a new RESTifyCombo instance
   * @param config Validated configuration
   */
  constructor(config: ValidatedConfig) {
    // Validate config
    if (!config.server || !config.client) {
      throw new RESTifyMCPError(
        'Combo mode requires both server and client configuration',
        'CONFIG_ERROR'
      );
    }
    
    this.config = config;
    
    // Check if external clients are allowed (default to true)
    this.allowExternalClients = config.mode === 'combo' && 
      'allowExternalClients' in config ? 
      (config.allowExternalClients as boolean) : true;
    
    logger.info(`External clients ${this.allowExternalClients ? 'allowed' : 'not allowed'}`);
    
    // Create server and client instances
    this.server = new RESTifyServer(config as ValidatedConfig & { server: ServerConfig });
    this.client = new RESTifyClient(config);
    
    logger.info('RESTifyCombo created');
  }
  
  /**
   * Start the combo
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting RESTifyCombo');
      
      // Start server first
      logger.info('Starting server component...');
      await this.server.start();
      
      // Wait a moment to ensure server is fully initialized
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then start client and connect to the server
      logger.info('Starting client component...');
      await this.client.start();
      
      logger.info('RESTifyCombo started successfully');
    } catch (error) {
      logger.error('Failed to start RESTifyCombo', error as Error);
      await this.stop();
      throw error;
    }
  }
  
  /**
   * Stop the combo
   */
  async stop(): Promise<void> {
    logger.info('Stopping RESTifyCombo');
    
    // Stop client first
    try {
      logger.info('Stopping client component...');
      await this.client.stop();
    } catch (error) {
      logger.error('Error stopping client component', error as Error);
    }
    
    // Then stop server
    try {
      logger.info('Stopping server component...');
      await this.server.stop();
    } catch (error) {
      logger.error('Error stopping server component', error as Error);
    }
    
    logger.info('RESTifyCombo stopped');
  }
} 