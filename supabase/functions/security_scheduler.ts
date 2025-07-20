/**
 * Security Scheduler Edge Function
 * Automated security tasks including rotation checks, cleanup, and monitoring
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rotationScheduler } from './utils/secret_management.ts'
import { auditLogger } from './utils/audit_logging.ts'
import { securityManager } from './utils/security.ts'

interface ScheduledTask {
  name: string
  description: string
  lastRun?: string
  nextRun?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: any
  error?: string
}

serve(async (req) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()
  
  try {
    // Verify this is a scheduled request (from cron or internal system)
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const url = new URL(req.url)
    const taskType = url.searchParams.get('task') || 'all'
    
    console.log(`Starting security scheduler tasks: ${taskType}`)
    
    const tasks: ScheduledTask[] = []
    const results = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      tasks: [] as ScheduledTask[]
    }

    // Task 1: Rotation Check
    if (taskType === 'all' || taskType === 'rotation') {
      const rotationTask: ScheduledTask = {
        name: 'rotation_check',
        description: 'Check and rotate secrets and API keys',
        status: 'running'
      }
      
      try {
        console.log('Running rotation check...')
        const rotationResult = await rotationScheduler.runRotationCheck()
        
        rotationTask.status = 'completed'
        rotationTask.result = rotationResult
        
        console.log(`Rotation check completed: ${rotationResult.secretsRotated.length} secrets, ${rotationResult.keysRotated.length} keys rotated`)
        
        // Log significant rotations
        if (rotationResult.secretsRotated.length > 0 || rotationResult.keysRotated.length > 0) {
          await auditLogger.logAuditEntry({
            requestId,
            clientIp: 'system',
            method: 'POST',
            endpoint: '/security_scheduler?task=rotation',
            responseStatus: 200,
            responseTimeMs: Date.now() - startTime,
            success: true,
            sensitiveDataAccessed: ['rotation_performed']
          })
        }
        
        results.completedTasks++
      } catch (error) {
        console.error('Rotation check failed:', error)
        rotationTask.status = 'failed'
        rotationTask.error = error.message
        results.failedTasks++
      }
      
      tasks.push(rotationTask)
      results.totalTasks++
    }

    // Task 2: Security Cleanup
    if (taskType === 'all' || taskType === 'cleanup') {
      const cleanupTask: ScheduledTask = {
        name: 'security_cleanup',
        description: 'Clean up expired blocks, old logs, and security data',
        status: 'running'
      }
      
      try {
        console.log('Running security cleanup...')
        
        // Clean up expired IP blocks
        const { error: cleanupError } = await supabase.rpc('cleanup_expired_blocks')
        if (cleanupError) {
          throw new Error(`Cleanup failed: ${cleanupError.message}`)
        }
        
        // Clean up old audit logs (keep last 90 days)
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        
        const { error: auditCleanupError } = await supabase
          .from('audit_logs')
          .delete()
          .lt('timestamp', ninetyDaysAgo.toISOString())
        
        if (auditCleanupError) {
          console.warn('Audit log cleanup warning:', auditCleanupError.message)
        }
        
        // Clean up old security events (keep last 180 days for compliance)
        const oneEightyDaysAgo = new Date()
        oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180)
        
        const { error: securityCleanupError } = await supabase
          .from('security_events')
          .delete()
          .lt('timestamp', oneEightyDaysAgo.toISOString())
          .neq('severity', 'critical') // Keep critical events longer
        
        if (securityCleanupError) {
          console.warn('Security events cleanup warning:', securityCleanupError.message)
        }
        
        // Clean up old secret backups
        const { error: vaultCleanupError } = await supabase.rpc('vault_cleanup_old_backups', { days_to_keep: 30 })
        if (vaultCleanupError) {
          console.warn('Vault cleanup warning:', vaultCleanupError.message)
        }
        
        cleanupTask.status = 'completed'
        cleanupTask.result = { message: 'Cleanup completed successfully' }
        
        console.log('Security cleanup completed')
        results.completedTasks++
      } catch (error) {
        console.error('Security cleanup failed:', error)
        cleanupTask.status = 'failed'
        cleanupTask.error = error.message
        results.failedTasks++
      }
      
      tasks.push(cleanupTask)
      results.totalTasks++
    }

    // Task 3: Security Monitoring and Alerting
    if (taskType === 'all' || taskType === 'monitoring') {
      const monitoringTask: ScheduledTask = {
        name: 'security_monitoring',
        description: 'Monitor security metrics and generate alerts',
        status: 'running'
      }
      
      try {
        console.log('Running security monitoring...')
        
        // Get security stats for last 24 hours
        const stats = await securityManager.getSecurityStats(24)
        
        // Check for concerning patterns
        const alerts = []
        
        if (stats.blockedRequests > 100) {
          alerts.push({
            type: 'high_blocked_requests',
            severity: 'medium',
            message: `High number of blocked requests: ${stats.blockedRequests} in last 24 hours`
          })
        }
        
        if (stats.totalEvents > 1000) {
          alerts.push({
            type: 'high_security_events',
            severity: 'medium',
            message: `High number of security events: ${stats.totalEvents} in last 24 hours`
          })
        }
        
        // Check for top attackers
        if (stats.topAttackers.length > 0) {
          const topAttacker = stats.topAttackers[0]
          if (topAttacker.count > 50) {
            alerts.push({
              type: 'persistent_attacker',
              severity: 'high',
              message: `Persistent attacker detected: ${topAttacker.ip} with ${topAttacker.count} events`
            })
          }
        }
        
        // Log alerts as security events
        for (const alert of alerts) {
          await supabase
            .from('security_events')
            .insert({
              type: 'monitoring_alert',
              severity: alert.severity,
              client_ip: 'system',
              endpoint: 'security_monitoring',
              details: alert,
              blocked: false
            })
        }
        
        monitoringTask.status = 'completed'
        monitoringTask.result = {
          stats,
          alerts,
          alertsGenerated: alerts.length
        }
        
        console.log(`Security monitoring completed: ${alerts.length} alerts generated`)
        results.completedTasks++
      } catch (error) {
        console.error('Security monitoring failed:', error)
        monitoringTask.status = 'failed'
        monitoringTask.error = error.message
        results.failedTasks++
      }
      
      tasks.push(monitoringTask)
      results.totalTasks++
    }

    // Task 4: Compliance Reporting
    if (taskType === 'all' || taskType === 'compliance') {
      const complianceTask: ScheduledTask = {
        name: 'compliance_check',
        description: 'Generate compliance reports and check violations',
        status: 'running'
      }
      
      try {
        console.log('Running compliance check...')
        
        // Generate daily compliance summary
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000) // Last 24 hours
        
        const metrics = await auditLogger.getSecurityMetrics(startDate, endDate)
        
        // Check for compliance violations
        const violations = []
        
        if (metrics.requestMetrics.failed / metrics.requestMetrics.total > 0.1) {
          violations.push({
            type: 'high_failure_rate',
            severity: 'medium',
            description: `High request failure rate: ${(metrics.requestMetrics.failed / metrics.requestMetrics.total * 100).toFixed(2)}%`
          })
        }
        
        if (metrics.securityMetrics.totalSecurityEvents > 500) {
          violations.push({
            type: 'excessive_security_events',
            severity: 'high',
            description: `Excessive security events: ${metrics.securityMetrics.totalSecurityEvents} in 24 hours`
          })
        }
        
        // Store compliance summary
        await supabase
          .from('security_config')
          .upsert({
            config_key: `daily_compliance_${endDate.toISOString().split('T')[0]}`,
            config_value: {
              date: endDate.toISOString().split('T')[0],
              metrics,
              violations,
              generated_at: new Date().toISOString()
            },
            description: `Daily compliance summary for ${endDate.toISOString().split('T')[0]}`
          })
        
        complianceTask.status = 'completed'
        complianceTask.result = {
          metrics,
          violations,
          violationCount: violations.length
        }
        
        console.log(`Compliance check completed: ${violations.length} violations found`)
        results.completedTasks++
      } catch (error) {
        console.error('Compliance check failed:', error)
        complianceTask.status = 'failed'
        complianceTask.error = error.message
        results.failedTasks++
      }
      
      tasks.push(complianceTask)
      results.totalTasks++
    }

    // Task 5: Brute Force Detection and Response
    if (taskType === 'all' || taskType === 'brute_force') {
      const bruteForceTask: ScheduledTask = {
        name: 'brute_force_detection',
        description: 'Detect and respond to brute force attacks',
        status: 'running'
      }
      
      try {
        console.log('Running brute force detection...')
        
        // Get brute force attack data
        const { data: attacks, error } = await supabase.rpc('detect_brute_force_attacks')
        
        if (error) {
          throw new Error(`Brute force detection failed: ${error.message}`)
        }
        
        let blockedIPs = 0
        
        // Block IPs with excessive failed attempts
        for (const attack of attacks || []) {
          if (attack.should_block) {
            const blockResult = await supabase.rpc('block_ip_address', {
              ip_address_param: attack.client_ip,
              reason_param: `Brute force attack detected: ${attack.attempt_count} failed attempts`,
              duration_hours: 2
            })
            
            if (!blockResult.error) {
              blockedIPs++
              
              // Also block in security manager
              securityManager.blockIP(attack.client_ip, 2 * 60 * 60 * 1000) // 2 hours
            }
          }
        }
        
        bruteForceTask.status = 'completed'
        bruteForceTask.result = {
          attacksDetected: attacks?.length || 0,
          ipsBlocked: blockedIPs
        }
        
        console.log(`Brute force detection completed: ${attacks?.length || 0} attacks detected, ${blockedIPs} IPs blocked`)
        results.completedTasks++
      } catch (error) {
        console.error('Brute force detection failed:', error)
        bruteForceTask.status = 'failed'
        bruteForceTask.error = error.message
        results.failedTasks++
      }
      
      tasks.push(bruteForceTask)
      results.totalTasks++
    }

    // Update results
    results.tasks = tasks

    // Log overall scheduler execution
    await auditLogger.logAuditEntry({
      requestId,
      clientIp: 'system',
      method: 'POST',
      endpoint: `/security_scheduler?task=${taskType}`,
      responseStatus: 200,
      responseTimeMs: Date.now() - startTime,
      success: results.failedTasks === 0,
      errorMessage: results.failedTasks > 0 ? `${results.failedTasks} tasks failed` : undefined
    })

    console.log(`Security scheduler completed: ${results.completedTasks}/${results.totalTasks} tasks successful`)

    return new Response(
      JSON.stringify({
        success: true,
        executionTime: Date.now() - startTime,
        results
      }),
      { 
        headers: { 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error) {
    console.error('Security scheduler error:', error)
    
    // Log scheduler failure
    try {
      await auditLogger.logAuditEntry({
        requestId,
        clientIp: 'system',
        method: 'POST',
        endpoint: '/security_scheduler',
        responseStatus: 500,
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message
      })
    } catch (logError) {
      console.error('Failed to log scheduler error:', logError)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      }),
      { 
        headers: { 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})