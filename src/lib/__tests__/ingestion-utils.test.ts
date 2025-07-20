// Tests for ingestion utility functions
// Since these are in Deno edge functions, we'll test the core logic by recreating them

// Recreate the utility functions for testing
function logIngestionStart(source: string, options?: any): void {
  console.log(`Starting ${source} ingestion`, options ? { options } : '')
}

function logIngestionProgress(
  source: string, 
  processed: number, 
  total?: number
): void {
  const progress = total ? ` (${processed}/${total})` : ` (${processed})`
  console.log(`${source} ingestion progress${progress}`)
}

function logIngestionComplete(
  source: string, 
  stats: { processed: number; errors: number; duration: number }
): void {
  console.log(`${source} ingestion completed:`, stats)
}

interface PaginationOptions {
  page?: number
  pageSize?: number
  maxPages?: number
}

interface RetryOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
}

async function withRetry<T>(
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

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

async function fetchPaginated<T>(
  baseUrl: string,
  options: PaginationOptions & {
    headers?: Record<string, string>
    rateLimiter?: any
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

    hasMore = response.next != null || pageResults.length === pageSize
    currentPage++

    console.log(`Fetched page ${currentPage - 1}, got ${pageResults.length} items`)
  }

  return results
}

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation()

// Mock fetch globally
global.fetch = jest.fn()
const mockFetch = fetch as jest.MockedFunction<typeof fetch>

describe('Ingestion Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchPaginated', () => {
    const mockApiResponse = (page: number, hasNext: boolean = true) => ({
      results: [
        { id: page * 10 + 1, name: `Item ${page * 10 + 1}` },
        { id: page * 10 + 2, name: `Item ${page * 10 + 2}` }
      ],
      next: hasNext ? `https://api.example.com/page=${page + 1}` : null,
      count: 100
    })

    it('should fetch single page successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse(1, false)
      } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        pageSize: 2,
        maxPages: 1
      })

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ id: 11, name: 'Item 11' })
      expect(results[1]).toEqual({ id: 12, name: 'Item 12' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should fetch multiple pages', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse(1, true)
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse(2, false)
        } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        pageSize: 2,
        maxPages: 2
      })

      expect(results).toHaveLength(4)
      expect(results[0]).toEqual({ id: 11, name: 'Item 11' })
      expect(results[2]).toEqual({ id: 21, name: 'Item 21' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should respect maxPages limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse(1, true)
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse(2, true)
        } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        pageSize: 2,
        maxPages: 2
      })

      expect(results).toHaveLength(4)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should handle API errors with retry', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse(1, false)
        } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        pageSize: 2,
        maxPages: 1
      })

      expect(results).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)

      await expect(
        fetchPaginated('https://api.example.com/items')
      ).rejects.toThrow('HTTP 404: Not Found')
    })

    it('should use custom transform function', async () => {
      const customResponse = {
        data: [{ id: 1, title: 'Custom Item' }],
        pagination: { hasNext: false }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => customResponse
      } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        transform: (data) => data.data || []
      })

      expect(results).toEqual([{ id: 1, title: 'Custom Item' }])
    })

    it('should include custom headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse(1, false)
      } as Response)

      await fetchPaginated('https://api.example.com/items', {
        headers: {
          'Authorization': 'Bearer token',
          'User-Agent': 'Test Agent'
        }
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.example.com/items'),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer token',
            'User-Agent': 'Test Agent'
          }
        })
      )
    })

    it('should work with rate limiter', async () => {
      const mockRateLimiter = {
        waitForToken: jest.fn().mockResolvedValue(undefined)
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse(1, false)
      } as Response)

      await fetchPaginated('https://api.example.com/items', {
        rateLimiter: mockRateLimiter as any
      })

      expect(mockRateLimiter.waitForToken).toHaveBeenCalled()
    })

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] })
      } as Response)

      const results = await fetchPaginated('https://api.example.com/items')

      expect(results).toEqual([])
    })

    it('should stop when no more results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [{ id: 1 }], next: 'page2' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [], next: null })
        } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        maxPages: 10
      })

      expect(results).toHaveLength(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should construct URLs with pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse(1, false)
      } as Response)

      await fetchPaginated('https://api.example.com/items?key=value', {
        page: 3,
        pageSize: 25
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('page=3')
      expect(calledUrl).toContain('page_size=25')
      expect(calledUrl).toContain('key=value')
    })
  })

  describe('Logging Functions', () => {
    afterEach(() => {
      mockConsoleLog.mockClear()
    })

    describe('logIngestionStart', () => {
      it('should log ingestion start without options', () => {
        logIngestionStart('TestAPI')

        expect(mockConsoleLog).toHaveBeenCalledWith('Starting TestAPI ingestion', '')
      })

      it('should log ingestion start with options', () => {
        const options = { batchSize: 50, maxPages: 10 }
        logIngestionStart('TestAPI', options)

        expect(mockConsoleLog).toHaveBeenCalledWith(
          'Starting TestAPI ingestion',
          { options }
        )
      })
    })

    describe('logIngestionProgress', () => {
      it('should log progress without total', () => {
        logIngestionProgress('TestAPI', 150)

        expect(mockConsoleLog).toHaveBeenCalledWith('TestAPI ingestion progress (150)')
      })

      it('should log progress with total', () => {
        logIngestionProgress('TestAPI', 150, 500)

        expect(mockConsoleLog).toHaveBeenCalledWith('TestAPI ingestion progress (150/500)')
      })
    })

    describe('logIngestionComplete', () => {
      it('should log completion with stats', () => {
        const stats = {
          processed: 250,
          errors: 5,
          duration: 30000
        }

        logIngestionComplete('TestAPI', stats)

        expect(mockConsoleLog).toHaveBeenCalledWith('TestAPI ingestion completed:', stats)
      })
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete ingestion workflow', async () => {
      // Mock multiple pages of data
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ id: 1, name: 'Game 1' }, { id: 2, name: 'Game 2' }],
            next: 'page2'
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ id: 3, name: 'Game 3' }],
            next: null
          })
        } as Response)

      // Start ingestion
      logIngestionStart('TestAPI', { batchSize: 2 })

      // Fetch data
      const results = await fetchPaginated('https://api.example.com/games', {
        pageSize: 2,
        maxPages: 5
      })

      // Log progress
      logIngestionProgress('TestAPI', results.length, 100)

      // Complete ingestion
      logIngestionComplete('TestAPI', {
        processed: results.length,
        errors: 0,
        duration: 5000
      })

      expect(results).toHaveLength(3)
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Starting TestAPI ingestion',
        { options: { batchSize: 2 } }
      )
      expect(mockConsoleLog).toHaveBeenCalledWith('TestAPI ingestion progress (3/100)')
      expect(mockConsoleLog).toHaveBeenCalledWith('TestAPI ingestion completed:', {
        processed: 3,
        errors: 0,
        duration: 5000
      })
    })

    it('should handle ingestion with errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ id: 1, name: 'Game 1' }],
            next: 'page2'
          })
        } as Response)
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))

      logIngestionStart('TestAPI')

      await expect(
        fetchPaginated('https://api.example.com/games', {
          pageSize: 1,
          maxPages: 2
        })
      ).rejects.toThrow('API rate limit exceeded')

      logIngestionComplete('TestAPI', {
        processed: 1,
        errors: 1,
        duration: 2000
      })

      expect(mockConsoleLog).toHaveBeenCalledWith('Starting TestAPI ingestion', '')
      expect(mockConsoleLog).toHaveBeenCalledWith('TestAPI ingestion completed:', {
        processed: 1,
        errors: 1,
        duration: 2000
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      } as Response)

      await expect(
        fetchPaginated('https://api.example.com/items')
      ).rejects.toThrow('Invalid JSON')
    })

    it('should handle network timeouts', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      )

      await expect(
        fetchPaginated('https://api.example.com/items')
      ).rejects.toThrow('Request timeout')
    })

    it('should handle responses with unexpected structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing 'results' field
          data: [{ id: 1 }],
          meta: { total: 1 }
        })
      } as Response)

      const results = await fetchPaginated('https://api.example.com/items')

      // Should return empty array when default transform doesn't find 'results'
      expect(results).toEqual([])
    })

    it('should handle very large page counts', async () => {
      // Mock a response that claims to have many pages
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ id: 1 }],
          next: 'always-has-next' // This would cause infinite loop without maxPages
        })
      } as Response)

      const results = await fetchPaginated('https://api.example.com/items', {
        maxPages: 3 // Limit to prevent infinite requests
      })

      expect(results).toHaveLength(3) // Should stop at maxPages
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })
})