/// <reference types="https://deno.land/x/deno/lib/deno.d.ts" />

/**
 * Embedding utilities for Supabase Edge Functions
 * Adapted for Deno environment
 */

// Deno environment declaration for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const EMBEDDING_DIMENSION = 1536

/**
 * Generates an embedding vector for the given text using OpenAI's text-embedding-3-small model
 * @param text The text to generate an embedding for
 * @returns Promise resolving to a 1536-dimensional embedding vector
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty')
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.trim(),
        encoding_format: 'float',
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const embedding = data.data[0]?.embedding

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

    const pineconeKey = Deno.env.get('PINECONE_API_KEY')
    const pineconeIndexName = Deno.env.get('PINECONE_INDEX_NAME') || 'gamecompare-vectors'
    const pineconeEnvironment = Deno.env.get('PINECONE_ENVIRONMENT') || 'us-east-1-aws'
    
    if (!pineconeKey) {
      throw new Error('PINECONE_API_KEY environment variable is required')
    }

    // Construct Pinecone API URL
    const pineconeUrl = `https://${pineconeIndexName}-${pineconeEnvironment}.svc.pinecone.io/query`

    const response = await fetch(pineconeUrl, {
      method: 'POST',
      headers: {
        'Api-Key': pineconeKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`Pinecone API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    return data.matches?.map((match: any) => ({
      gameId: match.id,
      score: match.score || 0
    })) || []
  } catch (error) {
    console.error('Error searching similar games:', error)
    throw new Error(`Failed to search similar games: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}