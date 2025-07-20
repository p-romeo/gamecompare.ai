/**
 * Monitoring and Alerting Utilities
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface MetricData {
  name: string
  value: number
  unit?: string
  tags?: Record<string, any>
}

export interface FunctionMetric {
  function_name: string
  endpoint?: string
  method?: string
  status_code?: number
  response_time_ms: number
  error_message?: string
  request_id?: string
  client_ip?: string
  user_agent?: string
}

export class MonitoringClient {
  private supabase: any

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  async recordMetric(metric: MetricData): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('system_metrics')
        .insert({
          metric_name: metric.name,
          metric_value: metric.value,
          metric_unit: metric.unit,
          tags: metric.tags || {}
        })

      if (error) {
        console.error('Failed to record metric:', error)
      }
    } catch (error) {
      console.error('Error recording metric:', error)
    }
  }

  async recordMetrics(metrics: MetricData[]): Promise<void> {
    try {
      const records = metrics.map(metric => ({
        metric_name: metric.name,
        metric_value: metric.value,
        metric_unit: metric.unit,
        tags: metric.tags || {}
      }))

      const { error } = await this.supabase
        .from('system_metrics')
        .insert(records)

      if (error) {
        console.error('Failed to record metrics batch:', error)
      }
    } catch (error) {
      console.error('Error recording metrics batch:', error)
    }
  }

  async recordFunctionMetric(metric: FunctionMetric): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('function_metrics')
        .insert(metric)

      if (error) {
        console.error('Failed to record function metric:', error)
      }
    } catch (error) {
      console.error('Error recording function metric:', error)
    }
  }

  async getSystemHealth(): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('system_health_dashboard')
        .select('*')
        .single()

      if (error) {
        console.error('Failed to get system health:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error getting system health:', error)
      return null
    }
  }

  async checkAlertConditions(): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('check_alert_conditions')

      if (error) {
        console.error('Failed to check alert conditions:', error)
      }
    } catch (error) {
      console.error('Error checking alert conditions:', error)
    }
  }
}

export const ALERT_THRESHOLDS = {
  RESPONSE_TIME_WARNING: 2000,
  RESPONSE_TIME_CRITICAL: 5000,
  ERROR_RATE_WARNING: 5,
  ERROR_RATE_CRITICAL: 10
}