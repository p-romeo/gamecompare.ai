/**
 * Monitoring Scheduler Edge Function
 * Orchestrates all monitoring, alerting, and incident response activities
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { alertingSystem } from './utils/alerting.ts'
import { businessMetrics } from './utils/business_metrics.ts'
import { incidentResponse } from './utils/incident_response.ts'
import { performanceMonitor } from './utils/performance.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MonitoringTask {
  name: string
  description: string
  schedule: string // cron expression
  enabled: boolean
  lastRun?: string
  nextRun?: string
  status: 'idle' | 'running' | 'error'
  errorMessage?: string
}

/**
 * Monitoring scheduler and orchestrator
 */
class MonitoringScheduler {
  private supabase: any
  private tasks: Map<string, MonitoringTask> = new Map()
  private runningTasks: Set<string> = new Set()

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
    this.initializeTasks()
  }

  /**
   * Initialize monitoring tasks
   */
  private initializeTasks(): void {
    const tasks: MonitoringTask[] = [
      {
        name: 'alert_check',
        description: 'Check all alert conditions and trigger notifications',
        schedule: '*/1 * * * *', // Every minute
        enabled: true,
        status: 'idle'
      },
      {
        name: 'business_metrics_collection',
        description: 'Collect and process business metrics',
        schedule: '*/5 * * * *', // Every 5 minutes
        enabled: true,
        status: 'idle'
      },
      {
        name: 'performance_analysis',
        description: 'Analyze performance metrics and detect anomalies',
        schedule: '*/10 * * * *', // Every 10 minutes
        enabled: true,
        status: 'idle'
      },
      {
        name: 'incident_health_check',
        description: 'Check active incidents and update status',
        schedule: '*/2 * * * *', // Every 2 minutes
        enabled: true,
        status: 'idle'
      },
      {
        name: 'system_health_collection',
        description: 'Collect system health metrics',
        schedule: '*/1 * * * *', // Every minute
        enabled: true,
        status: 'idle'
      },
      {
        name: 'sla_calculation',
        description: 'Calculate SLA compliance metrics',
        schedule: '0 * * * *', // Every hour
        enabled: true,
        status: 'idle'
      },
      {
        name: 'baseline_recalculation',
        description: 'Recalculate performance baselines',
        schedule: '0 2 * * *', // Daily at 2 AM
        enabled: true,
        status: 'idle'
      }
    ]

    tasks.forEach(task => this.tasks.set(task.name, task))
  }

  /**
   * Execute a monitoring task
   */
  async executeTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName)
    if (!task || !task.enabled || this.runningTasks.has(taskName)) {
      return
    }

    this.runningTasks.add(taskName)
    task.status = 'running'
    task.lastRun = new Date().toISOString()

    try {
      console.log(`Starting monitoring task: ${taskName}`)
      
      switch (taskName) {
        case 'alert_check':
          await this.executeAlertCheck()
          break
        
        case 'business_metrics_collection':
          await this.executeBusinessMetricsCollection()
          break
        
        case 'performance_analysis':
          await this.executePerformanceAnalysis()
          break
        
        case 'incident_health_check':
          await this.executeIncidentHealthCheck()
          break
        
        case 'system_health_collection':
          await this.executeSystemHealthCollection()
          break
        
        case 'sla_calculation':
          await this.executeSLACalculation()
          break
        
        case 'baseline_recalculation':
          await this.executeBaselineRecalculation()
          break
        
        default:
          throw new Error(`Unknown task: ${taskName}`)
      }

      task.status = 'idle'
      task.errorMessage = undefined
      console.log(`Completed monitoring task: ${taskName}`)

    } catch (error) {
      task.status = 'error'
      task.errorMessage = error.message
      console.error(`Monitoring task failed: ${taskName}`, error)
      
      // Record error for monitoring
      await this.recordTaskError(taskName, error)
      
    } finally {
      this.runningTasks.delete(taskName)
    }
  }

  /**
   * Execute alert checking
   */
  private async executeAlertCheck(): Promise<void> {
    await alertingSystem.checkAlerts()
  }

  /**
   * Execute business metrics collection
   */
  private async executeBusinessMetricsCollection(): Promise<void> {
    // Collect current business metrics
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    
    // Get recent function metrics for business analysis
    const { data: functionMetrics } = await this.supabase
      .from('function_metrics')
      .select('*')
      .gte('recorded_at', oneHourAgo.toISOString())
    
    if (functionMetrics && functionMetrics.length > 0) {
      // Calculate business metrics from function data
      const searchRequests = functionMetrics.filter((m: any) => m.endpoint === '/similar').length
      const comparisons = functionMetrics.filter((m: any) => m.endpoint === '/compare').length
      const avgResponseTime = functionMetrics.reduce((sum: number, m: any) => 
        sum + (m.response_time_ms || 0), 0) / functionMetrics.length
      
      // Record business metrics
      businessMetrics.recordMetric('hourly_search_requests', searchRequests)
      businessMetrics.recordMetric('hourly_comparisons', comparisons)
      businessMetrics.recordMetric('avg_response_time', avgResponseTime)
    }
    
    // Get click data for conversion metrics
    const { data: clicks } = await this.supabase
      .from('click_logs')
      .select('*')
      .gte('created_at', oneHourAgo.toISOString())
    
    if (clicks && clicks.length > 0) {
      businessMetrics.recordMetric('hourly_clicks', clicks.length)
      
      // Calculate conversion rate
      const searches = functionMetrics?.filter((m: any) => m.endpoint === '/similar').length || 0
      const conversionRate = searches > 0 ? (clicks.length / searches) * 100 : 0
      businessMetrics.recordMetric('conversion_rate', conversionRate)
    }
  }

  /**
   * Execute performance analysis
   */
  private async executePerformanceAnalysis(): Promise<void> {
    // Analyze recent performance data
    const stats = performanceMonitor.getAllStats()
    
    for (const [endpoint, stat] of Object.entries(stats)) {
      if (stat) {
        // Check for performance anomalies
        if (stat.p95 > 5000) { // P95 > 5 seconds
          console.warn(`Performance anomaly detected: ${endpoint} P95 = ${stat.p95}ms`)
          
          // Could trigger an alert here
          await incidentResponse.processAlert('slow_response_time', {
            endpoint,
            p95: stat.p95,
            avg: stat.avg,
            count: stat.count
          })
        }
        
        // Record performance metrics
        await this.supabase
          .from('system_health_metrics')
          .insert({
            metric_name: `${endpoint}_response_time_p95`,
            metric_value: stat.p95,
            metric_unit: 'milliseconds'
          })
      }
    }
  }

  /**
   * Execute incident health check
   */
  private async executeIncidentHealthCheck(): Promise<void> {
    const activeIncidents = incidentResponse.getActiveIncidents()
    
    for (const incident of activeIncidents) {
      // Check if incident conditions have been resolved
      const isResolved = await this.checkIncidentResolution(incident)
      
      if (isResolved) {
        await incidentResponse.resolveIncident(
          incident.id,
          'Conditions have returned to normal',
          'Automated resolution based on metric recovery'
        )
      }
      
      // Update incident metrics
      const now = new Date().getTime()
      const startTime = new Date(incident.startedAt).getTime()
      const duration = (now - startTime) / 1000
      
      await this.supabase
        .from('system_health_metrics')
        .insert({
          metric_name: 'incident_duration',
          metric_value: duration,
          metric_unit: 'seconds',
          instance_id: incident.id
        })
    }
  }

  /**
   * Execute system health collection
   */
  private async executeSystemHealthCollection(): Promise<void> {
    // Collect system metrics
    const memoryUsage = Deno.memoryUsage()
    const memoryPercent = (memoryUsage.rss / memoryUsage.heapTotal) * 100
    
    // Record system health metrics
    const metrics = [
      {
        metric_name: 'memory_usage_bytes',
        metric_value: memoryUsage.rss,
        metric_unit: 'bytes'
      },
      {
        metric_name: 'memory_usage_percent',
        metric_value: memoryPercent,
        metric_unit: 'percent'
      },
      {
        metric_name: 'heap_total_bytes',
        metric_value: memoryUsage.heapTotal,
        metric_unit: 'bytes'
      },
      {
        metric_name: 'heap_used_bytes',
        metric_value: memoryUsage.heapUsed,
        metric_unit: 'bytes'
      }
    ]
    
    await this.supabase
      .from('system_health_metrics')
      .insert(metrics)
    
    // Check for system health alerts
    if (memoryPercent > 85) {
      await incidentResponse.processAlert('high_memory_usage', {
        memoryPercent,
        memoryUsage
      })
    }
  }

  /**
   * Execute SLA calculation
   */
  private async executeSLACalculation(): Promise<void> {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    
    // Calculate API availability
    const { data: functionMetrics } = await this.supabase
      .from('function_metrics')
      .select('*')
      .gte('recorded_at', oneHourAgo.toISOString())
    
    if (functionMetrics && functionMetrics.length > 0) {
      const totalRequests = functionMetrics.length
      const successfulRequests = functionMetrics.filter((m: any) => 
        m.response_time_ms && m.response_time_ms < 30000
      ).length
      
      const availability = (successfulRequests / totalRequests) * 100
      const avgResponseTime = functionMetrics.reduce((sum: number, m: any) => 
        sum + (m.response_time_ms || 0), 0) / totalRequests
      const errorRate = ((totalRequests - successfulRequests) / totalRequests) * 100
      
      // Record SLA metrics
      const slaMetrics = [
        {
          service_name: 'api_router',
          metric_type: 'availability',
          target_value: 99.9,
          actual_value: availability,
          measurement_period: 'hourly',
          period_start: oneHourAgo.toISOString(),
          period_end: now.toISOString(),
          sla_met: availability >= 99.9
        },
        {
          service_name: 'api_router',
          metric_type: 'response_time',
          target_value: 2000,
          actual_value: avgResponseTime,
          measurement_period: 'hourly',
          period_start: oneHourAgo.toISOString(),
          period_end: now.toISOString(),
          sla_met: avgResponseTime <= 2000
        },
        {
          service_name: 'api_router',
          metric_type: 'error_rate',
          target_value: 1,
          actual_value: errorRate,
          measurement_period: 'hourly',
          period_start: oneHourAgo.toISOString(),
          period_end: now.toISOString(),
          sla_met: errorRate <= 1
        }
      ]
      
      await this.supabase
        .from('sla_metrics')
        .insert(slaMetrics)
    }
  }

  /**
   * Execute baseline recalculation
   */
  private async executeBaselineRecalculation(): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    
    // Get historical performance data
    const { data: metrics } = await this.supabase
      .from('system_health_metrics')
      .select('*')
      .gte('recorded_at', sevenDaysAgo.toISOString())
    
    if (metrics && metrics.length > 0) {
      // Group by metric name and calculate baselines
      const metricGroups = new Map<string, number[]>()
      
      for (const metric of metrics) {
        if (!metricGroups.has(metric.metric_name)) {
          metricGroups.set(metric.metric_name, [])
        }
        metricGroups.get(metric.metric_name)!.push(metric.metric_value)
      }
      
      // Calculate and update baselines
      for (const [metricName, values] of metricGroups.entries()) {
        const sorted = values.sort((a, b) => a - b)
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length
        const stdDev = Math.sqrt(
          values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
        )
        
        const baseline = {
          metric_name: metricName,
          baseline_value: mean,
          upper_bound: mean + (2 * stdDev),
          lower_bound: Math.max(0, mean - (2 * stdDev)),
          sample_size: values.length,
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        }
        
        await this.supabase
          .from('performance_baselines')
          .upsert(baseline, { onConflict: 'metric_name' })
      }
    }
  }

  /**
   * Check if incident conditions have been resolved
   */
  private async checkIncidentResolution(incident: any): Promise<boolean> {
    // This would check if the conditions that triggered the incident have been resolved
    // For now, return false to keep incidents open until manually resolved
    return false
  }

  /**
   * Record task execution error
   */
  private async recordTaskError(taskName: string, error: Error): Promise<void> {
    try {
      await this.supabase
        .from('error_logs')
        .insert({
          error_type: 'monitoring_task_error',
          error_message: error.message,
          error_stack: error.stack,
          function_name: 'monitoring_scheduler',
          context: { task_name: taskName },
          severity: 'medium'
        })
    } catch (logError) {
      console.error('Failed to log task error:', logError)
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(): MonitoringTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Enable/disable task
   */
  setTaskEnabled(taskName: string, enabled: boolean): boolean {
    const task = this.tasks.get(taskName)
    if (task) {
      task.enabled = enabled
      return true
    }
    return false
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      return new Response('Unauthorized', { 
        status: 401,
        headers: corsHeaders
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const scheduler = new MonitoringScheduler(supabaseUrl, serviceRoleKey)
    
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const taskName = url.searchParams.get('task')

    switch (action) {
      case 'run_task':
        if (!taskName) {
          return new Response(
            JSON.stringify({ error: 'Task name required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        await scheduler.executeTask(taskName)
        return new Response(
          JSON.stringify({ message: `Task ${taskName} executed` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      
      case 'run_all':
        // Run all enabled tasks
        const tasks = scheduler.getTaskStatus()
        const enabledTasks = tasks.filter(t => t.enabled)
        
        const results = await Promise.allSettled(
          enabledTasks.map(task => scheduler.executeTask(task.name))
        )
        
        const summary = {
          total: enabledTasks.length,
          successful: results.filter(r => r.status === 'fulfilled').length,
          failed: results.filter(r => r.status === 'rejected').length
        }
        
        return new Response(
          JSON.stringify({ message: 'All tasks executed', summary }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      
      case 'status':
        const status = scheduler.getTaskStatus()
        return new Response(
          JSON.stringify({ tasks: status }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      
      case 'enable_task':
        if (!taskName) {
          return new Response(
            JSON.stringify({ error: 'Task name required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const enabled = scheduler.setTaskEnabled(taskName, true)
        return new Response(
          JSON.stringify({ message: enabled ? 'Task enabled' : 'Task not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      
      case 'disable_task':
        if (!taskName) {
          return new Response(
            JSON.stringify({ error: 'Task name required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        const disabled = scheduler.setTaskEnabled(taskName, false)
        return new Response(
          JSON.stringify({ message: disabled ? 'Task disabled' : 'Task not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      
      default:
        // Default: run alert check (most common operation)
        await scheduler.executeTask('alert_check')
        return new Response(
          JSON.stringify({ message: 'Alert check completed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('Monitoring scheduler error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})