/**
 * Advanced alerting system for GameCompare.ai
 * Handles real-time error tracking, business metrics monitoring, and incident response
 */

interface AlertConfig {
  name: string
  description: string
  condition: AlertCondition
  severity: 'low' | 'medium' | 'high' | 'critical'
  channels: AlertChannel[]
  cooldown: number // seconds
  enabled: boolean
}

interface AlertCondition {
  metric: string
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  threshold: number
  window: number // seconds
  aggregation?: 'avg' | 'sum' | 'count' | 'max' | 'min'
}

interface AlertChannel {
  type: 'slack' | 'discord' | 'email' | 'webhook'
  config: Record<string, any>
}

interface Alert {
  id: string
  config: AlertConfig
  triggered_at: string
  resolved_at?: string
  status: 'active' | 'resolved' | 'suppressed'
  value: number
  context: Record<string, any>
}

/**
 * Real-time alerting system
 */
export class AlertingSystem {
  private alerts: Map<string, Alert> = new Map()
  private cooldowns: Map<string, number> = new Map()
  private supabase: any

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    const { createClient } = require('https://esm.sh/@supabase/supabase-js@2')
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Default alert configurations
   */
  private getDefaultAlerts(): AlertConfig[] {
    return [
      {
        name: 'high_error_rate',
        description: 'API error rate exceeds threshold',
        condition: {
          metric: 'api_error_rate',
          operator: 'gt',
          threshold: 5, // 5%
          window: 300, // 5 minutes
          aggregation: 'avg'
        },
        severity: 'high',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } },
          { type: 'email', config: { recipients: ['ops@gamecompare.ai'] } }
        ],
        cooldown: 900, // 15 minutes
        enabled: true
      },
      {
        name: 'slow_response_time',
        description: 'API response time is too slow',
        condition: {
          metric: 'api_response_time_p95',
          operator: 'gt',
          threshold: 5000, // 5 seconds
          window: 300,
          aggregation: 'avg'
        },
        severity: 'medium',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } }
        ],
        cooldown: 600, // 10 minutes
        enabled: true
      },
      {
        name: 'database_connection_failure',
        description: 'Database connection failures detected',
        condition: {
          metric: 'database_errors',
          operator: 'gt',
          threshold: 10,
          window: 60,
          aggregation: 'count'
        },
        severity: 'critical',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } },
          { type: 'discord', config: { webhook: Deno.env.get('DISCORD_WEBHOOK_URL') } },
          { type: 'email', config: { recipients: ['ops@gamecompare.ai', 'dev@gamecompare.ai'] } }
        ],
        cooldown: 300, // 5 minutes
        enabled: true
      },
      {
        name: 'low_search_success_rate',
        description: 'Search success rate is below threshold',
        condition: {
          metric: 'search_success_rate',
          operator: 'lt',
          threshold: 90, // 90%
          window: 600,
          aggregation: 'avg'
        },
        severity: 'medium',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } }
        ],
        cooldown: 1800, // 30 minutes
        enabled: true
      },
      {
        name: 'high_memory_usage',
        description: 'Memory usage is critically high',
        condition: {
          metric: 'memory_usage_percent',
          operator: 'gt',
          threshold: 85, // 85%
          window: 180,
          aggregation: 'avg'
        },
        severity: 'high',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } }
        ],
        cooldown: 600,
        enabled: true
      },
      {
        name: 'ingestion_failure',
        description: 'Data ingestion has failed multiple times',
        condition: {
          metric: 'ingestion_failures',
          operator: 'gt',
          threshold: 3,
          window: 3600, // 1 hour
          aggregation: 'count'
        },
        severity: 'high',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } },
          { type: 'email', config: { recipients: ['ops@gamecompare.ai'] } }
        ],
        cooldown: 1800,
        enabled: true
      },
      {
        name: 'low_conversion_rate',
        description: 'Click-through conversion rate is unusually low',
        condition: {
          metric: 'conversion_rate',
          operator: 'lt',
          threshold: 2, // 2%
          window: 3600,
          aggregation: 'avg'
        },
        severity: 'low',
        channels: [
          { type: 'slack', config: { webhook: Deno.env.get('SLACK_WEBHOOK_URL') } }
        ],
        cooldown: 7200, // 2 hours
        enabled: true
      }
    ]
  }

  /**
   * Check all alert conditions
   */
  async checkAlerts(): Promise<void> {
    const alertConfigs = this.getDefaultAlerts()
    
    for (const config of alertConfigs) {
      if (!config.enabled) continue
      
      try {
        await this.evaluateAlert(config)
      } catch (error) {
        console.error(`Failed to evaluate alert ${config.name}:`, error)
      }
    }
  }

  /**
   * Evaluate a single alert condition
   */
  private async evaluateAlert(config: AlertConfig): Promise<void> {
    // Check cooldown
    const lastTriggered = this.cooldowns.get(config.name)
    if (lastTriggered && (Date.now() - lastTriggered) < (config.cooldown * 1000)) {
      return
    }

    // Get metric value
    const value = await this.getMetricValue(config.condition)
    
    // Evaluate condition
    const triggered = this.evaluateCondition(config.condition, value)
    
    if (triggered) {
      await this.triggerAlert(config, value)
    } else {
      await this.resolveAlert(config.name)
    }
  }

  /**
   * Get metric value from monitoring data
   */
  private async getMetricValue(condition: AlertCondition): Promise<number> {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - (condition.window * 1000))
    
    try {
      switch (condition.metric) {
        case 'api_error_rate':
          return await this.calculateErrorRate(startTime, endTime)
        
        case 'api_response_time_p95':
          return await this.calculateResponseTimeP95(startTime, endTime)
        
        case 'database_errors':
          return await this.countDatabaseErrors(startTime, endTime)
        
        case 'search_success_rate':
          return await this.calculateSearchSuccessRate(startTime, endTime)
        
        case 'memory_usage_percent':
          return this.getCurrentMemoryUsage()
        
        case 'ingestion_failures':
          return await this.countIngestionFailures(startTime, endTime)
        
        case 'conversion_rate':
          return await this.calculateConversionRate(startTime, endTime)
        
        default:
          console.warn(`Unknown metric: ${condition.metric}`)
          return 0
      }
    } catch (error) {
      console.error(`Failed to get metric ${condition.metric}:`, error)
      return 0
    }
  }

  /**
   * Calculate API error rate
   */
  private async calculateErrorRate(startTime: Date, endTime: Date): Promise<number> {
    const { data: metrics } = await this.supabase
      .from('function_metrics')
      .select('*')
      .gte('recorded_at', startTime.toISOString())
      .lte('recorded_at', endTime.toISOString())
    
    if (!metrics || metrics.length === 0) return 0
    
    const totalRequests = metrics.length
    const errorRequests = metrics.filter((m: any) => 
      m.response_time_ms === null || m.response_time_ms > 30000
    ).length
    
    return (errorRequests / totalRequests) * 100
  }

  /**
   * Calculate 95th percentile response time
   */
  private async calculateResponseTimeP95(startTime: Date, endTime: Date): Promise<number> {
    const { data: metrics } = await this.supabase
      .from('function_metrics')
      .select('response_time_ms')
      .gte('recorded_at', startTime.toISOString())
      .lte('recorded_at', endTime.toISOString())
      .not('response_time_ms', 'is', null)
      .order('response_time_ms', { ascending: true })
    
    if (!metrics || metrics.length === 0) return 0
    
    const p95Index = Math.floor(metrics.length * 0.95)
    return metrics[p95Index]?.response_time_ms || 0
  }

  /**
   * Count database errors
   */
  private async countDatabaseErrors(startTime: Date, endTime: Date): Promise<number> {
    // This would query error logs or monitoring metrics
    // For now, return 0 as placeholder
    return 0
  }

  /**
   * Calculate search success rate
   */
  private async calculateSearchSuccessRate(startTime: Date, endTime: Date): Promise<number> {
    const { data: searches } = await this.supabase
      .from('function_metrics')
      .select('*')
      .eq('endpoint', '/similar')
      .gte('recorded_at', startTime.toISOString())
      .lte('recorded_at', endTime.toISOString())
    
    if (!searches || searches.length === 0) return 100
    
    const successfulSearches = searches.filter((s: any) => 
      s.response_time_ms && s.response_time_ms < 30000
    ).length
    
    return (successfulSearches / searches.length) * 100
  }

  /**
   * Get current memory usage percentage
   */
  private getCurrentMemoryUsage(): number {
    const memoryUsage = Deno.memoryUsage()
    return (memoryUsage.rss / memoryUsage.heapTotal) * 100
  }

  /**
   * Count ingestion failures
   */
  private async countIngestionFailures(startTime: Date, endTime: Date): Promise<number> {
    // This would query ingestion logs
    // For now, return 0 as placeholder
    return 0
  }

  /**
   * Calculate conversion rate (clicks to searches)
   */
  private async calculateConversionRate(startTime: Date, endTime: Date): Promise<number> {
    const [{ data: searches }, { data: clicks }] = await Promise.all([
      this.supabase
        .from('function_metrics')
        .select('*')
        .eq('endpoint', '/similar')
        .gte('recorded_at', startTime.toISOString())
        .lte('recorded_at', endTime.toISOString()),
      
      this.supabase
        .from('click_logs')
        .select('*')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
    ])
    
    if (!searches || searches.length === 0) return 0
    
    const clickCount = clicks?.length || 0
    return (clickCount / searches.length) * 100
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold
      case 'lt': return value < condition.threshold
      case 'eq': return value === condition.threshold
      case 'gte': return value >= condition.threshold
      case 'lte': return value <= condition.threshold
      default: return false
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(config: AlertConfig, value: number): Promise<void> {
    const alertId = `${config.name}_${Date.now()}`
    
    const alert: Alert = {
      id: alertId,
      config,
      triggered_at: new Date().toISOString(),
      status: 'active',
      value,
      context: {
        threshold: config.condition.threshold,
        operator: config.condition.operator,
        window: config.condition.window
      }
    }
    
    this.alerts.set(config.name, alert)
    this.cooldowns.set(config.name, Date.now())
    
    // Send notifications
    await this.sendNotifications(alert)
    
    // Store alert in database
    await this.storeAlert(alert)
    
    console.log(`Alert triggered: ${config.name} (value: ${value}, threshold: ${config.condition.threshold})`)
  }

  /**
   * Resolve an alert
   */
  private async resolveAlert(alertName: string): Promise<void> {
    const alert = this.alerts.get(alertName)
    if (alert && alert.status === 'active') {
      alert.status = 'resolved'
      alert.resolved_at = new Date().toISOString()
      
      // Update in database
      await this.updateAlert(alert)
      
      console.log(`Alert resolved: ${alertName}`)
    }
  }

  /**
   * Send notifications through configured channels
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    const notifications = alert.config.channels.map(channel => 
      this.sendNotification(channel, alert)
    )
    
    await Promise.allSettled(notifications)
  }

  /**
   * Send notification to a specific channel
   */
  private async sendNotification(channel: AlertChannel, alert: Alert): Promise<void> {
    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackNotification(channel.config, alert)
          break
        
        case 'discord':
          await this.sendDiscordNotification(channel.config, alert)
          break
        
        case 'email':
          await this.sendEmailNotification(channel.config, alert)
          break
        
        case 'webhook':
          await this.sendWebhookNotification(channel.config, alert)
          break
        
        default:
          console.warn(`Unknown notification channel: ${channel.type}`)
      }
    } catch (error) {
      console.error(`Failed to send ${channel.type} notification:`, error)
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(config: any, alert: Alert): Promise<void> {
    if (!config.webhook) return
    
    const color = {
      low: '#36a64f',
      medium: '#ff9500',
      high: '#ff4444',
      critical: '#ff0000'
    }[alert.config.severity]
    
    const payload = {
      attachments: [{
        color,
        title: `🚨 Alert: ${alert.config.name}`,
        text: alert.config.description,
        fields: [
          {
            title: 'Severity',
            value: alert.config.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Current Value',
            value: alert.value.toString(),
            short: true
          },
          {
            title: 'Threshold',
            value: `${alert.config.condition.operator} ${alert.config.condition.threshold}`,
            short: true
          },
          {
            title: 'Time Window',
            value: `${alert.config.condition.window}s`,
            short: true
          }
        ],
        ts: Math.floor(new Date(alert.triggered_at).getTime() / 1000)
      }]
    }
    
    await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }

  /**
   * Send Discord notification
   */
  private async sendDiscordNotification(config: any, alert: Alert): Promise<void> {
    if (!config.webhook) return
    
    const color = {
      low: 0x36a64f,
      medium: 0xff9500,
      high: 0xff4444,
      critical: 0xff0000
    }[alert.config.severity]
    
    const payload = {
      embeds: [{
        title: `🚨 Alert: ${alert.config.name}`,
        description: alert.config.description,
        color,
        fields: [
          {
            name: 'Severity',
            value: alert.config.severity.toUpperCase(),
            inline: true
          },
          {
            name: 'Current Value',
            value: alert.value.toString(),
            inline: true
          },
          {
            name: 'Threshold',
            value: `${alert.config.condition.operator} ${alert.config.condition.threshold}`,
            inline: true
          }
        ],
        timestamp: alert.triggered_at
      }]
    }
    
    await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(config: any, alert: Alert): Promise<void> {
    // Email implementation would depend on email service
    console.log(`Would send email to: ${config.recipients?.join(', ')}`)
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(config: any, alert: Alert): Promise<void> {
    if (!config.url) return
    
    await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_name: alert.config.name,
        severity: alert.config.severity,
        value: alert.value,
        threshold: alert.config.condition.threshold,
        triggered_at: alert.triggered_at,
        description: alert.config.description
      })
    })
  }

  /**
   * Store alert in database
   */
  private async storeAlert(alert: Alert): Promise<void> {
    try {
      await this.supabase
        .from('alerts')
        .insert({
          id: alert.id,
          name: alert.config.name,
          severity: alert.config.severity,
          status: alert.status,
          value: alert.value,
          threshold: alert.config.condition.threshold,
          triggered_at: alert.triggered_at,
          resolved_at: alert.resolved_at,
          context: alert.context
        })
    } catch (error) {
      console.error('Failed to store alert:', error)
    }
  }

  /**
   * Update alert in database
   */
  private async updateAlert(alert: Alert): Promise<void> {
    try {
      await this.supabase
        .from('alerts')
        .update({
          status: alert.status,
          resolved_at: alert.resolved_at
        })
        .eq('id', alert.id)
    } catch (error) {
      console.error('Failed to update alert:', error)
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values()).filter(alert => alert.status === 'active')
  }

  /**
   * Suppress alert
   */
  async suppressAlert(alertName: string, duration: number): Promise<void> {
    this.cooldowns.set(alertName, Date.now() + (duration * 1000))
    
    const alert = this.alerts.get(alertName)
    if (alert) {
      alert.status = 'suppressed'
      await this.updateAlert(alert)
    }
  }
}

// Global alerting system instance
export const alertingSystem = new AlertingSystem(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)