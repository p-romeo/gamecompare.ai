import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  withRetry,
  RateLimiter,
  validateRequired,
  sanitizeString,
  sanitizeNumber,
  sanitizeArray,
  logIngestionStart,
  logIngestionProgress,
  logIngestionComplete
} from './utils/api_helpers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SteamAppDetails {
  appid: number
  name: string
  type: string
  is_free: boolean
  price_overview?: {
    currency: string
    initial: number
    final: number
    discount_percent: number
    initial_formatted: string
    final_formatted: string
  }
  platforms: {
    windows: boolean
    mac: boolean
    linux: boolean
  }
  categories: Array<{
    id: number
    description: string
  }>
  genres: Array<{
    id: string
    description: string
  }>
  screenshots: Array<{
    id: number
    path_thumbnail: string
    path_full: string
  }>
  short_description?: string
  detailed_description?: string
  header_image?: string
}

interface SteamSpyData {
  appid: number
  name: string
  developer: string
  publisher: string
  score_rank: string
  positive: number
  negative: number
  userscore: number
  owners: string
  average_forever: number
  average_2weeks: number
  median_forever: number
  median_2weeks: number
  price: string
  initialprice: string
  discount: string
  languages: string
  genre: string
  ccu: number
  tags: Record<string, number>
}

interface GameUpdate {
  steam_appid?: number
  price_usd?: number
  steam_score?: number
  steam_review_count?: number
  platforms?: string[]
  genres?: string[]
  short_description?: string
  long_description?: string
  image_url?: string
  screenshots?: string[]
  updated_at: string
}

async function fetchSteamAppDetails(appId: number, apiKey?: string): Promise<SteamAppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&key=${apiKey || ''}`
  
  try {
    const response = await withRetry(async () => {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      return res.json()
    })

    const appData = response[appId.toString()]
    if (!appData?.success || !appData.data) {
      return null
    }

    return appData.data as SteamAppDetails
  } catch (error) {
    console.warn(`Failed to fetch Steam app details for ${appId}:`, error)
    return null
  }
}

async function fetchSteamSpyData(appId: number): Promise<SteamSpyData | null> {
  const url = `https://steamspy.com/api.php?request=appdetails&appid=${appId}`
  
  try {
    const response = await withRetry(async () => {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      return res.json()
    })

    if (!response || response.appid !== appId) {
      return null
    }

    return response as SteamSpyData
  } catch (error) {
    console.warn(`Failed to fetch SteamSpy data for ${appId}:`, error)
    return null
  }
}

function mapSteamToGameUpdate(steamApp: SteamAppDetails, steamSpyData?: SteamSpyData): GameUpdate {
  const platforms: string[] = []
  if (steamApp.platforms.windows) platforms.push('PC')
  if (steamApp.platforms.mac) platforms.push('Mac')
  if (steamApp.platforms.linux) platforms.push('Linux')

  const genres = steamApp.genres?.map(g => g.description) || []
  const screenshots = steamApp.screenshots?.map(s => s.path_full) || []

  // Calculate price in USD
  let priceUsd: number | undefined
  if (steamApp.price_overview) {
    // Steam prices are in cents
    priceUsd = steamApp.price_overview.final / 100
  } else if (steamApp.is_free) {
    priceUsd = 0
  } else if (steamSpyData?.price) {
    priceUsd = parseFloat(steamSpyData.price) || undefined
  }

  // Calculate Steam score from SteamSpy data
  let steamScore: number | undefined
  let reviewCount: number | undefined
  if (steamSpyData) {
    const totalReviews = steamSpyData.positive + steamSpyData.negative
    if (totalReviews > 0) {
      steamScore = (steamSpyData.positive / totalReviews) * 100
      reviewCount = totalReviews
    }
  }

  return {
    steam_appid: steamApp.appid,
    price_usd: priceUsd,
    steam_score: steamScore,
    steam_review_count: reviewCount,
    platforms: sanitizeArray(platforms),
    genres: sanitizeArray(genres),
    short_description: sanitizeString(steamApp.short_description),
    long_description: sanitizeString(steamApp.detailed_description),
    image_url: sanitizeString(steamApp.header_image),
    screenshots: sanitizeArray(screenshots),
    updated_at: new Date().toISOString()
  }
}

async function shouldRegenerateEmbedding(
  oldGame: any, 
  newUpdate: GameUpdate
): Promise<boolean> {
  // Check if descriptive content has changed significantly
  const oldContent = [
    oldGame.title,
    oldGame.short_description,
    oldGame.genres?.join(' '),
    oldGame.platforms?.join(' ')
  ].filter(Boolean).join(' ')

  const newContent = [
    oldGame.title, // Title doesn't change from Steam
    newUpdate.short_description,
    newUpdate.genres?.join(' '),
    newUpdate.platforms?.join(' ')
  ].filter(Boolean).join(' ')

  // Simple content comparison - in production, you might want more sophisticated comparison
  return oldContent !== newContent
}

async function regenerateEmbedding(supabase: any, gameId: string, game: any): Promise<void> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.warn('OpenAI API key not found, skipping embedding regeneration')
    return
  }

  try {
    // Create searchable text content
    const searchableText = [
      game.title,
      game.short_description,
      game.genres?.join(' '),
      game.platforms?.join(' ')
    ].filter(Boolean).join(' ')

    if (!searchableText.trim()) {
      return
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

    // Update Pinecone if available
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
                  id: `game-${gameId}`,
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
        console.warn(`Failed to update embedding in Pinecone for game ${gameId}:`, error)
      }
    }

    // Update local vector table
    await supabase
      .from('game_vectors')
      .upsert({
        game_id: gameId,
        embedding: embedding,
        content: searchableText,
        updated_at: new Date().toISOString()
      })

  } catch (error) {
    console.warn(`Failed to regenerate embedding for game ${gameId}:`, error)
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

    // Get Steam API key (optional for some endpoints)
    const steamApiKey = Deno.env.get('STEAM_API_KEY')

    logIngestionStart('Steam')

    // Get games that need Steam data updates
    // Focus on games with store links to Steam or existing steam_appid
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, rawg_id, title, steam_appid, store_links, short_description, genres, platforms, updated_at')
      .or('steam_appid.not.is.null,store_links->>steam.not.is.null')
      .order('updated_at', { ascending: true })
      .limit(500) // Process up to 500 games per run

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`)
    }

    if (!games || games.length === 0) {
      console.log('No games found that need Steam data updates')
      return new Response(
        JSON.stringify({ success: true, message: 'No games to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Found ${games.length} games to process for Steam data`)

    // Set up rate limiter (Steam allows ~200 requests per 5 minutes)
    const rateLimiter = new RateLimiter({ requestsPerSecond: 0.5, burstLimit: 5 })

    // Process games in batches
    const batchSize = 10
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize)
      
      for (const game of batch) {
        try {
          let steamAppId = game.steam_appid

          // Extract Steam App ID from store link if not already set
          if (!steamAppId && game.store_links?.steam) {
            const steamUrl = game.store_links.steam
            const appIdMatch = steamUrl.match(/\/app\/(\d+)\//)
            if (appIdMatch) {
              steamAppId = parseInt(appIdMatch[1])
            }
          }

          if (!steamAppId) {
            console.warn(`No Steam App ID found for game ${game.id}`)
            continue
          }

          await rateLimiter.waitForToken()

          // Fetch Steam app details
          const steamApp = await fetchSteamAppDetails(steamAppId, steamApiKey)
          if (!steamApp) {
            console.warn(`No Steam app details found for ${steamAppId}`)
            continue
          }

          await rateLimiter.waitForToken()

          // Fetch SteamSpy data for additional metadata
          const steamSpyData = await fetchSteamSpyData(steamAppId)

          // Map Steam data to game update
          const gameUpdate = mapSteamToGameUpdate(steamApp, steamSpyData || undefined)

          // Update game in database
          const { error: updateError } = await supabase
            .from('games')
            .update(gameUpdate)
            .eq('id', game.id)

          if (updateError) {
            console.error(`Failed to update game ${game.id}:`, updateError)
            errorCount++
            continue
          }

          // Check if we need to regenerate embeddings
          if (await shouldRegenerateEmbedding(game, gameUpdate)) {
            const updatedGame = { ...game, ...gameUpdate }
            await regenerateEmbedding(supabase, game.id, updatedGame)
          }

          processedCount++

        } catch (error) {
          console.error(`Error processing game ${game.id}:`, error)
          errorCount++
        }
      }

      logIngestionProgress('Steam', processedCount, games.length)
    }

    // Update checkpoint
    await supabase
      .from('sync_checkpoints')
      .upsert({ 
        source: 'steam', 
        last_run: new Date().toISOString(),
        games_processed: processedCount,
        errors: errorCount
      })

    const duration = Date.now() - startTime
    logIngestionComplete('Steam', { processed: processedCount, errors: errorCount, duration })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Steam ingestion completed',
        stats: {
          processed: processedCount,
          errors: errorCount,
          duration_ms: duration
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in Steam ingestion:', error)
    const duration = Date.now() - startTime
    
    // Still update checkpoint to prevent getting stuck
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      await supabase
        .from('sync_checkpoints')
        .upsert({ 
          source: 'steam', 
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