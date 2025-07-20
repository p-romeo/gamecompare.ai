/**
 * Conversation Cleanup Edge Function
 * Periodically cleans up old conversations and messages to maintain database performance
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { runConversationCleanup } from './utils/conversation_manager.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
  retention_days?: number
  dry_run?: boolean
}

interface CleanupResponse {
  success: boolean
  deleted_conversations: number
  retention_days: number
  dry_run: boolean
  timestamp: string
  error?: string
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
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized access - SERVICE_ROLE_KEY required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 401 
        }
      )
    }

    // Parse request body for configuration
    let config: CleanupRequest = {}
    if (req.method === 'POST') {
      try {
        config = await req.json()
      } catch (parseError) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid JSON in request body' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 400 
          }
        )
      }
    }

    // Default configuration
    const retentionDays = config.retention_days || 30
    const dryRun = config.dry_run || false

    // Validate retention days
    if (retentionDays < 1 || retentionDays > 365) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'retention_days must be between 1 and 365' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    
    let deletedCount = 0
    let error: string | undefined

    if (!dryRun) {
      // Run actual cleanup
      const result = await runConversationCleanup(supabaseUrl, serviceRoleKey, retentionDays)
      deletedCount = result.deleted
      error = result.error
    } else {
      // Dry run - count conversations that would be deleted
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      const { data, error: countError } = await supabase
        .from('conversations')
        .select('id', { count: 'exact' })
        .lt('updated_at', cutoffDate.toISOString())

      if (countError) {
        error = `Failed to count conversations: ${countError.message}`
      } else {
        deletedCount = data?.length || 0
      }
    }

    const response: CleanupResponse = {
      success: !error,
      deleted_conversations: deletedCount,
      retention_days: retentionDays,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
      error
    }

    console.log(`Conversation cleanup ${dryRun ? '(dry run)' : ''}: ${deletedCount} conversations ${dryRun ? 'would be' : ''} deleted`)

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: error ? 500 : 200 
      }
    )

  } catch (error) {
    console.error('Conversation cleanup error:', error)
    
    const response: CleanupResponse = {
      success: false,
      deleted_conversations: 0,
      retention_days: 30,
      dry_run: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})