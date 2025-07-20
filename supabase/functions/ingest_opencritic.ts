import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  withRetry,
  RateLimiter,
  validateRequired,
  sanitizeString,
  sanitizeNumber,
  logIngestionStart,
  logIngestionProgress,
  logIngestionComplete
} from './utils/api_helpers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OpenCriticGame {
  id: number
  name: string
  dist: number
  tier: string
  topCriticScore: number
  numTopCriticReviews: number
  percentRecommended: number
  numReviews: number
  averageScore: number
  medianScore: number
  hasLootBoxes: boolean
  hasMicrotransactions: boolean
  Companies: Array<{
    name: string
    type: string
  }>
  Platforms: Array<{
    id: number
    name: string
    shortName: string
  }>
}

interface OpenCriticSearchResult {
  id: number
  name: string
  dist: number
}

interface GameScoreUpdate {
  critic_score?: number
  critic_review_count?: number
  updated_at: string
}

async function searchOpenCriticByTitle(title: string, apiKey?: string): Promise<OpenCriticSearchResult[]> {
  const encodedTitle = encodeURIComponent(title)
  const url = `https://api.opencritic.com/api/game/search?criteria=${encodedTitle}`
  
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  try {
    const response = await withRetry(async () => {
      const res = await fetch(url, { headers })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      return res.json()
    })

    return Array.isArray(response) ? response : []
  } catch (error) {
    console.warn(`Failed to search OpenCritic for "${title}":`, error)
    return []
  }
}

async function fetchOpenCriticGameDetails(gameId: number, apiKey?: string): Promise<OpenCriticGame | null> {
  const url = `https://api.opencritic.com/api/game/${gameId}`
  
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  try {
    const response = await withRetry(async () => {
      const res = await fetch(url, { headers })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      return res.json()
    })

    return response as OpenCriticGame
  } catch (error) {
    console.warn(`Failed to fetch OpenCritic game details for ${gameId}:`, error)
    return null
  }
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  // Simple similarity calculation based on normalized titles
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const norm1 = normalize(title1)
  const norm2 = normalize(title2)

  // Exact match
  if (norm1 === norm2) return 1.0

  // Check if one title contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8

  // Calculate word overlap
  const words1 = norm1.split(' ')
  const words2 = norm2.split(' ')
  const commonWords = words1.filter(word => words2.includes(word))
  
  if (commonWords.length === 0) return 0.0
  
  const similarity = (commonWords.length * 2) / (words1.length + words2.length)
  return similarity
}

async function findBestOpenCriticMatch(
  gameTitle: string,
  steamAppId?: number,
  apiKey?: string
): Promise<{ gameId: number; confidence: number } | null> {
  // First, try searching by title
  const searchResults = await searchOpenCriticByTitle(gameTitle, apiKey)
  
  if (searchResults.length === 0) {
    return null
  }

  // Find the best match based on title similarity
  let bestMatch: { gameId: number; confidence: number } | null = null
  
  for (const result of searchResults.slice(0, 5)) { // Check top 5 results
    const similarity = calculateTitleSimilarity(gameTitle, result.name)
    
    if (similarity > 0.7 && (!bestMatch || similarity > bestMatch.confidence)) {
      bestMatch = {
        gameId: result.id,
        confidence: similarity
      }
    }
  }

  // If we have a Steam App ID, we could potentially use that for additional validation
  // OpenCritic doesn't directly expose Steam App IDs in their API, so we rely on title matching

  return bestMatch
}

function mapOpenCriticToGameUpdate(openCriticGame: OpenCriticGame): GameScoreUpdate {
  // Use topCriticScore if available, otherwise fall back to averageScore
  const criticScore = sanitizeNumber(openCriticGame.topCriticScore) || 
                     sanitizeNumber(openCriticGame.averageScore)
  
  const reviewCount = sanitizeNumber(openCriticGame.numTopCriticReviews) || 
                     sanitizeNumber(openCriticGame.numReviews)

  return {
    critic_score: criticScore,
    critic_review_count: reviewCount,
    updated_at: new Date().toISOString()
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
  let matchedCount = 0

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

    // Get OpenCritic API key (optional - some endpoints work without it)
    const openCriticApiKey = Deno.env.get('OPENCRITIC_API_KEY')

    logIngestionStart('OpenCritic')

    // Get games that need OpenCritic score updates
    // Focus on games without critic scores or with old scores
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, title, steam_appid, critic_score, updated_at')
      .or('critic_score.is.null,updated_at.lt.now() - interval \'30 days\'')
      .not('title', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(200) // Process up to 200 games per run to respect rate limits

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`)
    }

    if (!games || games.length === 0) {
      console.log('No games found that need OpenCritic score updates')
      return new Response(
        JSON.stringify({ success: true, message: 'No games to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Found ${games.length} games to process for OpenCritic scores`)

    // Set up rate limiter (OpenCritic allows ~60 requests per minute)
    const rateLimiter = new RateLimiter({ requestsPerSecond: 1, burstLimit: 5 })

    // Process games individually
    for (const game of games) {
      try {
        await rateLimiter.waitForToken()

        // Find the best OpenCritic match for this game
        const match = await findBestOpenCriticMatch(
          game.title,
          game.steam_appid,
          openCriticApiKey
        )

        if (!match) {
          console.log(`No OpenCritic match found for "${game.title}"`)
          processedCount++
          continue
        }

        if (match.confidence < 0.8) {
          console.log(`Low confidence match for "${game.title}" (${match.confidence})`)
          processedCount++
          continue
        }

        await rateLimiter.waitForToken()

        // Fetch detailed game information from OpenCritic
        const openCriticGame = await fetchOpenCriticGameDetails(match.gameId, openCriticApiKey)
        
        if (!openCriticGame) {
          console.warn(`Failed to fetch OpenCritic details for game ID ${match.gameId}`)
          errorCount++
          continue
        }

        // Validate that we have meaningful score data
        if (!validateRequired<OpenCriticGame>(openCriticGame, ['topCriticScore', 'averageScore'])) {
          console.warn(`No valid score data for "${game.title}" from OpenCritic`)
          processedCount++
          continue
        }

        // Map OpenCritic data to game update
        const gameUpdate = mapOpenCriticToGameUpdate(openCriticGame)

        // Only update if we have a valid critic score
        if (gameUpdate.critic_score !== null && gameUpdate.critic_score !== undefined) {
          const { error: updateError } = await supabase
            .from('games')
            .update(gameUpdate)
            .eq('id', game.id)

          if (updateError) {
            console.error(`Failed to update game ${game.id}:`, updateError)
            errorCount++
            continue
          }

          console.log(`Updated "${game.title}" with OpenCritic score: ${gameUpdate.critic_score}`)
          matchedCount++
        }

        processedCount++

      } catch (error) {
        console.error(`Error processing game "${game.title}":`, error)
        errorCount++
      }

      // Log progress every 50 games
      if (processedCount % 50 === 0) {
        logIngestionProgress('OpenCritic', processedCount, games.length)
      }
    }

    // Update checkpoint
    await supabase
      .from('sync_checkpoints')
      .upsert({ 
        source: 'opencritic', 
        last_run: new Date().toISOString(),
        games_processed: processedCount,
        errors: errorCount
      })

    const duration = Date.now() - startTime
    logIngestionComplete('OpenCritic', { 
      processed: processedCount, 
      errors: errorCount, 
      duration,
      matched: matchedCount 
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'OpenCritic ingestion completed',
        stats: {
          processed: processedCount,
          matched: matchedCount,
          errors: errorCount,
          duration_ms: duration
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in OpenCritic ingestion:', error)
    const duration = Date.now() - startTime
    
    // Still update checkpoint to prevent getting stuck
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      await supabase
        .from('sync_checkpoints')
        .upsert({ 
          source: 'opencritic', 
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
          matched: matchedCount,
          errors: errorCount + 1,
          duration_ms: duration
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})