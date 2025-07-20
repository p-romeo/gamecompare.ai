/**
 * Production Security Configuration
 * Centralized configuration for all security features
 */

export interface ProductionSecurityConfig {
  rateLimiting: {
    enabled: boolean
    windowMs: number
    maxRequests: number
    burstLimit: number
    progressiveBlocking: boolean
    skipSuccessfulRequests: boolean
    skipFailedRequests: boolean
  }
  ddosProtection: {
    enabled: boolean
    threshold: number
    windowMs: number
    blockDuration: number
    adaptiveThresholds: boolean
    distributedAttackDetection: boolean
  }
  inputValidation: {
    maxRequestSize: number
    allowedContentTypes: string[]
    sanitizeHtml: boolean
    validateJson: boolean
    blockMaliciousPatterns: boolean
    sqlInjectionDetection: boolean
    xssDetection: boolean
  }
  securityHeaders: {
    xContentTypeOptions: string
    xFrameOptions: string
    xXssProtection: string
    strictTransportSecurity: string
    referrerPolicy: string
    contentSecurityPolicy: string
    permissionsPolicy: string
    cacheControl: string
  }
  auditLogging: {
    enabled: boolean
    logSuccessfulRequests: boolean
    logFailedRequests: boolean
    logSecurityEvents: boolean
    retentionDays: number
    sensitiveFields: string[]
    complianceLogging: boolean
  }
  apiKeyManagement: {
    keyPrefix: string
    hashAlgorithm: string
    rotationIntervalDays: number
    autoRotation: boolean
    usageTracking: boolean
    permissionValidation: boolean
  }
  secretManagement: {
    rotationIntervalDays: number
    backupRetentionDays: number
    autoRotation: boolean
    encryptionAtRest: boolean
    accessAuditing: boolean
  }
  complianceMonitoring: {
    gdprCompliance: boolean
    soc2Compliance: boolean
    pciDssCompliance: boolean
    dataRetentionPolicies: boolean
    accessControlAuditing: boolean
    breachNotification: boolean
  }
  alerting: {
    enabled: boolean
    criticalEventThreshold: number
    highVolumeAttackThreshold: number
    failureRateThreshold: number
    responseTimeThreshold: number
    emailNotifications: boolean
    slackNotifications: boolean
  }
}

/**
 * Production-grade security configuration
 */
export const PRODUCTION_SECURITY_CONFIG: ProductionSecurityConfig = {
  rateLimiting: {
    enabled: true,
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute per IP
    burstLimit: 100, // Allow bursts up to 100 requests
    progressiveBlocking: true, // Increase block duration for repeat offenders
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  ddosProtection: {
    enabled: true,
    threshold: 100, // requests per minute
    windowMs: 60 * 1000,
    blockDuration: 15 * 60 * 1000, // 15 minutes
    adaptiveThresholds: true, // Adjust thresholds based on normal traffic
    distributedAttackDetection: true // Detect coordinated attacks
  },
  inputValidation: {
    maxRequestSize: 1024 * 1024, // 1MB
    allowedContentTypes: [
      'application/json',
      'text/plain',
      'application/x-www-form-urlencoded'
    ],
    sanitizeHtml: true,
    validateJson: true,
    blockMaliciousPatterns: true,
    sqlInjectionDetection: true,
    xssDetection: true
  },
  securityHeaders: {
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    xXssProtection: '1; mode=block',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    referrerPolicy: 'strict-origin-when-cross-origin',
    contentSecurityPolicy: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "media-src 'self'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    permissionsPolicy: [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'speaker=()',
      'fullscreen=(self)',
      'sync-xhr=()'
    ].join(', '),
    cacheControl: 'no-store, no-cache, must-revalidate, proxy-revalidate'
  },
  auditLogging: {
    enabled: true,
    logSuccessfulRequests: false, // Only log failures and security events
    logFailedRequests: true,
    logSecurityEvents: true,
    retentionDays: 90, // Keep logs for 90 days
    sensitiveFields: [
      'password', 'token', 'key', 'secret', 'auth', 'authorization',
      'cookie', 'session', 'jwt', 'api_key', 'access_token', 'refresh_token',
      'ssn', 'social_security', 'credit_card', 'card_number', 'cvv', 'pin'
    ],
    complianceLogging: true
  },
  apiKeyManagement: {
    keyPrefix: 'gca_', // GameCompare.ai prefix
    hashAlgorithm: 'SHA-256',
    rotationIntervalDays: 90, // Rotate every 90 days
    autoRotation: true,
    usageTracking: true,
    permissionValidation: true
  },
  secretManagement: {
    rotationIntervalDays: 30, // Rotate critical secrets every 30 days
    backupRetentionDays: 30,
    autoRotation: true,
    encryptionAtRest: true,
    accessAuditing: true
  },
  complianceMonitoring: {
    gdprCompliance: true,
    soc2Compliance: true,
    pciDssCompliance: false, // Enable if handling payment data
    dataRetentionPolicies: true,
    accessControlAuditing: true,
    breachNotification: true
  },
  alerting: {
    enabled: true,
    criticalEventThreshold: 5, // Alert after 5 critical events
    highVolumeAttackThreshold: 100, // Alert after 100 blocked requests
    failureRateThreshold: 0.1, // Alert if failure rate > 10%
    responseTimeThreshold: 5000, // Alert if P95 response time > 5s
    emailNotifications: true,
    slackNotifications: true
  }
}

/**
 * Development security configuration (less restrictive)
 */
export const DEVELOPMENT_SECURITY_CONFIG: ProductionSecurityConfig = {
  ...PRODUCTION_SECURITY_CONFIG,
  rateLimiting: {
    ...PRODUCTION_SECURITY_CONFIG.rateLimiting,
    maxRequests: 1000, // More lenient for development
    burstLimit: 2000
  },
  ddosProtection: {
    ...PRODUCTION_SECURITY_CONFIG.ddosProtection,
    threshold: 1000, // Higher threshold for development
    blockDuration: 5 * 60 * 1000 // Shorter block duration
  },
  auditLogging: {
    ...PRODUCTION_SECURITY_CONFIG.auditLogging,
    logSuccessfulRequests: true, // Log everything in development
    retentionDays: 7 // Shorter retention for development
  },
  alerting: {
    ...PRODUCTION_SECURITY_CONFIG.alerting,
    enabled: false // Disable alerts in development
  }
}

/**
 * Get security configuration based on environment
 */
export function getSecurityConfig(): ProductionSecurityConfig {
  const environment = Deno.env.get('NODE_ENV') || 'development'
  
  if (environment === 'production') {
    return PRODUCTION_SECURITY_CONFIG
  }
  
  return DEVELOPMENT_SECURITY_CONFIG
}

/**
 * Security configuration validation
 */
export function validateSecurityConfig(config: ProductionSecurityConfig): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Validate rate limiting
  if (config.rateLimiting.maxRequests <= 0) {
    errors.push('Rate limiting maxRequests must be greater than 0')
  }
  
  if (config.rateLimiting.windowMs <= 0) {
    errors.push('Rate limiting windowMs must be greater than 0')
  }

  // Validate DDoS protection
  if (config.ddosProtection.threshold <= 0) {
    errors.push('DDoS protection threshold must be greater than 0')
  }
  
  if (config.ddosProtection.blockDuration <= 0) {
    errors.push('DDoS protection blockDuration must be greater than 0')
  }

  // Validate input validation
  if (config.inputValidation.maxRequestSize <= 0) {
    errors.push('Input validation maxRequestSize must be greater than 0')
  }
  
  if (config.inputValidation.allowedContentTypes.length === 0) {
    errors.push('Input validation must have at least one allowed content type')
  }

  // Validate audit logging
  if (config.auditLogging.retentionDays <= 0) {
    errors.push('Audit logging retentionDays must be greater than 0')
  }

  // Validate API key management
  if (config.apiKeyManagement.rotationIntervalDays <= 0) {
    errors.push('API key rotationIntervalDays must be greater than 0')
  }

  // Validate secret management
  if (config.secretManagement.rotationIntervalDays <= 0) {
    errors.push('Secret management rotationIntervalDays must be greater than 0')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Security metrics thresholds
 */
export const SECURITY_METRICS_THRESHOLDS = {
  // Response time thresholds (milliseconds)
  RESPONSE_TIME_WARNING: 2000,
  RESPONSE_TIME_CRITICAL: 5000,
  
  // Error rate thresholds (percentage)
  ERROR_RATE_WARNING: 0.05, // 5%
  ERROR_RATE_CRITICAL: 0.1,  // 10%
  
  // Security event thresholds
  SECURITY_EVENTS_WARNING: 50,
  SECURITY_EVENTS_CRITICAL: 100,
  
  // Blocked requests thresholds
  BLOCKED_REQUESTS_WARNING: 100,
  BLOCKED_REQUESTS_CRITICAL: 500,
  
  // Attack pattern thresholds
  BRUTE_FORCE_THRESHOLD: 10, // Failed attempts per IP per 5 minutes
  SCANNING_THRESHOLD: 20,    // Different endpoints per IP per minute
  
  // Compliance thresholds
  DATA_ACCESS_THRESHOLD: 1000, // Data access requests per hour
  SENSITIVE_DATA_THRESHOLD: 100 // Sensitive data access per hour
}

/**
 * Security event severity levels
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security event types
 */
export enum SecurityEventType {
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  DDOS_DETECTED = 'ddos_detected',
  INVALID_INPUT = 'invalid_input',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SECURITY_VIOLATION = 'security_violation',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_ROTATED = 'api_key_rotated',
  API_KEY_REVOKED = 'api_key_revoked',
  SECRET_ROTATED = 'secret_rotated',
  IP_BLOCKED = 'ip_blocked',
  IP_UNBLOCKED = 'ip_unblocked',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  AUTHORIZATION_FAILURE = 'authorization_failure'
}

/**
 * Compliance standards
 */
export enum ComplianceStandard {
  GDPR = 'GDPR',
  SOC2 = 'SOC2',
  PCI_DSS = 'PCI_DSS',
  HIPAA = 'HIPAA',
  CCPA = 'CCPA'
}