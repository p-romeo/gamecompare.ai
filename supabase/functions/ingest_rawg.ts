import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Get RAWG API key
    const rawgApiKey = Deno.env.get('RAWG_API_KEY')
    
    // Get last sync checkpoint
    const { data: checkpoint } = await supabase
      .from('sync_checkpoints')
      .select('last_run')
      .eq('source', 'rawg')
      .single()

    const lastRun = checkpoint?.last_run || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // TODO: Implement RAWG API fetching logic
    // 1. Fetch paginated data from RAWG API
    // 2. Transform results to match games schema
    // 3. Upsert into games table
    // 4. Generate embeddings for new/updated games
    // 5. Update sync checkpoint

    // Update checkpoint
    await supabase
      .from('sync_checkpoints')
      .upsert({ source: 'rawg', last_run: new Date().toISOString() })

    return new Response(
      JSON.stringify({ success: true, message: 'RAWG ingestion completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in RAWG ingestion:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})