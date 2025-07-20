/**
 * Performance Dashboard Edge Function
 * Provides real-time performance metrics and system health monitoring
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { performanceMonitor } from './utils/performance.ts'
import { cacheManager } from './utils/cache.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PerformanceMetrics {
  timestamp: string
  system: {
    uptime: number
    memory: {
      used: number
      total: number
      percentage: number
    }
    cache: {
      hitRate: number
      size: number
      stats: any
    }
  }
  api: {
    totalRequests: number
    averageResponseTime: number
    errorRate: number
    endpoints: Record<string, {
      requests: number
      avgTime: number
      errors: number
    }>
  }
  database: {
    connections: number
    slowQueries: any[]
    tableStats: any[]
  }
  business: {
    searchRequests: number
    comparisons: number
    clickThroughs: number
    conversions: number
  }
}

/**
 * Get system performance metrics
 */
async function getSystemMetrics(): Promise<any> {
  const memoryUsage = Deno.memoryUsage()
  
  return {
    uptime: performance.now(),
    memory: {
      used: memoryUsage.rss,
      total: memoryUsage.heapTotal,
      percentage: (memoryUsage.rss / memoryUsage.heapTotal) * 100
    },
    cache: {
      hitRate: 0, // Will be calculated from cache stats
      size: 0,
      stats: {} // Will be populated from cache manager
    }
  }
}

/**
 * Get API performance metrics
 */
function getAPIMetrics(): any {
  const allStats = performanceMonitor.getAllStats()
  
  let totalRequests = 0
  let totalTime = 0
  let totalErrors = 0
  const endpoints: Record<string, any> = {}
  
  for (const [endpoint, stats] of Object.entries(allStats)) {
    if (stats) {
      totalRequests += stats.count
      totalTime += stats.avg * stats.count
      
      endpoints[endpoint] = {
        requests: stats.count,
        avgTime: stats.avg,
        p95Time: stats.p95,
        minTime: stats.min,
        maxTime: stats.max,
        errors: 0 // Would need separate error tracking
      }
    }
  }
  
  return {
    totalRequests,
    averageResponseTime: totalRequests > 0 ? totalTime / totalRequests : 0,
    errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
    endpoints
  }
}

/**
 * Get database performance metrics
 */
async function getDatabaseMetrics(supabase: any): Promise<any> {
  try {
    // Get table statistics
    const { data: tableStats } = await supabase.rpc('get_performance_stats')
    
    // Get slow queries (if pg_stat_statements is available)
    const { data: slowQueries } = await supabase.rpc('get_slow_queries')
    
    return {
      connections: 0, // Would need to query pg_stat_activity
      slowQueries: slowQueries || [],
      tableStats: tableStats || []
    }
  } catch (error) {
    console.error('Failed to get database metrics:', error)
    return {
      connections: 0,
      slowQueries: [],
      tableStats: []
    }
  }
}

/**
 * Get business metrics
 */
async function getBusinessMetrics(supabase: any): Promise<any> {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Get search requests from function metrics
    const { data: searchMetrics } = await supabase
      .from('function_metrics')
      .select('*')
      .eq('function_name', 'api_router')
      .eq('endpoint', '/similar')
      .gte('recorded_at', today.toISOString())
    
    // Get comparison requests
    const { data: comparisonMetrics } = await supabase
      .from('function_metrics')
      .select('*')
      .eq('function_name', 'api_router')
      .eq('endpoint', '/compare')
      .gte('recorded_at', today.toISOString())
    
    // Get click-through data
    const { data: clickData } = await supabase
      .from('click_logs')
      .select('*')
      .gte('created_at', today.toISOString())
    
    return {
      searchRequests: searchMetrics?.length || 0,
      comparisons: comparisonMetrics?.length || 0,
      clickThroughs: clickData?.length || 0,
      conversions: 0 // Would need conversion tracking
    }
  } catch (error) {
    console.error('Failed to get business metrics:', error)
    return {
      searchRequests: 0,
      comparisons: 0,
      clickThroughs: 0,
      conversions: 0
    }
  }
}

/**
 * Generate performance report
 */
async function generatePerformanceReport(supabase: any): Promise<PerformanceMetrics> {
  const [systemMetrics, apiMetrics, dbMetrics, businessMetrics] = await Promise.all([
    getSystemMetrics(),
    getAPIMetrics(),
    getDatabaseMetrics(supabase),
    getBusinessMetrics(supabase)
  ])
  
  return {
    timestamp: new Date().toISOString(),
    system: systemMetrics,
    api: apiMetrics,
    database: dbMetrics,
    business: businessMetrics
  }
}

/**
 * Generate HTML dashboard
 */
function generateDashboardHTML(metrics: PerformanceMetrics): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GameCompare.ai Performance Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .dashboard {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #333;
        }
        .metric-value {
            font-size: 24px;
            font-weight: 700;
            color: #2563eb;
            margin-bottom: 5px;
        }
        .metric-label {
            font-size: 14px;
            color: #666;
        }
        .status-good { color: #16a34a; }
        .status-warning { color: #ea580c; }
        .status-error { color: #dc2626; }
        .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        .table th, .table td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        .table th {
            background: #f9fafb;
            font-weight: 600;
        }
        .refresh-btn {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover {
            background: #1d4ed8;
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>GameCompare.ai Performance Dashboard</h1>
            <p>Last updated: ${metrics.timestamp}</p>
            <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">System Health</div>
                <div class="metric-value">${(metrics.system.memory.percentage).toFixed(1)}%</div>
                <div class="metric-label">Memory Usage</div>
                <div style="margin-top: 10px;">
                    <div>Used: ${(metrics.system.memory.used / 1024 / 1024).toFixed(1)} MB</div>
                    <div>Total: ${(metrics.system.memory.total / 1024 / 1024).toFixed(1)} MB</div>
                </div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">API Performance</div>
                <div class="metric-value">${metrics.api.averageResponseTime.toFixed(0)}ms</div>
                <div class="metric-label">Average Response Time</div>
                <div style="margin-top: 10px;">
                    <div>Total Requests: ${metrics.api.totalRequests}</div>
                    <div>Error Rate: ${metrics.api.errorRate.toFixed(2)}%</div>
                </div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Business Metrics</div>
                <div class="metric-value">${metrics.business.searchRequests}</div>
                <div class="metric-label">Search Requests Today</div>
                <div style="margin-top: 10px;">
                    <div>Comparisons: ${metrics.business.comparisons}</div>
                    <div>Click-throughs: ${metrics.business.clickThroughs}</div>
                </div>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Database</div>
                <div class="metric-value">${metrics.database.slowQueries.length}</div>
                <div class="metric-label">Slow Queries</div>
                <div style="margin-top: 10px;">
                    <div>Tables: ${metrics.database.tableStats.length}</div>
                </div>
            </div>
        </div>
        
        <div class="metric-card" style="margin-top: 20px;">
            <div class="metric-title">API Endpoints Performance</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th>Requests</th>
                        <th>Avg Time</th>
                        <th>P95 Time</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(metrics.api.endpoints).map(([endpoint, stats]: [string, any]) => `
                        <tr>
                            <td>${endpoint}</td>
                            <td>${stats.requests}</td>
                            <td>${stats.avgTime.toFixed(0)}ms</td>
                            <td>${stats.p95Time.toFixed(0)}ms</td>
                            <td class="${stats.avgTime < 1000 ? 'status-good' : stats.avgTime < 2000 ? 'status-warning' : 'status-error'}">
                                ${stats.avgTime < 1000 ? 'Good' : stats.avgTime < 2000 ? 'Warning' : 'Slow'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        ${metrics.database.tableStats.length > 0 ? `
        <div class="metric-card" style="margin-top: 20px;">
            <div class="metric-title">Database Tables</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Table</th>
                        <th>Rows</th>
                        <th>Table Size</th>
                        <th>Index Size</th>
                        <th>Total Size</th>
                    </tr>
                </thead>
                <tbody>
                    ${metrics.database.tableStats.map((table: any) => `
                        <tr>
                            <td>${table.table_name}</td>
                            <td>${table.row_count?.toLocaleString() || 'N/A'}</td>
                            <td>${table.table_size || 'N/A'}</td>
                            <td>${table.index_size || 'N/A'}</td>
                            <td>${table.total_size || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}
    </div>
    
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
  `.trim()
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const url = new URL(req.url)
    const format = url.searchParams.get('format') || 'html'

    // Generate performance report
    const metrics = await generatePerformanceReport(supabase)

    if (format === 'json') {
      return new Response(
        JSON.stringify(metrics, null, 2),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      )
    }

    // Return HTML dashboard
    const html = generateDashboardHTML(metrics)
    return new Response(html, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/html' 
      }
    })

  } catch (error) {
    console.error('Dashboard error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    )
  }
})