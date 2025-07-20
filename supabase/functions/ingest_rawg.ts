import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  fetchPaginated,
  withRetry,
  RateLimiter,
  validateRequired,
  sanitizeString,
  sanitizeNumber,
  sanitizeDate,
  sanitizeArray,
  handleApiError,
  logIngestionStart,
  logIngestionProgress,
  logIngestionComplete
} from './utils/api_helpers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RAWGGame {
  id: number
  name: string
  slug: string
  released: string
  background_image: string
  rating: number
  rating_top: number
  ratings_count: number
  metacritic: number
  playtime: number
  platforms: Array<{
    platform: {
      id: number
      name: string
      slug: string
    }
  }>
  genres: Array<{
    id: number
    name: string
    slug: string
  }>
  stores: Array<{
    id: number
    store: {
      id: number
      name: string
      slug: string
    }
  }>
  short_screenshots: Array<{
    id: number
    image: string
  }>
  description_raw?: string
}

interface GameRow {
  rawg_id: number
  title: string
  slug: string
  release_date: string | null
  short_description: string | null
  long_description: string | null
  image_url: string | null
  rating: number | null
  rating_count: number | null
  metacritic_score: number | null
  playtime_hours: number | null
  genres: string[]
  platforms: string[]
  store_links: Record<string, string>
  screenshots: string[]
  updated_at: string
}

function mapRAWGToGameRow(rawgGame: RAWGGame): GameRow {
  const platforms = rawgGame.platforms?.map(p => p.platform.name) || []
  const genres = rawgGame.genres?.map(g => g.name) || []
  const screenshots = rawgGame.short_screenshots?.map(s => s.image) || []
  
  // Map store links
  const storeLinks: Record<string, string> = {}
  rawgGame.stores?.forEach(store => {
    const storeName = store.store.slug
    if (storeName === 'steam') {
      storeLinks.steam = `https://store.steampowered.com/app/${rawgGame.id}/`
    } else if (storeName === 'epic-games') {
      storeLinks.epic = `https://store.epicgames.com/en-US/p/${rawgGame.slug}`
    } else if (storeName === 'gog') {
      storeLinks.gog = `https://www.gog.com/game/${rawgGame.slug}`
    }
  })

  return {
    rawg_id: rawgGame.id,
    title: sanitizeString(rawgGame.name) || 'Unknown Game',
    slug: sanitizeString(rawgGame.slug) || `game-${rawgGame.id}`,
    release_date: sanitizeDate(rawgGame.released),
    short_description: null, // Will be fetched from detailed API
    long_description: sanitizeString(rawgGame.description_raw),
    image_url: sanitizeString(rawgGame.background_image),
    rating: sanitizeNumber(rawgGame.rating),
    rating_count: sanitizeNumber(rawgGame.ratings_count),
    metacritic_score: sanitizeNumber(rawgGame.metacritic),
    playtime_hours: sanitizeNumber(rawgGame.playtime),
    genres: sanitizeArray(genres),
    platforms: sanitizeArray(platforms),
    store_links: storeLinks,
    screenshots: sanitizeArray(screenshots),
    updated_at: new Date().toISOString()
  }
}

async function fetchGameDetails(gameId: number, apiKey: string): Promise<Partial<GameRow>> {
  const url = `https://api.rawg.io/api/games/${gameId}?key=${apiKey}`
  
  const response = await withRetry(async () => {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    return res.json()
  })

  return {
    short_description: sanitizeString(response.description_raw?.substring(0, 500)),
    long_description: sanitizeString(response.description_raw)
  }
}

async function generateEmbeddings(supabase: any, games: GameRow[]): Promise<void> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.warn('OpenAI API key not found, skipping embedding generation')
    return
  }

  for (const game of games) {
    try {
      // Create searchable text content
      const searchableText = [
        game.title,
        game.short_description,
        game.genres.join(' '),
        game.platforms.join(' ')
      ].filter(Boolean).join(' ')

      if (!searchableText.trim()) {
        continue
      }

      // Generate embedding
      const embeddingResponse = await withRetry(async () => {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input: searchableText,
            model: 'text-embedding-3-small'
          })
        })

        if (!res.ok) {
          throw new Error(`OpenAI API error: ${res.status}`)
        }

        return res.json()
      })

      const embedding = embeddingResponse.data[0].embedding

      // Store embedding in Pinecone (if available) and local vector table
      const pineconeApiKey = Deno.env.get('PINECONE_API_KEY')
      const pineconeEnvironment = Deno.env.get('PINECONE_ENVIRONMENT')
      const pineconeIndex = Deno.env.get('PINECONE_INDEX')

      if (pineconeApiKey && pineconeEnvironment && pineconeIndex) {
        try {
          await withRetry(async () => {
            const res = await fetch(
              `https://${pineconeIndex}-${pineconeEnvironment}.svc.pinecone.io/vectors/upsert`,
              {
                method: 'POST',
                headers: {
                  'Api-Key': pineconeApiKey,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  vectors: [{
                    id: `game-${game.rawg_id}`,
                    values: embedding,
                    metadata: {
                      title: game.title,
                      genres: game.genres,
                      platforms: game.platforms,
                      rating: game.rating
                    }
                  }]
                })
              }
            )

            if (!res.ok) {
              throw new Error(`Pinecone error: ${res.status}`)
            }
          })
        } catch (error) {
          console.warn(`Failed to store embedding in Pinecone for game ${game.rawg_id}:`, error)
        }
      }

      // Store in local vector table as backup
      await supabase
        .from('game_vectors')
        .upsert({
          game_id: game.rawg_id,
          embedding: embedding,
          content: searchableText,
          updated_at: new Date().toISOString()
        })

    } catch (error) {
      console.warn(`Failed to generate embedding for game ${game.rawg_id}:`, error)
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let processedCount = 0
  let errorCount = 0

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
    if (!rawgApiKey) {
      throw new Error('RAWG_API_KEY environment variable is required')
    }

    logIngestionStart('RAWG')
    
    // Get last sync checkpoint
    const { data: checkpoint } = await supabase
      .from('sync_checkpoints')
      .select('last_run')
      .eq('source', 'rawg')
      .single()

    const lastRun = checkpoint?.last_run || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const lastRunDate = new Date(lastRun).toISOString().split('T')[0]

    // Set up rate limiter (5 requests per second as per RAWG API limits)
    const rateLimiter = new RateLimiter({ requestsPerSecond: 5, burstLimit: 10 })

    // Fetch updated games from RAWG API
    const baseUrl = `https://api.rawg.io/api/games?key=${rawgApiKey}&dates=${lastRunDate},${new Date().toISOString().split('T')[0]}&ordering=-updated`
    
    const rawgGames = await fetchPaginated<RAWGGame>(baseUrl, {
      pageSize: 40,
      maxPages: 25, // Limit to 1000 games per run
      rateLimiter,
      headers: {},
      transform: (data) => data.results || []
    })

    console.log(`Fetched ${rawgGames.length} games from RAWG API`)

    // Process games in batches
    const batchSize = 50
    for (let i = 0; i < rawgGames.length; i += batchSize) {
      const batch = rawgGames.slice(i, i + batchSize)
      
      try {
        // Transform games to database format
        const gameRows: GameRow[] = []
        
        for (const rawgGame of batch) {
          try {
            // Validate required fields
            if (!validateRequired<RAWGGame>(rawgGame, ['id', 'name'])) {
              console.warn(`Skipping invalid game:`, rawgGame)
              continue
            }

            let gameRow = mapRAWGToGameRow(rawgGame)

            // Fetch detailed description if needed
            if (!gameRow.short_description) {
              await rateLimiter.waitForToken()
              const details = await fetchGameDetails(rawgGame.id, rawgApiKey)
              gameRow = { ...gameRow, ...details }
            }

            gameRows.push(gameRow)
          } catch (error) {
            console.warn(`Error processing game ${rawgGame.id}:`, error)
            errorCount++
          }
        }

        // Upsert games to database
        if (gameRows.length > 0) {
          const { error: upsertError } = await supabase
            .from('games')
            .upsert(gameRows, { 
              onConflict: 'rawg_id',
              ignoreDuplicates: false 
            })

          if (upsertError) {
            console.error('Database upsert error:', upsertError)
            errorCount += gameRows.length
          } else {
            // Generate embeddings for new/updated games
            await generateEmbeddings(supabase, gameRows)
            processedCount += gameRows.length
          }
        }

        logIngestionProgress('RAWG', processedCount, rawgGames.length)
        
      } catch (error) {
        console.error(`Error processing batch ${i}-${i + batchSize}:`, error)
        errorCount += batch.length
      }
    }

    // Update checkpoint
    await supabase
      .from('sync_checkpoints')
      .upsert({ 
        source: 'rawg', 
        last_run: new Date().toISOString(),
        games_processed: processedCount,
        errors: errorCount
      })

    const duration = Date.now() - startTime
    logIngestionComplete('RAWG', { processed: processedCount, errors: errorCount, duration })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'RAWG ingestion completed',
        stats: {
          processed: processedCount,
          errors: errorCount,
          duration_ms: duration
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in RAWG ingestion:', error)
    const duration = Date.now() - startTime
    
    // Still update checkpoint to prevent getting stuck
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      await supabase
        .from('sync_checkpoints')
        .upsert({ 
          source: 'rawg', 
          last_run: new Date().toISOString(),
          games_processed: processedCount,
          errors: errorCount + 1,
          error_message: error.message
        })
    } catch (checkpointError) {
      console.error('Failed to update checkpoint:', checkpointError)
    }

    return new Response(
      JSON.stringify({ 
        error: error.message,
        stats: {
          processed: processedCount,
          errors: errorCount + 1,
          duration_ms: duration
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})