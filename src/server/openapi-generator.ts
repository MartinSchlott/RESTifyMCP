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
  private readonly baseUrl: string;
  private readonly apiTitle: string;
  private readonly apiVersion: string;
  
  /**
   * Create a new OpenAPI generator
   * @param baseUrl Base URL for the API
   * @param apiTitle API title
   * @param apiVersion API version
   */
  constructor(
    baseUrl = 'http://localhost:3000',
    apiTitle = 'RESTifyMCP API',
    apiVersion = '1.0.0'
  ) {
    this.baseUrl = baseUrl;
    this.apiTitle = apiTitle;
    this.apiVersion = apiVersion;
    
    logger.info('OpenAPI generator created');
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
    
    // Filter clients by connection status and API Space
    const filteredClients = this.filterClientsForApiSpace(clientsArray, apiSpace);
    
    logger.info(`Generating OpenAPI spec for ${filteredClients.length} clients${apiSpace ? ` in API Space '${apiSpace.name}'` : ''}`);
    
    // Create base OpenAPI object
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: apiSpace ? `${this.apiTitle} - ${apiSpace.name}` : this.apiTitle,
        version: this.apiVersion,
        description: this.generateDescription(apiSpace)
      },
      servers: [
        {
          url: this.baseUrl,
          description: 'RESTifyMCP Server'
        }
      ],
      paths: this.generatePaths(filteredClients),
      components: {
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
    // First filter by connection status - ONLY include connected clients
    let filteredClients = clients.filter(client => client.connectionStatus === 'connected');
    
    // Then filter by API Space if provided
    if (apiSpace) {
      filteredClients = filteredClients.filter(client => 
        apiSpace.allowedClientTokens.includes(client.bearerToken)
      );
    }
    
    return filteredClients;
  }
  
  /**
   * Generate paths for all tools
   * @param clients Array of client registrations
   * @returns Paths object
   */
  private generatePaths(clients: ClientRegistration[]): Record<string, any> {
    const paths: Record<string, any> = {};
    
    // For each client
    for (const client of clients) {
      // For each tool in the client
      for (const tool of client.tools) {
        // Generate path for this tool
        paths[`/api/tools/${tool.name}`] = this.generatePathForTool(client.clientId, tool);
      }
    }
    
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
        summary: this.truncateDescription(tool.name),
        description: this.truncateDescription(tool.description),
        operationId: `invoke${this.capitalizeFirstLetter(tool.name)}`,
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
                schema: {
                  type: 'object',
                  properties: {
                    result: this.generateResponses(tool.returns)
                  }
                }
              }
            }
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string'
                    },
                    code: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Tool not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string'
                    },
                    code: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string'
                    },
                    code: {
                      type: 'string'
                    }
                  }
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
      return {
        type: 'object',
        properties: {
          args: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        }
      };
    }
    
    return {
      type: 'object',
      properties: {
        args: this.sanitizeSchema(parameters)
      },
      required: ['args']
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
        description: 'Tool result'
      };
    }
    
    return this.sanitizeSchema(returns);
  }
  
  /**
   * Sanitize schema for OpenAPI
   * @param schema Schema object
   * @returns Sanitized schema
   */
  private sanitizeSchema(schema: unknown): Record<string, any> {
    if (schema === null || schema === undefined) {
      return { type: 'object' };
    }
    
    if (typeof schema !== 'object') {
      return { type: typeof schema };
    }
    
    const result: Record<string, any> = {};
    
    // Handle array type
    if (Array.isArray(schema)) {
      result.type = 'array';
      
      if (schema.length > 0) {
        result.items = this.sanitizeSchema(schema[0]);
      } else {
        result.items = { type: 'object' };
      }
      
      return result;
    }
    
    // Handle object type
    const schemaObj = schema as Record<string, any>;
    
    // Check if it's a type definition
    if ('type' in schemaObj) {
      result.type = schemaObj.type;
      
      if (schemaObj.description) {
        result.description = this.truncateDescription(schemaObj.description);
      }
      
      // Handle properties
      if (schemaObj.properties && typeof schemaObj.properties === 'object') {
        result.properties = {};
        
        for (const [key, value] of Object.entries(schemaObj.properties)) {
          result.properties[key] = this.sanitizeSchema(value);
        }
      }
      
      // Handle required fields
      if (schemaObj.required) {
        result.required = this.ensureRequiredIsArray(schemaObj.required);
      }
      
      // Handle enum
      if (schemaObj.enum && Array.isArray(schemaObj.enum)) {
        result.enum = schemaObj.enum;
      }
      
      // Handle default value
      if ('default' in schemaObj) {
        result.default = this.ensureDefaultValueMatchesType(
          schemaObj.default,
          result.type
        );
      }
      
      return result;
    }
    
    // Handle plain object
    result.type = 'object';
    result.properties = {};
    
    for (const [key, value] of Object.entries(schemaObj)) {
      result.properties[key] = this.sanitizeSchema(value);
    }
    
    return result;
  }
  
  /**
   * Check if a property is a simple type
   * @param property Property object
   * @returns True if simple type
   */
  private isSimpleType(property: Record<string, any>): boolean {
    const simpleTypes = ['string', 'number', 'integer', 'boolean'];
    return property.type && simpleTypes.includes(property.type);
  }
  
  /**
   * Capitalize first letter of a string
   * @param str String to capitalize
   * @returns Capitalized string
   */
  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
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