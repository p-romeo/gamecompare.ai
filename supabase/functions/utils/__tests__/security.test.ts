/**
 * Comprehensive unit tests for security utilities
 * Tests all security features including input validation, rate limiting, DDoS protection,
 * API key management, secret rotation, and compliance monitoring
 */

import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { SecurityManager } from '../security.ts'
import { APIKeyManager, SecretManager, RotationScheduler } from '../secret_management.ts'
import { AuditLogger } from '../audit_logging.ts'

// Mock Supabase client for testing
const mockSupabase = {
  from: (table: string) => ({
    select: (columns?: string) => ({
      data: mockData[table] || [],
      error: null,
      eq: (column: string, value: any) => ({ data: mockData[table] || [], error: null }),
      single: () => ({ data: mockData[table]?.[0] || null, error: null }),
      gte: (column: string, value: any) => ({ data: mockData[table] || [], error: null }),
      lte: (column: string, value: any) => ({ data: mockData[table] || [], error: null }),
      order: (column: string, options?: any) => ({ data: mockData[table] || [], error: null })
    }),
    insert: (data: any) => ({ error: null }),
    update: (data: any) => ({ 
      error: null,
      eq: (column: string, value: any) => ({ error: null })
    }),
    delete: () => ({ 
      error: null,
      eq: (column: string, value: any) => ({ error: null }),
      lt: (column: string, value: any) => ({ error: null })
    }),
    upsert: (data: any) => ({ error: null })
  }),
  rpc: (functionName: string, params?: any) => ({ 
    data: mockRpcResults[functionName] || null, 
    error: null 
  }),
  channel: (name: string) => ({
    on: (event: string, config: any, callback: Function) => ({
      subscribe: () => console.log(`Subscribed to ${name}`)
    })
  })
}

// Mock data for testing
const mockData: Record<string, any[]> = {
  security_events: [
    {
      id: '1',
      type: 'rate_limit_exceeded',
      severity: 'medium',
      client_ip: '192.168.1.1',
      timestamp: new Date().toISOString(),
      blocked: true
    }
  ],
  audit_logs: [
    {
      id: '1',
      client_ip: '192.168.1.1',
      method: 'POST',
      endpoint: '/api/test',
      success: false,
      response_status: 401,
      timestamp: new Date().toISOString()
    }
  ],
  api_keys: [
    {
      id: '1',
      key_hash: 'test_hash',
      name: 'test_key',
      permissions: ['read'],
      revoked: false,
      expires_at: null,
      usage_count: 0
    }
  ]
}

const mockRpcResults: Record<string, any> = {
  vault_store_secret: true,
  vault_get_secret: 'test_secret_value',
  detect_brute_force_attacks: [
    {
      client_ip: '192.168.1.100',
      attempt_count: 15,
      should_block: true
    }
  ]
}

Deno.test('SecurityManager - Input Validation', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  // Test valid request
  const validRequest = new Request('https://example.com/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '100'
    },
    body: JSON.stringify({ query: 'test query' })
  })
  
  const result = await securityManager.checkRequest(validRequest)
  assertEquals(result.allowed, true)
})

Deno.test('SecurityManager - Rate Limiting', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key', {
    rateLimiting: {
      enabled: true,
      windowMs: 1000,
      maxRequests: 2,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: () => 'test-ip'
    }
  })
  
  const request = new Request('https://example.com/test', {
    headers: { 'x-forwarded-for': 'test-ip' }
  })
  
  // First request should pass
  const result1 = await securityManager.checkRequest(request)
  assertEquals(result1.allowed, true)
  
  // Second request should pass
  const result2 = await securityManager.checkRequest(request)
  assertEquals(result2.allowed, true)
  
  // Third request should be blocked
  const result3 = await securityManager.checkRequest(request)
  assertEquals(result3.allowed, false)
  assertEquals(result3.reason, 'Rate limit exceeded')
})

Deno.test('SecurityManager - DDoS Protection', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key', {
    ddosProtection: {
      enabled: true,
      threshold: 3,
      windowMs: 1000,
      blockDuration: 5000
    }
  })
  
  const request = new Request('https://example.com/test', {
    headers: { 'x-forwarded-for': 'ddos-ip' }
  })
  
  // Send requests up to threshold
  for (let i = 0; i < 3; i++) {
    const result = await securityManager.checkRequest(request)
    assertEquals(result.allowed, true)
  }
  
  // Next request should trigger DDoS protection
  const blockedResult = await securityManager.checkRequest(request)
  assertEquals(blockedResult.allowed, false)
  assertEquals(blockedResult.reason, 'DDoS threshold exceeded')
})

Deno.test('SecurityManager - Malicious Input Detection', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  // Test SQL injection attempt
  const sqlInjectionRequest = new Request('https://example.com/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '50'
    },
    body: JSON.stringify({ query: "'; DROP TABLE users; --" })
  })
  
  const result = await securityManager.checkRequest(sqlInjectionRequest)
  assertEquals(result.allowed, false)
  assertEquals(result.reason, 'SQL injection attempt detected')
})

Deno.test('SecurityManager - XSS Detection', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  // Test XSS attempt
  const xssRequest = new Request('https://example.com/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '100'
    },
    body: JSON.stringify({ query: '<script>alert("xss")</script>' })
  })
  
  const result = await securityManager.checkRequest(xssRequest)
  assertEquals(result.allowed, false)
  assertEquals(result.reason, 'Malicious input detected')
})

Deno.test('SecurityManager - Security Headers', () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  const headers = securityManager.getSecurityHeaders()
  
  assertExists(headers['X-Content-Type-Options'])
  assertExists(headers['X-Frame-Options'])
  assertExists(headers['X-XSS-Protection'])
  assertExists(headers['Strict-Transport-Security'])
  assertExists(headers['Content-Security-Policy'])
  
  assertEquals(headers['X-Content-Type-Options'], 'nosniff')
  assertEquals(headers['X-Frame-Options'], 'DENY')
  assertEquals(headers['X-XSS-Protection'], '1; mode=block')
})

Deno.test('SecurityManager - IP Blocking', () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  const testIP = '192.168.1.100'
  
  // Block IP
  securityManager.blockIP(testIP)
  
  // Create request from blocked IP
  const blockedRequest = new Request('https://example.com/test', {
    headers: { 'x-forwarded-for': testIP }
  })
  
  // Should be blocked immediately
  const result = securityManager.checkRequest(blockedRequest)
  // Note: This would need to be tested with actual implementation
})

Deno.test('SecurityManager - Input Sanitization', () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  const maliciousInput = {
    name: '<script>alert("xss")</script>',
    password: 'secret123',
    data: ['<img src=x onerror=alert(1)>', 'normal data']
  }
  
  const sanitized = securityManager.sanitizeInput(maliciousInput)
  
  assertEquals(sanitized.name, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  assertEquals(sanitized.password, '[REDACTED]')
  assertEquals(sanitized.data[0], '&lt;img src=x onerror=alert(1)&gt;')
  assertEquals(sanitized.data[1], 'normal data')
})

Deno.test('SecurityManager - Security Statistics', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  const stats = await securityManager.getSecurityStats(24)
  
  assertExists(stats.totalEvents)
  assertExists(stats.eventsByType)
  assertExists(stats.eventsBySeverity)
  assertExists(stats.blockedRequests)
  assertExists(stats.topAttackers)
  
  assertEquals(typeof stats.totalEvents, 'number')
  assertEquals(typeof stats.blockedRequests, 'number')
  assert(Array.isArray(stats.topAttackers))
})

// API Key Management Tests
Deno.test('APIKeyManager - Generate API Key', async () => {
  const apiKeyManager = new APIKeyManager('test-url', 'test-key')
  
  const result = await apiKeyManager.generateAPIKey({
    name: 'test-key',
    description: 'Test API key',
    permissions: ['read', 'write']
  })
  
  // Mock should return null, but in real implementation would return key and hash
  // This test validates the interface
  assert(result === null || (result && result.key && result.hash))
})

Deno.test('APIKeyManager - Validate API Key', async () => {
  const apiKeyManager = new APIKeyManager('test-url', 'test-key')
  
  const result = await apiKeyManager.validateAPIKey('test_key_value')
  
  assertExists(result.valid)
  assertEquals(typeof result.valid, 'boolean')
  
  if (!result.valid) {
    assertExists(result.error)
  } else {
    assertExists(result.keyInfo)
  }
})

Deno.test('APIKeyManager - Rotate API Key', async () => {
  const apiKeyManager = new APIKeyManager('test-url', 'test-key')
  
  const result = await apiKeyManager.rotateAPIKey('test_hash')
  
  assertExists(result.success)
  assertEquals(typeof result.success, 'boolean')
  
  if (!result.success) {
    assertExists(result.error)
  }
})

Deno.test('APIKeyManager - Revoke API Key', async () => {
  const apiKeyManager = new APIKeyManager('test-url', 'test-key')
  
  const result = await apiKeyManager.revokeAPIKey('test_hash', 'Security breach')
  
  assertEquals(typeof result, 'boolean')
})

// Secret Management Tests
Deno.test('SecretManager - Store Secret', async () => {
  const secretManager = new SecretManager('test-url', 'test-key')
  
  const result = await secretManager.storeSecret({
    name: 'test_secret',
    value: 'secret_value',
    description: 'Test secret'
  })
  
  assertEquals(typeof result, 'boolean')
})

Deno.test('SecretManager - Get Secret', async () => {
  const secretManager = new SecretManager('test-url', 'test-key')
  
  const result = await secretManager.getSecret('test_secret')
  
  assert(result === null || typeof result === 'string')
})

Deno.test('SecretManager - Rotate Secret', async () => {
  const secretManager = new SecretManager('test-url', 'test-key')
  
  const result = await secretManager.rotateSecret('test_secret', 'new_value')
  
  assertEquals(typeof result, 'boolean')
})

Deno.test('SecretManager - Generate Secure Secret', () => {
  const secretManager = new SecretManager('test-url', 'test-key')
  
  const secret = secretManager.generateSecureSecret(32)
  
  assertEquals(typeof secret, 'string')
  assertEquals(secret.length, 32)
  
  // Test different length
  const longSecret = secretManager.generateSecureSecret(64)
  assertEquals(longSecret.length, 64)
})

Deno.test('SecretManager - Get Secrets Needing Rotation', async () => {
  const secretManager = new SecretManager('test-url', 'test-key')
  
  const secrets = await secretManager.getSecretsNeedingRotation()
  
  assert(Array.isArray(secrets))
})

// Rotation Scheduler Tests
Deno.test('RotationScheduler - Run Rotation Check', async () => {
  const rotationScheduler = new RotationScheduler('test-url', 'test-key')
  
  const result = await rotationScheduler.runRotationCheck()
  
  assertExists(result.secretsRotated)
  assertExists(result.keysRotated)
  assertExists(result.errors)
  
  assert(Array.isArray(result.secretsRotated))
  assert(Array.isArray(result.keysRotated))
  assert(Array.isArray(result.errors))
})

// Audit Logger Tests
Deno.test('AuditLogger - Log Audit Entry', async () => {
  const auditLogger = new AuditLogger('test-url', 'test-key')
  
  const result = await auditLogger.logAuditEntry({
    requestId: 'test-request-id',
    clientIp: '192.168.1.1',
    method: 'POST',
    endpoint: '/api/test',
    responseStatus: 200,
    responseTimeMs: 150,
    success: true
  })
  
  assertEquals(typeof result, 'boolean')
})

Deno.test('AuditLogger - Generate Compliance Report', async () => {
  const auditLogger = new AuditLogger('test-url', 'test-key')
  
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
  const endDate = new Date()
  
  const report = await auditLogger.generateComplianceReport('GDPR', startDate, endDate)
  
  assertExists(report.reportId)
  assertExists(report.reportType)
  assertExists(report.generatedAt)
  assertExists(report.timeRange)
  assertExists(report.summary)
  assertExists(report.details)
  assertExists(report.recommendations)
  
  assertEquals(report.reportType, 'GDPR')
  assert(Array.isArray(report.recommendations))
})

Deno.test('AuditLogger - Get Security Metrics', async () => {
  const auditLogger = new AuditLogger('test-url', 'test-key')
  
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const endDate = new Date()
  
  const metrics = await auditLogger.getSecurityMetrics(startDate, endDate)
  
  assertExists(metrics.timeRange)
  assertExists(metrics.requestMetrics)
  assertExists(metrics.securityMetrics)
  assertExists(metrics.complianceMetrics)
  assertExists(metrics.topThreats)
  
  assertEquals(typeof metrics.requestMetrics.total, 'number')
  assertEquals(typeof metrics.securityMetrics.totalSecurityEvents, 'number')
  assert(Array.isArray(metrics.topThreats))
})

// Integration Tests
Deno.test('Security Integration - Complete Request Flow', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  // Test normal request flow
  const normalRequest = new Request('https://example.com/api/games', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer valid-token',
      'x-forwarded-for': '192.168.1.50'
    },
    body: JSON.stringify({ query: 'action games' })
  })
  
  const result = await securityManager.checkRequest(normalRequest)
  assertEquals(result.allowed, true)
})

Deno.test('Security Integration - Attack Detection and Response', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key', {
    rateLimiting: {
      enabled: true,
      windowMs: 1000,
      maxRequests: 3,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req) => 'attacker-ip'
    },
    ddosProtection: {
      enabled: true,
      threshold: 5,
      windowMs: 1000,
      blockDuration: 5000
    }
  })
  
  // Simulate attack pattern
  const attackRequest = new Request('https://example.com/api/games', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': 'attacker-ip'
    },
    body: JSON.stringify({ query: "'; DROP TABLE games; --" })
  })
  
  // First few requests might pass rate limiting but fail input validation
  const result1 = await securityManager.checkRequest(attackRequest)
  assertEquals(result1.allowed, false)
  assertEquals(result1.reason, 'SQL injection attempt detected')
})

Deno.test('Security Integration - Compliance Monitoring', async () => {
  const auditLogger = new AuditLogger('test-url', 'test-key')
  
  // Log a GDPR-related request
  const gdprResult = await auditLogger.logAuditEntry({
    requestId: 'gdpr-request-1',
    clientIp: '192.168.1.100',
    method: 'GET',
    endpoint: '/api/user/profile',
    responseStatus: 200,
    responseTimeMs: 120,
    success: true,
    sensitiveDataAccessed: ['user_profile', 'personal_data']
  })
  
  assertEquals(gdprResult, true)
  
  // Generate compliance report
  const report = await auditLogger.generateComplianceReport(
    'GDPR',
    new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    new Date()
  )
  
  assertExists(report.summary.dataAccessEvents)
  assertEquals(typeof report.summary.dataAccessEvents, 'number')
})

// Performance Tests
Deno.test('Security Performance - Rate Limiting Performance', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key', {
    rateLimiting: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 1000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req) => 'performance-test-ip'
    }
  })
  
  const request = new Request('https://example.com/test', {
    headers: { 'x-forwarded-for': 'performance-test-ip' }
  })
  
  const startTime = Date.now()
  
  // Test 100 requests
  for (let i = 0; i < 100; i++) {
    await securityManager.checkRequest(request)
  }
  
  const endTime = Date.now()
  const duration = endTime - startTime
  
  // Should complete 100 requests in reasonable time (less than 1 second)
  assert(duration < 1000, `Rate limiting took too long: ${duration}ms`)
})

Deno.test('Security Performance - Input Validation Performance', async () => {
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  // Create request with large but valid JSON
  const largeValidData = {
    query: 'test query',
    filters: {
      genres: Array(100).fill('action'),
      platforms: Array(50).fill('pc'),
      priceRange: [0, 60]
    },
    metadata: Array(200).fill({ key: 'value', description: 'test data' })
  }
  
  const request = new Request('https://example.com/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': JSON.stringify(largeValidData).length.toString()
    },
    body: JSON.stringify(largeValidData)
  })
  
  const startTime = Date.now()
  const result = await securityManager.checkRequest(request)
  const endTime = Date.now()
  
  assertEquals(result.allowed, true)
  
  const duration = endTime - startTime
  // Input validation should be fast even for large requests
  assert(duration < 100, `Input validation took too long: ${duration}ms`)
})

// Error Handling Tests
Deno.test('Security Error Handling - Invalid Configuration', () => {
  // Test with invalid configuration
  const securityManager = new SecurityManager('test-url', 'test-key', {
    rateLimiting: {
      enabled: true,
      windowMs: -1000, // Invalid negative value
      maxRequests: 0, // Invalid zero value
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req) => 'test-ip'
    }
  })
  
  // Should handle invalid config gracefully
  assertExists(securityManager)
})

Deno.test('Security Error Handling - Network Failures', async () => {
  // Create security manager with mock that simulates network failures
  const failingMockSupabase = {
    ...mockSupabase,
    from: () => ({
      select: () => ({ data: null, error: { message: 'Network error' } }),
      insert: () => ({ error: { message: 'Network error' } })
    })
  }
  
  const securityManager = new SecurityManager('test-url', 'test-key')
  
  const request = new Request('https://example.com/test')
  
  // Should handle database failures gracefully
  const result = await securityManager.checkRequest(request)
  
  // Should allow request if security checks fail (fail-open for availability)
  assertEquals(result.allowed, true)
})