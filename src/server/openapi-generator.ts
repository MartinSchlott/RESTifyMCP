/**
 * OpenAPI Generator for RESTifyMCP
 * 
 * This module is responsible for generating OpenAPI specifications
 * based on the available MCP tools from connected clients.
 */
import { ClientRegistration, MCPToolDefinition } from '../shared/types.js';
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
  generateSpec(clients: Map<string, ClientRegistration>): OpenAPIObject;
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
   * Create a new OpenAPI Generator
   * @param baseUrl Base URL for the API
   * @param apiTitle Title of the API
   * @param apiVersion Version of the API
   */
  constructor(
    baseUrl = 'http://localhost:3000',
    apiTitle = 'RESTifyMCP API',
    apiVersion = '1.0.0'
  ) {
    this.baseUrl = baseUrl;
    this.apiTitle = apiTitle;
    this.apiVersion = apiVersion;
    logger.info('OpenAPIGenerator initialized');
    logger.debug('Using OpenAPI 3.1.0 format with formatting improvements: required fields as arrays, default arrays as [], descriptions truncated at 300 chars');
  }

  /**
   * Generate an OpenAPI specification for the available tools
   * @param clients Map of client registrations
   * @returns OpenAPI specification
   */
  generateSpec(clients: Map<string, ClientRegistration>): OpenAPIObject {
    logger.info('Generating OpenAPI specification');
    
    // Debug: Log the size of the clients map
    logger.info(`Number of clients: ${clients.size}`);
    
    // Create basic OpenAPI structure
    const spec: OpenAPIObject = {
      openapi: '3.1.0',
      info: {
        title: this.apiTitle,
        version: this.apiVersion,
        description: this.truncateDescription('RESTified Model Context Protocol API')
      },
      servers: [
        {
          url: this.baseUrl,
          description: this.truncateDescription('RESTifyMCP Server')
        }
      ],
      paths: {},
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'string'
          }
        },
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
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ]
    };

    // Add tools from all clients
    for (const [clientId, client] of clients.entries()) {
      // Debug: Log client info
      logger.info(`Client ${clientId} status: ${client.connectionStatus}, tools: ${client.tools.length}`);
      
      if (client.connectionStatus === 'connected') {
        logger.info(`Processing connected client ${clientId} with ${client.tools.length} tools`);
        
        for (const tool of client.tools) {
          logger.info(`Adding tool ${tool.name} to OpenAPI spec`);
          const path = `/api/tools/${tool.name}`;
          spec.paths[path] = this.generatePathForTool(clientId, tool);
        }
      }
    }

    // Debug: Log number of paths added
    logger.info(`Generated OpenAPI spec with ${Object.keys(spec.paths).length} paths`);
    
    return spec;
  }

  /**
   * Generate an OpenAPI path for a specific tool
   * @param clientId ID of the client that provides the tool
   * @param tool MCP Tool Definition
   * @returns OpenAPI path object
   */
  generatePathForTool(clientId: string, tool: MCPToolDefinition): Record<string, any> {
    logger.debug(`Generating path for tool ${tool.name} from client ${clientId}`);
    
    // Generate request body schema
    const requestBody = this.generateRequestBody(tool.parameters);
    
    // Generate response schema
    const responses = this.generateResponses(tool.returns);
    
    return {
      post: {
        description: this.truncateDescription(tool.description),
        // Store client info in a custom extension field
        'x-restifymcp-client': clientId,
        // tell OpenAI that this is not a consequential tool (it does not change the state of the world)
        'x-openai-isConsequential': false,
        // Use the exact tool name as operationId for better LLM understanding
        operationId: tool.name,
        // Always use requestBody, never query parameters for consistency and to handle large parameter sets
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: requestBody || {
                type: 'object',
                properties: {}
              }
            }
          }
        },
        responses: {
          '200': {
            description: this.truncateDescription('Successful operation'),
            content: {
              'application/json': {
                schema: responses
              }
            }
          },
          '401': {
            description: this.truncateDescription('Unauthorized'),
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          },
          '404': {
            description: this.truncateDescription('Tool or client not found'),
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                }
              }
            }
          },
          '500': {
            description: this.truncateDescription('Server error'),
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
  }

  /**
   * Convert MCP parameters to OpenAPI parameters
   * @param parameters MCP parameters
   * @returns OpenAPI parameters
   */
  private convertParametersToOpenAPI(parameters: Record<string, unknown>): ParameterObject[] {
    // We're no longer using query parameters for LLM compatibility
    // Always use request body instead
    return [];
  }

  /**
   * Generate request body schema for OpenAPI
   * @param parameters MCP parameters
   * @returns OpenAPI schema for request body
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
   * Generate response schema for OpenAPI
   * @param returns MCP return schema
   * @returns OpenAPI schema for response
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
   * Sanitize a schema to be OpenAPI-compatible
   * @param schema Input schema
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
   * Check if a property is a simple type (string, number, boolean, etc.)
   * @param property Property to check
   * @returns true if the property is a simple type
   */
  private isSimpleType(property: Record<string, any>): boolean {
    if (!property || typeof property !== 'object') {
      return false;
    }
    
    const type = property.type;
    return type === 'string' || type === 'number' || type === 'integer' || type === 'boolean';
  }

  /**
   * Capitalize the first letter of a string
   * @param str Input string
   * @returns String with first letter capitalized
   */
  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Helper method to ensure required fields are always arrays
   * @param required Required field value (may be object or array)
   * @returns Array of required field names
   */
  private ensureRequiredIsArray(required: unknown): string[] {
    if (!required) {
      return [];
    }
    
    if (Array.isArray(required)) {
      return required;
    }
    
    if (typeof required === 'object' && required !== null) {
      return Object.values(required) as string[];
    }
    
    return [];
  }

  /**
   * Ensure the default value matches the type specified in the schema
   * @param defaultValue The default value to check
   * @param type The expected type (e.g., 'array', 'object', etc.)
   * @returns A properly formatted default value
   */
  private ensureDefaultValueMatchesType(defaultValue: unknown, type: string): unknown {
    // Handle undefined/null default values
    if (defaultValue === undefined || defaultValue === null) {
      if (type === 'array') return [];
      if (type === 'object') return {};
      return defaultValue;
    }
    
    if (type === 'array') {
      // Always ensure array default is an array
      if (!Array.isArray(defaultValue)) {
        logger.debug(`Converting default value to array: ${JSON.stringify(defaultValue)}`);
        return [];
      }
      return defaultValue;
    }
    
    if (type === 'object') {
      // Ensure object default is an object
      if (typeof defaultValue !== 'object' || defaultValue === null) {
        logger.debug(`Converting default value to object: ${JSON.stringify(defaultValue)}`);
        return {};
      }
      return defaultValue;
    }
    
    // For other types, just return the default value as is
    return defaultValue;
  }

  /**
   * Truncates a description if it exceeds 300 characters
   * @param description The description to truncate
   * @returns Truncated description (297 characters + "...")
   */
  private truncateDescription(description: string): string {
    if (!description) return description;
    if (description.length <= 300) return description;
    
    return description.substring(0, 297) + "...";
  }
} 