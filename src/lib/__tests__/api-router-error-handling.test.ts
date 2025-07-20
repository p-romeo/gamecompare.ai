/**
 * Tests for API Router Error Handling and Logging
 * These tests verify the error handling patterns used in the API router
 */

describe('API Router Error Handling', () => {
  // Error types enum for testing
  enum ErrorType {
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
    NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR'
  }

  interface ErrorResponse {
    error: string
    type: ErrorType
    details?: string
    timestamp: string
    requestId: string
  }

  describe('Error Response Creation', () => {
    it('should create structured error responses with all required fields', () => {
      const createErrorResponse = (
        error: string,
        type: ErrorType,
        status: number,
        requestId: string,
        details?: string
      ): ErrorResponse => {
        return {
          error,
          type,
          details,
          timestamp: new Date().toISOString(),
          requestId
        }
      }

      const errorResponse = createErrorResponse(
        'Test error',
        ErrorType.VALIDATION_ERROR,
        400,
        'test-request-id',
        'Test details'
      )

      expect(errorResponse.error).toBe('Test error')
      expect(errorResponse.type).toBe('VALIDATION_ERROR')
      expect(errorResponse.details).toBe('Test details')
      expect(errorResponse.requestId).toBe('test-request-id')
      expect(errorResponse.timestamp).toBeDefined()
      expect(new Date(errorResponse.timestamp)).toBeInstanceOf(Date)
    })

    it('should handle error responses without details', () => {
      const createErrorResponse = (
        error: string,
        type: ErrorType,
        status: number,
        requestId: string,
        details?: string
      ): ErrorResponse => {
        return {
          error,
          type,
          details,
          timestamp: new Date().toISOString(),
          requestId
        }
      }

      const errorResponse = createErrorResponse(
        'Simple error',
        ErrorType.INTERNAL_ERROR,
        500,
        'test-id'
      )

      expect(errorResponse.error).toBe('Simple error')
      expect(errorResponse.type).toBe('INTERNAL_ERROR')
      expect(errorResponse.details).toBeUndefined()
      expect(errorResponse.requestId).toBe('test-id')
    })
  })

  describe('Input Validation and Sanitization', () => {
    const validateAndSanitizeInput = (input: any, schema: Record<string, any>): any => {
      const sanitized: any = {}
      
      for (const [key, rules] of Object.entries(schema)) {
        const value = input[key]
        
        if (rules.required && (value === undefined || value === null)) {
          throw new Error(`${key} is required`)
        }
        
        if (value !== undefined && value !== null) {
          if (rules.type === 'string') {
            if (typeof value !== 'string') {
              throw new Error(`${key} must be a string`)
            }
            sanitized[key] = value.trim()
            
            if (rules.minLength && sanitized[key].length < rules.minLength) {
              throw new Error(`${key} must be at least ${rules.minLength} characters`)
            }
            
            if (rules.maxLength && sanitized[key].length > rules.maxLength) {
              throw new Error(`${key} must be at most ${rules.maxLength} characters`)
            }
          } else if (rules.type === 'object') {
            if (typeof value !== 'object' || Array.isArray(value)) {
              throw new Error(`${key} must be an object`)
            }
            sanitized[key] = value
          }
        }
      }
      
      return sanitized
    }

    it('should validate and sanitize valid input', () => {
      const input = { query: '  test query  ', filters: { price: 50 } }
      const schema = {
        query: { type: 'string', required: true, minLength: 1, maxLength: 500 },
        filters: { type: 'object', required: false }
      }

      const result = validateAndSanitizeInput(input, schema)

      expect(result.query).toBe('test query') // trimmed
      expect(result.filters).toEqual({ price: 50 })
    })

    it('should throw error for missing required fields', () => {
      const input = {}
      const schema = { query: { type: 'string', required: true } }

      expect(() => validateAndSanitizeInput(input, schema)).toThrow('query is required')
    })

    it('should throw error for invalid types', () => {
      const input = { query: 123 }
      const schema = { query: { type: 'string', required: true } }

      expect(() => validateAndSanitizeInput(input, schema)).toThrow('query must be a string')
    })

    it('should validate string length constraints', () => {
      const schema = { query: { type: 'string', required: true, minLength: 5, maxLength: 10 } }

      // Too short
      expect(() => validateAndSanitizeInput({ query: 'hi' }, schema))
        .toThrow('query must be at least 5 characters')

      // Too long
      expect(() => validateAndSanitizeInput({ query: 'this is way too long' }, schema))
        .toThrow('query must be at most 10 characters')

      // Just right
      const result = validateAndSanitizeInput({ query: 'hello' }, schema)
      expect(result.query).toBe('hello')
    })

    it('should validate object types', () => {
      const schema = { filters: { type: 'object', required: true } }

      // Array should fail
      expect(() => validateAndSanitizeInput({ filters: [] }, schema))
        .toThrow('filters must be an object')

      // String should fail
      expect(() => validateAndSanitizeInput({ filters: 'not an object' }, schema))
        .toThrow('filters must be an object')

      // Valid object should pass
      const result = validateAndSanitizeInput({ filters: { price: 50 } }, schema)
      expect(result.filters).toEqual({ price: 50 })
    })
  })

  describe('Rate Limiting', () => {
    const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
    const RATE_LIMIT_MAX_REQUESTS = 60 // 60 requests per minute

    const checkRateLimit = (
      clientIp: string,
      rateLimitStore: Map<string, { count: number; resetTime: number }>
    ): boolean => {
      const now = Date.now()
      const key = clientIp
      const current = rateLimitStore.get(key)
      
      if (!current || now > current.resetTime) {
        rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
        return true
      }
      
      if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false
      }
      
      current.count++
      return true
    }

    it('should allow requests within rate limit', () => {
      const rateLimitStore = new Map()
      const clientIp = '192.168.1.1'

      // First request should pass
      expect(checkRateLimit(clientIp, rateLimitStore)).toBe(true)
      
      // Subsequent requests should also pass
      expect(checkRateLimit(clientIp, rateLimitStore)).toBe(true)
      expect(checkRateLimit(clientIp, rateLimitStore)).toBe(true)
    })

    it('should block requests when rate limit is exceeded', () => {
      const rateLimitStore = new Map()
      const clientIp = '192.168.1.1'

      // First request creates entry
      expect(checkRateLimit(clientIp, rateLimitStore)).toBe(true)

      // Simulate hitting rate limit
      const current = rateLimitStore.get(clientIp)!
      current.count = RATE_LIMIT_MAX_REQUESTS

      // Next request should fail
      expect(checkRateLimit(clientIp, rateLimitStore)).toBe(false)
    })

    it('should reset rate limit after time window', () => {
      const rateLimitStore = new Map()
      const clientIp = '192.168.1.1'

      // Set up expired rate limit entry
      const pastTime = Date.now() - RATE_LIMIT_WINDOW - 1000
      rateLimitStore.set(clientIp, { count: RATE_LIMIT_MAX_REQUESTS, resetTime: pastTime })

      // Request should pass because time window has expired
      expect(checkRateLimit(clientIp, rateLimitStore)).toBe(true)

      // Verify new entry was created
      const newEntry = rateLimitStore.get(clientIp)!
      expect(newEntry.count).toBe(1)
      expect(newEntry.resetTime).toBeGreaterThan(Date.now())
    })

    it('should handle different client IPs independently', () => {
      const rateLimitStore = new Map()
      const clientIp1 = '192.168.1.1'
      const clientIp2 = '192.168.1.2'

      // Set up rate limit for first IP
      rateLimitStore.set(clientIp1, { count: RATE_LIMIT_MAX_REQUESTS, resetTime: Date.now() + RATE_LIMIT_WINDOW })

      // First IP should be blocked
      expect(checkRateLimit(clientIp1, rateLimitStore)).toBe(false)

      // Second IP should be allowed
      expect(checkRateLimit(clientIp2, rateLimitStore)).toBe(true)
    })
  })

  describe('Client IP Extraction', () => {
    const getClientIp = (headers: Record<string, string>): string => {
      return headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             headers['x-real-ip'] ||
             headers['cf-connecting-ip'] ||
             'unknown'
    }

    it('should extract IP from x-forwarded-for header', () => {
      const headers = { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' }
      expect(getClientIp(headers)).toBe('192.168.1.1')
    })

    it('should extract IP from x-real-ip header', () => {
      const headers = { 'x-real-ip': '192.168.1.2' }
      expect(getClientIp(headers)).toBe('192.168.1.2')
    })

    it('should extract IP from cf-connecting-ip header', () => {
      const headers = { 'cf-connecting-ip': '192.168.1.3' }
      expect(getClientIp(headers)).toBe('192.168.1.3')
    })

    it('should return unknown when no IP headers present', () => {
      const headers = {}
      expect(getClientIp(headers)).toBe('unknown')
    })

    it('should prioritize x-forwarded-for over other headers', () => {
      const headers = {
        'x-forwarded-for': '192.168.1.1',
        'x-real-ip': '192.168.1.2',
        'cf-connecting-ip': '192.168.1.3'
      }
      expect(getClientIp(headers)).toBe('192.168.1.1')
    })

    it('should handle whitespace in x-forwarded-for', () => {
      const headers = { 'x-forwarded-for': '  192.168.1.1  , 10.0.0.1' }
      expect(getClientIp(headers)).toBe('192.168.1.1')
    })
  })

  describe('Logging Functions', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('should log requests with structured format', () => {
      const logRequest = (
        method: string,
        path: string,
        requestId: string,
        clientIp?: string,
        userAgent?: string
      ): void => {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          type: 'REQUEST',
          requestId,
          method,
          path,
          clientIp,
          userAgent
        }))
      }

      logRequest('POST', '/similar', 'test-id', '192.168.1.1', 'test-agent')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData.level).toBe('INFO')
      expect(loggedData.type).toBe('REQUEST')
      expect(loggedData.method).toBe('POST')
      expect(loggedData.path).toBe('/similar')
      expect(loggedData.requestId).toBe('test-id')
      expect(loggedData.clientIp).toBe('192.168.1.1')
      expect(loggedData.userAgent).toBe('test-agent')
      expect(loggedData.timestamp).toBeDefined()
    })

    it('should log responses with structured format', () => {
      const logResponse = (
        requestId: string,
        status: number,
        duration: number,
        path: string
      ): void => {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          type: 'RESPONSE',
          requestId,
          status,
          duration,
          path
        }))
      }

      logResponse('test-id', 200, 150, '/similar')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData.level).toBe('INFO')
      expect(loggedData.type).toBe('RESPONSE')
      expect(loggedData.requestId).toBe('test-id')
      expect(loggedData.status).toBe(200)
      expect(loggedData.duration).toBe(150)
      expect(loggedData.path).toBe('/similar')
      expect(loggedData.timestamp).toBeDefined()
    })
  })

  describe('Error Logging', () => {
    let consoleErrorSpy: jest.SpyInstance

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    it('should log errors with structured format', () => {
      const logError = (
        error: Error | string,
        requestId: string,
        context?: Record<string, any>
      ): void => {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          type: 'ERROR',
          requestId,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          context
        }))
      }

      const testError = new Error('Test error message')
      logError(testError, 'test-id', { additional: 'context' })

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0])

      expect(loggedData.level).toBe('ERROR')
      expect(loggedData.type).toBe('ERROR')
      expect(loggedData.requestId).toBe('test-id')
      expect(loggedData.error).toBe('Test error message')
      expect(loggedData.context.additional).toBe('context')
      expect(loggedData.timestamp).toBeDefined()
      expect(loggedData.stack).toBeDefined()
    })

    it('should handle string errors', () => {
      const logError = (
        error: Error | string,
        requestId: string,
        context?: Record<string, any>
      ): void => {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          type: 'ERROR',
          requestId,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          context
        }))
      }

      logError('String error message', 'test-id')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0])

      expect(loggedData.error).toBe('String error message')
      expect(loggedData.stack).toBeUndefined()
    })
  })

  describe('Store Validation', () => {
    it('should validate store names against allowed list', () => {
      const validStores = ['steam', 'epic', 'gog', 'playstation', 'xbox']
      
      const isValidStore = (store: string): boolean => {
        return validStores.includes(store.toLowerCase())
      }

      // Valid stores
      expect(isValidStore('steam')).toBe(true)
      expect(isValidStore('STEAM')).toBe(true)
      expect(isValidStore('Epic')).toBe(true)
      expect(isValidStore('gog')).toBe(true)

      // Invalid stores
      expect(isValidStore('nintendo')).toBe(false)
      expect(isValidStore('origin')).toBe(false)
      expect(isValidStore('')).toBe(false)
      expect(isValidStore('invalid')).toBe(false)
    })
  })
})