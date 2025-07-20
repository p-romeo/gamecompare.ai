import 'openai/shims/node'
import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
import { supabase, Game } from './supabase'
import { FilterState } from './types'

/**
 * Validates that all required environment variables are set
 * @throws Error if any required environment variables are missing
 */
function validateEnvironmentVariables(): void {
  const required = [
    'OPENAI_API_KEY',
    'PINECONE_API_KEY'
  ]

  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// Validate environment variables at module initialization
validateEnvironmentVariables()

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Initialize Pinecone client (v1.x no longer uses environment parameter)
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
})

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'gamecompare-vectors'
const EMBEDDING_DIMENSION = 1536

/**
 * Configuration for batch processing and retry behavior
 */
export interface BatchProcessConfig {
  batchSize: number
  concurrency: number
  maxRetries: number
  retryDelay: number
}

/**
 * Default configuration for batch processing
 */
export const defaultBatchConfig: BatchProcessConfig = {
  batchSize: 10,
  concurrency: 3,
  maxRetries: 3,
  retryDelay: 1000
}

/**
 * Generates an embedding vector for the given text using OpenAI's text-embedding-3-small model
 * @param text The text to generate an embedding for
 * @returns Promise resolving to a 1536-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty')
    }

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    })

    const embedding = response.data[0]?.embedding
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI')
    }

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Expected embedding dimension ${EMBEDDING_DIMENSION}, got ${embedding.length}`)
    }

    return embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Upserts a vector to both Pinecone and Supabase
 * @param gameId The unique identifier for the game
 * @param embedding The 1536-dimensional embedding vector
 * @returns Promise that resolves when both operations complete
 */
export async function upsertVector(gameId: string, embedding: number[]): Promise<void> {
  try {
    if (!gameId || gameId.trim().length === 0) {
      throw new Error('Game ID cannot be empty')
    }

    if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Embedding must be exactly ${EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`)
    }

    // Get Pinecone index
    const index = pinecone.index(PINECONE_INDEX_NAME)

    // Upsert to Pinecone
    await index.upsert([
      {
        id: gameId,
        values: embedding,
        metadata: { gameId }
      }
    ])

    // Upsert to Supabase game_vectors table
    const { error: supabaseError } = await supabase
      .from('game_vectors')
      .upsert({
        game_id: gameId,
        embedding: embedding
      }, {
        onConflict: 'game_id'
      })

    if (supabaseError) {
      throw new Error(`Supabase upsert failed: ${supabaseError.message}`)
    }

    console.log(`Successfully upserted vector for game ${gameId}`)
  } catch (error) {
    console.error('Error upserting vector:', error)
    throw new Error(`Failed to upsert vector: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Normalizes game metadata into a single string suitable for embedding generation
 * @param game The game object to normalize
 * @returns A normalized string containing all relevant game information
 */
export function normalizeGameMetadata(game: Game): string {
  const parts: string[] = []

  // Add title (most important)
  if (game.title) {
    parts.push(`Title: ${game.title}`)
  }

  // Add description
  if (game.short_description) {
    parts.push(`Description: ${game.short_description}`)
  }

  // Add genres
  if (game.genres && game.genres.length > 0) {
    parts.push(`Genres: ${game.genres.join(', ')}`)
  }

  // Add platforms
  if (game.platforms && game.platforms.length > 0) {
    parts.push(`Platforms: ${game.platforms.join(', ')}`)
  }

  // Add release date
  if (game.release_date) {
    const releaseYear = new Date(game.release_date).getFullYear()
    if (!isNaN(releaseYear)) {
      parts.push(`Release Year: ${releaseYear}`)
    }
  }

  // Add price information if available
  if (game.price_usd !== null && game.price_usd !== undefined) {
    parts.push(`Price: $${game.price_usd}`)
  }

  // Add critic score if available
  if (game.critic_score !== null && game.critic_score !== undefined) {
    parts.push(`Critic Score: ${game.critic_score}/100`)
  }

  const normalized = parts.join('. ')
  
  if (!normalized.trim()) {
    throw new Error('No metadata available to normalize for this game')
  }

  return normalized
}

/**
 * Convenience function to generate and upsert embedding for a game
 * @param game The game object to process
 * @returns Promise that resolves when the embedding is generated and upserted
 */
export async function processGameEmbedding(game: Game): Promise<void> {
  try {
    const normalizedText = normalizeGameMetadata(game)
    const embedding = await generateEmbedding(normalizedText)
    await upsertVector(game.id, embedding)
    console.log(`Successfully processed embedding for game: ${game.title}`)
  } catch (error) {
    console.error(`Error processing embedding for game ${game.id}:`, error)
    throw error
  }
}

/**
 * Searches for similar games using vector similarity in Pinecone
 * @param queryEmbedding The embedding vector to search with
 * @param topK Number of results to return (default: 10)
 * @returns Promise resolving to an array of game IDs with similarity scores
 */
export async function searchSimilarGames(
  queryEmbedding: number[], 
  topK: number = 10
): Promise<Array<{ gameId: string; score: number }>> {
  try {
    if (!queryEmbedding || queryEmbedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Query embedding must be exactly ${EMBEDDING_DIMENSION} dimensions`)
    }

    const index = pinecone.index(PINECONE_INDEX_NAME)
    
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true
    })

    return queryResponse.matches?.map((match: any) => ({
      gameId: match.id,
      score: match.score || 0
    })) || []
  } catch (error) {
    console.error('Error searching similar games:', error)
    throw new Error(`Failed to search similar games: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Searches for similar games with filtering capabilities
 * @param queryText The text query to search for
 * @param filters Optional filters to apply to the search results
 * @param topK Number of results to return (default: 10)
 * @returns Promise resolving to an array of games with similarity scores
 */
export async function searchSimilarGamesWithFilters(
  queryText: string,
  filters?: FilterState,
  topK: number = 10
): Promise<Array<{ game: Game; similarity_score: number }>> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(queryText)
    
    // Search for similar games in Pinecone
    const similarGames = await searchSimilarGames(queryEmbedding, topK * 2) // Get more results to allow for filtering
    
    if (similarGames.length === 0) {
      return []
    }
    
    // Build SQL query with filters
    let query = supabase
      .from('games')
      .select('*')
      .in('id', similarGames.map(g => g.gameId))
    
    // Apply filters if provided
    if (filters) {
      // Price filter
      if (filters.priceMax !== undefined) {
        query = query.lte('price_usd', filters.priceMax)
      }
      
      // Platform filter
      if (filters.platforms && filters.platforms.length > 0) {
        // Use overlap operator to find games available on any of the selected platforms
        query = query.overlaps('platforms', filters.platforms)
      }
      
      // Year range filter
      if (filters.yearRange && filters.yearRange.length === 2) {
        const [startYear, endYear] = filters.yearRange
        const startDate = new Date(startYear, 0, 1).toISOString()
        const endDate = new Date(endYear, 11, 31).toISOString()
        
        query = query
          .gte('release_date', startDate)
          .lte('release_date', endDate)
      }
    }
    
    // Execute query
    const { data: games, error } = await query
    
    if (error) {
      throw new Error(`Database query failed: ${error.message}`)
    }
    
    if (!games || games.length === 0) {
      // If no games match the filters, try a fallback to text search
      return await fallbackToTextSearch(queryText, filters, topK)
    }
    
    // Map game IDs to similarity scores
    const scoreMap = new Map(similarGames.map(g => [g.gameId, g.score]))
    
    // Sort by similarity score
    const result = games
      .map(game => ({
        game,
        similarity_score: scoreMap.get(game.id) || 0
      }))
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, topK)
    
    return result
  } catch (error) {
    console.error('Error searching similar games with filters:', error)
    throw new Error(`Failed to search similar games: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Fallback search using PostgreSQL full-text search when vector search returns no results
 * @param queryText The text query to search for
 * @param filters Optional filters to apply to the search results
 * @param topK Number of results to return
 * @returns Promise resolving to an array of games with similarity scores
 */
async function fallbackToTextSearch(
  queryText: string,
  filters?: FilterState,
  topK: number = 10
): Promise<Array<{ game: Game; similarity_score: number }>> {
  try {
    console.log('Falling back to text search for query:', queryText)
    
    // Build text search query
    let query = supabase
      .from('games')
      .select('*')
      .textSearch('search_text', queryText.replace(/[^\w\s]/g, ' ').trim())
    
    // Apply filters if provided
    if (filters) {
      // Price filter
      if (filters.priceMax !== undefined) {
        query = query.lte('price_usd', filters.priceMax)
      }
      
      // Platform filter
      if (filters.platforms && filters.platforms.length > 0) {
        query = query.overlaps('platforms', filters.platforms)
      }
      
      // Year range filter
      if (filters.yearRange && filters.yearRange.length === 2) {
        const [startYear, endYear] = filters.yearRange
        const startDate = new Date(startYear, 0, 1).toISOString()
        const endDate = new Date(endYear, 11, 31).toISOString()
        
        query = query
          .gte('release_date', startDate)
          .lte('release_date', endDate)
      }
    }
    
    // Limit results
    query = query.limit(topK)
    
    // Execute query
    const { data: games, error } = await query
    
    if (error) {
      throw new Error(`Text search query failed: ${error.message}`)
    }
    
    if (!games || games.length === 0) {
      return []
    }
    
    // Assign arbitrary similarity scores (lower than vector search would provide)
    return games.map((game, index) => ({
      game,
      similarity_score: 0.5 - (index * 0.01) // Scores from 0.5 down
    }))
  } catch (error) {
    console.error('Error in fallback text search:', error)
    throw new Error(`Fallback search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Result of a batch processing operation
 */
export interface BatchProcessResult {
  totalGames: number
  succeeded: number
  failed: number
  failedGameIds: string[]
  errors: Record<string, string>
}

/**
 * Processes embeddings for a batch of games with enhanced error handling and retry logic
 * @param games Array of games to process
 * @param config Configuration for batch processing (optional)
 * @returns Promise resolving to batch processing results
 */
export async function batchProcessEmbeddings(
  games: Game[],
  config: Partial<BatchProcessConfig> = {}
): Promise<BatchProcessResult> {
  // Merge provided config with defaults
  const fullConfig: BatchProcessConfig = {
    ...defaultBatchConfig,
    ...config
  }
  
  const { batchSize, concurrency, maxRetries, retryDelay } = fullConfig
  const results: BatchProcessResult = {
    totalGames: games.length,
    succeeded: 0,
    failed: 0,
    failedGameIds: [],
    errors: {}
  }
  
  try {
    if (!games || games.length === 0) {
      console.log('No games to process')
      return results
    }
    
    console.log(`Processing embeddings for ${games.length} games in batches of ${batchSize} with concurrency ${concurrency}`)
    
    // Process games in batches
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(games.length / batchSize)}`)
      
      // Process games in the batch with controlled concurrency
      const batchResults = await processBatchWithConcurrency(batch, concurrency, maxRetries, retryDelay)
      
      // Update overall results
      results.succeeded += batchResults.succeeded
      results.failed += batchResults.failed
      results.failedGameIds.push(...batchResults.failedGameIds)
      results.errors = { ...results.errors, ...batchResults.errors }
      
      console.log(`Batch completed: ${batchResults.succeeded} succeeded, ${batchResults.failed} failed`)
      
      // If there are more batches, wait a bit to avoid rate limiting
      if (i + batchSize < games.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log(`Finished processing embeddings for ${games.length} games: ${results.succeeded} succeeded, ${results.failed} failed`)
    
    return results
  } catch (error) {
    console.error('Error in batch processing:', error)
    throw new Error(`Batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Processes a batch of games with controlled concurrency and retry logic
 * @param games Array of games to process in this batch
 * @param concurrency Maximum number of concurrent operations
 * @param maxRetries Maximum number of retry attempts per game
 * @param retryDelay Base delay between retries in milliseconds
 * @returns Promise resolving to batch processing results
 */
async function processBatchWithConcurrency(
  games: Game[],
  concurrency: number,
  maxRetries: number,
  retryDelay: number
): Promise<BatchProcessResult> {
  const results: BatchProcessResult = {
    totalGames: games.length,
    succeeded: 0,
    failed: 0,
    failedGameIds: [],
    errors: {}
  }
  
  // Create a queue of games to process
  const queue = [...games]
  const inProgress = new Set<string>()
  const completed = new Set<string>()
  
  // Process games until queue is empty
  while (queue.length > 0 || inProgress.size > 0) {
    // Fill up to concurrency limit
    while (queue.length > 0 && inProgress.size < concurrency) {
      const game = queue.shift()!
      inProgress.add(game.id)
      
      // Process game with retry logic
      processGameWithRetry(game, maxRetries, retryDelay)
        .then(success => {
          if (success) {
            results.succeeded++
          } else {
            results.failed++
            results.failedGameIds.push(game.id)
            results.errors[game.id] = `Failed after ${maxRetries} retries`
          }
          inProgress.delete(game.id)
          completed.add(game.id)
        })
        .catch(error => {
          results.failed++
          results.failedGameIds.push(game.id)
          results.errors[game.id] = error instanceof Error ? error.message : 'Unknown error'
          inProgress.delete(game.id)
          completed.add(game.id)
        })
    }
    
    // Wait a bit before checking again
    if (inProgress.size >= concurrency || (queue.length === 0 && inProgress.size > 0)) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return results
}

/**
 * Processes a single game with retry logic
 * @param game The game to process
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelay Base delay between retries in milliseconds
 * @returns Promise resolving to a boolean indicating success
 */
async function processGameWithRetry(
  game: Game,
  maxRetries: number,
  retryDelay: number
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await processGameEmbedding(game)
      return true
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`Failed to process game ${game.id} after ${maxRetries} attempts:`, error)
        return false
      }
      
      // Calculate exponential backoff with jitter
      const delay = retryDelay * Math.pow(2, attempt) + Math.random() * 1000
      console.warn(`Attempt ${attempt + 1} failed for game ${game.id}, retrying in ${Math.round(delay)}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  return false
}

/**
 * Checks if a game needs its embedding updated based on content changes
 * @param game The game to check
 * @param previousVersion Previous version of the game (if available)
 * @returns Boolean indicating if the game needs a new embedding
 */
export function needsEmbeddingUpdate(game: Game, previousVersion?: Game): boolean {
  // If no previous version, always generate embedding
  if (!previousVersion) {
    return true
  }
  
  // Check if any fields that affect the embedding have changed
  return (
    game.title !== previousVersion.title ||
    game.short_description !== previousVersion.short_description ||
    JSON.stringify(game.genres) !== JSON.stringify(previousVersion.genres) ||
    JSON.stringify(game.platforms) !== JSON.stringify(previousVersion.platforms) ||
    game.release_date !== previousVersion.release_date ||
    game.critic_score !== previousVersion.critic_score
  )
}