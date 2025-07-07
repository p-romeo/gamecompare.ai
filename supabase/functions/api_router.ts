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
      
      if (!query || query.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Query is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      try {
        // Import embeddings and GPT modules (from shared utilities)
        const { generateQueryEmbedding, searchSimilarGames } = await import('./_shared/embeddings.ts')
        const { streamSimilarGamesResponse } = await import('./_shared/gpt.ts')

        // 1. Generate embedding for query
        const queryEmbedding = await generateQueryEmbedding(query.trim())

        // 2. Query Pinecone for similar vectors
        const similarGameResults = await searchSimilarGames(queryEmbedding, 10)

        if (similarGameResults.length === 0) {
          return new Response(
            JSON.stringify({ games: [], response: "I couldn't find any games matching your query. Try a different search term or check back later as we're constantly adding new games!" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }

        // 3. Get game details from database
        const gameIds = similarGameResults.map(result => result.gameId)
        let gamesQuery = supabase
          .from('games')
          .select('id, title, price_usd, critic_score, platforms')
          .in('id', gameIds)

        // 4. Apply filters
        if (filters?.priceMax !== undefined) {
          gamesQuery = gamesQuery.lte('price_usd', filters.priceMax)
        }
        
        if (filters?.platforms && filters.platforms.length > 0) {
          gamesQuery = gamesQuery.overlaps('platforms', filters.platforms)
        }

        if (filters?.yearRange) {
          const [startYear, endYear] = filters.yearRange
          gamesQuery = gamesQuery
            .gte('release_date', `${startYear}-01-01`)
            .lte('release_date', `${endYear}-12-31`)
        }

        const { data: games, error: gamesError } = await gamesQuery

        if (gamesError) {
          throw new Error(`Database error: ${gamesError.message}`)
        }

        if (!games || games.length === 0) {
          return new Response(
            JSON.stringify({ games: [], response: "No games match your current filters. Try adjusting your price range, platforms, or release year filters." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }

        // 5. Transform to GameSummary format
        const gameSummaries = games.map(game => ({
          id: game.id,
          title: game.title,
          price: game.price_usd || 0,
          score: game.critic_score || 0,
          platforms: game.platforms || []
        }))

        // 6. Generate GPT response with streaming
        const responseStream = await streamSimilarGamesResponse(query, gameSummaries, filters)

        // Return streaming response
        return new Response(responseStream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'X-Games': JSON.stringify(gameSummaries) // Include games in header for frontend
          }
        })

      } catch (error) {
        console.error('Error in /similar endpoint:', error)
        return new Response(
          JSON.stringify({ error: `Failed to find similar games: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
    }
    
    if (path[2] === 'compare' && req.method === 'POST') {
      // POST /compare - Compare two games
      const { left, right } = await req.json() as { left: string; right: string }
      
      if (!left || !right || left.trim().length === 0 || right.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Both game IDs are required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      try {
        // Import GPT module (from shared utilities)
        const { generateGameComparison } = await import('./_shared/gpt.ts')

        // 1. Find both games in database
        const { data: games, error: gamesError } = await supabase
          .from('games')
          .select('id, title, price_usd, critic_score, genres, platforms, short_description')
          .in('id', [left.trim(), right.trim()])

        if (gamesError) {
          throw new Error(`Database error: ${gamesError.message}`)
        }

        if (!games || games.length !== 2) {
          return new Response(
            JSON.stringify({ error: 'One or both games not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }

        // Find which game is which
        const leftGame = games.find(g => g.id === left.trim())
        const rightGame = games.find(g => g.id === right.trim())

        if (!leftGame || !rightGame) {
          return new Response(
            JSON.stringify({ error: 'Could not match games to provided IDs' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }

        // Transform to GameDetail format (estimate playtime as we don't have it yet)
        const leftGameDetail = {
          id: leftGame.id,
          title: leftGame.title,
          price: leftGame.price_usd || 0,
          score: leftGame.critic_score || 0,
          platforms: leftGame.platforms || [],
          description: leftGame.short_description || 'No description available',
          genres: leftGame.genres || [],
          playtime: 20 // Default estimate - will be improved with actual data
        }

        const rightGameDetail = {
          id: rightGame.id,
          title: rightGame.title,
          price: rightGame.price_usd || 0,
          score: rightGame.critic_score || 0,
          platforms: rightGame.platforms || [],
          description: rightGame.short_description || 'No description available',
          genres: rightGame.genres || [],
          playtime: 20 // Default estimate - will be improved with actual data
        }

        // 2. Generate comparison using GPT
        const comparison = await generateGameComparison(leftGameDetail, rightGameDetail)

        return new Response(
          JSON.stringify({ comparison }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

      } catch (error) {
        console.error('Error in /compare endpoint:', error)
        return new Response(
          JSON.stringify({ error: `Failed to compare games: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
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