import { GameSummary, GameDetail, FilterState } from './types'

// Type declaration for process.env in Next.js
declare const process: {
  env: {
    NEXT_PUBLIC_SUPABASE_URL?: string
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  }
}

/**
 * Base configuration for API calls
 */
const API_BASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL as string) + '/functions/v1'

const API_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

/**
 * Makes an authenticated request to the API
 */
async function makeRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_BASE_URL || !API_KEY) {
    throw new APIError('Missing Supabase configuration', 500)
  }

  const url = `${API_BASE_URL}/${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`
    let errorData = null
    
    try {
      errorData = await response.json()
      errorMessage = errorData.error || errorMessage
    } catch {
      // If JSON parsing fails, use default message
    }

    throw new APIError(errorMessage, response.status, errorData)
  }

  // Handle streaming responses
  if (response.headers.get('transfer-encoding') === 'chunked') {
    return response as unknown as T
  }

  try {
    return await response.json()
  } catch {
    // If JSON parsing fails, return the response object
    return response as unknown as T
  }
}

/**
 * Searches for similar games based on a query
 */
export async function searchSimilarGames(
  query: string,
  filters?: FilterState
): Promise<{
  games: GameSummary[]
  response: ReadableStream<Uint8Array>
}> {
  try {
    if (!query.trim()) {
      throw new APIError('Query cannot be empty', 400)
    }

    const response = await makeRequest<Response>('api_router/similar', {
      method: 'POST',
      body: JSON.stringify({ query: query.trim(), filters }),
    })

    // For streaming responses, we need to handle them differently
    if (response instanceof Response && response.body) {
      // This is a streaming response
      return {
        games: [], // Games will be included in the stream
        response: response.body
      }
    }

    // Fallback for non-streaming response
    const data = response as any
    return {
      games: data.games || [],
      response: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data.response || 'No response'))
          controller.close()
        }
      })
    }
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw new APIError(
      `Failed to search similar games: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    )
  }
}

/**
 * Compares two games
 */
export async function compareGames(
  leftGameId: string,
  rightGameId: string
): Promise<{ comparison: string }> {
  try {
    if (!leftGameId.trim() || !rightGameId.trim()) {
      throw new APIError('Both game IDs are required', 400)
    }

    const data = await makeRequest<{ comparison: string }>('api_router/compare', {
      method: 'POST',
      body: JSON.stringify({ 
        left: leftGameId.trim(), 
        right: rightGameId.trim() 
      }),
    })

    return data
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw new APIError(
      `Failed to compare games: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    )
  }
}

/**
 * Gets details for a specific game
 */
export async function getGameDetails(gameId: string): Promise<GameDetail> {
  try {
    if (!gameId.trim()) {
      throw new APIError('Game ID is required', 400)
    }

    const data = await makeRequest<GameDetail>(`api_router/game/${gameId.trim()}`)
    return data
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw new APIError(
      `Failed to get game details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    )
  }
}

/**
 * Logs a click and redirects to the store (for tracking affiliate clicks)
 */
export function trackClick(gameId: string, store: string): string {
  if (!gameId.trim() || !store.trim()) {
    throw new APIError('Game ID and store are required', 400)
  }

  // Return the URL that will handle the click tracking and redirect
  return `${API_BASE_URL}/api_router/click/${gameId.trim()}/${store.trim()}`
}

/**
 * Helper function to consume a ReadableStream and return text
 */
export async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }
    return result
  } finally {
    reader.releaseLock()
  }
}

/**
 * Helper function to consume a ReadableStream chunk by chunk
 */
export async function* streamChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Validates filter state before sending to API
 */
export function validateFilters(filters: FilterState): FilterState {
  const validated: FilterState = {}

  if (filters.priceMax !== undefined) {
    if (filters.priceMax < 0) {
      throw new APIError('Price max must be non-negative', 400)
    }
    validated.priceMax = filters.priceMax
  }

  if (filters.playtimeMax !== undefined) {
    if (filters.playtimeMax < 0) {
      throw new APIError('Playtime max must be non-negative', 400)
    }
    validated.playtimeMax = filters.playtimeMax
  }

  if (filters.platforms && filters.platforms.length > 0) {
    validated.platforms = filters.platforms.filter(p => p.trim().length > 0)
  }

  if (filters.yearRange) {
    const [start, end] = filters.yearRange
    if (start > end) {
      throw new APIError('Year range start cannot be after end', 400)
    }
    if (start < 1970 || end > new Date().getFullYear() + 5) {
      throw new APIError('Year range must be reasonable (1970-future)', 400)
    }
    validated.yearRange = filters.yearRange
  }

  return validated
} 