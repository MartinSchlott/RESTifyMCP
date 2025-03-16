/**
 * API Space Manager for RESTifyMCP
 * 
 * This module manages the relationships between clients and API Spaces.
 */
import { APISpace } from '../shared/types.js';
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
  isClientAllowedInSpace(clientToken: string, spaceToken: string): boolean;
  
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
  
  /**
   * Initialize from server configuration
   */
  constructor(apiSpaces: APISpace[] = []) {
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
      // Store space by name
      this.spaceNameToSpace.set(space.name, space);
      
      // Store token to name mapping
      this.spaceTokenToName.set(space.bearerToken, space.name);
      
      // Process client tokens
      for (const clientToken of space.allowedClientTokens) {
        // Get or create the set of spaces for this client
        let spaces = this.clientTokenToSpaces.get(clientToken);
        if (!spaces) {
          spaces = new Set<string>();
          this.clientTokenToSpaces.set(clientToken, spaces);
        }
        
        // Add this space to the client's spaces
        spaces.add(space.name);
      }
    }
    
    logger.info(`Initialized with ${apiSpaces.length} API Spaces`);
  }
  
  /**
   * Get all API Spaces a client belongs to
   */
  getSpacesForClient(clientToken: string): APISpace[] {
    const spaceNames = this.clientTokenToSpaces.get(clientToken);
    if (!spaceNames) {
      return [];
    }
    
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
  isClientAllowedInSpace(clientToken: string, spaceToken: string): boolean {
    const spaceName = this.spaceTokenToName.get(spaceToken);
    if (!spaceName) {
      return false;
    }
    
    const clientSpaces = this.clientTokenToSpaces.get(clientToken);
    if (!clientSpaces) {
      return false;
    }
    
    return clientSpaces.has(spaceName);
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