#!/usr/bin/env node
/**
 * RESTifyMCP Main Entry Point
 * 
 * This is the main entry point for the RESTifyMCP application.
 * It handles command-line arguments and starts the appropriate mode.
 */

import { Command } from 'commander';
import { ConsoleLogger, LogLevel } from './shared/utils.js';
import { configService } from './shared/config.js';
import { ServerConfig, ValidatedConfig } from './shared/types.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Set up logger
const logger = new ConsoleLogger('RESTifyMCP', LogLevel.INFO);

// Get current file directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load package.json for version
let version = '1.0.0';
try {
  const packageJsonPath = join(dirname(__dirname), 'package.json');
  const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  version = packageJson.version;
} catch (error) {
  logger.warn('Failed to load package.json, using default version');
}

// Create the command line program
const program = new Command();

// Set up the CLI
program
  .name('restifymcp')
  .description('A tool that makes MCP servers available as REST APIs')
  .version(version)
  .option('-c, --config <path>', 'Path to configuration file', './config.json')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress all output except errors')
  .action(async (options) => {
    try {
      // Set log level based on options
      if (options.verbose) {
        logger.setLogLevel(LogLevel.DEBUG);
        logger.debug('Verbose logging enabled');
      } else if (options.quiet) {
        logger.setLogLevel(LogLevel.ERROR);
        logger.info('Quiet mode enabled, suppressing non-error output');
      }

      // Load configuration
      const config = await configService.loadConfig(options.config);
      logger.info(`Running in ${config.mode} mode`);

      // Start the appropriate mode
      await startMode(config);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to start RESTifyMCP: ${error.message}`, error);
        process.exit(1);
      }
    }
  });

// Parse command line arguments
program.parse(process.argv);

/**
 * Active component reference for graceful shutdown
 */
let activeComponent: { stop(): Promise<void> } | null = null;

/**
 * Start the appropriate mode based on the configuration
 */
async function startMode(config: ValidatedConfig): Promise<void> {
  // Start the appropriate mode
  switch (config.mode) {
    case 'server': {
      logger.info('Starting server mode');
      const { RESTifyServer } = await import('./server/index.js');
      const server = new RESTifyServer(config as ValidatedConfig & { server: ServerConfig });
      await server.start();
      activeComponent = server; // Store reference for graceful shutdown
      break;
    }
    case 'client': {
      logger.info('Starting client mode');
      const { default: RESTifyClient } = await import('./client/index.js');
      const client = new RESTifyClient(config);
      await client.start();
      activeComponent = client; // Store reference for graceful shutdown
      break;
    }
    case 'combo': {
      logger.info('Starting combo mode');
      const { default: RESTifyCombo } = await import('./combo/index.js');
      const combo = new RESTifyCombo(config);
      await combo.start();
      activeComponent = combo; // Store reference for graceful shutdown
      break;
    }
    default:
      throw new Error(`Invalid mode: ${config.mode}`);
  }

  // Set up graceful shutdown
  setupShutdown();
}

/**
 * Set up graceful shutdown handlers
 */
function setupShutdown(): void {
  // Handle various signals
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  let isShuttingDown = false;
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      // Prevent multiple shutdown attempts
      if (isShuttingDown) {
        logger.warn(`Received another ${signal} during shutdown, forcing exit...`);
        process.exit(1);
        return;
      }
      
      isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        if (activeComponent) {
          logger.info('Stopping active component...');
          await activeComponent.stop();
          logger.info('Active component stopped successfully');
        }
      } catch (error) {
        logger.error('Error during graceful shutdown', error as Error);
      } finally {
        logger.info('Exiting process');
        // Force exit after a timeout to handle any hanging connections
        setTimeout(() => {
          logger.warn('Shutdown timeout exceeded, forcing exit');
          process.exit(1);
        }, 3000);
        
        // Try normal exit first
        process.exit(0);
      }
    });
  });

  // Handle unhandled errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason}`);
    process.exit(1);
  });
} 