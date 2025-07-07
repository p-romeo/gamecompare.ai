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

    // Get OpenCritic API key
    const openCriticApiKey = Deno.env.get('OPENCRITIC_API_KEY')
    
    // Get games with steam_appid
    const { data: games } = await supabase
      .from('games')
      .select('id, steam_appid')
      .not('steam_appid', 'is', null)

    // TODO: Implement OpenCritic API fetching logic
    // 1. For each game with steam_appid, fetch critic scores
    // 2. Update critic_score in games table
    // 3. Handle rate limiting and errors gracefully

    // Update checkpoint
    await supabase
      .from('sync_checkpoints')
      .upsert({ source: 'opencritic', last_run: new Date().toISOString() })

    return new Response(
      JSON.stringify({ success: true, message: 'OpenCritic ingestion completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in OpenCritic ingestion:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})