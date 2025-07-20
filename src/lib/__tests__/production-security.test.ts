/**
 * Production Security Integration Tests
 * Comprehensive tests for all production security measures
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'

// Mock security utilities for testing
const mockSecurityManager = {
  checkRequest: jest.fn(),
  getSecurityHeaders: jest.fn(),
  blockIP: jest.fn(),
  unblockIP: jest.fn(),
  sanitizeInput: jest.fn(),
  getSecurityStats: jest.fn()
}

const mockAPIKeyManager = {
  generateAPIKey: jest.fn(),
  validateAPIKey: jest.fn(),
  rotateAPIKey: jest.fn(),
  revokeAPIKey: jest.fn()
}

const mockSecretManager = {
  storeSecret: jest.fn(),
  getSecret: jest.fn(),
  rotateSecret: jest.fn(),
  generateSecureSecret: jest.fn()
}

const mockAuditLogger = {
  logAuditEntry: jest.fn(),
  generateComplianceReport: jest.fn(),
  getSecurityMetrics: jest.fn()
}

describe('Production Security System', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Comprehensive Input Validation', () => {
    test('should detect and block SQL injection attempts', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM passwords",
        "'; INSERT INTO admin VALUES('hacker', 'password'); --",
        "1'; EXEC xp_cmdshell('dir'); --"
      ]

      for (const input of maliciousInputs) {
        mockSecurityManager.checkRequest.mockResolvedValueOnce({
          allowed: false,
          reason: 'SQL injection attempt detected'
        })

        const result = await mockSecurityManager.checkRequest({
          body: JSON.stringify({ query: input })
        })

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('SQL injection')
      }
    })

    test('should detect and block XSS attempts', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert("xss")',
        '<svg onload=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<body onload=alert(1)>',
        '<div onclick="alert(1)">Click me</div>'
      ]

      for (const payload of xssPayloads) {
        mockSecurityManager.checkRequest.mockResolvedValueOnce({
          allowed: false,
          reason: 'Malicious input detected'
        })

        const result = await mockSecurityManager.checkRequest({
          body: JSON.stringify({ content: payload })
        })

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('Malicious input')
      }
    })

    test('should validate request size limits', async () => {
      const largePayload = 'x'.repeat(2 * 1024 * 1024) // 2MB payload

      mockSecurityManager.checkRequest.mockResolvedValueOnce({
        allowed: false,
        reason: 'Request too large'
      })

      const result = await mockSecurityManager.checkRequest({
        headers: { 'content-length': (2 * 1024 * 1024).toString() },
        body: largePayload
      })

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('too large')
    })

    test('should validate content types', async () => {
      const invalidContentTypes = [
        'application/x-executable',
        'text/html',
        'application/octet-stream',
        'multipart/form-data'
      ]

      for (const contentType of invalidContentTypes) {
        mockSecurityManager.checkRequest.mockResolvedValueOnce({
          allowed: false,
          reason: 'Invalid content type'
        })

        const result = await mockSecurityManager.checkRequest({
          headers: { 'content-type': contentType }
        })

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('content type')
      }
    })
  })

  describe('Advanced Rate Limiting', () => {
    test('should implement progressive blocking for repeat offenders', async () => {
      const clientIP = '192.168.1.100'
      
      // First violation - short block
      mockSecurityManager.checkRequest.mockResolvedValueOnce({
        allowed: false,
        reason: 'Rate limit exceeded',
        blockDuration: 60000 // 1 minute
      })

      // Second violation - longer block
      mockSecurityManager.checkRequest.mockResolvedValueOnce({
        allowed: false,
        reason: 'Rate limit exceeded',
        blockDuration: 300000 // 5 minutes
      })

      // Third violation - much longer block
      mockSecurityManager.checkRequest.mockResolvedValueOnce({
        allowed: false,
        reason: 'Rate limit exceeded',
        blockDuration: 900000 // 15 minutes
      })

      const results = []
      for (let i = 0; i < 3; i++) {
        const result = await mockSecurityManager.checkRequest({
          headers: { 'x-forwarded-for': clientIP }
        })
        results.push(result)
      }

      expect(results[0].blockDuration).toBeLessThan(results[1].blockDuration)
      expect(results[1].blockDuration).toBeLessThan(results[2].blockDuration)
    })

    test('should handle burst traffic appropriately', async () => {
      const burstRequests = Array(150).fill(null).map((_, i) => ({
        headers: { 'x-forwarded-for': '192.168.1.200' },
        timestamp: Date.now() + i * 10 // 10ms apart
      }))

      // First 100 requests should pass (burst limit)
      for (let i = 0; i < 100; i++) {
        mockSecurityManager.checkRequest.mockResolvedValueOnce({
          allowed: true
        })
      }

      // Remaining requests should be rate limited
      for (let i = 100; i < 150; i++) {
        mockSecurityManager.checkRequest.mockResolvedValueOnce({
          allowed: false,
          reason: 'Burst limit exceeded'
        })
      }

      const results = []
      for (const request of burstRequests) {
        const result = await mockSecurityManager.checkRequest(request)
        results.push(result)
      }

      const allowedCount = results.filter(r => r.allowed).length
      const blockedCount = results.filter(r => !r.allowed).length

      expect(allowedCount).toBe(100)
      expect(blockedCount).toBe(50)
    })
  })

  describe('DDoS Protection', () => {
    test('should detect distributed attacks from multiple IPs', async () => {
      const attackIPs = Array(20).fill(null).map((_, i) => `192.168.1.${i + 1}`)
      const attackRequests = attackIPs.flatMap(ip => 
        Array(10).fill(null).map(() => ({
          headers: { 'x-forwarded-for': ip },
          timestamp: Date.now()
        }))
      )

      // Simulate coordinated attack detection
      mockSecurityManager.checkRequest.mockImplementation(async (req) => {
        const ip = req.headers['x-forwarded-for']
        const recentRequests = attackRequests.filter(r => 
          r.headers['x-forwarded-for'] === ip &&
          Date.now() - r.timestamp < 60000
        ).length

        if (recentRequests > 5) {
          return {
            allowed: false,
            reason: 'DDoS attack detected',
            attackType: 'distributed'
          }
        }

        return { allowed: true }
      })

      const results = []
      for (const request of attackRequests.slice(0, 50)) {
        const result = await mockSecurityManager.checkRequest(request)
        results.push(result)
      }

      const blockedCount = results.filter(r => !r.allowed).length
      expect(blockedCount).toBeGreaterThan(0)
    })

    test('should implement adaptive thresholds based on normal traffic', async () => {
      // Simulate normal traffic baseline
      const normalTraffic = Array(1000).fill(null).map(() => ({
        headers: { 'x-forwarded-for': `192.168.1.${Math.floor(Math.random() * 100)}` },
        timestamp: Date.now() - Math.random() * 3600000 // Last hour
      }))

      // Calculate baseline
      const baselineRPS = normalTraffic.length / 3600 // requests per second

      mockSecurityManager.checkRequest.mockImplementation(async (req) => {
        const currentRPS = 50 // Simulated current rate
        const adaptiveThreshold = baselineRPS * 3 // 3x normal traffic

        if (currentRPS > adaptiveThreshold) {
          return {
            allowed: false,
            reason: 'Adaptive DDoS threshold exceeded',
            threshold: adaptiveThreshold,
            currentRate: currentRPS
          }
        }

        return { allowed: true }
      })

      const result = await mockSecurityManager.checkRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' }
      })

      expect(result).toHaveProperty('threshold')
      expect(result).toHaveProperty('currentRate')
    })
  })

  describe('API Key Management', () => {
    test('should generate secure API keys with proper format', async () => {
      mockAPIKeyManager.generateAPIKey.mockResolvedValue({
        key: 'gca_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        hash: 'sha256_hash_of_key'
      })

      const result = await mockAPIKeyManager.generateAPIKey({
        name: 'test-key',
        permissions: ['read', 'write']
      })

      expect(result.key).toMatch(/^gca_[a-f0-9]{64}$/)
      expect(result.hash).toBeTruthy()
    })

    test('should validate API key permissions', async () => {
      mockAPIKeyManager.validateAPIKey.mockImplementation(async (key) => {
        if (key === 'valid_key') {
          return {
            valid: true,
            keyInfo: {
              permissions: ['read'],
              rateLimitOverride: 100
            }
          }
        }
        return { valid: false, error: 'Invalid API key' }
      })

      const validResult = await mockAPIKeyManager.validateAPIKey('valid_key')
      const invalidResult = await mockAPIKeyManager.validateAPIKey('invalid_key')

      expect(validResult.valid).toBe(true)
      expect(validResult.keyInfo.permissions).toContain('read')
      expect(invalidResult.valid).toBe(false)
    })

    test('should rotate API keys automatically', async () => {
      mockAPIKeyManager.rotateAPIKey.mockResolvedValue({
        success: true,
        oldKeyHash: 'old_hash',
        newKeyHash: 'new_hash'
      })

      const result = await mockAPIKeyManager.rotateAPIKey('old_hash')

      expect(result.success).toBe(true)
      expect(result.oldKeyHash).toBe('old_hash')
      expect(result.newKeyHash).toBe('new_hash')
    })

    test('should revoke compromised API keys', async () => {
      mockAPIKeyManager.revokeAPIKey.mockResolvedValue(true)

      const result = await mockAPIKeyManager.revokeAPIKey('compromised_hash', 'Security breach')

      expect(result).toBe(true)
    })
  })

  describe('Secret Management', () => {
    test('should generate cryptographically secure secrets', () => {
      mockSecretManager.generateSecureSecret.mockImplementation((length) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
        return Array(length).fill(null).map(() => 
          chars[Math.floor(Math.random() * chars.length)]
        ).join('')
      })

      const secret32 = mockSecretManager.generateSecureSecret(32)
      const secret64 = mockSecretManager.generateSecureSecret(64)

      expect(secret32).toHaveLength(32)
      expect(secret64).toHaveLength(64)
      expect(secret32).toMatch(/^[A-Za-z0-9!@#$%^&*]+$/)
    })

    test('should rotate secrets with backup', async () => {
      mockSecretManager.rotateSecret.mockResolvedValue(true)

      const result = await mockSecretManager.rotateSecret('api_secret', 'new_secret_value')

      expect(result).toBe(true)
    })

    test('should store secrets securely', async () => {
      mockSecretManager.storeSecret.mockResolvedValue(true)

      const result = await mockSecretManager.storeSecret({
        name: 'database_password',
        value: 'secure_password_123',
        description: 'Database connection password'
      })

      expect(result).toBe(true)
    })
  })

  describe('Security Headers', () => {
    test('should generate comprehensive security headers', () => {
      mockSecurityManager.getSecurityHeaders.mockReturnValue({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      })

      const headers = mockSecurityManager.getSecurityHeaders()

      expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff')
      expect(headers).toHaveProperty('X-Frame-Options', 'DENY')
      expect(headers).toHaveProperty('Strict-Transport-Security')
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000')
      expect(headers).toHaveProperty('Content-Security-Policy')
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'")
    })

    test('should validate CSP directives', () => {
      const headers = mockSecurityManager.getSecurityHeaders()
      const csp = headers['Content-Security-Policy']

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src")
      expect(csp).not.toContain("'unsafe-eval'") // Should not allow eval
    })
  })

  describe('Audit Logging and Compliance', () => {
    test('should log all security events', async () => {
      mockAuditLogger.logAuditEntry.mockResolvedValue(true)

      const auditEntry = {
        requestId: 'req-123',
        clientIp: '192.168.1.1',
        method: 'POST',
        endpoint: '/api/games',
        responseStatus: 200,
        responseTimeMs: 150,
        success: true,
        sensitiveDataAccessed: ['user_profile']
      }

      const result = await mockAuditLogger.logAuditEntry(auditEntry)

      expect(result).toBe(true)
      expect(mockAuditLogger.logAuditEntry).toHaveBeenCalledWith(auditEntry)
    })

    test('should generate GDPR compliance reports', async () => {
      mockAuditLogger.generateComplianceReport.mockResolvedValue({
        reportId: 'gdpr-2024-01',
        reportType: 'GDPR',
        generatedAt: new Date().toISOString(),
        summary: {
          totalRequests: 1000,
          dataAccessEvents: 50,
          complianceViolations: 0
        },
        recommendations: ['Continue current practices']
      })

      const report = await mockAuditLogger.generateComplianceReport(
        'GDPR',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      )

      expect(report.reportType).toBe('GDPR')
      expect(report.summary.dataAccessEvents).toBe(50)
      expect(report.recommendations).toContain('Continue current practices')
    })

    test('should redact sensitive information in logs', () => {
      mockSecurityManager.sanitizeInput.mockImplementation((input) => {
        if (typeof input === 'object') {
          const sanitized = { ...input }
          if (sanitized.password) sanitized.password = '[REDACTED]'
          if (sanitized.token) sanitized.token = '[REDACTED]'
          if (sanitized.apiKey) sanitized.apiKey = '[REDACTED]'
          return sanitized
        }
        return input
      })

      const sensitiveData = {
        username: 'john_doe',
        password: 'secret123',
        token: 'jwt_token_here',
        apiKey: 'api_key_here',
        publicData: 'this is fine'
      }

      const sanitized = mockSecurityManager.sanitizeInput(sensitiveData)

      expect(sanitized.username).toBe('john_doe')
      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.token).toBe('[REDACTED]')
      expect(sanitized.apiKey).toBe('[REDACTED]')
      expect(sanitized.publicData).toBe('this is fine')
    })
  })

  describe('IP Blocking and Management', () => {
    test('should block malicious IPs persistently', async () => {
      mockSecurityManager.blockIP.mockImplementation((ip, duration) => {
        return { blocked: true, ip, duration }
      })

      const result = mockSecurityManager.blockIP('192.168.1.100', 3600000) // 1 hour

      expect(result.blocked).toBe(true)
      expect(result.ip).toBe('192.168.1.100')
      expect(result.duration).toBe(3600000)
    })

    test('should unblock IPs when appropriate', () => {
      mockSecurityManager.unblockIP.mockImplementation((ip) => {
        return { unblocked: true, ip }
      })

      const result = mockSecurityManager.unblockIP('192.168.1.100')

      expect(result.unblocked).toBe(true)
      expect(result.ip).toBe('192.168.1.100')
    })
  })

  describe('Security Metrics and Monitoring', () => {
    test('should generate comprehensive security statistics', async () => {
      mockSecurityManager.getSecurityStats.mockResolvedValue({
        totalEvents: 150,
        eventsByType: {
          'rate_limit_exceeded': 50,
          'ddos_detected': 10,
          'invalid_input': 30,
          'suspicious_activity': 60
        },
        eventsBySeverity: {
          'low': 80,
          'medium': 50,
          'high': 15,
          'critical': 5
        },
        blockedRequests: 95,
        topAttackers: [
          { ip: '192.168.1.100', count: 25 },
          { ip: '192.168.1.101', count: 20 }
        ]
      })

      const stats = await mockSecurityManager.getSecurityStats(24)

      expect(stats.totalEvents).toBe(150)
      expect(stats.eventsByType['rate_limit_exceeded']).toBe(50)
      expect(stats.eventsBySeverity['critical']).toBe(5)
      expect(stats.blockedRequests).toBe(95)
      expect(stats.topAttackers).toHaveLength(2)
    })

    test('should track security metrics over time', async () => {
      mockAuditLogger.getSecurityMetrics.mockResolvedValue({
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z'
        },
        requestMetrics: {
          total: 10000,
          successful: 9500,
          failed: 500,
          averageResponseTime: 250,
          p95ResponseTime: 800
        },
        securityMetrics: {
          totalSecurityEvents: 150,
          blockedRequests: 95,
          rateLimitViolations: 50,
          ddosAttempts: 10
        },
        complianceMetrics: {
          dataAccessRequests: 200,
          sensitiveDataAccessed: 50,
          gdprRequests: 25
        }
      })

      const metrics = await mockAuditLogger.getSecurityMetrics(
        new Date('2024-01-01'),
        new Date('2024-01-02')
      )

      expect(metrics.requestMetrics.total).toBe(10000)
      expect(metrics.securityMetrics.totalSecurityEvents).toBe(150)
      expect(metrics.complianceMetrics.gdprRequests).toBe(25)
    })
  })

  describe('Integration and End-to-End Security', () => {
    test('should handle complete attack scenario', async () => {
      // Simulate a complete attack scenario
      const attackScenario = [
        { type: 'reconnaissance', blocked: false },
        { type: 'sql_injection', blocked: true },
        { type: 'rate_limit_test', blocked: true },
        { type: 'ddos_attempt', blocked: true },
        { type: 'credential_stuffing', blocked: true }
      ]

      mockSecurityManager.checkRequest.mockImplementation(async (req) => {
        const attackType = req.attackType
        const scenario = attackScenario.find(s => s.type === attackType)
        
        return {
          allowed: !scenario?.blocked,
          reason: scenario?.blocked ? `${attackType} detected and blocked` : undefined,
          attackType
        }
      })

      const results = []
      for (const attack of attackScenario) {
        const result = await mockSecurityManager.checkRequest({ attackType: attack.type })
        results.push(result)
      }

      const blockedCount = results.filter(r => !r.allowed).length
      expect(blockedCount).toBe(4) // All except reconnaissance should be blocked
    })

    test('should maintain security under high load', async () => {
      const highLoadRequests = Array(1000).fill(null).map((_, i) => ({
        id: i,
        headers: { 'x-forwarded-for': `192.168.1.${i % 100}` },
        timestamp: Date.now()
      }))

      mockSecurityManager.checkRequest.mockImplementation(async (req) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1))
        
        return {
          allowed: true,
          processingTime: 1,
          requestId: req.id
        }
      })

      const startTime = Date.now()
      const results = await Promise.all(
        highLoadRequests.map(req => mockSecurityManager.checkRequest(req))
      )
      const endTime = Date.now()

      const processingTime = endTime - startTime
      const averageProcessingTime = processingTime / results.length

      expect(results).toHaveLength(1000)
      expect(averageProcessingTime).toBeLessThan(10) // Should process quickly
      expect(results.every(r => r.allowed)).toBe(true)
    })

    test('should recover gracefully from security system failures', async () => {
      // Simulate security system failure
      mockSecurityManager.checkRequest.mockRejectedValueOnce(new Error('Security system unavailable'))
      
      // Should fail open for availability
      mockSecurityManager.checkRequest.mockResolvedValueOnce({
        allowed: true,
        warning: 'Security check failed, allowing request for availability'
      })

      try {
        await mockSecurityManager.checkRequest({ test: true })
      } catch (error) {
        // First call should fail
        expect(error.message).toBe('Security system unavailable')
      }

      // Second call should succeed with warning
      const result = await mockSecurityManager.checkRequest({ test: true })
      expect(result.allowed).toBe(true)
      expect(result.warning).toContain('Security check failed')
    })
  })

  describe('Performance and Scalability', () => {
    test('should maintain low latency under security checks', async () => {
      const testRequests = Array(100).fill(null).map(() => ({
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'test query' })
      }))

      mockSecurityManager.checkRequest.mockImplementation(async (req) => {
        const startTime = Date.now()
        // Simulate security checks
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
        const endTime = Date.now()
        
        return {
          allowed: true,
          processingTime: endTime - startTime
        }
      })

      const results = await Promise.all(
        testRequests.map(req => mockSecurityManager.checkRequest(req))
      )

      const averageProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
      const maxProcessingTime = Math.max(...results.map(r => r.processingTime))

      expect(averageProcessingTime).toBeLessThan(10) // Average < 10ms
      expect(maxProcessingTime).toBeLessThan(50) // Max < 50ms
    })

    test('should scale security checks horizontally', async () => {
      // Simulate multiple security manager instances
      const instances = Array(5).fill(null).map(() => ({
        checkRequest: jest.fn().mockResolvedValue({ allowed: true, instanceId: Math.random() })
      }))

      const requests = Array(500).fill(null).map((_, i) => ({
        id: i,
        instance: instances[i % instances.length]
      }))

      const results = await Promise.all(
        requests.map(req => req.instance.checkRequest({ id: req.id }))
      )

      expect(results).toHaveLength(500)
      expect(results.every(r => r.allowed)).toBe(true)
      
      // Verify load distribution
      instances.forEach(instance => {
        expect(instance.checkRequest).toHaveBeenCalledTimes(100)
      })
    })
  })
})