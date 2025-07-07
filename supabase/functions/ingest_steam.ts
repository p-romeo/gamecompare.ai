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

    // Get Steam API keys
    const steamApiKey = Deno.env.get('STEAM_API_KEY')
    const steamSpyApiKey = Deno.env.get('STEAMSPY_API_KEY')
    
    // Get last sync checkpoint
    const { data: checkpoint } = await supabase
      .from('sync_checkpoints')
      .select('last_run')
      .eq('source', 'steam')
      .single()

    const lastRun = checkpoint?.last_run || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // TODO: Implement Steam/SteamSpy API fetching logic
    // 1. Fetch data from Steam Web API
    // 2. Fetch additional data from SteamSpy
    // 3. Normalize fields (price_usd, genres, platforms)
    // 4. Upsert into games table
    // 5. Update embeddings if descriptive data changed
    // 6. Update sync checkpoint

    // Update checkpoint
    await supabase
      .from('sync_checkpoints')
      .upsert({ source: 'steam', last_run: new Date().toISOString() })

    return new Response(
      JSON.stringify({ success: true, message: 'Steam ingestion completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in Steam ingestion:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})