/**
 * Security Audit Logging and Compliance Monitoring
 * Comprehensive logging, monitoring, and compliance reporting for security events
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AuditLogEntry {
  requestId: string
  clientIp: string
  userAgent?: string
  method: string
  endpoint: string
  queryParams?: Record<string, any>
  requestHeaders?: Record<string, any>
  requestBody?: any
  responseStatus: number
  responseTimeMs: number
  userId?: string
  sessionId?: string
  success: boolean
  errorMessage?: string
  sensitiveDataAccessed?: string[]
  complianceFlags?: string[]
}

interface ComplianceReport {
  reportId: string
  reportType: 'GDPR' | 'SOC2' | 'PCI_DSS' | 'HIPAA' | 'CUSTOM'
  generatedAt: string
  timeRange: {
    start: string
    end: string
  }
  summary: {
    totalRequests: number
    failedRequests: number
    securityEvents: number
    dataAccessEvents: number
    complianceViolations: number
  }
  details: {
    topEndpoints: Array<{ endpoint: string; count: number }>
    errorsByType: Record<string, number>
    securityEventsByType: Record<string, number>
    dataAccessByType: Record<string, number>
    complianceViolations: Array<{
      type: string
      count: number
      severity: string
      description: string
    }>
  }
  recommendations: string[]
}

interface SecurityMetrics {
  timeRange: {
    start: string
    end: string
  }
  requestMetrics: {
    total: number
    successful: number
    failed: number
    averageResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
  }
  securityMetrics: {
    totalSecurityEvents: number
    blockedRequests: number
    rateLimitViolations: number
    ddosAttempts: number
    maliciousInputDetected: number
    suspiciousActivityDetected: number
  }
  complianceMetrics: {
    dataAccessRequests: number
    sensitiveDataAccessed: number
    gdprRequests: number
    dataRetentionViolations: number
  }
  topThreats: Array<{
    type: string
    count: number
    severity: string
    lastOccurrence: string
  }>
}

/**
 * Comprehensive Audit Logger
 */
export class AuditLogger {
  private supabase: any
  private sensitiveFields = [
    'password', 'token', 'key', 'secret', 'auth', 'authorization',
    'cookie', 'session', 'jwt', 'api_key', 'access_token', 'refresh_token',
    'ssn', 'social_security', 'credit_card', 'card_number', 'cvv', 'pin'
  ]

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Log comprehensive audit entry
   */
  async logAuditEntry(entry: AuditLogEntry): Promise<boolean> {
    try {
      // Sanitize sensitive data
      const sanitizedEntry = this.sanitizeAuditEntry(entry)
      
      // Detect compliance flags
      const complianceFlags = this.detectComplianceFlags(sanitizedEntry)
      
      // Store audit log
      const { error } = await this.supabase
        .from('audit_logs')
        .insert({
          request_id: sanitizedEntry.requestId,
          client_ip: sanitizedEntry.clientIp,
          user_agent: sanitizedEntry.userAgent,
          method: sanitizedEntry.method,
          endpoint: sanitizedEntry.endpoint,
          query_params: sanitizedEntry.queryParams || {},
          request_headers: sanitizedEntry.requestHeaders || {},
          request_body: sanitizedEntry.requestBody,
          response_status: sanitizedEntry.responseStatus,
          response_time_ms: sanitizedEntry.responseTimeMs,
          user_id: sanitizedEntry.userId,
          session_id: sanitizedEntry.sessionId,
          success: sanitizedEntry.success,
          error_message: sanitizedEntry.errorMessage
        })

      if (error) {
        console.error('Failed to store audit log:', error)
        return false
      }

      // Log compliance events if detected
      if (complianceFlags.length > 0) {
        await this.logComplianceEvent({
          type: 'data_access',
          flags: complianceFlags,
          auditEntry: sanitizedEntry
        })
      }

      // Check for security violations
      await this.checkSecurityViolations(sanitizedEntry)

      return true
    } catch (error) {
      console.error('Error logging audit entry:', error)
      return false
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    reportType: ComplianceReport['reportType'],
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const reportId = crypto.randomUUID()
    const timeRange = {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    }

    try {
      // Get audit logs for time range
      const { data: auditLogs } = await this.supabase
        .from('audit_logs')
        .select('*')
        .gte('timestamp', timeRange.start)
        .lte('timestamp', timeRange.end)

      // Get security events for time range
      const { data: securityEvents } = await this.supabase
        .from('security_events')
        .select('*')
        .gte('timestamp', timeRange.start)
        .lte('timestamp', timeRange.end)

      // Calculate summary metrics
      const summary = {
        totalRequests: auditLogs?.length || 0,
        failedRequests: auditLogs?.filter(log => !log.success).length || 0,
        securityEvents: securityEvents?.length || 0,
        dataAccessEvents: auditLogs?.filter(log => 
          this.isDataAccessEndpoint(log.endpoint)
        ).length || 0,
        complianceViolations: this.countComplianceViolations(auditLogs || [], securityEvents || [])
      }

      // Calculate detailed metrics
      const details = {
        topEndpoints: this.getTopEndpoints(auditLogs || []),
        errorsByType: this.getErrorsByType(auditLogs || []),
        securityEventsByType: this.getSecurityEventsByType(securityEvents || []),
        dataAccessByType: this.getDataAccessByType(auditLogs || []),
        complianceViolations: this.getComplianceViolations(auditLogs || [], securityEvents || [])
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(summary, details, reportType)

      const report: ComplianceReport = {
        reportId,
        reportType,
        generatedAt: new Date().toISOString(),
        timeRange,
        summary,
        details,
        recommendations
      }

      // Store report
      await this.storeComplianceReport(report)

      return report
    } catch (error) {
      console.error('Error generating compliance report:', error)
      throw error
    }
  }

  /**
   * Get security metrics for dashboard
   */
  async getSecurityMetrics(startDate: Date, endDate: Date): Promise<SecurityMetrics> {
    const timeRange = {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    }

    try {
      // Get audit logs
      const { data: auditLogs } = await this.supabase
        .from('audit_logs')
        .select('*')
        .gte('timestamp', timeRange.start)
        .lte('timestamp', timeRange.end)

      // Get security events
      const { data: securityEvents } = await this.supabase
        .from('security_events')
        .select('*')
        .gte('timestamp', timeRange.start)
        .lte('timestamp', timeRange.end)

      // Calculate request metrics
      const responseTimes = auditLogs?.map(log => log.response_time_ms).filter(Boolean) || []
      responseTimes.sort((a, b) => a - b)
      
      const requestMetrics = {
        total: auditLogs?.length || 0,
        successful: auditLogs?.filter(log => log.success).length || 0,
        failed: auditLogs?.filter(log => !log.success).length || 0,
        averageResponseTime: responseTimes.length > 0 
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0,
        p95ResponseTime: responseTimes.length > 0 
          ? responseTimes[Math.floor(responseTimes.length * 0.95)]
          : 0,
        p99ResponseTime: responseTimes.length > 0 
          ? responseTimes[Math.floor(responseTimes.length * 0.99)]
          : 0
      }

      // Calculate security metrics
      const securityMetrics = {
        totalSecurityEvents: securityEvents?.length || 0,
        blockedRequests: securityEvents?.filter(event => event.blocked).length || 0,
        rateLimitViolations: securityEvents?.filter(event => event.type === 'rate_limit_exceeded').length || 0,
        ddosAttempts: securityEvents?.filter(event => event.type === 'ddos_detected').length || 0,
        maliciousInputDetected: securityEvents?.filter(event => event.type === 'invalid_input').length || 0,
        suspiciousActivityDetected: securityEvents?.filter(event => event.type === 'suspicious_activity').length || 0
      }

      // Calculate compliance metrics
      const complianceMetrics = {
        dataAccessRequests: auditLogs?.filter(log => this.isDataAccessEndpoint(log.endpoint)).length || 0,
        sensitiveDataAccessed: auditLogs?.filter(log => this.containsSensitiveData(log)).length || 0,
        gdprRequests: auditLogs?.filter(log => this.isGDPRRelatedEndpoint(log.endpoint)).length || 0,
        dataRetentionViolations: 0 // Would need additional logic to detect
      }

      // Get top threats
      const topThreats = this.getTopThreats(securityEvents || [])

      return {
        timeRange,
        requestMetrics,
        securityMetrics,
        complianceMetrics,
        topThreats
      }
    } catch (error) {
      console.error('Error getting security metrics:', error)
      throw error
    }
  }

  /**
   * Monitor real-time security events
   */
  async monitorSecurityEvents(): Promise<void> {
    try {
      // Set up real-time subscription for security events
      const subscription = this.supabase
        .channel('security_events')
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'security_events' 
          }, 
          (payload: any) => {
            this.handleRealTimeSecurityEvent(payload.new)
          }
        )
        .subscribe()

      console.log('Security event monitoring started')
    } catch (error) {
      console.error('Error setting up security monitoring:', error)
    }
  }

  /**
   * Handle real-time security event
   */
  private async handleRealTimeSecurityEvent(event: any): Promise<void> {
    try {
      // Check if immediate action is needed
      if (event.severity === 'critical' || event.blocked) {
        await this.triggerSecurityAlert(event)
      }

      // Update security metrics
      await this.updateSecurityMetrics(event)

      // Check for patterns that might indicate coordinated attacks
      await this.checkAttackPatterns(event)

    } catch (error) {
      console.error('Error handling real-time security event:', error)
    }
  }

  /**
   * Sanitize audit entry to remove sensitive data
   */
  private sanitizeAuditEntry(entry: AuditLogEntry): AuditLogEntry {
    const sanitized = { ...entry }

    // Sanitize request headers
    if (sanitized.requestHeaders) {
      sanitized.requestHeaders = this.sanitizeObject(sanitized.requestHeaders)
    }

    // Sanitize request body
    if (sanitized.requestBody) {
      sanitized.requestBody = this.sanitizeObject(sanitized.requestBody)
    }

    // Sanitize query params
    if (sanitized.queryParams) {
      sanitized.queryParams = this.sanitizeObject(sanitized.queryParams)
    }

    return sanitized
  }

  /**
   * Sanitize object by removing/masking sensitive fields
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }

    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      
      if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Detect compliance flags for audit entry
   */
  private detectComplianceFlags(entry: AuditLogEntry): string[] {
    const flags: string[] = []

    // GDPR flags
    if (this.isGDPRRelatedEndpoint(entry.endpoint)) {
      flags.push('GDPR_DATA_ACCESS')
    }

    // PCI DSS flags
    if (this.isPCIRelatedEndpoint(entry.endpoint)) {
      flags.push('PCI_DSS_PAYMENT_DATA')
    }

    // SOC2 flags
    if (entry.sensitiveDataAccessed && entry.sensitiveDataAccessed.length > 0) {
      flags.push('SOC2_SENSITIVE_DATA')
    }

    return flags
  }

  /**
   * Check for security violations in audit entry
   */
  private async checkSecurityViolations(entry: AuditLogEntry): Promise<void> {
    // Check for suspicious patterns
    if (entry.responseStatus >= 400 && entry.responseStatus < 500) {
      // Multiple 4xx errors from same IP might indicate scanning
      const recentErrors = await this.getRecentErrorsFromIP(entry.clientIp, 5 * 60 * 1000) // 5 minutes
      
      if (recentErrors >= 10) {
        await this.logSecurityEvent({
          type: 'suspicious_activity',
          severity: 'medium',
          clientIp: entry.clientIp,
          endpoint: entry.endpoint,
          details: {
            reason: 'Multiple 4xx errors detected',
            error_count: recentErrors,
            time_window: '5 minutes'
          }
        })
      }
    }

    // Check for data exfiltration patterns
    if (entry.method === 'GET' && entry.responseTimeMs > 5000) {
      // Long response times on GET requests might indicate large data downloads
      await this.logSecurityEvent({
        type: 'suspicious_activity',
        severity: 'low',
        clientIp: entry.clientIp,
        endpoint: entry.endpoint,
        details: {
          reason: 'Unusually long response time on GET request',
          response_time_ms: entry.responseTimeMs
        }
      })
    }
  }

  /**
   * Helper methods for compliance detection
   */
  private isDataAccessEndpoint(endpoint: string): boolean {
    const dataEndpoints = ['/game/', '/user/', '/profile/', '/data/', '/export/']
    return dataEndpoints.some(pattern => endpoint.includes(pattern))
  }

  private isGDPRRelatedEndpoint(endpoint: string): boolean {
    const gdprEndpoints = ['/user/', '/profile/', '/personal/', '/data/', '/export/', '/delete/']
    return gdprEndpoints.some(pattern => endpoint.includes(pattern))
  }

  private isPCIRelatedEndpoint(endpoint: string): boolean {
    const pciEndpoints = ['/payment/', '/billing/', '/card/', '/purchase/']
    return pciEndpoints.some(pattern => endpoint.includes(pattern))
  }

  private containsSensitiveData(log: any): boolean {
    const logStr = JSON.stringify(log).toLowerCase()
    return this.sensitiveFields.some(field => logStr.includes(field))
  }

  /**
   * Helper methods for metrics calculation
   */
  private getTopEndpoints(logs: any[]): Array<{ endpoint: string; count: number }> {
    const endpointCounts: Record<string, number> = {}
    
    logs.forEach(log => {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + 1
    })

    return Object.entries(endpointCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }))
  }

  private getErrorsByType(logs: any[]): Record<string, number> {
    const errorCounts: Record<string, number> = {}
    
    logs.filter(log => !log.success).forEach(log => {
      const errorType = this.categorizeError(log.response_status, log.error_message)
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1
    })

    return errorCounts
  }

  private getSecurityEventsByType(events: any[]): Record<string, number> {
    const eventCounts: Record<string, number> = {}
    
    events.forEach(event => {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1
    })

    return eventCounts
  }

  private getDataAccessByType(logs: any[]): Record<string, number> {
    const accessCounts: Record<string, number> = {}
    
    logs.filter(log => this.isDataAccessEndpoint(log.endpoint)).forEach(log => {
      const accessType = this.categorizeDataAccess(log.endpoint)
      accessCounts[accessType] = (accessCounts[accessType] || 0) + 1
    })

    return accessCounts
  }

  private getComplianceViolations(logs: any[], events: any[]): Array<{
    type: string
    count: number
    severity: string
    description: string
  }> {
    const violations: Array<{
      type: string
      count: number
      severity: string
      description: string
    }> = []

    // Add specific compliance violation detection logic here
    // This is a simplified example
    const unauthorizedAccess = events.filter(e => e.type === 'authentication_failure').length
    if (unauthorizedAccess > 0) {
      violations.push({
        type: 'unauthorized_access_attempts',
        count: unauthorizedAccess,
        severity: 'high',
        description: 'Multiple unauthorized access attempts detected'
      })
    }

    return violations
  }

  private getTopThreats(events: any[]): Array<{
    type: string
    count: number
    severity: string
    lastOccurrence: string
  }> {
    const threatCounts: Record<string, { count: number; lastOccurrence: string; severity: string }> = {}
    
    events.forEach(event => {
      if (!threatCounts[event.type]) {
        threatCounts[event.type] = {
          count: 0,
          lastOccurrence: event.timestamp,
          severity: event.severity
        }
      }
      threatCounts[event.type].count++
      if (event.timestamp > threatCounts[event.type].lastOccurrence) {
        threatCounts[event.type].lastOccurrence = event.timestamp
      }
    })

    return Object.entries(threatCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([type, data]) => ({
        type,
        count: data.count,
        severity: data.severity,
        lastOccurrence: data.lastOccurrence
      }))
  }

  /**
   * Additional helper methods
   */
  private categorizeError(status: number, message?: string): string {
    if (status >= 400 && status < 500) return 'client_error'
    if (status >= 500) return 'server_error'
    return 'unknown_error'
  }

  private categorizeDataAccess(endpoint: string): string {
    if (endpoint.includes('/user/')) return 'user_data'
    if (endpoint.includes('/game/')) return 'game_data'
    if (endpoint.includes('/profile/')) return 'profile_data'
    return 'other_data'
  }

  private countComplianceViolations(logs: any[], events: any[]): number {
    // Simplified compliance violation counting
    return events.filter(e => e.severity === 'critical' || e.severity === 'high').length
  }

  private generateRecommendations(
    summary: ComplianceReport['summary'],
    details: ComplianceReport['details'],
    reportType: ComplianceReport['reportType']
  ): string[] {
    const recommendations: string[] = []

    if (summary.securityEvents > 100) {
      recommendations.push('Consider implementing additional rate limiting or DDoS protection')
    }

    if (summary.failedRequests / summary.totalRequests > 0.1) {
      recommendations.push('High failure rate detected - review error handling and input validation')
    }

    if (details.complianceViolations.length > 0) {
      recommendations.push('Address compliance violations to maintain regulatory compliance')
    }

    return recommendations
  }

  private async getRecentErrorsFromIP(clientIp: string, windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs).toISOString()
    
    const { data } = await this.supabase
      .from('audit_logs')
      .select('id')
      .eq('client_ip', clientIp)
      .eq('success', false)
      .gte('timestamp', since)

    return data?.length || 0
  }

  private async logSecurityEvent(event: {
    type: string
    severity: string
    clientIp: string
    endpoint: string
    details: Record<string, any>
  }): Promise<void> {
    await this.supabase
      .from('security_events')
      .insert({
        type: event.type,
        severity: event.severity,
        client_ip: event.clientIp,
        endpoint: event.endpoint,
        details: event.details,
        blocked: false
      })
  }

  private async logComplianceEvent(event: {
    type: string
    flags: string[]
    auditEntry: AuditLogEntry
  }): Promise<void> {
    // Log compliance-specific events
    await this.supabase
      .from('security_events')
      .insert({
        type: 'compliance_event',
        severity: 'medium',
        client_ip: event.auditEntry.clientIp,
        endpoint: event.auditEntry.endpoint,
        details: {
          compliance_type: event.type,
          flags: event.flags,
          request_id: event.auditEntry.requestId
        },
        blocked: false
      })
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    // Store compliance report for audit trail
    await this.supabase
      .from('security_config')
      .insert({
        config_key: `compliance_report_${report.reportId}`,
        config_value: report,
        description: `${report.reportType} compliance report generated at ${report.generatedAt}`
      })
  }

  private async triggerSecurityAlert(event: any): Promise<void> {
    // Implement alerting logic (email, Slack, etc.)
    console.log(`SECURITY ALERT: ${event.type} - ${event.severity} - ${event.client_ip}`)
  }

  private async updateSecurityMetrics(event: any): Promise<void> {
    // Update real-time security metrics
    // This could update a dashboard or metrics system
  }

  private async checkAttackPatterns(event: any): Promise<void> {
    // Check for coordinated attack patterns
    // This could analyze multiple events to detect sophisticated attacks
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)