/**
 * Configuration service for RESTifyMCP
 */
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { ValidatedConfig } from './types.js';
import { ConsoleLogger, RESTifyMCPError } from './utils.js';

// Create a logger
const logger = new ConsoleLogger('ConfigService');

// Zod schema for API Space
const apiSpaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  bearerToken: z.string().min(32),
  allowedClientTokens: z.array(z.string().min(32)).min(1)
});

// Zod schema for admin configuration
const adminConfigSchema = z.object({
  adminToken: z.string().min(32)
}).optional();

// Zod schema for logging configuration
const loggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  format: z.enum(['text', 'json']).optional()
}).optional();

// Zod schema for server configuration
const serverConfigSchema = z.object({
  http: z.object({
    port: z.number().int().min(1).max(65535).default(3000),
    host: z.string().default('localhost'),
    publicUrl: z.string().optional()
  }),
  apiSpaces: z.array(apiSpaceSchema).min(1),
  admin: adminConfigSchema,
  logging: loggingConfigSchema
});

// Zod schema for client configuration
const clientConfigSchema = z.object({
  serverUrl: z.string().url(),
  bearerToken: z.string().min(32),
  mcpCommand: z.string(),
  mcpArgs: z.array(z.string()).default([])
}).refine(
  (data) => {
    // Ensure bearerToken is defined and not empty
    return !!data.bearerToken && data.bearerToken.length >= 32;
  },
  {
    message: "Bearer token must be defined and at least 32 characters long",
    path: ['bearerToken']
  }
);

// Define a type for the config with mode
type ConfigWithMode = {
  mode: 'server' | 'client' | 'combo';
};

// Zod schema for complete configuration with refined validation
const configSchema = z.object({
  mode: z.enum(['server', 'client', 'combo']),
  server: serverConfigSchema.optional(),
  client: clientConfigSchema.optional()
}).refine(
  (data) => {
    // Ensure server config exists when mode is server or combo
    if (['server', 'combo'].includes(data.mode) && !data.server) {
      return false;
    }
    return true;
  },
  {
    message: "Server configuration is required when mode is 'server' or 'combo'",
    path: ['server']
  }
).refine(
  (data) => {
    // Ensure client config exists when mode is client or combo
    if (['client', 'combo'].includes(data.mode) && !data.client) {
      return false;
    }
    return true;
  },
  {
    message: "Client configuration is required when mode is 'client' or 'combo'",
    path: ['client']
  }
);

/**
 * ConfigService interface
 */
export interface ConfigService {
  loadConfig(path: string): Promise<ValidatedConfig>;
  validateConfig(config: unknown): ValidatedConfig;
}

/**
 * Implementation of ConfigService
 */
export class FileConfigService implements ConfigService {
  /**
   * Load and validate configuration from file
   */
  async loadConfig(path: string): Promise<ValidatedConfig> {
    try {
      logger.info(`Loading configuration from ${path}`);
      const configPath = resolve(process.cwd(), path);
      const fileContent = await readFile(configPath, 'utf-8');
      const configData = JSON.parse(fileContent);
      
      return this.validateConfig(configData);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to load configuration: ${error.message}`, error);
        throw new RESTifyMCPError(`Failed to load configuration: ${error.message}`, 'CONFIG_LOAD_ERROR');
      }
      throw error;
    }
  }

  /**
   * Normalize config for backward compatibility
   */
  private normalizeConfig(config: unknown): unknown {
    if (typeof config !== 'object' || config === null) {
      return config;
    }

    const result = { ...config } as Record<string, any>;

    // Handle old server config format
    if (result.server && typeof result.server === 'object') {
      const serverConfig = { ...result.server } as Record<string, any>;
      
      // Convert flat structure to nested
      if ('port' in serverConfig || 'host' in serverConfig) {
        serverConfig.http = {
          port: serverConfig.port,
          host: serverConfig.host
        };
        delete serverConfig.port;
        delete serverConfig.host;
      }
      
      // Convert auth.bearerTokens to apiSpaces
      if (serverConfig.auth && serverConfig.auth.bearerTokens && Array.isArray(serverConfig.auth.bearerTokens)) {
        // Create a default API Space with all tokens
        serverConfig.apiSpaces = [{
          name: 'default',
          description: 'Default API Space (auto-created from legacy config)',
          bearerToken: serverConfig.auth.bearerTokens[0],
          allowedClientTokens: [...serverConfig.auth.bearerTokens]
        }];
        delete serverConfig.auth;
      }
      
      // Convert single bearerToken to apiSpaces
      if ('bearerToken' in serverConfig) {
        serverConfig.apiSpaces = [{
          name: 'default',
          description: 'Default API Space (auto-created from legacy config)',
          bearerToken: serverConfig.bearerToken,
          allowedClientTokens: [serverConfig.bearerToken]
        }];
        delete serverConfig.bearerToken;
      }
      
      result.server = serverConfig;
    }

    return result;
  }

  /**
   * Validate configuration object using Zod
   */
  validateConfig(config: unknown): ValidatedConfig {
    try {
      logger.info('Validating configuration');
      
      // Normalize config for backward compatibility
      const normalizedConfig = this.normalizeConfig(config);
      
      const validatedConfig = configSchema.parse(normalizedConfig);
      
      logger.info('Configuration validated successfully');
      return validatedConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        logger.error(`Configuration validation failed: ${issues}`);
        throw new RESTifyMCPError(`Configuration validation failed: ${issues}`, 'CONFIG_VALIDATION_ERROR');
      }
      throw error;
    }
  }
}

// Export default instance
export const configService = new FileConfigService(); 