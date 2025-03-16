/**
 * Authentication service for RESTifyMCP server
 */
import { Request, Response, NextFunction } from 'express';
import { ConsoleLogger, LogLevel, RESTifyMCPError } from '../shared/utils.js';
import { APISpace, ClientRegistration } from '../shared/types.js';
import { APISpaceManager } from './api-space-manager.js';
import crypto from 'crypto';

// Set up logger
const logger = new ConsoleLogger('AuthService', LogLevel.INFO);

/**
 * Authentication service interface
 */
export interface AuthService {
  validateBearerToken(token: string): boolean;
  getClientIdFromToken(token: string): string | null;
  authenticateRequest(req: Request, res: Response, next: NextFunction): void;
  getRequestAPISpace(req: Request): APISpace | null;
  getValidClientTokensForRequest(req: Request): string[];
  validateAdminToken(token: string): boolean;
  getTokenHash(token: string): string;
  getAPISpaceByTokenHash(hash: string): APISpace | null;
}

/**
 * Default implementation of authentication service
 */
export class BearerAuthService implements AuthService {
  private readonly apiSpaceManager: APISpaceManager;
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  private readonly adminToken: string | null;
  private readonly tokenHashes: Map<string, string> = new Map(); // hash -> token

  /**
   * Create a new BearerAuthService
   * @param apiSpaceManager The API Space manager
   * @param clientRegistrations Map of client registrations
   * @param adminToken Optional admin token
   */
  constructor(
    apiSpaceManager: APISpaceManager,
    clientRegistrations: Map<string, ClientRegistration>,
    adminToken: string | null = null
  ) {
    this.apiSpaceManager = apiSpaceManager;
    this.clientRegistrations = clientRegistrations;
    this.adminToken = adminToken;
    
    // Generate token hashes for all API Spaces
    this.generateTokenHashes();
    
    logger.info('BearerAuthService initialized');
  }

  /**
   * Generate secure hashes for all API Space tokens
   */
  private generateTokenHashes(): void {
    // Clear existing hashes
    this.tokenHashes.clear();
    
    // Generate hashes for all API Space tokens
    for (const token of this.apiSpaceManager.getAllSpaceTokens()) {
      const hash = this.getTokenHash(token);
      this.tokenHashes.set(hash, token);
    }
    
    logger.info(`Generated token hashes for ${this.tokenHashes.size} API Spaces`);
  }

  /**
   * Generate a secure hash for a token
   */
  getTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get API Space by token hash
   */
  getAPISpaceByTokenHash(hash: string): APISpace | null {
    const token = this.tokenHashes.get(hash);
    if (!token) {
      return null;
    }
    
    return this.apiSpaceManager.getSpaceByToken(token);
  }

  /**
   * Validate if a Bearer token is valid
   * @param token Bearer token to validate
   * @returns true if token is valid, false otherwise
   */
  validateBearerToken(token: string): boolean {
    // Check if token matches any API Space token
    if (this.apiSpaceManager.getSpaceByToken(token)) {
      return true;
    }

    // Check if token matches any client token
    for (const client of this.clientRegistrations.values()) {
      if (client.bearerToken === token) {
        return true;
      }
    }
    
    // Check if token matches admin token
    if (this.adminToken && token === this.adminToken) {
      return true;
    }

    return false;
  }
  
  /**
   * Validate if a token is a valid admin token
   */
  validateAdminToken(token: string): boolean {
    return !!this.adminToken && token === this.adminToken;
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
   * Get the API Space associated with a request
   * @param req Express request
   * @returns API Space if found, null otherwise
   */
  getRequestAPISpace(req: Request): APISpace | null {
    const token = (req as any).bearerToken;
    if (!token) {
      return null;
    }
    
    return this.apiSpaceManager.getSpaceByToken(token);
  }

  /**
   * Get valid client tokens for a request
   * @param req Express request
   * @returns Array of valid client tokens for the request's API Space
   */
  getValidClientTokensForRequest(req: Request): string[] {
    const apiSpace = this.getRequestAPISpace(req);
    if (!apiSpace) {
      return [];
    }
    
    return this.apiSpaceManager.getClientTokensForSpace(apiSpace.name);
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