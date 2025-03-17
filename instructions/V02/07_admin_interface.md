# RESTifyMCP V02 - Admin Interface & Improved Access Control

## Overview

This document outlines the implementation of an admin interface with token-based authentication and improved access to OpenAPI documentation through token-hash URLs.

## Key Requirements

1. Add admin token authentication for the info/dashboard page
2. Streamline the info page to focus on API Spaces and connected clients
3. Create accessible but protected OpenAPI documentation URLs
4. Maintain logging functionality

## Admin Authentication Concept

Enhance the server configuration to include admin authentication:

```typescript
export interface AdminConfig {
  // Admin token for accessing the dashboard
  adminToken: string;
}

// Addition to server config
export interface ServerConfig {
  // ... existing fields
  admin?: AdminConfig;
}
```

Implementation approach:
- Create a login page that requires the admin token
- Use session-based authentication with secure cookies
- Protect admin routes with authentication middleware
- Implement logout functionality

## OpenAPI Access via Token Hash

Define a new URL scheme for accessing OpenAPI documentation:

```
/openapi/{tokenHash}/yaml
/openapi/{tokenHash}/json
```

Where `{tokenHash}` is a secure one-way hash of the API Space token.

Implementation considerations:
- Generate cryptographically secure hashes of API Space tokens
- Create a mapping between hashes and API Spaces
- Make these endpoints accessible without authentication
- Include links to these endpoints in the admin dashboard

## Token Hash Generation

The system should provide a secure way to map from tokens to hashes:

- Use a cryptographic hash function (e.g., SHA-256)
- Optionally add salt for additional security
- Create a lookup mechanism to resolve API Spaces from token hashes
- Generate these hashes when API Spaces are initialized

## Updated Admin Dashboard

The admin dashboard should focus on API Spaces with:

1. **Overview Statistics**
   - Total number of API Spaces
   - Total number of connected clients
   - System uptime

2. **API Space List**
   - Name and description of each API Space
   - Count of connected clients per space
   - Links to OpenAPI documentation
   - Expandable list of connected clients

3. **Client Information**
   - Client ID (shortened for readability)
   - Connection status and time
   - Number of provided tools

The dashboard should not display individual tools to keep the interface focused and manageable.

## Log Management

Maintain the existing logging functionality:

- Protect the logs page with admin authentication
- Keep the server-sent events (SSE) stream for real-time logs
- Allow filtering of logs by severity and component
- Ensure the logs are easily accessible from the dashboard

## Authentication Middleware

Create middleware to enforce admin authentication:

```typescript
interface AuthMiddleware {
  // Middleware to protect admin routes
  requireAdminAuth(req: Request, res: Response, next: NextFunction): void;
  
  // Validate admin token
  validateAdminToken(token: string): boolean;
  
  // Generate and validate session tokens
  createSession(res: Response): void;
  validateSession(req: Request): boolean;
}
```

## Implementation Strategy

1. Add admin configuration to the server config schema
2. Implement a login flow with the necessary routes and templates
3. Create a secure token hash generation system
4. Update the OpenAPI access routes to use token hashes
5. Redesign the admin dashboard to focus on API Spaces
6. Apply authentication to the appropriate routes

## UI Design Considerations

The admin interface should follow these design principles:

1. **Clean and Focused**
   - Prioritize information hierarchy
   - Use white space effectively
   - Employ a limited, consistent color palette

2. **Functional Layout**
   - Card-based design for API Spaces
   - Clear separation between different information sections
   - Responsive design that works on both desktop and mobile

3. **Visual Hierarchy**
   - Important information should be immediately visible
   - Secondary details can be hidden in expandable sections
   - Use consistent styling for similar elements

4. **Navigation**
   - Provide clear paths between dashboard and logs
   - Include a logout option
   - Ensure all actions are clearly labeled

The specific implementation details should align with these principles while allowing the developers freedom to choose the exact styling approach.
