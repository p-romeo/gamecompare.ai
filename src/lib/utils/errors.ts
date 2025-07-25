/**
 * Error Handling Utilities
 * Standardized error classes and error handling functions
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.isOperational = isOperational

    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * API-related errors
 */
export class APIError extends AppError {
  constructor(message: string, statusCode: number = 500) {
    super(message, 'API_ERROR', statusCode)
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  public readonly field?: string

  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.field = field
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401)
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403)
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND_ERROR', 404)
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429)
    this.retryAfter = retryAfter
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends AppError {
  public readonly service: string
  public readonly originalError?: Error

  constructor(message: string, service: string, originalError?: Error) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502)
    this.service = service
    this.originalError = originalError
  }
}

/**
 * Data ingestion errors
 */
export class IngestionError extends AppError {
  public readonly source: string
  public readonly originalError?: Error

  constructor(message: string, source: string, originalError?: Error) {
    super(message, 'INGESTION_ERROR', 500)
    this.source = source
    this.originalError = originalError
  }
}

/**
 * Database errors
 */
export class DatabaseError extends AppError {
  public readonly query?: string
  public readonly originalError?: Error

  constructor(message: string, query?: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500)
    this.query = query
    this.originalError = originalError
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  public readonly configKey?: string

  constructor(message: string, configKey?: string) {
    super(message, 'CONFIGURATION_ERROR', 500, false)
    this.configKey = configKey
  }
}

/**
 * Error handler for API errors
 */
export function handleApiError(error: any, source: string): never {
  if (error instanceof AppError) {
    throw error
  }
  
  const message = error?.message || 'Unknown error occurred'
  throw new ExternalServiceError(`${source} API error: ${message}`, source, error)
}

/**
 * Error handler for database errors
 */
export function handleDatabaseError(error: any, query?: string): never {
  if (error instanceof AppError) {
    throw error
  }
  
  const message = error?.message || 'Database operation failed'
  throw new DatabaseError(message, query, error)
}

/**
 * Validate environment variables
 */
export function validateEnvironmentVariables(required: string[]): void {
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}`,
      missing[0]
    )
  }
}

/**
 * Safe async wrapper that catches and handles errors
 */
export function safeAsync<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  return operation().catch(error => {
    console.error('Safe async operation failed:', error)
    return fallback
  })
}

/**
 * Retry wrapper with exponential backoff for error handling
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === maxAttempts) {
        break
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
      
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

/**
 * Error serializer for logging and API responses
 */
export function serializeError(error: Error): Record<string, any> {
  const serialized: Record<string, any> = {
    name: error.name,
    message: error.message,
    stack: error.stack
  }

  if (error instanceof AppError) {
    serialized.code = error.code
    serialized.statusCode = error.statusCode
    serialized.isOperational = error.isOperational
  }

  if (error instanceof ValidationError && error.field) {
    serialized.field = error.field
  }

  if (error instanceof RateLimitError && error.retryAfter) {
    serialized.retryAfter = error.retryAfter
  }

  if (error instanceof ExternalServiceError) {
    serialized.service = error.service
    if (error.originalError) {
      serialized.originalError = serializeError(error.originalError)
    }
  }

  if (error instanceof DatabaseError) {
    serialized.query = error.query
    if (error.originalError) {
      serialized.originalError = serializeError(error.originalError)
    }
  }

  if (error instanceof ConfigurationError && error.configKey) {
    serialized.configKey = error.configKey
  }

  return serialized
}

/**
 * Create error response for API endpoints
 */
export function createErrorResponse(error: Error): {
  error: {
    code: string
    message: string
    details?: any
    timestamp: string
  }
  status: number
} {
  const serialized = serializeError(error)
  
  return {
    error: {
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      message: error.message,
      details: serialized,
      timestamp: new Date().toISOString()
    },
    status: error instanceof AppError ? error.statusCode : 500
  }
}

/**
 * Global error handler for unhandled promises and exceptions
 */
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    // Don't exit the process in production, just log
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1)
    }
  })

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
    // Exit the process for uncaught exceptions
    process.exit(1)
  })
}

/**
 * Error boundary for React components (utility function)
 */
export function createErrorBoundary(
  onError: (error: Error, errorInfo: any) => void
) {
  return class ErrorBoundary extends Error {
    constructor(error: Error, errorInfo: any) {
      super(error.message)
      this.name = 'ErrorBoundary'
      onError(error, errorInfo)
    }
  }
}