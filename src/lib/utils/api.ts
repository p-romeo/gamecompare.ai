/**
 * Consolidated API Utilities
 * Common functionality for API calls, retry logic, and response handling
 */

/**
 * Configuration for API client retry behavior
 */
export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

/**
 * Default retry configuration
 */
export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
}

/**
 * Rate limiting configuration
 */
export interface RateLimitOptions {
  requestsPerSecond?: number
  burstLimit?: number
}

/**
 * Pagination options for API calls
 */
export interface PaginationOptions {
  page?: number
  pageSize?: number
  maxPages?: number
}

/**
 * Rate limiter class to handle API rate limiting
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number

  constructor(options: RateLimitOptions = {}) {
    this.maxTokens = options.burstLimit || 10
    this.refillRate = options.requestsPerSecond || 1
    this.tokens = this.maxTokens
    this.lastRefill = Date.now()
  }

  async waitForToken(): Promise<void> {
    this.refillTokens()
    
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Wait until we can get a token
    const waitTime = (1 / this.refillRate) * 1000
    await new Promise(resolve => setTimeout(resolve, waitTime))
    return this.waitForToken()
  }

  private refillTokens(): void {
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000
    const tokensToAdd = timePassed * this.refillRate
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefill = now
  }
}

/**
 * Implements exponential backoff retry logic for API calls
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === config.maxAttempts) {
        break
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
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
 * Generic paginated API fetcher
 */
export async function fetchPaginated<T>(
  baseUrl: string,
  options: PaginationOptions & {
    headers?: Record<string, string>
    rateLimiter?: RateLimiter
    transform?: (data: any) => T[]
  } = {}
): Promise<T[]> {
  const {
    page = 1,
    pageSize = 20,
    maxPages = 50,
    headers = {},
    rateLimiter,
    transform = (data) => data.results || data
  } = options

  const results: T[] = []
  let currentPage = page
  let hasMore = true

  while (hasMore && currentPage <= maxPages) {
    if (rateLimiter) {
      await rateLimiter.waitForToken()
    }

    const url = new URL(baseUrl)
    url.searchParams.set('page', currentPage.toString())
    url.searchParams.set('page_size', pageSize.toString())

    const response = await withRetry(async () => {
      const res = await fetch(url.toString(), { headers })
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      return res.json()
    })

    const pageResults = transform(response)
    results.push(...pageResults)

    // Check if there are more pages
    hasMore = response.next != null || pageResults.length === pageSize
    currentPage++

    console.log(`Fetched page ${currentPage - 1}, got ${pageResults.length} items`)
  }

  return results
}

/**
 * HTTP client with built-in retry and error handling
 */
export class HttpClient {
  private readonly baseUrl: string
  private readonly retryConfig: RetryConfig
  private readonly defaultHeaders: Record<string, string>

  constructor(
    baseUrl: string = '',
    retryConfig: RetryConfig = defaultRetryConfig,
    defaultHeaders: Record<string, string> = {}
  ) {
    this.baseUrl = baseUrl
    this.retryConfig = retryConfig
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders
    }
  }

  /**
   * Make a GET request
   */
  async get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('GET', url, undefined, headers)
  }

  /**
   * Make a POST request
   */
  async post<T>(url: string, body?: any, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('POST', url, body, headers)
  }

  /**
   * Make a PUT request
   */
  async put<T>(url: string, body?: any, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('PUT', url, body, headers)
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('DELETE', url, undefined, headers)
  }

  /**
   * Generic request method with retry logic
   */
  private async request<T>(
    method: string,
    url: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<T> {
    return withRetry(async () => {
      const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`
      const requestHeaders = { ...this.defaultHeaders, ...headers }

      const response = await fetch(fullUrl, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
      }

      return await response.json()
    }, this.retryConfig)
  }
}

/**
 * Utility for handling streaming responses
 */
export async function handleStreamingResponse(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        break
      }
      
      const chunk = decoder.decode(value, { stream: true })
      onChunk(chunk)
    }
  } finally {
    reader.releaseLock()
  }
}