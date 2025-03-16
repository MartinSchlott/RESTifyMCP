# RESTifyMCP V02 - Instruction Index

This document provides an overview of the instruction files for developing RESTifyMCP V02 with API Spaces.

## Instruction Files

1. **01_client_connection_handling.md**
   - Immediate reaction to client disconnections
   - Removal of "ghost tools" from API definitions
   - Event-based architecture for connection status

2. **02_newconfig.md**
   - Introduction to the API Spaces concept
   - New server configuration structure
   - Benefits compared to V01

3. **03_data_structures.md**
   - New interfaces for API Spaces
   - Adaptations to existing types
   - Data flow diagram for API Spaces

4. **04_server_implementation.md** 
   - Changes to the Server class
   - API Space management
   - Adaptations to BearerAuthService

5. **05_restapi_implementation.md**
   - Changes to ExpressRESTApiService
   - Routing based on API Spaces
   - Separate OpenAPI generation per space

6. **06_openapi_generation.md**
   - Adapting the OpenApiGenerator for multi-tenant
   - Generating separate documentation per space
   - Modifications for better readability

This step-by-step approach gives AI coders a clear understanding of the architecture while leaving them enough freedom for the specific implementation details.
