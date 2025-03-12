/**
 * Authentication service for RESTifyMCP server
 */
import { Request, Response, NextFunction } from 'express';
import { ConsoleLogger, LogLevel, RESTifyMCPError } from '../shared/utils.js';
import { ClientRegistration } from '../shared/types.js';

// Set up logger
const logger = new ConsoleLogger('AuthService', LogLevel.INFO);

/**
 * Authentication service interface
 */
export interface AuthService {
  validateBearerToken(token: string): boolean;
  getClientIdFromToken(token: string): string | null;
  authenticateRequest(req: Request, res: Response, next: NextFunction): void;
}

/**
 * Default implementation of authentication service
 */
export class BearerAuthService implements AuthService {
  private readonly serverTokens: string[];
  private readonly clientRegistrations: Map<string, ClientRegistration>;

  /**
   * Create a new BearerAuthService
   * @param serverTokens The server's own Bearer tokens
   * @param clientRegistrations Map of client registrations
   */
  constructor(serverTokens: string[] | string, clientRegistrations: Map<string, ClientRegistration>) {
    // Handle both string and array for backward compatibility
    this.serverTokens = Array.isArray(serverTokens) ? serverTokens : [serverTokens];
    this.clientRegistrations = clientRegistrations;
    logger.info('BearerAuthService initialized');
  }

  /**
   * Validate if a Bearer token is valid
   * @param token Bearer token to validate
   * @returns true if token is valid, false otherwise
   */
  validateBearerToken(token: string): boolean {
    // Check if token matches any server token
    if (this.serverTokens.includes(token)) {
      return true;
    }

    // Check if token matches any client token
    for (const client of this.clientRegistrations.values()) {
      if (client.bearerToken === token) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get client ID associated with a token
   * @param token Bearer token
   * @returns Client ID if found, null otherwise
   */
  getClientIdFromToken(token: string): string | null {
    // Check client registrations
    for (const [clientId, client] of this.clientRegistrations.entries()) {
      if (client.bearerToken === token) {
        return clientId;
      }
    }

    return null;
  }

  /**
   * Express middleware to authenticate requests
   * @param req Express request
   * @param res Express response
   * @param next Express next function
   */
  authenticateRequest(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn('Request rejected: Missing Authorization header');
      res.status(401).json({ error: 'Authentication required', code: 'MISSING_AUTH_HEADER' });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      logger.warn('Request rejected: Invalid Authorization header format');
      res.status(401).json({ error: 'Invalid Authorization header format', code: 'INVALID_AUTH_FORMAT' });
      return;
    }

    const token = parts[1];
    if (!this.validateBearerToken(token)) {
      logger.warn('Request rejected: Invalid Bearer token');
      res.status(403).json({ error: 'Invalid Bearer token', code: 'INVALID_TOKEN' });
      return;
    }

    // Store token in request for later use
    (req as any).bearerToken = token;
    
    next();
  }
} 