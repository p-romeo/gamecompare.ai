/**
 * Validation script for monitoring and alerting system
 * Tests all monitoring components and endpoints
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SERVICE_ROLE_KEY')
  Deno.exit(1)
}

const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
}

/**
 * Test monitoring database schema
 */
async function testMonitoringSchema() {
  console.log('\n🔍 Testing monitoring database schema...')
  
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    
    // Test system_metrics table
    const { data: metricsData, error: metricsError } = await supabase
      .from('system_metrics')
      .select('*')
      .limit(1)
    
    if (metricsError) {
      console.error('❌ system_metrics table test failed:', metricsError.message)
      return false
    }
    console.log('✅ system_metrics table accessible')
    
    // Test alert_rules table
    const { data: rulesData, error: rulesError } = await supabase
      .from('alert_rules')
      .select('*')
      .limit(1)
    
    if (rulesError) {
      console.error('❌ alert_rules table test failed:', rulesError.message)
      return false
    }
    console.log('✅ alert_rules table accessible')
    
    // Test alerts table
    const { data: alertsData, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .limit(1)
    
    if (alertsError) {
      console.error('❌ alerts table test failed:', alertsError.message)
      return false
    }
    console.log('✅ alerts table accessible')
    
    // Test function_metrics table
    const { data: functionData, error: functionError } = await supabase
      .from('function_metrics')
      .select('*')
      .limit(1)
    
    if (functionError) {
      console.error('❌ function_metrics table test failed:', functionError.message)
      return false
    }
    console.log('✅ function_metrics table accessible')
    
    // Test business_metrics table
    const { data: businessData, error: businessError } = await supabase
      .from('business_metrics')
      .select('*')
      .limit(1)
    
    if (businessError) {
      console.error('❌ business_metrics table test failed:', businessError.message)
      return false
    }
    console.log('✅ business_metrics table accessible')
    
    return true
  } catch (error) {
    console.error('❌ Database schema test failed:', error.message)
    return false
  }
}

/**
 * Test monitoring utility functions
 */
async function testMonitoringUtilities() {
  console.log('\n🔧 Testing monitoring utilities...')
  
  try {
    const { MonitoringClient } = await import('./utils/monitoring.ts')
    const monitoring = new MonitoringClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    
    // Test metric recording
    await monitoring.recordMetric({
      name: 'test_metric',
      value: 42,
      unit: 'count',
      tags: { test: 'validation' }
    })
    console.log('✅ Metric recording works')
    
    // Test function metric recording
    await monitoring.recordFunctionMetric({
      function_name: 'test_function',
      endpoint: '/test',
      method: 'GET',
      status_code: 200,
      response_time_ms: 150,
      request_id: 'test-request-id'
    })
    console.log('✅ Function metric recording works')
    
    return true
  } catch (error) {
    console.error('❌ Monitoring utilities test failed:', error.message)
    return false
  }
}

/**
 * Test health check endpoints
 */
async function testHealthCheckEndpoints() {
  console.log('\n🏥 Testing health check endpoints...')
  
  try {
    // Test basic health endpoint
    const basicHealthResponse = await fetch(`${SUPABASE_URL}/functions/v1/health_check/health`, {
      headers
    })
    
    if (!basicHealthResponse.ok) {
      console.error('❌ Basic health check failed:', basicHealthResponse.status)
      return false
    }
    console.log('✅ Basic health check endpoint works')
    
    // Test detailed health endpoint
    const detailedHealthResponse = await fetch(`${SUPABASE_URL}/functions/v1/health_check/health/detailed`, {
      headers
    })
    
    if (!detailedHealthResponse.ok) {
      console.error('❌ Detailed health check failed:', detailedHealthResponse.status)
      return false
    }
    
    const healthData = await detailedHealthResponse.json()
    console.log('✅ Detailed health check endpoint works')
    console.log(`   Overall status: ${healthData.overall_status}`)
    console.log(`   Checks performed: ${healthData.checks?.length || 0}`)
    
    return true
  } catch (error) {
    console.error('❌ Health check endpoints test failed:', error.message)
    return false
  }
}

/**
 * Test monitoring dashboard endpoints
 */
async function testMonitoringDashboard() {
  console.log('\n📊 Testing monitoring dashboard endpoints...')
  
  try {
    // Test dashboard overview
    const dashboardResponse = await fetch(`${SUPABASE_URL}/functions/v1/monitoring_dashboard/dashboard`, {
      headers
    })
    
    if (!dashboardResponse.ok) {
      console.error('❌ Dashboard endpoint failed:', dashboardResponse.status)
      return false
    }
    console.log('✅ Dashboard overview endpoint works')
    
    // Test health status endpoint
    const healthStatusResponse = await fetch(`${SUPABASE_URL}/functions/v1/monitoring_dashboard/health-status`, {
      headers
    })
    
    if (!healthStatusResponse.ok) {
      console.error('❌ Health status endpoint failed:', healthStatusResponse.status)
      return false
    }
    console.log('✅ Health status endpoint works')
    
    // Test alerts endpoint
    const alertsResponse = await fetch(`${SUPABASE_URL}/functions/v1/monitoring_dashboard/alerts`, {
      headers
    })
    
    if (!alertsResponse.ok) {
      console.error('❌ Alerts endpoint failed:', alertsResponse.status)
      return false
    }
    console.log('✅ Alerts endpoint works')
    
    return true
  } catch (error) {
    console.error('❌ Monitoring dashboard test failed:', error.message)
    return false
  }
}

/**
 * Test alert system
 */
async function testAlertSystem() {
  console.log('\n🚨 Testing alert system...')
  
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    
    // Create a test alert rule
    const { error: ruleError } = await supabase
      .from('alert_rules')
      .upsert({
        name: 'test_alert_rule',
        metric_name: 'test_metric',
        condition: '>',
        threshold: 40,
        severity: 'warning',
        description: 'Test alert rule for validation',
        enabled: true
      })
    
    if (ruleError) {
      console.error('❌ Failed to create test alert rule:', ruleError.message)
      return false
    }
    console.log('✅ Test alert rule created')
    
    // Test alert condition checking
    const { error: checkError } = await supabase.rpc('check_alert_conditions')
    
    if (checkError) {
      console.error('❌ Alert condition check failed:', checkError.message)
      return false
    }
    console.log('✅ Alert condition checking works')
    
    // Check if alert was fired
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'firing')
      .limit(5)
    
    if (alertsError) {
      console.error('❌ Failed to query alerts:', alertsError.message)
      return false
    }
    
    console.log(`✅ Alert system functional (${alerts?.length || 0} active alerts)`)
    
    // Clean up test alert rule
    await supabase
      .from('alert_rules')
      .delete()
      .eq('name', 'test_alert_rule')
    
    return true
  } catch (error) {
    console.error('❌ Alert system test failed:', error.message)
    return false
  }
}

/**
 * Test monitoring scheduler
 */
async function testMonitoringScheduler() {
  console.log('\n⏰ Testing monitoring scheduler...')
  
  try {
    // Test aggregate metrics endpoint
    const aggregateResponse = await fetch(`${SUPABASE_URL}/functions/v1/monitoring_scheduler/aggregate-metrics`, {
      method: 'POST',
      headers
    })
    
    if (!aggregateResponse.ok) {
      console.error('❌ Aggregate metrics endpoint failed:', aggregateResponse.status)
      return false
    }
    console.log('✅ Aggregate metrics endpoint works')
    
    // Test check alerts endpoint
    const checkAlertsResponse = await fetch(`${SUPABASE_URL}/functions/v1/monitoring_scheduler/check-alerts`, {
      method: 'POST',
      headers
    })
    
    if (!checkAlertsResponse.ok) {
      console.error('❌ Check alerts endpoint failed:', checkAlertsResponse.status)
      return false
    }
    console.log('✅ Check alerts endpoint works')
    
    return true
  } catch (error) {
    console.error('❌ Monitoring scheduler test failed:', error.message)
    return false
  }
}

/**
 * Run all validation tests
 */
async function runAllTests() {
  console.log('🚀 Starting monitoring system validation...')
  
  const tests = [
    { name: 'Database Schema', fn: testMonitoringSchema },
    { name: 'Monitoring Utilities', fn: testMonitoringUtilities },
    { name: 'Health Check Endpoints', fn: testHealthCheckEndpoints },
    { name: 'Monitoring Dashboard', fn: testMonitoringDashboard },
    { name: 'Alert System', fn: testAlertSystem },
    { name: 'Monitoring Scheduler', fn: testMonitoringScheduler }
  ]
  
  const results = []
  
  for (const test of tests) {
    try {
      const result = await test.fn()
      results.push({ name: test.name, passed: result })
    } catch (error) {
      console.error(`❌ ${test.name} test crashed:`, error.message)
      results.push({ name: test.name, passed: false })
    }
  }
  
  // Summary
  console.log('\n📋 Validation Summary:')
  console.log('=' .repeat(50))
  
  const passed = results.filter(r => r.passed).length
  const total = results.length
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL'
    console.log(`${status} ${result.name}`)
  })
  
  console.log('=' .repeat(50))
  console.log(`Overall: ${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('🎉 All monitoring system tests passed!')
    return true
  } else {
    console.log('⚠️  Some monitoring system tests failed. Please review the output above.')
    return false
  }
}

// Run the validation
if (import.meta.main) {
  const success = await runAllTests()
  Deno.exit(success ? 0 : 1)
}