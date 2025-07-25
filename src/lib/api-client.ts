import { FilterState, GameSummary } from './types'
import { Game } from './supabase'

/**
 * Response from the /similar endpoint
 */
export interface ChatResponse {
  response: string
  games: GameSummary[]
  conversation_id: string
}

/**
 * Response from the /compare endpoint
 */
export interface ComparisonResponse {
  comparison: string
  leftGame: Game
  rightGame: Game
}

/**
 * Configuration for API client retry behavior
 */
interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

/**
 * Default retry configuration
 */
const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
}

/**
 * API client for frontend-to-backend communication
 */
export class APIClient {
  private readonly baseUrl: string
  private readonly retryConfig: RetryConfig

  /**
   * Creates a new API client instance
   * @param baseUrl Base URL for API endpoints
   * @param retryConfig Configuration for retry behavior
   */
  constructor(
    baseUrl: string = '/api',
    retryConfig: RetryConfig = defaultRetryConfig
  ) {
    this.baseUrl = baseUrl
    this.retryConfig = retryConfig
  }

  /**
   * Implements exponential backoff retry logic for API calls
   * @param operation The API operation to retry
   * @returns Promise resolving to the operation result
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt === this.retryConfig.maxAttempts) {
          break
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        )
        
        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000
        
        console.warn(`API attempt ${attempt} failed, retrying in ${jitteredDelay}ms:`, lastError.message)
        await new Promise(resolve => setTimeout(resolve, jitteredDelay))
      }
    }
    
    throw lastError!
  }

  /**
   * Searches for similar games based on a natural language query
   * @param query The user's natural language query
   * @param filters Optional filters to apply to the search
   * @returns Promise resolving to the chat response
   */
  async searchSimilarGames(query: string, filters?: FilterState): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/similar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, filters }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to search similar games: ${response.status} ${errorData.error || response.statusText}`)
      }

      return await response.json()
    })
  }

  /**
   * Compares two games side-by-side
   * @param leftId ID of the first game to compare
   * @param rightId ID of the second game to compare
   * @returns Promise resolving to the comparison response
   */
  async compareGames(leftId: string, rightId: string): Promise<ComparisonResponse> {
    return this.withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ left: leftId, right: rightId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to compare games: ${response.status} ${errorData.error || response.statusText}`)
      }

      return await response.json()
    })
  }

  /**
   * Gets detailed information about a specific game
   * @param gameId ID of the game to retrieve
   * @returns Promise resolving to the game details
   */
  async getGameDetails(gameId: string): Promise<Game> {
    return this.withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/game/${gameId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to get game details: ${response.status} ${errorData.error || response.statusText}`)
      }

      return await response.json()
    })
  }

  /**
   * Tracks a click on a game store link
   * @param gameId ID of the game that was clicked
   * @param store The store that was clicked (e.g., 'steam', 'epic', 'gog')
   * @returns Promise that resolves when the click is tracked
   */
  async trackClick(gameId: string, store: string): Promise<void> {
    return this.withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/click/${gameId}/${store}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to track click: ${response.status} ${errorData.error || response.statusText}`)
      }
    })
  }

  /**
   * Streams a chat response for real-time updates
   * @param query The user's natural language query
   * @param filters Optional filters to apply to the search
   * @param onChunk Callback function that receives each chunk of the streamed response
   * @returns Promise that resolves when the stream is complete
   */
  async streamChatResponse(
    query: string, 
    filters: FilterState | undefined, 
    onChunk: (chunk: string) => void
  ): Promise<void> {
    return this.withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/similar/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, filters }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to stream chat response: ${response.status} ${errorData.error || response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            break
          }
          
          buffer += decoder.decode(value, { stream: true })
          
          // Process complete lines
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                
                if (data.type === 'chunk') {
                  onChunk(data.content)
                } else if (data.type === 'error') {
                  throw new Error(data.content)
                } else if (data.type === 'done') {
                  return
                }
                // Ignore other types like 'games' for now
              } catch (parseError) {
                console.warn('Failed to parse streaming data:', line, parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    })
  }
}

// Export singleton instance
export const apiClient = new APIClient()