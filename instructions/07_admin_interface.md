# RESTifyMCP V02 - Admin Interface & Improved Access Control

## Overview

This document outlines the implementation of an admin interface with token-based authentication and improved access to OpenAPI documentation through token-hash URLs.

## Key Requirements

1. Add admin token authentication for the info/dashboard page
2. Streamline the info page to focus on API Spaces and connected clients
3. Create accessible but protected OpenAPI documentation URLs
4. Maintain logging functionality

## Admin Authentication

Implement a simple admin authentication system:

```typescript
export interface AdminConfig {
  // Admin token for accessing the dashboard
  adminToken: string;
}

// Add to server config
export interface ServerConfig {
  http: { /*...*/ },
  apiSpaces: APISpace[];
  admin: AdminConfig;
  logging?: { /*...*/ };
}
```

Implementation notes:
- Add a simple login page that requires the admin token
- Store the authentication state in a session cookie
- Redirect unauthenticated requests to the login page
- Set reasonable session expiration

## Login Page

Create a simple but secure login page:

```typescript
// Route handler for login page
this.app.get('/login', (req: Request, res: Response) => {
  res.type('text/html').send(this.generateLoginPageHtml());
});

// POST handler for authentication
this.app.post('/login', express.urlencoded({ extended: true }), (req: Request, res: Response) => {
  const { token } = req.body;
  
  // Validate token against admin token
  if (token === this.config.server.admin.adminToken) {
    // Set session cookie
    res.cookie('admin_session', this.generateSessionToken(), {
      httpOnly: true,
      secure: true,
      maxAge: 3600000 // 1 hour
    });
    res.redirect('/info');
  } else {
    res.status(401).send(this.generateLoginPageHtml(true));
  }
});
```

## OpenAPI Access via Token Hash

Implement a new URL scheme for accessing OpenAPI documentation:

```typescript
// Route handlers for OpenAPI docs with token-hash URLs
this.app.get('/openapi/:tokenHash/json', (req: Request, res: Response) => {
  const tokenHash = req.params.tokenHash;
  const apiSpace = this.resolveTokenHash(tokenHash);
  
  if (!apiSpace) {
    return res.status(404).json({ error: 'API Space not found' });
  }
  
  res.json(this.getOpenApiSpec(apiSpace));
});

this.app.get('/openapi/:tokenHash/yaml', (req: Request, res: Response) => {
  const tokenHash = req.params.tokenHash;
  const apiSpace = this.resolveTokenHash(tokenHash);
  
  if (!apiSpace) {
    return res.status(404).type('text/plain').send('API Space not found');
  }
  
  res.type('text/yaml').send(yamlDump(this.getOpenApiSpec(apiSpace)));
});
```

Implementation notes:
- Create a secure hash of each API Space token (e.g., SHA-256)
- Store a mapping of token hashes to API Spaces
- Update the info page to include links to these new URLs
- Keep the old URL scheme working for backward compatibility

## Token Hash Generation

Implement a secure method for generating token hashes:

```typescript
/**
 * Generate a secure hash of an API Space token
 */
private generateTokenHash(token: string): string {
  // Use a cryptographic hash function (SHA-256)
  const hash = createHash('sha256');
  hash.update(token);
  return hash.digest('hex');
}

/**
 * Resolve an API Space from a token hash
 */
private resolveTokenHash(tokenHash: string): APISpace | null {
  // Implementation to look up API Space by token hash
}
```

## Updated Info Dashboard

Redesign the info dashboard to focus on API Spaces and clients:

```typescript
private generateInfoPageHtml(): string {
  // Generate API Spaces section
  let apiSpacesHtml = '';
  for (const space of this.apiSpaceManager.getAllSpaces()) {
    const connectedClients = this.getConnectedClientsForSpace(space.name);
    
    apiSpacesHtml += `
      <div class="api-space-card">
        <h3>${space.name}</h3>
        <p>${space.description || 'No description'}</p>
        <div class="api-space-stats">
          <span>Connected Clients: ${connectedClients.length}</span>
        </div>
        <div class="api-space-links">
          <a href="/openapi/${this.getTokenHashForSpace(space)}/yaml" target="_blank">OpenAPI YAML</a>
          <a href="/openapi/${this.getTokenHashForSpace(space)}/json" target="_blank">OpenAPI JSON</a>
        </div>
        <div class="api-space-clients">
          <h4>Connected Clients</h4>
          ${this.generateClientListHtml(connectedClients)}
        </div>
      </div>
    `;
  }
  
  // Insert into template
  let htmlTemplate = /* ... */;
  return htmlTemplate
    .replace('{{apiSpacesHtml}}', apiSpacesHtml)
    .replace('{{totalSpaces}}', this.apiSpaceManager.getAllSpaces().length.toString())
    .replace('{{totalClients}}', this.getConnectedClientCount().toString());
}
```

## Logs Interface

Maintain the existing logs streaming interface:

```typescript
// Route handler for logs page (with admin authentication)
this.app.get('/logs', this.requireAdminAuth.bind(this), (req: Request, res: Response) => {
  res.type('text/html').send(this.generateLogsPageHtml());
});

// SSE endpoint for log streaming (with admin authentication)
this.app.get('/logs/events', this.requireAdminAuth.bind(this), (req: Request, res: Response) => {
  // Existing SSE implementation
});
```

## Implementation Strategy

1. Add admin configuration to the server config
2. Create a simple login page and authentication system
3. Implement token hash generation for API Spaces
4. Add new URL routes for OpenAPI access
5. Update the info dashboard to focus on API Spaces
6. Ensure logs functionality remains accessible through admin auth

## Visual Design Guidelines

This section provides design suggestions for the admin interface. These are optional and can be adapted or replaced based on implementation preferences.

### Login Page

Create a clean, simple login page:

```html
<div class="login-container">
  <div class="login-card">
    <h2>RESTifyMCP Admin</h2>
    <form method="post" action="/login">
      <div class="input-group">
        <label for="token">Admin Token</label>
        <input type="password" id="token" name="token" required autofocus>
      </div>
      <button type="submit">Log In</button>
      {{#if error}}
      <div class="error-message">Invalid token</div>
      {{/if}}
    </form>
  </div>
</div>
```

Styling suggestions:
- Use a card-based design with subtle shadows
- Implement responsive layout that works on mobile and desktop
- Use a calming color scheme (blues and grays work well for admin interfaces)
- Keep the form centered with adequate whitespace

### Dashboard Layout

Structure the dashboard with a clear hierarchy:

1. **Header** - With logo, title, and logout button
2. **Statistics Summary** - Cards showing total API Spaces and clients
3. **API Spaces Grid** - Cards for each API Space with:
   - Name and description
   - Client count
   - OpenAPI links
   - Expandable client list
4. **Footer** - With version information and links to logs

### API Space Cards

Design each API Space card to clearly present information:

```html
<div class="api-space-card">
  <div class="card-header">
    <h3>{{name}}</h3>
    <span class="badge">{{clientCount}} clients</span>
  </div>
  <p class="description">{{description}}</p>
  <div class="links">
    <a href="/openapi/{{tokenHash}}/yaml" class="button">OpenAPI YAML</a>
    <a href="/openapi/{{tokenHash}}/json" class="button secondary">OpenAPI JSON</a>
  </div>
  <details>
    <summary>Connected Clients</summary>
    <ul class="client-list">
      {{#each clients}}
      <li>
        <span class="client-id">{{id}}</span>
        <span class="connection-time">Connected: {{connectedTime}}</span>
      </li>
      {{/each}}
    </ul>
  </details>
</div>
```

Consider using:
- A grid or flex layout for responsive design
- Collapsible sections for client details
- Clear visual hierarchy with consistent spacing
- Subtle visual indicators for connection status

### Color Scheme Suggestion

```css
:root {
  --primary-color: #3498db;
  --secondary-color: #2c3e50;
  --success-color: #2ecc71;
  --warning-color: #f39c12;
  --danger-color: #e74c3c;
  --light-color: #ecf0f1;
  --dark-color: #34495e;
  --background-color: #f5f7fa;
  --card-color: #ffffff;
  --text-color: #333333;
  --text-light: #7f8c8d;
}
```

This professional color scheme provides good contrast while maintaining a modern look suitable for an admin interface.
