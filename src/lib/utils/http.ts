/**
 * HTTP Utilities
 * Common HTTP-related functions and middleware
 */

import { ApiResponse, ErrorDetails, RateLimitInfo } from './types'

/**
 * HTTP status codes
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const

/**
 * HTTP methods
 */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS'
} as const

/**
 * Content types
 */
export const ContentType = {
  JSON: 'application/json',
  FORM: 'application/x-www-form-urlencoded',
  MULTIPART: 'multipart/form-data',
  TEXT: 'text/plain',
  HTML: 'text/html',
  XML: 'application/xml',
  STREAM: 'text/event-stream'
} as const

/**
 * Create standardized API response
 */
export function createApiResponse<T>(
  data?: T,
  message?: string,
  requestId?: string
): ApiResponse<T> {
  return {
    data,
    message,
    timestamp: new Date().toISOString(),
    requestId
  }
}

/**
 * Create error response
 */
export function createErrorResponse(
  error: string | Error,
  code: string = 'INTERNAL_ERROR',
  field?: string,
  requestId?: string
): ApiResponse<never> {
  const message = error instanceof Error ? error.message : error
  
  return {
    error: message,
    timestamp: new Date().toISOString(),
    requestId
  }
}

/**
 * Create error details
 */
export function createErrorDetails(
  code: string,
  message: string,
  field?: string,
  details?: Record<string, any>,
  requestId?: string
): ErrorDetails {
  return {
    code,
    message,
    field,
    details,
    timestamp: new Date().toISOString(),
    requestId
  }
}

/**
 * Parse request body safely
 */
export async function parseRequestBody<T = any>(request: Request): Promise<T | null> {
  try {
    const contentType = request.headers.get('content-type')
    
    if (!contentType) {
      return null
    }
    
    if (contentType.includes(ContentType.JSON)) {
      return await request.json()
    }
    
    if (contentType.includes(ContentType.FORM)) {
      const formData = await request.formData()
      const result: Record<string, any> = {}
      
      for (const [key, value] of formData.entries()) {
        result[key] = value
      }
      
      return result as T
    }
    
    if (contentType.includes(ContentType.TEXT)) {
      return await request.text() as T
    }
    
    return null
  } catch (error) {
    console.error('Error parsing request body:', error)
    return null
  }
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: Request): string {
  // Check various headers for the real IP
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ]
  
  for (const header of headers) {
    const value = request.headers.get(header)
    if (value) {
      // Take the first IP if there are multiple
      const ip = value.split(',')[0].trim()
      if (ip && ip !== 'unknown') {
        return ip
      }
    }
  }
  
  // Fallback to a default value
  return '127.0.0.1'
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'Unknown'
}

/**
 * Check if request is from a mobile device
 */
export function isMobileRequest(request: Request): boolean {
  const userAgent = getUserAgent(request).toLowerCase()
  const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'tablet']
  
  return mobileKeywords.some(keyword => userAgent.includes(keyword))
}

/**
 * Create CORS headers
 */
export function createCorsHeaders(
  origin?: string,
  methods: string[] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  headers: string[] = ['Content-Type', 'Authorization']
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Allow-Headers': headers.join(', '),
    'Access-Control-Max-Age': '86400' // 24 hours
  }
}

/**
 * Create security headers
 */
export function createSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  }
}

/**
 * Create rate limit headers
 */
export function createRateLimitHeaders(rateLimitInfo: RateLimitInfo): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': rateLimitInfo.limit.toString(),
    'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
    'X-RateLimit-Reset': rateLimitInfo.resetTime.toString()
  }
  
  if (rateLimitInfo.retryAfter) {
    headers['Retry-After'] = rateLimitInfo.retryAfter.toString()
  }
  
  return headers
}

/**
 * Create response with standard headers
 */
export function createResponse(
  body: any,
  status: number = HttpStatus.OK,
  additionalHeaders: Record<string, string> = {}
): Response {
  const headers = {
    'Content-Type': ContentType.JSON,
    ...createSecurityHeaders(),
    ...additionalHeaders
  }
  
  const responseBody = typeof body === 'string' ? body : JSON.stringify(body)
  
  return new Response(responseBody, {
    status,
    headers
  })
}

/**
 * Create streaming response
 */
export function createStreamingResponse(
  stream: ReadableStream,
  additionalHeaders: Record<string, string> = {}
): Response {
  const headers = {
    'Content-Type': ContentType.STREAM,
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...createSecurityHeaders(),
    ...additionalHeaders
  }
  
  return new Response(stream, {
    status: HttpStatus.OK,
    headers
  })
}

/**
 * Create redirect response
 */
export function createRedirectResponse(
  url: string,
  permanent: boolean = false
): Response {
  return new Response(null, {
    status: permanent ? 301 : 302,
    headers: {
      'Location': url,
      ...createSecurityHeaders()
    }
  })
}

/**
 * Validate request method
 */
export function validateMethod(
  request: Request,
  allowedMethods: string[]
): boolean {
  return allowedMethods.includes(request.method)
}

/**
 * Handle OPTIONS request for CORS
 */
export function handleOptionsRequest(
  request: Request,
  allowedMethods: string[] = ['GET', 'POST', 'PUT', 'DELETE']
): Response {
  const origin = request.headers.get('origin')
  const corsHeaders = createCorsHeaders(origin || undefined, allowedMethods)
  
  return new Response(null, {
    status: HttpStatus.NO_CONTENT,
    headers: corsHeaders
  })
}

/**
 * Extract query parameters from URL
 */
export function getQueryParams(url: string): Record<string, string> {
  const urlObj = new URL(url)
  const params: Record<string, string> = {}
  
  for (const [key, value] of urlObj.searchParams.entries()) {
    params[key] = value
  }
  
  return params
}

/**
 * Extract path parameters from URL pattern
 */
export function extractPathParams(
  url: string,
  pattern: string
): Record<string, string> | null {
  const urlParts = url.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)
  
  if (urlParts.length !== patternParts.length) {
    return null
  }
  
  const params: Record<string, string> = {}
  
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const urlPart = urlParts[i]
    
    if (patternPart.startsWith(':')) {
      const paramName = patternPart.slice(1)
      params[paramName] = decodeURIComponent(urlPart)
    } else if (patternPart !== urlPart) {
      return null
    }
  }
  
  return params
}

/**
 * Create middleware function type
 */
export type Middleware = (
  request: Request,
  context: any,
  next: () => Promise<Response>
) => Promise<Response>

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(...middlewares: Middleware[]): Middleware {
  return async (request: Request, context: any, next: () => Promise<Response>) => {
    let index = 0
    
    async function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      
      index = i
      
      const middleware = middlewares[i]
      
      if (!middleware) {
        return next()
      }
      
      return middleware(request, context, () => dispatch(i + 1))
    }
    
    return dispatch(0)
  }
}

/**
 * Create logging middleware
 */
export function createLoggingMiddleware(): Middleware {
  return async (request: Request, context: any, next: () => Promise<Response>) => {
    const start = Date.now()
    const method = request.method
    const url = request.url
    const userAgent = getUserAgent(request)
    const ip = getClientIP(request)
    
    console.log(`${method} ${url} - ${ip} - ${userAgent}`)
    
    try {
      const response = await next()
      const duration = Date.now() - start
      
      console.log(`${method} ${url} - ${response.status} - ${duration}ms`)
      
      return response
    } catch (error) {
      const duration = Date.now() - start
      console.error(`${method} ${url} - ERROR - ${duration}ms:`, error)
      throw error
    }
  }
}

/**
 * Create error handling middleware
 */
export function createErrorMiddleware(): Middleware {
  return async (request: Request, context: any, next: () => Promise<Response>) => {
    try {
      return await next()
    } catch (error) {
      console.error('Unhandled error in request:', error)
      
      const errorResponse = createErrorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        'INTERNAL_ERROR',
        undefined,
        context.requestId
      )
      
      return createResponse(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}