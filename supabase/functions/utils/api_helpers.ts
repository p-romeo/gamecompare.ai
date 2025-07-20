// Shared utilities for API ingestion functions

export interface PaginationOptions {
  page?: number
  pageSize?: number
  maxPages?: number
}

export interface RetryOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
}

export interface RateLimitOptions {
  requestsPerSecond?: number
  burstLimit?: number
}

// Rate limiter class to handle API rate limiting
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

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3
  const baseDelay = options.baseDelay || 1000
  const maxDelay = options.maxDelay || 10000

  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxAttempts) {
        throw lastError
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

// Generic paginated API fetcher
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

// Data validation helpers
export function validateRequired<T>(
  data: any,
  requiredFields: (keyof T)[]
): data is T {
  if (!data || typeof data !== 'object') {
    return false
  }

  return requiredFields.every(field => 
    data[field] !== undefined && data[field] !== null
  )
}

export function sanitizeString(value: any): string | null {
  if (typeof value !== 'string') {
    return null
  }
  
  return value.trim() || null
}

export function sanitizeNumber(value: any): number | null {
  const num = Number(value)
  return isNaN(num) ? null : num
}

export function sanitizeDate(value: any): string | null {
  if (!value) return null
  
  try {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date.toISOString()
  } catch {
    return null
  }
}

export function sanitizeArray(value: any): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  
  return value
    .map(item => sanitizeString(item))
    .filter((item): item is string => item !== null)
}

// Error handling utilities
export class IngestionError extends Error {
  constructor(
    message: string,
    public readonly source: string,
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'IngestionError'
  }
}

export function handleApiError(error: any, source: string): never {
  if (error instanceof IngestionError) {
    throw error
  }
  
  const message = error?.message || 'Unknown error occurred'
  throw new IngestionError(`${source} API error: ${message}`, source, error)
}

// Logging utilities
export function logIngestionStart(source: string, options?: any): void {
  console.log(`Starting ${source} ingestion`, options ? { options } : '')
}

export function logIngestionProgress(
  source: string, 
  processed: number, 
  total?: number
): void {
  const progress = total ? ` (${processed}/${total})` : ` (${processed})`
  console.log(`${source} ingestion progress${progress}`)
}

export function logIngestionComplete(
  source: string, 
  stats: { processed: number; errors: number; duration: number }
): void {
  console.log(`${source} ingestion completed:`, stats)
}