/**
 * Admin Service for RESTifyMCP
 * 
 * This module handles admin authentication and dashboard functionality.
 */
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { ConsoleLogger, LogLevel } from '../shared/utils.js';
import { APISpace, ClientRegistration } from '../shared/types.js';
import { APISpaceManager } from './api-space-manager.js';

// Set up logger
const logger = new ConsoleLogger('AdminService', LogLevel.INFO);

/**
 * Interface for admin service configuration
 */
export interface AdminServiceConfig {
  adminToken: string;
}

/**
 * Interface for admin service
 */
export interface AdminService {
  requireAuth(req: Request, res: Response, next: NextFunction): void;
  validateAdminToken(token: string): boolean;
  createSession(res: Response): void;
  validateSession(req: Request): boolean;
  getTokenHash(token: string): string;
  generateDashboardData(): Promise<Record<string, any>>;
  getAPISpaceByTokenHash(hash: string): APISpace | null;
}

/**
 * Default implementation of admin service
 */
export class DefaultAdminService implements AdminService {
  private readonly adminToken: string;
  private readonly apiSpaceManager: APISpaceManager;
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  private readonly startTime: number;
  private readonly tokenHashes: Map<string, string> = new Map();

  constructor(
    config: AdminServiceConfig,
    apiSpaceManager: APISpaceManager,
    clientRegistrations: Map<string, ClientRegistration>
  ) {
    this.adminToken = config.adminToken;
    this.apiSpaceManager = apiSpaceManager;
    this.clientRegistrations = clientRegistrations;
    this.startTime = Date.now();

    // Generate token hashes for all API Spaces
    this.initializeTokenHashes();
  }

  /**
   * Initialize token hashes for all API Spaces
   */
  private initializeTokenHashes(): void {
    for (const space of this.apiSpaceManager.getAllSpaces()) {
      const hash = this.getTokenHash(space.bearerToken);
      this.tokenHashes.set(hash, space.bearerToken);
    }
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
   * Get token hash for an API Space token
   */
  getTokenHash(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for shorter URLs
  }

  /**
   * Middleware to require admin authentication
   */
  requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (this.validateSession(req)) {
      next();
    } else {
      res.redirect('/login');
    }
  }

  /**
   * Validate admin token
   */
  validateAdminToken(token: string): boolean {
    return token === this.adminToken;
  }

  /**
   * Create a session for authenticated admin
   */
  createSession(res: Response): void {
    // Create a session cookie that expires in 24 hours
    res.cookie('adminSession', this.getTokenHash(this.adminToken), {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }

  /**
   * Validate admin session
   */
  validateSession(req: Request): boolean {
    const sessionToken = req.cookies?.adminSession;
    if (!sessionToken) {
      return false;
    }
    return sessionToken === this.getTokenHash(this.adminToken);
  }

  /**
   * Generate dashboard data
   */
  async generateDashboardData(): Promise<Record<string, any>> {
    const apiSpaces = this.apiSpaceManager.getAllSpaces();
    const connectedClients = Array.from(this.clientRegistrations.values())
      .filter(client => client.connectionStatus === 'connected');
    
    let totalTools = 0;
    for (const client of connectedClients) {
      totalTools += client.tools.length;
    }

    // Calculate uptime
    const uptime = this.formatUptime(Date.now() - this.startTime);

    // Generate API Space data
    const apiSpacesData = apiSpaces.map(space => {
      const spaceClients = Array.from(this.clientRegistrations.entries())
        .filter(([clientId]) => this.apiSpaceManager.isClientAllowedInSpace(clientId, space.name))
        .map(([clientId, client]) => ({
          id: clientId,
          connectionStatus: client.connectionStatus,
          toolCount: client.tools.length
        }));

      const connectedSpaceClients = spaceClients.filter(
        client => client.connectionStatus === 'connected'
      );

      let spaceToolCount = 0;
      for (const client of connectedSpaceClients) {
        spaceToolCount += client.toolCount;
      }

      return {
        name: space.name,
        description: space.description,
        tokenHash: this.getTokenHash(space.bearerToken),
        clientCount: connectedSpaceClients.length,
        toolCount: spaceToolCount,
        clients: spaceClients
      };
    });

    return {
      apiSpacesCount: apiSpaces.length,
      connectedClientsCount: connectedClients.length,
      totalToolsCount: totalTools,
      uptime,
      apiSpaces: apiSpacesData
    };
  }

  /**
   * Format uptime duration
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
} 