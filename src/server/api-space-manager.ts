/**
 * API Space Manager for RESTifyMCP
 * 
 * This module manages the relationships between clients and API Spaces.
 */
import { APISpace, ClientRegistration } from '../shared/types.js';
import { ConsoleLogger, LogLevel } from '../shared/utils.js';

// Set up logger
const logger = new ConsoleLogger('APISpaceManager', LogLevel.INFO);

/**
 * API Space Manager interface
 */
export interface APISpaceManager {
  /**
   * Initialize or update the manager with API Spaces
   */
  initialize(apiSpaces: APISpace[]): void;
  
  /**
   * Get all API Spaces a client belongs to
   */
  getSpacesForClient(clientToken: string): APISpace[];
  
  /**
   * Get API Space by its token
   */
  getSpaceByToken(spaceToken: string): APISpace | null;
  
  /**
   * Check if a client is allowed in a specific API Space
   */
  isClientAllowedInSpace(clientId: string, spaceName: string): boolean;
  
  /**
   * Get all client tokens that belong to a space
   */
  getClientTokensForSpace(spaceName: string): string[];
  
  /**
   * Get all available space tokens
   */
  getAllSpaceTokens(): string[];
  
  /**
   * Get API Space by its name
   */
  getSpaceByName(spaceName: string): APISpace | null;
  
  /**
   * Get all API Spaces
   */
  getAllSpaces(): APISpace[];
}

/**
 * Default implementation of API Space Manager
 */
export class DefaultAPISpaceManager implements APISpaceManager {
  // Maps client tokens to the API Space names they belong to
  private clientTokenToSpaces: Map<string, Set<string>> = new Map();
  
  // Maps API Space names to their full definitions
  private spaceNameToSpace: Map<string, APISpace> = new Map();
  
  // Maps API Space tokens to their names for quick lookup
  private spaceTokenToName: Map<string, string> = new Map();
  
  // Client registrations map
  private readonly clientRegistrations: Map<string, ClientRegistration>;
  
  /**
   * Initialize from server configuration
   */
  constructor(apiSpaces: APISpace[] = [], clientRegistrations: Map<string, ClientRegistration> = new Map()) {
    this.clientRegistrations = clientRegistrations;
    logger.debug(`APISpaceManager initialized with ${clientRegistrations.size} client registrations`);
    this.initialize(apiSpaces);
  }
  
  /**
   * Initialize or update the manager with API Spaces
   */
  initialize(apiSpaces: APISpace[]): void {
    // Clear existing maps
    this.clientTokenToSpaces.clear();
    this.spaceNameToSpace.clear();
    this.spaceTokenToName.clear();
    
    // Process each API Space
    for (const space of apiSpaces) {
      // Store API Space by name
      this.spaceNameToSpace.set(space.name, space);
      
      // Store API Space token to name mapping
      this.spaceTokenToName.set(space.bearerToken, space.name);
      
      // Associate client tokens with this API Space
      for (const clientToken of space.allowedClientTokens) {
        // Get or create set of spaces for this client token
        let spaces = this.clientTokenToSpaces.get(clientToken);
        if (!spaces) {
          spaces = new Set<string>();
          this.clientTokenToSpaces.set(clientToken, spaces);
        }
        
        // Add this space to the set
        spaces.add(space.name);
        
        logger.debug(`Associated client token ${clientToken} with API Space ${space.name}`);
      }
    }
    
    logger.debug(`Initialized with ${apiSpaces.length} API Spaces and ${this.clientTokenToSpaces.size} client tokens`);
    logger.debug(`Client token to spaces map: ${JSON.stringify(Array.from(this.clientTokenToSpaces.entries()))}`);
  }
  
  /**
   * Get all API Spaces a client belongs to
   */
  getSpacesForClient(clientToken: string): APISpace[] {
    logger.debug(`Getting spaces for client token: ${clientToken}`);
    
    const spaceNames = this.clientTokenToSpaces.get(clientToken);
    if (!spaceNames) {
      logger.debug(`No spaces found for client token: ${clientToken}`);
      return [];
    }
    
    logger.debug(`Found spaces for client token: ${Array.from(spaceNames).join(', ')}`);
    
    return Array.from(spaceNames)
      .map(name => this.spaceNameToSpace.get(name))
      .filter((space): space is APISpace => space !== undefined);
  }
  
  /**
   * Get API Space by its token
   */
  getSpaceByToken(spaceToken: string): APISpace | null {
    const spaceName = this.spaceTokenToName.get(spaceToken);
    if (!spaceName) {
      return null;
    }
    
    return this.spaceNameToSpace.get(spaceName) || null;
  }
  
  /**
   * Check if a client is allowed in a specific API Space
   */
  isClientAllowedInSpace(clientId: string, spaceName: string): boolean {
    // Get the space by name
    const space = this.spaceNameToSpace.get(spaceName);
    if (!space) {
      logger.debug(`API Space ${spaceName} not found`);
      return false;
    }
    
    // Get the client registration
    const client = this.clientRegistrations.get(clientId);
    if (!client) {
      logger.debug(`Client ${clientId} not found in registrations`);
      return false;
    }
    
    // Check if the client's bearer token is allowed in this space
    const isAllowed = space.allowedClientTokens.includes(client.bearerToken);
    
    logger.debug(`Client ${clientId} with token ${client.bearerToken} is ${isAllowed ? 'allowed' : 'not allowed'} in space ${spaceName}`);
    logger.debug(`Space ${spaceName} allowed tokens: ${JSON.stringify(space.allowedClientTokens)}`);
    
    return isAllowed;
  }
  
  /**
   * Get all client tokens that belong to a space
   */
  getClientTokensForSpace(spaceName: string): string[] {
    const result: string[] = [];
    
    for (const [clientToken, spaces] of this.clientTokenToSpaces.entries()) {
      if (spaces.has(spaceName)) {
        result.push(clientToken);
      }
    }
    
    return result;
  }
  
  /**
   * Get all available space tokens
   */
  getAllSpaceTokens(): string[] {
    return Array.from(this.spaceTokenToName.keys());
  }
  
  /**
   * Get API Space by its name
   */
  getSpaceByName(spaceName: string): APISpace | null {
    return this.spaceNameToSpace.get(spaceName) || null;
  }
  
  /**
   * Get all API Spaces
   */
  getAllSpaces(): APISpace[] {
    return Array.from(this.spaceNameToSpace.values());
  }
} 