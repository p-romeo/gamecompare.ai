/**
 * Consolidated Monitoring and Performance Utilities
 * Combines monitoring, alerting, and performance tracking functionality
 */

/**
 * Metric data structure
 */
export interface MetricData {
  name: string
  value: number
  unit?: string
  tags?: Record<string, any>
  timestamp?: string
}

/**
 * Function performance metric
 */
export interface FunctionMetric {
  function_name: string
  endpoint?: string
  method?: string
  status_code?: number
  response_time_ms: number
  memory_used_mb?: number
  error_message?: string
  request_id?: string
  client_ip?: string
  user_agent?: string
  timestamp?: string
}

/**
 * System health status
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptime: number
  memory: {
    used: number
    total: number
    percentage: number
  }
  database: {
    connected: boolean
    responseTime: number
  }
  external_services: {
    openai: boolean
    pinecone: boolean
  }
  metrics: {
    requests_per_minute: number
    error_rate: number
    avg_response_time: number
  }
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  name: string
  condition: (metrics: MetricData[]) => boolean
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  cooldown: number // minutes
}

/**
 * Alert thresholds
 */
export const ALERT_THRESHOLDS = {
  RESPONSE_TIME_WARNING: 2000,
  RESPONSE_TIME_CRITICAL: 5000,
  ERROR_RATE_WARNING: 5,
  ERROR_RATE_CRITICAL: 10,
  MEMORY_WARNING: 80,
  MEMORY_CRITICAL: 95,
  DATABASE_RESPONSE_WARNING: 1000,
  DATABASE_RESPONSE_CRITICAL: 3000
} as const

/**
 * Consolidated monitoring client
 */
export class MonitoringClient {
  private metrics: Map<string, MetricData[]> = new Map()
  private alerts: Map<string, { lastTriggered: number; count: number }> = new Map()
  private performanceStats: Map<string, number[]> = new Map()
  private maxMetricsPerType: number = 1000
  private alertConfigs: AlertConfig[] = []

  constructor() {
    this.setupDefaultAlerts()
  }

  /**
   * Record a single metric
   */
  recordMetric(metric: MetricData): void {
    const key = metric.name
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, [])
    }
    
    const metrics = this.metrics.get(key)!
    metrics.push({
      ...metric,
      timestamp: metric.timestamp || new Date().toISOString()
    })
    
    // Keep only recent metrics
    if (metrics.length > this.maxMetricsPerType) {
      metrics.shift()
    }
    
    // Check alert conditions
    this.checkAlerts(key, metrics)
  }

  /**
   * Record multiple metrics
   */
  recordMetrics(metrics: MetricData[]): void {
    metrics.forEach(metric => this.recordMetric(metric))
  }

  /**
   * Record function performance metric
   */
  recordFunctionMetric(metric: FunctionMetric): void {
    // Record as general metrics
    this.recordMetric({
      name: 'function_response_time',
      value: metric.response_time_ms,
      unit: 'ms',
      tags: {
        function_name: metric.function_name,
        endpoint: metric.endpoint,
        method: metric.method,
        status_code: metric.status_code
      }
    })

    if (metric.memory_used_mb) {
      this.recordMetric({
        name: 'function_memory_usage',
        value: metric.memory_used_mb,
        unit: 'mb',
        tags: {
          function_name: metric.function_name
        }
      })
    }

    if (metric.error_message) {
      this.recordMetric({
        name: 'function_errors',
        value: 1,
        unit: 'count',
        tags: {
          function_name: metric.function_name,
          error_type: metric.error_message.substring(0, 50)
        }
      })
    }

    // Record performance stats
    this.recordPerformanceTime(
      `${metric.function_name}_${metric.endpoint || 'unknown'}`,
      metric.response_time_ms
    )
  }

  /**
   * Record performance timing
   */
  recordPerformanceTime(operation: string, timeMs: number): void {
    if (!this.performanceStats.has(operation)) {
      this.performanceStats.set(operation, [])
    }

    const times = this.performanceStats.get(operation)!
    times.push(timeMs)

    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift()
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getPerformanceStats(operation: string): {
    count: number
    avg: number
    min: number
    max: number
    p50: number
    p95: number
    p99: number
  } | null {
    const times = this.performanceStats.get(operation)
    if (!times || times.length === 0) return null

    const sorted = [...times].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((a, b) => a + b, 0)
    const avg = sum / count

    return {
      count,
      avg: parseFloat(avg.toFixed(2)),
      min: sorted[0],
      max: sorted[count - 1],
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    }
  }

  /**
   * Get all performance statistics
   */
  getAllPerformanceStats(): Record<string, ReturnType<typeof this.getPerformanceStats>> {
    const stats: Record<string, ReturnType<typeof this.getPerformanceStats>> = {}

    for (const operation of this.performanceStats.keys()) {
      stats[operation] = this.getPerformanceStats(operation)
    }

    return stats
  }

  /**
   * Get metrics for a specific type
   */
  getMetrics(metricName: string, limit?: number): MetricData[] {
    const metrics = this.metrics.get(metricName) || []
    return limit ? metrics.slice(-limit) : metrics
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, MetricData[]> {
    const result: Record<string, MetricData[]> = {}
    
    for (const [key, metrics] of this.metrics.entries()) {
      result[key] = metrics
    }
    
    return result
  }

  /**
   * Get system health status
   */
  getSystemHealth(): SystemHealth {
    const now = Date.now()
    const memoryUsage = process.memoryUsage()
    
    // Calculate metrics from recent data
    const responseTimeMetrics = this.getMetrics('function_response_time', 100)
    const errorMetrics = this.getMetrics('function_errors', 100)
    
    const avgResponseTime = responseTimeMetrics.length > 0
      ? responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length
      : 0
    
    const errorRate = errorMetrics.length > 0
      ? (errorMetrics.length / Math.max(responseTimeMetrics.length, 1)) * 100
      : 0
    
    const requestsPerMinute = responseTimeMetrics.filter(
      m => now - new Date(m.timestamp!).getTime() < 60000
    ).length

    // Determine overall health status
    let status: SystemHealth['status'] = 'healthy'
    
    if (avgResponseTime > ALERT_THRESHOLDS.RESPONSE_TIME_CRITICAL || 
        errorRate > ALERT_THRESHOLDS.ERROR_RATE_CRITICAL) {
      status = 'unhealthy'
    } else if (avgResponseTime > ALERT_THRESHOLDS.RESPONSE_TIME_WARNING || 
               errorRate > ALERT_THRESHOLDS.ERROR_RATE_WARNING) {
      status = 'degraded'
    }

    return {
      status,
      uptime: process.uptime(),
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      database: {
        connected: true, // This would be checked against actual DB
        responseTime: 0 // This would be measured from actual DB queries
      },
      external_services: {
        openai: true, // This would be checked against actual service
        pinecone: true // This would be checked against actual service
      },
      metrics: {
        requests_per_minute: requestsPerMinute,
        error_rate: errorRate,
        avg_response_time: avgResponseTime
      }
    }
  }

  /**
   * Setup default alert configurations
   */
  private setupDefaultAlerts(): void {
    this.alertConfigs = [
      {
        name: 'high_response_time',
        condition: (metrics) => {
          const recent = metrics.slice(-10)
          const avg = recent.reduce((sum, m) => sum + m.value, 0) / recent.length
          return avg > ALERT_THRESHOLDS.RESPONSE_TIME_WARNING
        },
        severity: 'warning',
        message: 'Average response time is above threshold',
        cooldown: 5
      },
      {
        name: 'critical_response_time',
        condition: (metrics) => {
          const recent = metrics.slice(-5)
          const avg = recent.reduce((sum, m) => sum + m.value, 0) / recent.length
          return avg > ALERT_THRESHOLDS.RESPONSE_TIME_CRITICAL
        },
        severity: 'critical',
        message: 'Critical response time detected',
        cooldown: 2
      },
      {
        name: 'high_error_rate',
        condition: (metrics) => {
          const recent = metrics.slice(-20)
          return recent.length > ALERT_THRESHOLDS.ERROR_RATE_WARNING
        },
        severity: 'error',
        message: 'Error rate is above threshold',
        cooldown: 5
      }
    ]
  }

  /**
   * Check alert conditions
   */
  private checkAlerts(metricName: string, metrics: MetricData[]): void {
    const now = Date.now()
    
    for (const config of this.alertConfigs) {
      const alertKey = `${metricName}_${config.name}`
      const lastAlert = this.alerts.get(alertKey)
      
      // Check cooldown
      if (lastAlert && (now - lastAlert.lastTriggered) < (config.cooldown * 60 * 1000)) {
        continue
      }
      
      // Check condition
      if (config.condition(metrics)) {
        this.triggerAlert(config, metricName, metrics)
        
        this.alerts.set(alertKey, {
          lastTriggered: now,
          count: (lastAlert?.count || 0) + 1
        })
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(config: AlertConfig, metricName: string, metrics: MetricData[]): void {
    const alert = {
      name: config.name,
      severity: config.severity,
      message: config.message,
      metric: metricName,
      value: metrics[metrics.length - 1]?.value,
      timestamp: new Date().toISOString()
    }
    
    console.warn(`ALERT [${config.severity.toUpperCase()}]: ${config.message}`, alert)
    
    // Here you would typically send to external alerting system
    // this.sendToAlertingSystem(alert)
  }

  /**
   * Add custom alert configuration
   */
  addAlertConfig(config: AlertConfig): void {
    this.alertConfigs.push(config)
  }

  /**
   * Clear all metrics and stats
   */
  clear(): void {
    this.metrics.clear()
    this.performanceStats.clear()
    this.alerts.clear()
  }

  /**
   * Get monitoring summary
   */
  getSummary(): {
    totalMetrics: number
    activeAlerts: number
    systemHealth: SystemHealth
    topOperations: Array<{ name: string; avgTime: number; count: number }>
  } {
    const totalMetrics = Array.from(this.metrics.values())
      .reduce((sum, metrics) => sum + metrics.length, 0)
    
    const activeAlerts = this.alerts.size
    const systemHealth = this.getSystemHealth()
    
    // Get top operations by average time
    const topOperations = Array.from(this.performanceStats.entries())
      .map(([name, times]) => {
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length
        return { name, avgTime: parseFloat(avg.toFixed(2)), count: times.length }
      })
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10)

    return {
      totalMetrics,
      activeAlerts,
      systemHealth,
      topOperations
    }
  }
}

/**
 * Performance timer with monitoring integration
 */
export class MonitoredPerformanceTimer {
  private startTime: number
  private label: string
  private monitoring: MonitoringClient

  constructor(label: string, monitoring: MonitoringClient) {
    this.label = label
    this.monitoring = monitoring
    this.startTime = performance.now()
  }

  /**
   * Stop timer and record metric
   */
  stop(): number {
    const duration = performance.now() - this.startTime
    
    this.monitoring.recordMetric({
      name: 'operation_duration',
      value: duration,
      unit: 'ms',
      tags: { operation: this.label }
    })
    
    this.monitoring.recordPerformanceTime(this.label, duration)
    
    return duration
  }
}

/**
 * Database query monitor
 */
export class DatabaseQueryMonitor {
  private monitoring: MonitoringClient

  constructor(monitoring: MonitoringClient) {
    this.monitoring = monitoring
  }

  /**
   * Monitor database query execution
   */
  async monitorQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const timer = new MonitoredPerformanceTimer(`db_query_${queryName}`, this.monitoring)
    
    try {
      const result = await queryFn()
      const duration = timer.stop()
      
      this.monitoring.recordMetric({
        name: 'database_query_success',
        value: 1,
        unit: 'count',
        tags: { query: queryName, duration }
      })
      
      return result
    } catch (error) {
      timer.stop()
      
      this.monitoring.recordMetric({
        name: 'database_query_error',
        value: 1,
        unit: 'count',
        tags: { 
          query: queryName, 
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      
      throw error
    }
  }
}

/**
 * API endpoint monitor
 */
export class APIEndpointMonitor {
  private monitoring: MonitoringClient

  constructor(monitoring: MonitoringClient) {
    this.monitoring = monitoring
  }

  /**
   * Monitor API endpoint execution
   */
  async monitorEndpoint<T>(
    endpoint: string,
    method: string,
    handler: () => Promise<T>
  ): Promise<T> {
    const timer = new MonitoredPerformanceTimer(`api_${method}_${endpoint}`, this.monitoring)
    
    try {
      const result = await handler()
      const duration = timer.stop()
      
      this.monitoring.recordFunctionMetric({
        function_name: 'api_handler',
        endpoint,
        method,
        status_code: 200,
        response_time_ms: duration
      })
      
      return result
    } catch (error) {
      const duration = timer.stop()
      
      this.monitoring.recordFunctionMetric({
        function_name: 'api_handler',
        endpoint,
        method,
        status_code: 500,
        response_time_ms: duration,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }
}

// Global monitoring instance
export const globalMonitoring = new MonitoringClient()

// Convenience functions
export function recordMetric(metric: MetricData): void {
  globalMonitoring.recordMetric(metric)
}

export function recordFunctionMetric(metric: FunctionMetric): void {
  globalMonitoring.recordFunctionMetric(metric)
}

export function getSystemHealth(): SystemHealth {
  return globalMonitoring.getSystemHealth()
}

export function getPerformanceStats(operation?: string): any {
  return operation 
    ? globalMonitoring.getPerformanceStats(operation)
    : globalMonitoring.getAllPerformanceStats()
}

export function createPerformanceTimer(label: string): MonitoredPerformanceTimer {
  return new MonitoredPerformanceTimer(label, globalMonitoring)
}

export function createDatabaseMonitor(): DatabaseQueryMonitor {
  return new DatabaseQueryMonitor(globalMonitoring)
}

export function createAPIMonitor(): APIEndpointMonitor {
  return new APIEndpointMonitor(globalMonitoring)
}