/**
 * Security Dashboard and Monitoring Utilities
 * Real-time security metrics, alerting, and dashboard data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  SECURITY_METRICS_THRESHOLDS, 
  SecuritySeverity, 
  SecurityEventType,
  ComplianceStandard 
} from './security_config.ts'

interface SecurityDashboardMetrics {
  timestamp: string
  timeRange: {
    start: string
    end: string
    hours: number
  }
  overview: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    blockedRequests: number
    securityEvents: number
    criticalEvents: number
    activeThreats: number
  }
  performance: {
    averageResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    errorRate: number
    successRate: number
    throughput: number
  }
  security: {
    rateLimitViolations: number
    ddosAttempts: number
    maliciousInputDetected: number
    suspiciousActivity: number
    ipBlocksActive: number
    apiKeyRotations: number
    secretRotations: number
  }
  compliance: {
    dataAccessRequests: number
    sensitiveDataAccessed: number
    gdprRequests: number
    complianceViolations: number
    auditLogRetention: number
  }
  threats: Array<{
    type: string
    count: number
    severity: SecuritySeverity
    lastOccurrence: string
    trend: 'increasing' | 'decreasing' | 'stable'
  }>
  alerts: Array<{
    id: string
    type: string
    severity: SecuritySeverity
    message: string
    timestamp: string
    acknowledged: boolean
  }>
}

interface SecurityAlert {
  id: string
  type: string
  severity: SecuritySeverity
  message: string
  details: Record<string, any>
  timestamp: string
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: string
}

/**
 * Security Dashboard Manager
 */
export class SecurityDashboard {
  private supabase: any

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Get comprehensive security dashboard metrics
   */
  async getDashboardMetrics(hours: number = 24): Promise<SecurityDashboardMetrics> {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000)
    
    const timeRange = {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      hours
    }

    try {
      // Get audit logs for the time range
      const { data: auditLogs } = await this.supabase
        .from('audit_logs')
        .select('*')
        .gte('timestamp', timeRange.start)
        .lte('timestamp', timeRange.end)

      // Get security events for the time range
      const { data: securityEvents } = await this.supabase
        .from('security_events')
        .select('*')
        .gte('timestamp', timeRange.start)
        .lte('timestamp', timeRange.end)

      // Get active IP blocks
      const { data: activeBlocks } = await this.supabase
        .from('blocked_ips')
        .select('*')
        .or('expires_at.is.null,expires_at.gt.now()')

      // Calculate overview metrics
      const overview = {
        totalRequests: auditLogs?.length || 0,
        successfulRequests: auditLogs?.filter(log => log.success).length || 0,
        failedRequests: auditLogs?.filter(log => !log.success).length || 0,
        blockedRequests: securityEvents?.filter(event => event.blocked).length || 0,
        securityEvents: securityEvents?.length || 0,
        criticalEvents: securityEvents?.filter(event => event.severity === 'critical').length || 0,
        activeThreats: this.calculateActiveThreats(securityEvents || [])
      }

      // Calculate performance metrics
      const responseTimes = auditLogs?.map(log => log.response_time_ms).filter(Boolean) || []
      responseTimes.sort((a, b) => a - b)
      
      const performance = {
        averageResponseTime: responseTimes.length > 0 
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0,
        p95ResponseTime: responseTimes.length > 0 
          ? responseTimes[Math.floor(responseTimes.length * 0.95)]
          : 0,
        p99ResponseTime: responseTimes.length > 0 
          ? responseTimes[Math.floor(responseTimes.length * 0.99)]
          : 0,
        errorRate: overview.totalRequests > 0 
          ? Math.round((overview.failedRequests / overview.totalRequests) * 100) / 100
          : 0,
        successRate: overview.totalRequests > 0 
          ? Math.round((overview.successfulRequests / overview.totalRequests) * 100) / 100
          : 0,
        throughput: Math.round(overview.totalRequests / hours)
      }

      // Calculate security metrics
      const security = {
        rateLimitViolations: securityEvents?.filter(e => e.type === 'rate_limit_exceeded').length || 0,
        ddosAttempts: securityEvents?.filter(e => e.type === 'ddos_detected').length || 0,
        maliciousInputDetected: securityEvents?.filter(e => e.type === 'invalid_input').length || 0,
        suspiciousActivity: securityEvents?.filter(e => e.type === 'suspicious_activity').length || 0,
        ipBlocksActive: activeBlocks?.length || 0,
        apiKeyRotations: securityEvents?.filter(e => e.type === 'api_key_rotated').length || 0,
        secretRotations: securityEvents?.filter(e => e.type === 'secret_rotated').length || 0
      }

      // Calculate compliance metrics
      const compliance = {
        dataAccessRequests: auditLogs?.filter(log => this.isDataAccessEndpoint(log.endpoint)).length || 0,
        sensitiveDataAccessed: auditLogs?.filter(log => this.containsSensitiveData(log)).length || 0,
        gdprRequests: auditLogs?.filter(log => this.isGDPRRelatedEndpoint(log.endpoint)).length || 0,
        complianceViolations: securityEvents?.filter(e => e.type === 'compliance_violation').length || 0,
        auditLogRetention: await this.calculateAuditLogRetention()
      }

      // Get threat analysis
      const threats = this.analyzeThreatTrends(securityEvents || [])

      // Get active alerts
      const alerts = await this.getActiveAlerts()

      return {
        timestamp: new Date().toISOString(),
        timeRange,
        overview,
        performance,
        security,
        compliance,
        threats,
        alerts
      }
    } catch (error) {
      console.error('Error getting dashboard metrics:', error)
      throw error
    }
  }

  /**
   * Generate security alerts based on current metrics
   */
  async generateAlerts(metrics: SecurityDashboardMetrics): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = []

    // Performance alerts
    if (metrics.performance.p95ResponseTime > SECURITY_METRICS_THRESHOLDS.RESPONSE_TIME_CRITICAL) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'performance_critical',
        severity: SecuritySeverity.CRITICAL,
        message: `Critical response time: P95 is ${metrics.performance.p95ResponseTime}ms`,
        details: { p95ResponseTime: metrics.performance.p95ResponseTime },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    } else if (metrics.performance.p95ResponseTime > SECURITY_METRICS_THRESHOLDS.RESPONSE_TIME_WARNING) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'performance_warning',
        severity: SecuritySeverity.MEDIUM,
        message: `High response time: P95 is ${metrics.performance.p95ResponseTime}ms`,
        details: { p95ResponseTime: metrics.performance.p95ResponseTime },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    }

    // Error rate alerts
    if (metrics.performance.errorRate > SECURITY_METRICS_THRESHOLDS.ERROR_RATE_CRITICAL) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'error_rate_critical',
        severity: SecuritySeverity.CRITICAL,
        message: `Critical error rate: ${(metrics.performance.errorRate * 100).toFixed(1)}%`,
        details: { errorRate: metrics.performance.errorRate },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    }

    // Security event alerts
    if (metrics.overview.criticalEvents > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'critical_security_events',
        severity: SecuritySeverity.CRITICAL,
        message: `${metrics.overview.criticalEvents} critical security events detected`,
        details: { criticalEvents: metrics.overview.criticalEvents },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    }

    // DDoS attack alerts
    if (metrics.security.ddosAttempts > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'ddos_attack',
        severity: SecuritySeverity.HIGH,
        message: `${metrics.security.ddosAttempts} DDoS attacks detected`,
        details: { ddosAttempts: metrics.security.ddosAttempts },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    }

    // High blocked requests alert
    if (metrics.overview.blockedRequests > SECURITY_METRICS_THRESHOLDS.BLOCKED_REQUESTS_CRITICAL) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'high_blocked_requests',
        severity: SecuritySeverity.HIGH,
        message: `High number of blocked requests: ${metrics.overview.blockedRequests}`,
        details: { blockedRequests: metrics.overview.blockedRequests },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    }

    // Compliance alerts
    if (metrics.compliance.complianceViolations > 0) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'compliance_violation',
        severity: SecuritySeverity.HIGH,
        message: `${metrics.compliance.complianceViolations} compliance violations detected`,
        details: { complianceViolations: metrics.compliance.complianceViolations },
        timestamp: new Date().toISOString(),
        acknowledged: false
      })
    }

    // Store alerts in database
    for (const alert of alerts) {
      await this.storeAlert(alert)
    }

    return alerts
  }

  /**
   * Get real-time security status
   */
  async getSecurityStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical'
    score: number
    issues: string[]
    recommendations: string[]
  }> {
    const metrics = await this.getDashboardMetrics(1) // Last hour
    const issues: string[] = []
    const recommendations: string[] = []
    let score = 100

    // Check performance
    if (metrics.performance.errorRate > SECURITY_METRICS_THRESHOLDS.ERROR_RATE_CRITICAL) {
      issues.push(`High error rate: ${(metrics.performance.errorRate * 100).toFixed(1)}%`)
      recommendations.push('Investigate and fix underlying causes of request failures')
      score -= 20
    }

    if (metrics.performance.p95ResponseTime > SECURITY_METRICS_THRESHOLDS.RESPONSE_TIME_CRITICAL) {
      issues.push(`Slow response times: P95 is ${metrics.performance.p95ResponseTime}ms`)
      recommendations.push('Optimize database queries and add caching')
      score -= 15
    }

    // Check security events
    if (metrics.overview.criticalEvents > 0) {
      issues.push(`${metrics.overview.criticalEvents} critical security events`)
      recommendations.push('Review and respond to critical security events immediately')
      score -= 25
    }

    if (metrics.security.ddosAttempts > 0) {
      issues.push(`${metrics.security.ddosAttempts} DDoS attacks detected`)
      recommendations.push('Consider implementing additional DDoS protection measures')
      score -= 20
    }

    // Check compliance
    if (metrics.compliance.complianceViolations > 0) {
      issues.push(`${metrics.compliance.complianceViolations} compliance violations`)
      recommendations.push('Address compliance violations to maintain regulatory compliance')
      score -= 15
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical'
    if (score >= 80) {
      status = 'healthy'
    } else if (score >= 60) {
      status = 'warning'
    } else {
      status = 'critical'
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      recommendations
    }
  }

  /**
   * Get security trends over time
   */
  async getSecurityTrends(days: number = 7): Promise<{
    dates: string[]
    metrics: {
      requests: number[]
      errors: number[]
      securityEvents: number[]
      blockedRequests: number[]
      responseTime: number[]
    }
  }> {
    const dates: string[] = []
    const metrics = {
      requests: [] as number[],
      errors: [] as number[],
      securityEvents: [] as number[],
      blockedRequests: [] as number[],
      responseTime: [] as number[]
    }

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)
      
      dates.push(date.toISOString().split('T')[0])

      // Get metrics for this day
      const dayMetrics = await this.getDashboardMetrics(24) // This would need to be adjusted for specific date ranges
      
      metrics.requests.push(dayMetrics.overview.totalRequests)
      metrics.errors.push(dayMetrics.overview.failedRequests)
      metrics.securityEvents.push(dayMetrics.overview.securityEvents)
      metrics.blockedRequests.push(dayMetrics.overview.blockedRequests)
      metrics.responseTime.push(dayMetrics.performance.p95ResponseTime)
    }

    return { dates, metrics }
  }

  /**
   * Private helper methods
   */
  private calculateActiveThreats(securityEvents: any[]): number {
    const recentEvents = securityEvents.filter(event => {
      const eventTime = new Date(event.timestamp)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      return eventTime > oneHourAgo && (event.severity === 'high' || event.severity === 'critical')
    })
    
    return new Set(recentEvents.map(event => event.client_ip)).size
  }

  private analyzeThreatTrends(securityEvents: any[]): Array<{
    type: string
    count: number
    severity: SecuritySeverity
    lastOccurrence: string
    trend: 'increasing' | 'decreasing' | 'stable'
  }> {
    const threatCounts: Record<string, any> = {}
    
    securityEvents.forEach(event => {
      if (!threatCounts[event.type]) {
        threatCounts[event.type] = {
          count: 0,
          severity: event.severity,
          lastOccurrence: event.timestamp,
          recentCount: 0,
          olderCount: 0
        }
      }
      
      threatCounts[event.type].count++
      
      if (event.timestamp > threatCounts[event.type].lastOccurrence) {
        threatCounts[event.type].lastOccurrence = event.timestamp
      }
      
      // Count recent vs older events for trend analysis
      const eventTime = new Date(event.timestamp)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      
      if (eventTime > oneHourAgo) {
        threatCounts[event.type].recentCount++
      } else {
        threatCounts[event.type].olderCount++
      }
    })

    return Object.entries(threatCounts)
      .map(([type, data]) => ({
        type,
        count: data.count,
        severity: data.severity,
        lastOccurrence: data.lastOccurrence,
        trend: this.calculateTrend(data.recentCount, data.olderCount)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  private calculateTrend(recent: number, older: number): 'increasing' | 'decreasing' | 'stable' {
    if (recent > older * 1.2) return 'increasing'
    if (recent < older * 0.8) return 'decreasing'
    return 'stable'
  }

  private async getActiveAlerts(): Promise<SecurityAlert[]> {
    try {
      const { data } = await this.supabase
        .from('security_alerts')
        .select('*')
        .eq('acknowledged', false)
        .order('timestamp', { ascending: false })
        .limit(50)

      return data || []
    } catch (error) {
      console.error('Error getting active alerts:', error)
      return []
    }
  }

  private async storeAlert(alert: SecurityAlert): Promise<void> {
    try {
      await this.supabase
        .from('security_alerts')
        .insert({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          details: alert.details,
          timestamp: alert.timestamp,
          acknowledged: alert.acknowledged
        })
    } catch (error) {
      console.error('Error storing alert:', error)
    }
  }

  private async calculateAuditLogRetention(): Promise<number> {
    try {
      const { data } = await this.supabase
        .from('audit_logs')
        .select('timestamp')
        .order('timestamp', { ascending: true })
        .limit(1)

      if (data && data.length > 0) {
        const oldestLog = new Date(data[0].timestamp)
        const now = new Date()
        return Math.floor((now.getTime() - oldestLog.getTime()) / (1000 * 60 * 60 * 24))
      }

      return 0
    } catch (error) {
      console.error('Error calculating audit log retention:', error)
      return 0
    }
  }

  private isDataAccessEndpoint(endpoint: string): boolean {
    const dataEndpoints = ['/game/', '/user/', '/profile/', '/data/', '/export/']
    return dataEndpoints.some(pattern => endpoint.includes(pattern))
  }

  private isGDPRRelatedEndpoint(endpoint: string): boolean {
    const gdprEndpoints = ['/user/', '/profile/', '/personal/', '/data/', '/export/', '/delete/']
    return gdprEndpoints.some(pattern => endpoint.includes(pattern))
  }

  private containsSensitiveData(log: any): boolean {
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth', 'authorization']
    const logStr = JSON.stringify(log).toLowerCase()
    return sensitiveFields.some(field => logStr.includes(field))
  }
}

// Export singleton instance
export const securityDashboard = new SecurityDashboard(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)