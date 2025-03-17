# RESTifyMCP: OpenAPI Generation

This document describes how RESTifyMCP converts MCP tool definitions into an OpenAPI specification.

## Basic Principle

Each MCP server provides a set of tools, which are defined as functions in the MCP protocol. RESTifyMCP automatically converts these tools into REST API endpoints and generates an OpenAPI specification documenting these endpoints.

## Converting MCP Tools to REST Endpoints

### Path Structure

For each MCP tool, a REST endpoint is created following this pattern:

```
/api/tools/{toolName}
```

Where:
- `toolName`: The name of the MCP tool as provided by the MCP server.

### HTTP Methods

Each tool is implemented as a POST endpoint since they represent actions/function calls.

## OpenAPI Structure

The generated OpenAPI specification follows the OpenAPI 3.0 standard and includes:

### 1. General Information

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "RESTify MCP API",
    "version": "1.0.0",
    "description": "REST API for MCP Tools"
  },
  "servers": [
    {
      "url": "[server.http.publicUrl]"
    }
  ]
}
```

### 2. Security Definition

```json
{
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "string"
      }
    }
  },
  "security": [
    {
      "bearerAuth": []
    }
  ]
}
```

### 3. Paths for Each Tool

For each MCP tool, a path entry is created:

```json
{
  "paths": {
    "/api/tools/{toolName}": {
      "post": {
        "operationId": "{toolName}",
        "description": "Tool description goes here",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "paramName1": {
                    "type": "string",
                    "description": "Parameter description"
                  },
                  "paramName2": {
                    "type": "number",
                    "description": "Parameter description"
                  }
                },
                "required": ["paramName1"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successful operation",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "result": {}
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Tool not found"
          },
          "500": {
            "description": "Internal server error"
          }
        }
      }
    }
  }
}
```

## Parameter Transformation

MCP tools define parameters with types and schemas. These are converted into OpenAPI parameters as follows:

### MCP Parameter Schema (Example)

```json
{
  "name": "calculate-bmi",
  "description": "Calculate BMI from weight and height",
  "parameters": {
    "weightKg": {
      "type": "number",
      "description": "Weight in kilograms",
      "required": true
    },
    "heightM": {
      "type": "number",
      "description": "Height in meters",
      "required": true
    }
  },
  "returns": {
    "schema": {
      "type": "object",
      "properties": {
        "bmi": {
          "type": "number"
        },
        "category": {
          "type": "string"
        }
      }
    }
  }
}
```

### Resulting OpenAPI Definition

```json
{
  "post": {
    "operationId": "calculate-bmi",
    "description": "Calculate BMI from weight and height",
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "weightKg": {
                "type": "number",
                "description": "Weight in kilograms"
              },
              "heightM": {
                "type": "number",
                "description": "Height in meters"
              }
            },
            "required": ["weightKg", "heightM"]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Successful operation",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "bmi": {
                  "type": "number"
                },
                "category": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Retrieving the OpenAPI Specification

The OpenAPI specification is available at the following endpoints:

- `/openapi.json` - JSON format
- `/openapi.yaml` - YAML format

These endpoints provide the complete OpenAPI specification, including all available tools. This specification can be directly imported into tools such as Swagger UI, Postman, or CustomGPTs.

## Key Features for CustomGPTs and Other Clients

For better integration with CustomGPTs and other API clients:

1. **OperationId**: Each endpoint uses the original `toolName` as the `operationId` for easy mapping.

2. **Consistent Format**: All requests and responses use JSON.

3. **Clear Parameter Documentation**: Parameter descriptions and types are taken directly from MCP tool definitions.

4. **Complete Error Documentation**: All possible error scenarios are documented.

## Updating the OpenAPI Definition

The OpenAPI definition is dynamically updated when:

1. A new client with MCP tools registers with the server.
2. A client updates its tool definitions.
3. A client disconnects from the server.

The update occurs automatically in the background, ensuring that the OpenAPI specification always reflects the current state of available tools.
