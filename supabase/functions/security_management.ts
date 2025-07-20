/**
 * Security Management Edge Function
 * Provides endpoints for managing security features, API keys, and compliance reporting
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { secretManager, apiKeyManager, rotationScheduler } from './utils/secret_management.ts'
import { auditLogger } from './utils/audit_logging.ts'
import { securityManager } from './utils/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SecurityRequest {
  action: string
  data?: any
}

serve(async (req) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()
  const clientIp = getClientIp(req)
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const url = new URL(req.url)
  const path = url.pathname

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 
        ...corsHeaders, 
        ...securityManager.getSecurityHeaders() 
      } 
    })
  }

  try {
    // Security check
    const securityCheck = await securityManager.checkRequest(req)
    if (!securityCheck.allowed) {
      return createErrorResponse(
        securityCheck.reason || 'Security check failed',
        429,
        requestId
      )
    }

    // Verify authorization - require service role key for security management
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      return createErrorResponse('Unauthorized access', 401, requestId)
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Parse URL and route
    const pathSegments = path.split('/').filter(Boolean)
    
    // Route handling
    if (pathSegments[2] === 'api-keys' && req.method === 'POST') {
      // POST /api-keys - Generate new API key
      const requestBody = await req.json()
      const { name, description, permissions, rateLimitOverride, expiresAt } = requestBody

      if (!name || !permissions) {
        return createErrorResponse('Name and permissions are required', 400, requestId)
      }

      const result = await apiKeyManager.generateAPIKey({
        name,
        description,
        permissions,
        rateLimitOverride,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      })

      if (!result) {
        return createErrorResponse('Failed to generate API key', 500, requestId)
      }

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: 200,
        responseTimeMs: Date.now() - startTime,
        success: true,
        sensitiveDataAccessed: ['api_key_generated']
      })

      return new Response(
        JSON.stringify({ 
          success: true, 
          keyHash: result.hash,
          key: result.key // Only return once, client should store securely
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'api-keys' && pathSegments[3] === 'rotate' && req.method === 'POST') {
      // POST /api-keys/rotate - Rotate API key
      const requestBody = await req.json()
      const { keyHash } = requestBody

      if (!keyHash) {
        return createErrorResponse('Key hash is required', 400, requestId)
      }

      const result = await apiKeyManager.rotateAPIKey(keyHash)

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: result.success ? 200 : 500,
        responseTimeMs: Date.now() - startTime,
        success: result.success,
        errorMessage: result.error,
        sensitiveDataAccessed: ['api_key_rotated']
      })

      if (!result.success) {
        return createErrorResponse(result.error || 'Failed to rotate API key', 500, requestId)
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          oldKeyHash: result.oldKeyHash,
          newKeyHash: result.newKeyHash
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'api-keys' && pathSegments[3] === 'revoke' && req.method === 'POST') {
      // POST /api-keys/revoke - Revoke API key
      const requestBody = await req.json()
      const { keyHash, reason } = requestBody

      if (!keyHash || !reason) {
        return createErrorResponse('Key hash and reason are required', 400, requestId)
      }

      const success = await apiKeyManager.revokeAPIKey(keyHash, reason)

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: success ? 200 : 500,
        responseTimeMs: Date.now() - startTime,
        success,
        sensitiveDataAccessed: ['api_key_revoked']
      })

      if (!success) {
        return createErrorResponse('Failed to revoke API key', 500, requestId)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'secrets' && pathSegments[3] === 'rotate' && req.method === 'POST') {
      // POST /secrets/rotate - Rotate secret
      const requestBody = await req.json()
      const { secretName, newValue } = requestBody

      if (!secretName) {
        return createErrorResponse('Secret name is required', 400, requestId)
      }

      const value = newValue || secretManager.generateSecureSecret()
      const success = await secretManager.rotateSecret(secretName, value)

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: success ? 200 : 500,
        responseTimeMs: Date.now() - startTime,
        success,
        sensitiveDataAccessed: ['secret_rotated']
      })

      if (!success) {
        return createErrorResponse('Failed to rotate secret', 500, requestId)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'rotation' && pathSegments[3] === 'check' && req.method === 'POST') {
      // POST /rotation/check - Run rotation check
      const result = await rotationScheduler.runRotationCheck()

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: 200,
        responseTimeMs: Date.now() - startTime,
        success: true,
        sensitiveDataAccessed: ['rotation_check']
      })

      return new Response(
        JSON.stringify(result),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'compliance' && pathSegments[3] === 'report' && req.method === 'POST') {
      // POST /compliance/report - Generate compliance report
      const requestBody = await req.json()
      const { reportType, startDate, endDate } = requestBody

      if (!reportType || !startDate || !endDate) {
        return createErrorResponse('Report type, start date, and end date are required', 400, requestId)
      }

      const report = await auditLogger.generateComplianceReport(
        reportType,
        new Date(startDate),
        new Date(endDate)
      )

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: 200,
        responseTimeMs: Date.now() - startTime,
        success: true,
        sensitiveDataAccessed: ['compliance_report']
      })

      return new Response(
        JSON.stringify(report),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'metrics' && req.method === 'GET') {
      // GET /metrics - Get security metrics
      const url = new URL(req.url)
      const hours = parseInt(url.searchParams.get('hours') || '24')
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000)

      const metrics = await auditLogger.getSecurityMetrics(startDate, endDate)

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: 200,
        responseTimeMs: Date.now() - startTime,
        success: true
      })

      return new Response(
        JSON.stringify(metrics),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'security' && pathSegments[3] === 'stats' && req.method === 'GET') {
      // GET /security/stats - Get security statistics
      const url = new URL(req.url)
      const hours = parseInt(url.searchParams.get('hours') || '24')

      const stats = await securityManager.getSecurityStats(hours)

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: 200,
        responseTimeMs: Date.now() - startTime,
        success: true
      })

      return new Response(
        JSON.stringify(stats),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'ip' && pathSegments[3] === 'block' && req.method === 'POST') {
      // POST /ip/block - Block IP address
      const requestBody = await req.json()
      const { ipAddress, reason, durationHours } = requestBody

      if (!ipAddress || !reason) {
        return createErrorResponse('IP address and reason are required', 400, requestId)
      }

      securityManager.blockIP(ipAddress, durationHours ? durationHours * 60 * 60 * 1000 : undefined)

      // Also block in database
      const { error } = await supabase.rpc('block_ip_address', {
        ip_address_param: ipAddress,
        reason_param: reason,
        duration_hours: durationHours || 24
      })

      const success = !error

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: success ? 200 : 500,
        responseTimeMs: Date.now() - startTime,
        success,
        errorMessage: error?.message,
        sensitiveDataAccessed: ['ip_blocked']
      })

      if (!success) {
        return createErrorResponse('Failed to block IP address', 500, requestId)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    if (pathSegments[2] === 'ip' && pathSegments[3] === 'unblock' && req.method === 'POST') {
      // POST /ip/unblock - Unblock IP address
      const requestBody = await req.json()
      const { ipAddress } = requestBody

      if (!ipAddress) {
        return createErrorResponse('IP address is required', 400, requestId)
      }

      securityManager.unblockIP(ipAddress)

      // Also unblock in database
      const { error } = await supabase.rpc('unblock_ip_address', {
        ip_address_param: ipAddress
      })

      const success = !error

      // Log audit entry
      await auditLogger.logAuditEntry({
        requestId,
        clientIp,
        userAgent,
        method: req.method,
        endpoint: path,
        responseStatus: success ? 200 : 500,
        responseTimeMs: Date.now() - startTime,
        success,
        errorMessage: error?.message,
        sensitiveDataAccessed: ['ip_unblocked']
      })

      if (!success) {
        return createErrorResponse('Failed to unblock IP address', 500, requestId)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            ...securityManager.getSecurityHeaders()
          }, 
          status: 200 
        }
      )
    }

    // Default 404 response
    return createErrorResponse('Endpoint not found', 404, requestId)

  } catch (error) {
    console.error('Security management error:', error)
    
    // Log audit entry for error
    await auditLogger.logAuditEntry({
      requestId,
      clientIp,
      userAgent,
      method: req.method,
      endpoint: path,
      responseStatus: 500,
      responseTimeMs: Date.now() - startTime,
      success: false,
      errorMessage: error.message
    })

    return createErrorResponse(
      'Internal server error',
      500,
      requestId
    )
  }
})

/**
 * Helper functions
 */
function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('x-real-ip') ||
         req.headers.get('cf-connecting-ip') ||
         'unknown'
}

function createErrorResponse(error: string, status: number, requestId: string): Response {
  return new Response(
    JSON.stringify({
      error,
      requestId,
      timestamp: new Date().toISOString()
    }),
    { 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        ...securityManager.getSecurityHeaders()
      }, 
      status 
    }
  )
}