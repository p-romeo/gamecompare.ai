import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
import { supabase, Game } from './supabase'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
  environment: process.env.PINECONE_ENV || '',
})

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'gamecompare-vectors'
const EMBEDDING_DIMENSION = 1536

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
 * Validates that all required environment variables are set
 * @throws Error if any required environment variables are missing
 */
export function validateEnvironmentVariables(): void {
  const required = [
    'OPENAI_API_KEY',
    'PINECONE_API_KEY', 
    'PINECONE_ENV'
  ]

  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}