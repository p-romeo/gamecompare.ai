import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FilterState {
  playtimeMax?: number
  priceMax?: number
  platforms?: string[]
  yearRange?: [number, number]
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

    // Parse URL and route
    const url = new URL(req.url)
    const path = url.pathname.split('/').filter(Boolean)
    
    // Route handling
    if (path[2] === 'similar' && req.method === 'POST') {
      // POST /similar - Find similar games
      const { query, filters } = await req.json() as { query: string; filters?: FilterState }
      
      // TODO: Implement similar games logic
      // 1. Generate embedding for query
      // 2. Query Pinecone for similar vectors
      // 3. Apply filters
      // 4. Get game details from database
      // 5. Generate GPT response with recommendations
      
      return new Response(
        JSON.stringify({ games: [], response: 'Similar games functionality coming soon' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    
    if (path[2] === 'compare' && req.method === 'POST') {
      // POST /compare - Compare two games
      const { left, right } = await req.json() as { left: string; right: string }
      
      // TODO: Implement game comparison logic
      // 1. Find both games in database
      // 2. Generate comparison using GPT
      
      return new Response(
        JSON.stringify({ comparison: 'Comparison functionality coming soon' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    
    if (path[2] === 'game' && path[3] && req.method === 'GET') {
      // GET /game/:id - Get game details
      const gameId = path[3]
      
      const { data: game, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()
      
      if (error || !game) {
        return new Response(
          JSON.stringify({ error: 'Game not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }
      
      return new Response(
        JSON.stringify(game),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    
    if (path[2] === 'click' && path[3] && path[4] && req.method === 'GET') {
      // GET /click/:gid/:store - Log click and redirect
      const gameId = path[3]
      const store = path[4]
      
      // Log click
      await supabase
        .from('click_logs')
        .insert({ game_id: gameId, store })
      
      // Get redirect URL
      const { data: link } = await supabase
        .from('store_links')
        .select('url')
        .eq('game_id', gameId)
        .eq('store', store)
        .single()
      
      if (!link?.url) {
        return new Response(
          JSON.stringify({ error: 'Store link not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }
      
      // Add affiliate ID
      const affiliateId = Deno.env.get(`AFFILIATE_${store.toUpperCase()}`)
      const redirectUrl = affiliateId ? `${link.url}?aff_id=${affiliateId}` : link.url
      
      // Redirect
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': redirectUrl }
      })
    }
    
    // 404 for unknown routes
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    )
    
  } catch (error) {
    console.error('Error in API router:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})