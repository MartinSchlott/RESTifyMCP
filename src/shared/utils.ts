/**
 * Utility functions for logging, error handling, etc.
 */
import crypto from 'node:crypto';

/**
 * Log levels
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

/**
 * Logger interface
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
  debug(message: string): void;
  setLogLevel(level: LogLevel): void;
}

/**
 * Console Logger implementation
 */
export class ConsoleLogger implements Logger {
  private readonly component: string;
  private currentLogLevel: LogLevel;
  private static logHandler: ((level: LogLevel, component: string, message: string) => void) | null = null;

  /**
   * Set a global log handler to capture logs for SSE
   * @param handler Log handler function
   */
  public static setLogHandler(handler: (level: LogLevel, component: string, message: string) => void): void {
    ConsoleLogger.logHandler = handler;
  }

  constructor(component: string, logLevel: LogLevel = LogLevel.INFO) {
    this.component = component;
    this.currentLogLevel = logLevel;
  }

  private log(level: LogLevel, message: string, error?: Error): void {
    // Skip if log level is below configured level
    if (this.shouldSkipLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] [${this.component}] ${message}`;
    
    // Send to console
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        if (error) {
          console.error(error);
        }
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
      default:
        console.info(formattedMessage);
        break;
    }
    
    // Send to SSE log handler if registered
    if (ConsoleLogger.logHandler) {
      ConsoleLogger.logHandler(level, this.component, message);
    }
  }
  
  private shouldSkipLog(level: LogLevel): boolean {
    const logLevels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    const configuredIndex = logLevels.indexOf(this.currentLogLevel);
    const messageIndex = logLevels.indexOf(level);
    
    return messageIndex > configuredIndex;
  }

  public setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  info(message: string): void {
    this.log(LogLevel.INFO, message);
  }

  warn(message: string): void {
    this.log(LogLevel.WARN, message);
  }

  error(message: string, error?: Error): void {
    this.log(LogLevel.ERROR, message, error);
  }
  
  debug(message: string): void {
    this.log(LogLevel.DEBUG, message);
  }
}

/**
 * Custom error class for RESTifyMCP
 */
export class RESTifyMCPError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RESTifyMCPError';
    this.code = code;
  }
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a client ID from a bearer token using SHA-256 hash
 */
export function generateClientIdFromToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Safe JSON parse that returns null on error
 */
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

/**
 * Sleep for the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a timeout promise that rejects after the specified timeout
 */
export function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new RESTifyMCPError(message, 'TIMEOUT')), ms);
    })
  ]);
} 