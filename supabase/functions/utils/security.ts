/**
 * Advanced security utilities for GameCompare.ai
 * Includes input validation, rate limiting, DDoS protection, and security audit logging
 */

interface SecurityConfig {
  rateLimiting: {
    enabled: boolean
    windowMs: number
    maxRequests: number
    skipSuccessfulRequests: boolean
    skipFailedRequests: boolean
    keyGenerator: (req: Request) => string
  }
  ddosProtection: {
    enabled: boolean
    threshold: number
    windowMs: number
    blockDuration: number
  }
  inputValidation: {
    maxRequestSize: number
    allowedContentTypes: string[]
    sanitizeHtml: boolean
    validateJson: boolean
  }
  auditLogging: {
    enabled: boolean
    logSuccessfulRequests: boolean
    logFailedRequests: boolean
    sensitiveFields: string[]
  }
}

interface SecurityEvent {
  id: string
  type: 'rate_limit_exceeded' | 'ddos_detected' | 'invalid_input' | 'suspicious_activity' | 'security_violation'
  severity: 'low' | 'medium' | 'high' | 'critical'
  clientIp: string
  userAgent?: string
  endpoint: string
  details: Record<string, any>
  timestamp: string
  blocked: boolean
}

interface RateLimitInfo {
  count: number
  resetTime: number
  blocked: boolean
}

interface DDoSInfo {
  requestCount: number
  firstRequest: number
  blocked: boolean
  blockExpires?: number
}

/**
 * Advanced security manager
 */
export class SecurityManager {
  private config: SecurityConfig
  private rateLimitStore = new Map<string, RateLimitInfo>()
  private ddosStore = new Map<string, DDoSInfo>()
  private blockedIPs = new Set<string>()
  private supabase: any

  constructor(supabaseUrl: string, serviceRoleKey: string, config?: Partial<SecurityConfig>) {
    const { createClient } = require('https://esm.sh/@supabase/supabase-js@2')
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
    
    this.config = {
      rateLimiting: {
        enabled: true,
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: (req: Request) => this.getClientIP(req),
        ...config?.rateLimiting
      },
      ddosProtection: {
        enabled: true,
        threshold: 100, // requests per minute
        windowMs: 60 * 1000,
        blockDuration: 15 * 60 * 1000, // 15 minutes
        ...config?.ddosProtection
      },
      inputValidation: {
        maxRequestSize: 1024 * 1024, // 1MB
        allowedContentTypes: ['application/json', 'text/plain'],
        sanitizeHtml: true,
        validateJson: true,
        ...config?.inputValidation
      },
      auditLogging: {
        enabled: true,
        logSuccessfulRequests: false,
        logFailedRequests: true,
        sensitiveFields: ['password', 'token', 'key', 'secret'],
        ...config?.auditLogging
      }
    }
  }

  /**
   * Comprehensive security check for incoming requests
   */
  async checkRequest(req: Request): Promise<{
    allowed: boolean
    reason?: string
    securityEvent?: SecurityEvent
  }> {
    const clientIP = this.getClientIP(req)
    const userAgent = req.headers.get('user-agent') || 'unknown'
    const url = new URL(req.url)
    const endpoint = url.pathname

    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      const event = await this.createSecurityEvent({
        type: 'security_violation',
        severity: 'high',
        clientIp: clientIP,
        userAgent,
        endpoint,
        details: { reason: 'IP blocked' },
        blocked: true
      })
      
      return {
        allowed: false,
        reason: 'IP address is blocked',
        securityEvent: event
      }
    }

    // DDoS protection check
    if (this.config.ddosProtection.enabled) {
      const ddosCheck = await this.checkDDoS(clientIP, endpoint)
      if (!ddosCheck.allowed) {
        return ddosCheck
      }
    }

    // Rate limiting check
    if (this.config.rateLimiting.enabled) {
      const rateLimitCheck = await this.checkRateLimit(req, clientIP, endpoint)
      if (!rateLimitCheck.allowed) {
        return rateLimitCheck
      }
    }

    // Input validation
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const inputCheck = await this.validateInput(req, clientIP, endpoint)
      if (!inputCheck.allowed) {
        return inputCheck
      }
    }

    // Suspicious activity detection
    const suspiciousCheck = await this.detectSuspiciousActivity(req, clientIP, endpoint)
    if (!suspiciousCheck.allowed) {
      return suspiciousCheck
    }

    return { allowed: true }
  }

  /**
   * Check for DDoS attacks
   */
  private async checkDDoS(clientIP: string, endpoint: string): Promise<{
    allowed: boolean
    reason?: string
    securityEvent?: SecurityEvent
  }> {
    const now = Date.now()
    const ddosInfo = this.ddosStore.get(clientIP)

    if (ddosInfo) {
      // Check if block has expired
      if (ddosInfo.blocked && ddosInfo.blockExpires && now > ddosInfo.blockExpires) {
        ddosInfo.blocked = false
        ddosInfo.blockExpires = undefined
        ddosInfo.requestCount = 0
        ddosInfo.firstRequest = now
      }

      // If currently blocked
      if (ddosInfo.blocked) {
        const event = await this.createSecurityEvent({
          type: 'ddos_detected',
          severity: 'critical',
          clientIp: clientIP,
          endpoint,
          details: { 
            requestCount: ddosInfo.requestCount,
            blockExpires: ddosInfo.blockExpires
          },
          blocked: true
        })

        return {
          allowed: false,
          reason: 'DDoS protection activated',
          securityEvent: event
        }
      }

      // Check if within time window
      if (now - ddosInfo.firstRequest < this.config.ddosProtection.windowMs) {
        ddosInfo.requestCount++
        
        // Check if threshold exceeded
        if (ddosInfo.requestCount > this.config.ddosProtection.threshold) {
          ddosInfo.blocked = true
          ddosInfo.blockExpires = now + this.config.ddosProtection.blockDuration
          this.blockedIPs.add(clientIP)

          const event = await this.createSecurityEvent({
            type: 'ddos_detected',
            severity: 'critical',
            clientIp: clientIP,
            endpoint,
            details: { 
              requestCount: ddosInfo.requestCount,
              threshold: this.config.ddosProtection.threshold,
              blockDuration: this.config.ddosProtection.blockDuration
            },
            blocked: true
          })

          return {
            allowed: false,
            reason: 'DDoS threshold exceeded',
            securityEvent: event
          }
        }
      } else {
        // Reset counter for new window
        ddosInfo.requestCount = 1
        ddosInfo.firstRequest = now
      }
    } else {
      // First request from this IP
      this.ddosStore.set(clientIP, {
        requestCount: 1,
        firstRequest: now,
        blocked: false
      })
    }

    return { allowed: true }
  }

  /**
   * Advanced rate limiting with IP-based throttling
   */
  private async checkRateLimit(req: Request, clientIP: string, endpoint: string): Promise<{
    allowed: boolean
    reason?: string
    securityEvent?: SecurityEvent
  }> {
    const key = this.config.rateLimiting.keyGenerator(req)
    const now = Date.now()
    const rateLimitInfo = this.rateLimitStore.get(key)

    if (rateLimitInfo) {
      // Check if window has expired
      if (now > rateLimitInfo.resetTime) {
        rateLimitInfo.count = 1
        rateLimitInfo.resetTime = now + this.config.rateLimiting.windowMs
        rateLimitInfo.blocked = false
      } else {
        rateLimitInfo.count++
        
        // Check if limit exceeded
        if (rateLimitInfo.count > this.config.rateLimiting.maxRequests) {
          rateLimitInfo.blocked = true

          const event = await this.createSecurityEvent({
            type: 'rate_limit_exceeded',
            severity: 'medium',
            clientIp: clientIP,
            endpoint,
            details: { 
              count: rateLimitInfo.count,
              limit: this.config.rateLimiting.maxRequests,
              windowMs: this.config.rateLimiting.windowMs
            },
            blocked: true
          })

          return {
            allowed: false,
            reason: 'Rate limit exceeded',
            securityEvent: event
          }
        }
      }
    } else {
      // First request
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + this.config.rateLimiting.windowMs,
        blocked: false
      })
    }

    return { allowed: true }
  }

  /**
   * Comprehensive input validation and sanitization
   */
  private async validateInput(req: Request, clientIP: string, endpoint: string): Promise<{
    allowed: boolean
    reason?: string
    securityEvent?: SecurityEvent
  }> {
    try {
      // Check content type
      const contentType = req.headers.get('content-type') || ''
      const isAllowedContentType = this.config.inputValidation.allowedContentTypes.some(
        type => contentType.includes(type)
      )

      if (!isAllowedContentType) {
        const event = await this.createSecurityEvent({
          type: 'invalid_input',
          severity: 'medium',
          clientIp: clientIP,
          endpoint,
          details: { 
            reason: 'Invalid content type',
            contentType,
            allowed: this.config.inputValidation.allowedContentTypes
          },
          blocked: true
        })

        return {
          allowed: false,
          reason: 'Invalid content type',
          securityEvent: event
        }
      }

      // Check request size
      const contentLength = parseInt(req.headers.get('content-length') || '0')
      if (contentLength > this.config.inputValidation.maxRequestSize) {
        const event = await this.createSecurityEvent({
          type: 'invalid_input',
          severity: 'medium',
          clientIp: clientIP,
          endpoint,
          details: { 
            reason: 'Request too large',
            size: contentLength,
            maxSize: this.config.inputValidation.maxRequestSize
          },
          blocked: true
        })

        return {
          allowed: false,
          reason: 'Request too large',
          securityEvent: event
        }
      }

      // Validate JSON if applicable
      if (this.config.inputValidation.validateJson && contentType.includes('application/json')) {
        try {
          const body = await req.clone().text()
          const parsed = JSON.parse(body)
          
          // Check for malicious patterns
          const maliciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /eval\s*\(/gi,
            /Function\s*\(/gi
          ]

          const bodyStr = JSON.stringify(parsed)
          for (const pattern of maliciousPatterns) {
            if (pattern.test(bodyStr)) {
              const event = await this.createSecurityEvent({
                type: 'invalid_input',
                severity: 'high',
                clientIp: clientIP,
                endpoint,
                details: { 
                  reason: 'Malicious pattern detected',
                  pattern: pattern.source
                },
                blocked: true
              })

              return {
                allowed: false,
                reason: 'Malicious input detected',
                securityEvent: event
              }
            }
          }

          // Check for SQL injection patterns
          const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
            /(--|\/\*|\*\/|;)/g,
            /(\b(OR|AND)\b.*=.*)/gi
          ]

          for (const pattern of sqlPatterns) {
            if (pattern.test(bodyStr)) {
              const event = await this.createSecurityEvent({
                type: 'invalid_input',
                severity: 'critical',
                clientIp: clientIP,
                endpoint,
                details: { 
                  reason: 'SQL injection attempt detected',
                  pattern: pattern.source
                },
                blocked: true
              })

              return {
                allowed: false,
                reason: 'SQL injection attempt detected',
                securityEvent: event
              }
            }
          }

        } catch (jsonError) {
          const event = await this.createSecurityEvent({
            type: 'invalid_input',
            severity: 'low',
            clientIp: clientIP,
            endpoint,
            details: { 
              reason: 'Invalid JSON',
              error: jsonError.message
            },
            blocked: true
          })

          return {
            allowed: false,
            reason: 'Invalid JSON format',
            securityEvent: event
          }
        }
      }

      return { allowed: true }

    } catch (error) {
      console.error('Input validation error:', error)
      return { allowed: true } // Allow request if validation fails
    }
  }

  /**
   * Detect suspicious activity patterns
   */
  private async detectSuspiciousActivity(req: Request, clientIP: string, endpoint: string): Promise<{
    allowed: boolean
    reason?: string
    securityEvent?: SecurityEvent
  }> {
    const userAgent = req.headers.get('user-agent') || ''
    const referer = req.headers.get('referer') || ''
    
    // Check for bot patterns
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i
    ]

    const isSuspiciousBot = botPatterns.some(pattern => pattern.test(userAgent))
    
    // Check for missing or suspicious headers
    const hasNormalHeaders = req.headers.get('accept') && req.headers.get('accept-language')
    
    // Check for rapid sequential requests to different endpoints
    const recentRequests = await this.getRecentRequests(clientIP, 60000) // Last minute
    const uniqueEndpoints = new Set(recentRequests.map(r => r.endpoint)).size
    const isRapidScanning = recentRequests.length > 20 && uniqueEndpoints > 10

    if (isSuspiciousBot && !hasNormalHeaders) {
      const event = await this.createSecurityEvent({
        type: 'suspicious_activity',
        severity: 'medium',
        clientIp: clientIP,
        userAgent,
        endpoint,
        details: { 
          reason: 'Suspicious bot activity',
          userAgent,
          missingHeaders: !hasNormalHeaders
        },
        blocked: false // Log but don't block
      })

      // Don't block, just log for now
      return { allowed: true, securityEvent: event }
    }

    if (isRapidScanning) {
      const event = await this.createSecurityEvent({
        type: 'suspicious_activity',
        severity: 'high',
        clientIp: clientIP,
        userAgent,
        endpoint,
        details: { 
          reason: 'Rapid endpoint scanning detected',
          requestCount: recentRequests.length,
          uniqueEndpoints,
          timeWindow: 60000
        },
        blocked: true
      })

      return {
        allowed: false,
        reason: 'Suspicious scanning activity detected',
        securityEvent: event
      }
    }

    return { allowed: true }
  }

  /**
   * Get recent requests for an IP
   */
  private async getRecentRequests(clientIP: string, windowMs: number): Promise<any[]> {
    const since = new Date(Date.now() - windowMs).toISOString()
    
    try {
      const { data } = await this.supabase
        .from('security_events')
        .select('*')
        .eq('client_ip', clientIP)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
      
      return data || []
    } catch (error) {
      console.error('Failed to get recent requests:', error)
      return []
    }
  }

  /**
   * Create and log security event
   */
  private async createSecurityEvent(eventData: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<SecurityEvent> {
    const event: SecurityEvent = {
      ...eventData,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }

    // Log to console
    console.log(`Security Event: ${event.type} - ${event.severity} - ${event.clientIp} - ${event.details.reason || 'No reason'}`)

    // Store in database if audit logging is enabled
    if (this.config.auditLogging.enabled) {
      try {
        await this.supabase
          .from('security_events')
          .insert({
            id: event.id,
            type: event.type,
            severity: event.severity,
            client_ip: event.clientIp,
            user_agent: event.userAgent,
            endpoint: event.endpoint,
            details: event.details,
            blocked: event.blocked,
            timestamp: event.timestamp
          })
      } catch (error) {
        console.error('Failed to store security event:', error)
      }
    }

    return event
  }

  /**
   * Get client IP address with proxy support
   */
  private getClientIP(req: Request): string {
    // Check various headers for real IP
    const headers = [
      'cf-connecting-ip', // Cloudflare
      'x-real-ip',
      'x-forwarded-for',
      'x-client-ip',
      'x-forwarded',
      'x-cluster-client-ip',
      'forwarded-for',
      'forwarded'
    ]

    for (const header of headers) {
      const value = req.headers.get(header)
      if (value) {
        // Handle comma-separated IPs (take first one)
        const ip = value.split(',')[0].trim()
        if (this.isValidIP(ip)) {
          return ip
        }
      }
    }

    return 'unknown'
  }

  /**
   * Validate IP address format
   */
  private isValidIP(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
    return ipv4Regex.test(ip) || ipv6Regex.test(ip)
  }

  /**
   * Sanitize input data
   */
  sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      // Remove HTML tags if sanitization is enabled
      if (this.config.inputValidation.sanitizeHtml) {
        input = input.replace(/<[^>]*>/g, '')
      }
      
      // Remove potentially dangerous characters
      input = input.replace(/[<>'"&]/g, (match) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        }
        return entities[match] || match
      })
      
      return input.trim()
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item))
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(input)) {
        // Skip sensitive fields
        if (this.config.auditLogging.sensitiveFields.includes(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]'
        } else {
          sanitized[key] = this.sanitizeInput(value)
        }
      }
      return sanitized
    }
    
    return input
  }

  /**
   * Generate security headers
   */
  getSecurityHeaders(): HeadersInit {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; media-src 'self'; frame-src 'none';",
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), speaker=()',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  }

  /**
   * Block IP address
   */
  blockIP(ip: string, duration?: number): void {
    this.blockedIPs.add(ip)
    
    if (duration) {
      setTimeout(() => {
        this.blockedIPs.delete(ip)
        console.log(`IP ${ip} unblocked after ${duration}ms`)
      }, duration)
    }
  }

  /**
   * Unblock IP address
   */
  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip)
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(hours: number = 24): Promise<{
    totalEvents: number
    eventsByType: Record<string, number>
    eventsBySeverity: Record<string, number>
    blockedRequests: number
    topAttackers: Array<{ ip: string; count: number }>
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    
    try {
      const { data: events } = await this.supabase
        .from('security_events')
        .select('*')
        .gte('timestamp', since)
      
      if (!events) {
        return {
          totalEvents: 0,
          eventsByType: {},
          eventsBySeverity: {},
          blockedRequests: 0,
          topAttackers: []
        }
      }

      const eventsByType: Record<string, number> = {}
      const eventsBySeverity: Record<string, number> = {}
      const attackerCounts: Record<string, number> = {}
      let blockedRequests = 0

      for (const event of events) {
        eventsByType[event.type] = (eventsByType[event.type] || 0) + 1
        eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1
        attackerCounts[event.client_ip] = (attackerCounts[event.client_ip] || 0) + 1
        
        if (event.blocked) {
          blockedRequests++
        }
      }

      const topAttackers = Object.entries(attackerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }))

      return {
        totalEvents: events.length,
        eventsByType,
        eventsBySeverity,
        blockedRequests,
        topAttackers
      }
    } catch (error) {
      console.error('Failed to get security stats:', error)
      return {
        totalEvents: 0,
        eventsByType: {},
        eventsBySeverity: {},
        blockedRequests: 0,
        topAttackers: []
      }
    }
  }
}

// Global security manager instance
export const securityManager = new SecurityManager(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)