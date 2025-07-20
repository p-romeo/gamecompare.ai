/**
 * Monitoring Dashboard Edge Function
 * Provides comprehensive system monitoring dashboard and metrics endpoints
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MonitoringClient } from './utils/monitoring.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DashboardMetrics {
  system_health: any
  active_alerts: any[]
  recent_metrics: any[]
  function_performance: any[]
  business_metrics: any[]
  error_summary: any[]
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname

    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized access' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 401 
        }
      )
    }

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const monitoring = new MonitoringClient(supabaseUrl, serviceRoleKey)

    // Dashboard overview endpoint
    if (path.endsWith('/dashboard') || path.endsWith('/dashboard/')) {
      const dashboardData: DashboardMetrics = {
        system_health: await monitoring.getSystemHealth(),
        active_alerts: await getActiveAlerts(supabase),
        recent_metrics: await getRecentMetrics(supabase),
        function_performance: await getFunctionPerformance(supabase),
        business_metrics: await getBusinessMetrics(supabase),
        error_summary: await getErrorSummary(supabase)
      }

      return new Response(
        JSON.stringify(dashboardData, null, 2),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // System health endpoint
    if (path.endsWith('/health-status') || path.endsWith('/health-status/')) {
      const healthStatus = await monitoring.getSystemHealth()
      
      return new Response(
        JSON.stringify(healthStatus),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // Active alerts endpoint
    if (path.endsWith('/alerts') || path.endsWith('/alerts/')) {
      const severity = url.searchParams.get('severity')
      const alerts = await getActiveAlerts(supabase, severity as any)
      
      return new Response(
        JSON.stringify({ alerts }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // Metrics endpoint
    if (path.endsWith('/metrics') || path.endsWith('/metrics/')) {
      const metricName = url.searchParams.get('metric')
      const hours = parseInt(url.searchParams.get('hours') || '24')
      
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
      const endTime = new Date()
      
      let metrics
      if (metricName) {
        metrics = await getSpecificMetrics(supabase, metricName, startTime, endTime)
      } else {
        metrics = await getRecentMetrics(supabase, hours)
      }
      
      return new Response(
        JSON.stringify({ metrics }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // Function performance endpoint
    if (path.endsWith('/performance') || path.endsWith('/performance/')) {
      const functionName = url.searchParams.get('function')
      const hours = parseInt(url.searchParams.get('hours') || '24')
      
      const performance = await getFunctionPerformance(supabase, functionName, hours)
      
      return new Response(
        JSON.stringify({ performance }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // Business metrics endpoint
    if (path.endsWith('/business') || path.endsWith('/business/')) {
      const hours = parseInt(url.searchParams.get('hours') || '24')
      const businessMetrics = await getBusinessMetrics(supabase, hours)
      
      return new Response(
        JSON.stringify({ business_metrics: businessMetrics }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // Trigger alert check endpoint
    if (path.endsWith('/check-alerts') && req.method === 'POST') {
      await monitoring.checkAlertConditions()
      
      return new Response(
        JSON.stringify({ message: 'Alert conditions checked' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }

    // Default response
    return new Response(
      JSON.stringify({ 
        error: 'Monitoring endpoint not found',
        available_endpoints: [
          '/dashboard', '/health-status', '/alerts', 
          '/metrics', '/performance', '/business', '/check-alerts'
        ]
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 404 
      }
    )

  } catch (error) {
    console.error('Monitoring dashboard error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Monitoring dashboard failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})

async function getActiveAlerts(supabase: any, severity?: string): Promise<any[]> {
  try {
    let query = supabase
      .from('alerts')
      .select(`
        *,
        alert_rules (
          name,
          metric_name,
          condition,
          threshold,
          severity,
          description
        )
      `)
      .eq('status', 'firing')
      .order('fired_at', { ascending: false })

    if (severity) {
      query = query.eq('alert_rules.severity', severity)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to get active alerts:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting active alerts:', error)
    return []
  }
}

async function getRecentMetrics(supabase: any, hours: number = 1): Promise<any[]> {
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    const { data, error } = await supabase
      .from('system_metrics')
      .select('*')
      .gte('recorded_at', startTime.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Failed to get recent metrics:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting recent metrics:', error)
    return []
  }
}

async function getSpecificMetrics(
  supabase: any, 
  metricName: string, 
  startTime: Date, 
  endTime: Date
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('system_metrics')
      .select('*')
      .eq('metric_name', metricName)
      .gte('recorded_at', startTime.toISOString())
      .lte('recorded_at', endTime.toISOString())
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('Failed to get specific metrics:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting specific metrics:', error)
    return []
  }
}

async function getFunctionPerformance(
  supabase: any, 
  functionName?: string, 
  hours: number = 24
): Promise<any[]> {
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    let query = supabase
      .from('function_metrics')
      .select('*')
      .gte('recorded_at', startTime.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(1000)

    if (functionName) {
      query = query.eq('function_name', functionName)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to get function performance:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting function performance:', error)
    return []
  }
}

async function getBusinessMetrics(supabase: any, hours: number = 24): Promise<any[]> {
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    const { data, error } = await supabase
      .from('business_metrics')
      .select('*')
      .gte('time_bucket', startTime.toISOString())
      .order('time_bucket', { ascending: false })

    if (error) {
      console.error('Failed to get business metrics:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting business metrics:', error)
    return []
  }
}

async function getErrorSummary(supabase: any): Promise<any[]> {
  try {
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    
    const { data, error } = await supabase
      .from('function_metrics')
      .select('function_name, endpoint, status_code, error_message, recorded_at')
      .gte('status_code', 400)
      .gte('recorded_at', startTime.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Failed to get error summary:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error getting error summary:', error)
    return []
  }
}