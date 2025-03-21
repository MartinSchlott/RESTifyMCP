/**
 * OpenAPI Generator for RESTifyMCP
 * 
 * This module is responsible for generating OpenAPI specifications
 * based on the available MCP tools from connected clients.
 */
import { APISpace, ClientRegistration, MCPToolDefinition } from '../shared/types.js';
import { ConsoleLogger, LogLevel } from '../shared/utils.js';

// Set up logger
const logger = new ConsoleLogger('OpenAPIGenerator', LogLevel.INFO);

// Type definitions for OpenAPI types
type OpenAPIObject = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
    [key: string]: any;
  };
  security?: Array<Record<string, string[]>>;
  [key: string]: any;
};

type ParameterObject = {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: any;
  [key: string]: any;
};

type SchemaObject = {
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
  description?: string;
  [key: string]: any;
};

/**
 * OpenAPI Generator interface
 */
export interface OpenApiGenerator {
  /**
   * Generate OpenAPI specification
   * @param clientRegistrations Map or array of client registrations
   * @param apiSpace Optional API Space to filter clients
   * @returns OpenAPI specification object
   */
  generateSpec(
    clientRegistrations: Map<string, ClientRegistration> | ClientRegistration[],
    apiSpace?: APISpace
  ): OpenAPIObject;
  
  /**
   * Generate path for a tool
   * @param clientId Client ID
   * @param tool Tool definition
   * @returns Path object
   */
  generatePathForTool(clientId: string, tool: MCPToolDefinition): Record<string, any>;
}

/**
 * Default implementation of OpenAPI Generator
 */
export class DefaultOpenApiGenerator implements OpenApiGenerator {
  private readonly publicUrl: string;
  private readonly apiTitle: string;
  private readonly apiVersion: string;
  
  /**
   * Create a new OpenAPI generator
   * @param publicUrl Public URL for the API
   * @param apiTitle API title
   * @param apiVersion API version
   */
  constructor(
    publicUrl = 'http://localhost:3000',
    apiTitle = 'RESTifyMCP API',
    apiVersion = '1.0.0'
  ) {
    this.publicUrl = publicUrl;
    this.apiTitle = apiTitle;
    this.apiVersion = apiVersion;
    
    logger.info('OpenAPIGenerator initialized');
    logger.debug(`Using OpenAPI 3.1.0 format with publicUrl: ${publicUrl}`);
    logger.debug('Formatting improvements: required fields as arrays, default arrays as [], descriptions truncated at 300 chars');
  }
  
  /**
   * Generate OpenAPI specification
   * @param clientRegistrations Map or array of client registrations
   * @param apiSpace Optional API Space to filter clients
   * @returns OpenAPI specification object
   */
  generateSpec(
    clientRegistrations: Map<string, ClientRegistration> | ClientRegistration[],
    apiSpace?: APISpace
  ): OpenAPIObject {
    // Convert map to array if needed
    const clientsArray = Array.isArray(clientRegistrations)
      ? clientRegistrations
      : Array.from(clientRegistrations.values());
    
    logger.debug(`Generating OpenAPI spec for ${clientsArray.length} clients${apiSpace ? ` in API Space '${apiSpace.name}'` : ''}`);
    logger.debug(`Using publicUrl: ${this.publicUrl}`);
    
    if (clientsArray.length > 0) {
      logger.debug(`Client IDs: ${clientsArray.map(c => c.clientId).join(', ')}`);
      logger.debug(`Client tokens: ${clientsArray.map(c => c.bearerToken).join(', ')}`);
    }
    
    // Filter clients by connection status and API Space
    const filteredClients = this.filterClientsForApiSpace(clientsArray, apiSpace);
    
    logger.info(`Generating OpenAPI spec for ${filteredClients.length} clients${apiSpace ? ` in API Space '${apiSpace.name}'` : ''}`);
    
    // Create base OpenAPI object
    const spec: OpenAPIObject = {
      openapi: '3.1.0',
      info: {
        title: apiSpace ? `${this.apiTitle} - ${apiSpace.name}` : this.apiTitle,
        version: this.apiVersion,
        description: this.generateDescription(apiSpace)
      },
      servers: [
        {
          url: this.publicUrl,
          description: 'RESTifyMCP Server'
        }
      ],
      paths: this.generatePaths(filteredClients),
      components: {
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: {
                type: 'string'
              },
              code: {
                type: 'string'
              }
            },
            required: ['error', 'code']
          }
        },
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'API authentication token'
          }
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ]
    };
    
    return spec;
  }
  
  /**
   * Generate API description
   * @param apiSpace Optional API Space
   * @returns Description string
   */
  private generateDescription(apiSpace?: APISpace): string {
    let description = 'RESTifyMCP provides access to tools registered by connected clients.';
    
    if (apiSpace) {
      // Add API Space description if available
      if (apiSpace.description) {
        description = this.truncateDescription(apiSpace.description) + '\n\n' + description;
      }
      
      // Add API Space info
      description += `\n\nThis API Space '${apiSpace.name}' provides access to tools from ${apiSpace.allowedClientTokens.length} allowed clients.`;
    }
    
    return description;
  }
  
  /**
   * Filter clients for API Space
   * @param clients Array of client registrations
   * @param apiSpace Optional API Space
   * @returns Filtered array of client registrations
   */
  private filterClientsForApiSpace(
    clients: ClientRegistration[],
    apiSpace?: APISpace
  ): ClientRegistration[] {
    logger.debug(`Filtering ${clients.length} clients for API Space ${apiSpace?.name || 'all'}`);
    
    // First filter by connection status - ONLY include connected clients
    let filteredClients = clients.filter(client => client.connectionStatus === 'connected');
    logger.debug(`After connection status filter: ${filteredClients.length} clients`);
    
    // Then filter by API Space if provided
    if (apiSpace) {
      logger.debug(`Filtering by API Space: ${apiSpace.name}`);
      logger.debug(`API Space allowed tokens: ${JSON.stringify(apiSpace.allowedClientTokens)}`);
      
      filteredClients = filteredClients.filter(client => {
        const isAllowed = apiSpace.allowedClientTokens.includes(client.bearerToken);
        logger.debug(`Client ${client.clientId} with token ${client.bearerToken} is ${isAllowed ? 'allowed' : 'not allowed'} in space ${apiSpace.name}`);
        return isAllowed;
      });
      
      logger.debug(`After API Space filter: ${filteredClients.length} clients`);
    }
    
    return filteredClients;
  }
  
  /**
   * Generate paths for all tools
   * @param clients Array of client registrations
   * @returns Paths object
   */
  private generatePaths(clients: ClientRegistration[]): Record<string, any> {
    logger.debug(`Generating paths for ${clients.length} clients`);
    
    const paths: Record<string, any> = {};
    
    // For each client
    for (const client of clients) {
      logger.debug(`Processing client ${client.clientId} with ${client.tools.length} tools`);
      
      // For each tool in the client
      for (const tool of client.tools) {
        logger.debug(`Adding path for tool ${tool.name}`);
        
        // Generate path for this tool
        paths[`/api/tools/${tool.name}`] = this.generatePathForTool(client.clientId, tool);
      }
    }
    
    logger.debug(`Generated ${Object.keys(paths).length} paths`);
    
    return paths;
  }
  
  /**
   * Generate path for a tool
   * @param clientId Client ID
   * @param tool Tool definition
   * @returns Path object
   */
  generatePathForTool(clientId: string, tool: MCPToolDefinition): Record<string, any> {
    // Create path object
    const path: Record<string, any> = {
      post: {
        description: this.truncateDescription(tool.description),
        operationId: tool.name,
        'x-openai-isConsequential': false,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: this.generateRequestBody(tool.parameters)
            }
          }
        },
        responses: {
          '200': {
            description: 'Successful operation',
            content: {
              'application/json': {
                schema: this.generateResponses(tool.returns)
              }
            }
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          },
          '404': {
            description: 'Tool not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          }
        }
      }
    };
    
    return path;
  }
  
  /**
   * Generate request body schema
   * @param parameters Tool parameters
   * @returns Schema object
   */
  private generateRequestBody(parameters: Record<string, unknown>): SchemaObject | null {
    if (!parameters || Object.keys(parameters).length === 0) {
      return null;
    }
    
    // Convert the MCP parameters to OpenAPI schema
    // For now, just reuse as is with some sanitization
    const sanitized = this.sanitizeSchema(parameters);
    
    // Ensure required field is an array if it exists
    const required = this.ensureRequiredIsArray(sanitized.required);
    
    return {
      type: 'object',
      properties: sanitized.properties || {},
      required: required
    };
  }
  
  /**
   * Generate response schema
   * @param returns Tool return type
   * @returns Schema object
   */
  private generateResponses(returns: unknown): SchemaObject {
    if (!returns) {
      return {
        type: 'object',
        properties: {
          result: {
            type: 'object',
            description: this.truncateDescription('Generic result object')
          }
        }
      };
    }
    
    // Sanitize the schema
    const sanitized = this.sanitizeSchema(returns);
    
    // Ensure required field is an array if it exists
    if (sanitized.required) {
      sanitized.required = this.ensureRequiredIsArray(sanitized.required);
    }
    
    return {
      type: 'object',
      properties: {
        result: sanitized
      },
      required: ['result']
    };
  }
  
  /**
   * Sanitize schema for OpenAPI
   * @param schema Schema object
   * @returns Sanitized schema
   */
  private sanitizeSchema(schema: unknown): Record<string, any> {
    if (typeof schema !== 'object' || schema === null) {
      return { type: 'object' };
    }
    
    // Remove any keys that start with '$' (like $schema, $ref, etc.)
    // to avoid conflicts with OpenAPI's special keywords
    const result: Record<string, any> = {};
    
    // First pass: Process all properties except defaults
    for (const [key, value] of Object.entries(schema as Record<string, any>)) {
      if (!key.startsWith('$') && key !== 'default') {
        if (key === 'required') {
          // Standardize required fields as arrays
          result[key] = this.ensureRequiredIsArray(value);
        } else if (key === 'enum') {
          // Handle enum values - ensure they are arrays
          result[key] = this.ensureEnumIsArray(value);
        } else if (key === 'description' && typeof value === 'string') {
          // Truncate descriptions that are too long
          result[key] = this.truncateDescription(value);
        } else if (key === 'items' && typeof value === 'object' && value !== null) {
          // Special handling for items property in array types
          result[key] = this.sanitizeSchema(value);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.sanitizeSchema(value);
        } else {
          result[key] = value;
        }
      }
    }
    
    // Second pass: Process default values now that we know the type
    if ('default' in (schema as Record<string, any>)) {
      const defaultValue = (schema as Record<string, any>).default;
      result.default = this.ensureDefaultValueMatchesType(defaultValue, result.type);
    }
    
    return result;
  }
  
  /**
   * Ensure enum is an array
   * @param enumValue Enum value
   * @returns Array of enum values
   */
  private ensureEnumIsArray(enumValue: unknown): unknown[] {
    if (Array.isArray(enumValue)) {
      return enumValue;
    }
    
    if (typeof enumValue === 'object' && enumValue !== null) {
      // Convert object enum to array of values
      return Object.values(enumValue);
    }
    
    if (enumValue === null || enumValue === undefined) {
      return [];
    }
    
    // Single value becomes a one-element array
    return [enumValue];
  }
    
  /**
   * Ensure required is an array
   * @param required Required value
   * @returns Array of required fields
   */
  private ensureRequiredIsArray(required: unknown): string[] {
    if (Array.isArray(required)) {
      return required.filter(item => typeof item === 'string') as string[];
    }
    
    if (typeof required === 'string') {
      return [required];
    }
    
    if (typeof required === 'object' && required !== null) {
      return Object.keys(required);
    }
    
    return [];
  }
  
  /**
   * Ensure default value matches type
   * @param defaultValue Default value
   * @param type Type
   * @returns Corrected default value
   */
  private ensureDefaultValueMatchesType(defaultValue: unknown, type: string): unknown {
    switch (type) {
      case 'string':
        return String(defaultValue);
      case 'number':
      case 'integer':
        return Number(defaultValue);
      case 'boolean':
        return Boolean(defaultValue);
      case 'array':
        return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
      case 'object':
        return typeof defaultValue === 'object' ? defaultValue : {};
      default:
        return defaultValue;
    }
  }
  
  /**
   * Truncate description to 300 characters
   * @param description Description
   * @returns Truncated description
   */
  private truncateDescription(description: string): string {
    if (!description) {
      return '';
    }
    
    const maxLength = 300;
    
    if (description.length <= maxLength) {
      return description;
    }
    
    return description.substring(0, maxLength - 3) + '...';
  }
} 