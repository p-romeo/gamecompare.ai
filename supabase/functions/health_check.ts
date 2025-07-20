/**
 * Health Check Edge Function
 * Provides system health monitoring endpoints for external monitoring services
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MonitoringClient, MetricData } from './utils/monitoring.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HealthCheckResult {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  response_time_ms: number
  error?: string
  details?: Record<string, any>
}

interface SystemHealth {
  overall_status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: HealthCheckResult[]
  uptime_seconds: number
  version: string
}

const startTime = Date.now()

/**
 * Check database connectivity and performance
 */
async function checkDatabase(supabase: any): Promise<HealthCheckResult> {
  const start = Date.now()
  
  try {
    // Test basic connectivity
    const { data, error } = await supabase
      .from('games')
      .select('id')
      .limit(1)
    
    const responseTime = Date.now() - start
    
    if (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        response_time_ms: responseTime,
        error: error.message
      }
    }
    
    // Check response time thresholds
    const status = responseTime > 1000 ? 'degraded' : 'healthy'
    
    return {
      service: 'database',
      status,
      response_time_ms: responseTime,
      details: {
        query_executed: 'SELECT id FROM games LIMIT 1',
        records_found: data?.length || 0
      }
    }
  } catch (error) {
    return {
      service: 'database',
      status: 'unhealthy',
      response_time_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown database error'
    }
  }
}

/**
 * Check vector database (Pinecone) connectivity
 */
async function checkVectorDatabase(): Promise<HealthCheckResult> {
  const start = Date.now()
  
  try {
    const pineconeApiKey = Deno.env.get('PINECONE_API_KEY')
    const pineconeEnvironment = Deno.env.get('PINECONE_ENVIRONMENT')
    const pineconeIndexName = Deno.env.get('PINECONE_INDEX_NAME')
    
    if (!pineconeApiKey || !pineconeEnvironment || !pineconeIndexName) {
      return {
        service: 'vector_database',
        status: 'unhealthy',
        response_time_ms: Date.now() - start,
        error: 'Pinecone configuration missing'
      }
    }
    
    // Test Pinecone index stats endpoint
    const response = await fetch(
      `https://${pineconeIndexName}-${pineconeEnvironment}.svc.pinecone.io/describe_index_stats`,
      {
        method: 'POST',
        headers: {
          'Api-Key': pineconeApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    )
    
    const responseTime = Date.now() - start
    
    if (!response.ok) {
      return {
        service: 'vector_database',
        status: 'unhealthy',
        response_time_ms: responseTime,
        error: `Pinecone API error: ${response.status} ${response.statusText}`
      }
    }
    
    const stats = await response.json()
    const status = responseTime > 2000 ? 'degraded' : 'healthy'
    
    return {
      service: 'vector_database',
      status,
      response_time_ms: responseTime,
      details: {
        total_vector_count: stats.totalVectorCount || 0,
        dimension: stats.dimension || 0
      }
    }
  } catch (error) {
    return {
      service: 'vector_database',
      status: 'unhealthy',
      response_time_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown Pinecone error'
    }
  }
}

/**
 * Check OpenAI API connectivity
 */
async function checkOpenAI(): Promise<HealthCheckResult> {
  const start = Date.now()
  
  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openaiApiKey) {
      return {
        service: 'openai_api',
        status: 'unhealthy',
        response_time_ms: Date.now() - start,
        error: 'OpenAI API key not configured'
      }
    }
    
    // Test OpenAI models endpoint (lightweight check)
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    const responseTime = Date.now() - start
    
    if (!response.ok) {
      return {
        service: 'openai_api',
        status: 'unhealthy',
        response_time_ms: responseTime,
        error: `OpenAI API error: ${response.status} ${response.statusText}`
      }
    }
    
    const models = await response.json()
    const status = responseTime > 3000 ? 'degraded' : 'healthy'
    
    return {
      service: 'openai_api',
      status,
      response_time_ms: responseTime,
      details: {
        models_available: models.data?.length || 0,
        gpt4_available: models.data?.some((m: any) => m.id.includes('gpt-4')) || false
      }
    }
  } catch (error) {
    return {
      service: 'openai_api',
      status: 'unhealthy',
      response_time_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown OpenAI error'
    }
  }
}

/**
 * Check external APIs (RAWG, Steam, OpenCritic)
 */
async function checkExternalAPIs(): Promise<HealthCheckResult[]> {
  const checks: Promise<HealthCheckResult>[] = []
  
  // RAWG API check
  checks.push((async () => {
    const start = Date.now()
    try {
      const rawgApiKey = Deno.env.get('RAWG_API_KEY')
      if (!rawgApiKey) {
        return {
          service: 'rawg_api',
          status: 'unhealthy' as const,
          response_time_ms: Date.now() - start,
          error: 'RAWG API key not configured'
        }
      }
      
      const response = await fetch(`https://api.rawg.io/api/games?key=${rawgApiKey}&page_size=1`)
      const responseTime = Date.now() - start
      
      if (!response.ok) {
        return {
          service: 'rawg_api',
          status: 'unhealthy' as const,
          response_time_ms: responseTime,
          error: `RAWG API error: ${response.status}`
        }
      }
      
      const status = responseTime > 5000 ? 'degraded' : 'healthy'
      return {
        service: 'rawg_api',
        status: status as const,
        response_time_ms: responseTime
      }
    } catch (error) {
      return {
        service: 'rawg_api',
        status: 'unhealthy' as const,
        response_time_ms: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown RAWG error'
      }
    }
  })())
  
  // Steam API check
  checks.push((async () => {
    const start = Date.now()
    try {
      const steamApiKey = Deno.env.get('STEAM_API_KEY')
      if (!steamApiKey) {
        return {
          service: 'steam_api',
          status: 'degraded' as const, // Steam is optional
          response_time_ms: Date.now() - start,
          error: 'Steam API key not configured'
        }
      }
      
      // Test Steam Web API
      const response = await fetch(`https://api.steampowered.com/ISteamApps/GetAppList/v2/?key=${steamApiKey}&max_length=1`)
      const responseTime = Date.now() - start
      
      if (!response.ok) {
        return {
          service: 'steam_api',
          status: 'degraded' as const,
          response_time_ms: responseTime,
          error: `Steam API error: ${response.status}`
        }
      }
      
      const status = responseTime > 5000 ? 'degraded' : 'healthy'
      return {
        service: 'steam_api',
        status: status as const,
        response_time_ms: responseTime
      }
    } catch (error) {
      return {
        service: 'steam_api',
        status: 'degraded' as const,
        response_time_ms: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown Steam error'
      }
    }
  })())
  
  return Promise.all(checks)
}

/**
 * Determine overall system status based on individual checks
 */
function determineOverallStatus(checks: HealthCheckResult[]): 'healthy' | 'degraded' | 'unhealthy' {
  const criticalServices = ['database', 'vector_database', 'openai_api']
  
  // Check if any critical service is unhealthy
  const criticalUnhealthy = checks.some(check => 
    criticalServices.includes(check.service) && check.status === 'unhealthy'
  )
  
  if (criticalUnhealthy) {
    return 'unhealthy'
  }
  
  // Check if any service is degraded
  const anyDegraded = checks.some(check => check.status === 'degraded')
  
  if (anyDegraded) {
    return 'degraded'
  }
  
  return 'healthy'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    const url = new URL(req.url)
    const path = url.pathname
    
    // Basic health check endpoint
    if (path.endsWith('/health') || path.endsWith('/health/')) {
      return new Response(
        JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }
    
    // Detailed health check endpoint
    if (path.endsWith('/health/detailed') || path.endsWith('/health/detailed/')) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const monitoring = new MonitoringClient(supabaseUrl, serviceRoleKey)
      
      // Run all health checks in parallel
      const [
        databaseCheck,
        vectorDbCheck,
        openaiCheck,
        ...externalApiChecks
      ] = await Promise.all([
        checkDatabase(supabase),
        checkVectorDatabase(),
        checkOpenAI(),
        ...await checkExternalAPIs()
      ])
      
      const allChecks = [databaseCheck, vectorDbCheck, openaiCheck, ...externalApiChecks]
      const overallStatus = determineOverallStatus(allChecks)
      
      // Record health check metrics
      const metrics: MetricData[] = allChecks.map(check => ({
        name: `${check.service}_response_time_ms`,
        value: check.response_time_ms,
        unit: 'milliseconds',
        tags: { service: check.service, status: check.status }
      }))
      
      // Add overall system status metric
      metrics.push({
        name: 'system_health_status',
        value: overallStatus === 'healthy' ? 1 : overallStatus === 'degraded' ? 0.5 : 0,
        tags: { status: overallStatus }
      })
      
      // Record metrics asynchronously
      Promise.all(metrics.map(metric => monitoring.recordMetric(metric))).catch(console.error)
      
      // Check alert conditions
      monitoring.checkAlertConditions().catch(console.error)
      
      const healthReport: SystemHealth = {
        overall_status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: allChecks,
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
        version: Deno.env.get('APP_VERSION') || '1.0.0'
      }
      
      const statusCode = overallStatus === 'healthy' ? 200 : 
                        overallStatus === 'degraded' ? 200 : 503
      
      return new Response(
        JSON.stringify(healthReport, null, 2),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: statusCode 
        }
      )
    }
    
    // Readiness check (for Kubernetes/container orchestration)
    if (path.endsWith('/ready') || path.endsWith('/ready/')) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      // Only check critical services for readiness
      const databaseCheck = await checkDatabase(supabase)
      
      if (databaseCheck.status === 'unhealthy') {
        return new Response(
          JSON.stringify({ 
            ready: false, 
            reason: 'Database unavailable',
            timestamp: new Date().toISOString()
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 503 
          }
        )
      }
      
      return new Response(
        JSON.stringify({ 
          ready: true, 
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }
    
    // Liveness check (for Kubernetes/container orchestration)
    if (path.endsWith('/live') || path.endsWith('/live/')) {
      return new Response(
        JSON.stringify({ 
          alive: true, 
          timestamp: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200 
        }
      )
    }
    
    // Default response
    return new Response(
      JSON.stringify({ 
        error: 'Health check endpoint not found',
        available_endpoints: ['/health', '/health/detailed', '/ready', '/live']
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 404 
      }
    )
    
  } catch (error) {
    console.error('Health check error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})