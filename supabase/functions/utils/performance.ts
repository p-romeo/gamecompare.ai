/**
 * Performance optimization utilities for GameCompare.ai
 * Includes query optimization, connection pooling, and response optimization
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Connection pool for database connections
 */
class ConnectionPool {
  private pools = new Map<string, SupabaseClient[]>()
  private maxConnections: number
  private activeConnections = new Map<string, number>()

  constructor(maxConnections: number = 10) {
    this.maxConnections = maxConnections
  }

  /**
   * Get or create a connection pool for a specific configuration
   */
  getConnection(url: string, key: string): SupabaseClient {
    const poolKey = `${url}:${key}`
    
    if (!this.pools.has(poolKey)) {
      this.pools.set(poolKey, [])
      this.activeConnections.set(poolKey, 0)
    }

    const pool = this.pools.get(poolKey)!
    const activeCount = this.activeConnections.get(poolKey)!

    // Reuse existing connection if available
    if (pool.length > 0) {
      return pool.pop()!
    }

    // Create new connection if under limit
    if (activeCount < this.maxConnections) {
      const client = createClient(url, key, {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false
        }
      })
      
      this.activeConnections.set(poolKey, activeCount + 1)
      return client
    }

    // Fallback: create temporary connection
    return createClient(url, key, {
      db: { schema: 'public' },
      auth: { persistSession: false }
    })
  }

  /**
   * Return connection to pool
   */
  releaseConnection(url: string, key: string, client: SupabaseClient): void {
    const poolKey = `${url}:${key}`
    const pool = this.pools.get(poolKey)

    if (pool && pool.length < this.maxConnections) {
      pool.push(client)
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): Record<string, { active: number; pooled: number }> {
    const stats: Record<string, { active: number; pooled: number }> = {}
    
    for (const [key, pool] of this.pools.entries()) {
      stats[key] = {
        active: this.activeConnections.get(key) || 0,
        pooled: pool.length
      }
    }
    
    return stats
  }
}

// Global connection pool
export const connectionPool = new ConnectionPool()

/**
 * Optimized database query builder with caching and performance hints
 */
export class OptimizedQueryBuilder {
  private client: SupabaseClient
  private cacheManager: any

  constructor(client: SupabaseClient, cacheManager?: any) {
    this.client = client
    this.cacheManager = cacheManager
  }

  /**
   * Get games with optimized query and caching
   */
  async getGamesOptimized(options: {
    ids?: string[]
    limit?: number
    offset?: number
    platforms?: string[]
    genres?: string[]
    priceRange?: [number, number]
    scoreRange?: [number, number]
    cacheKey?: string
    cacheTTL?: number
  }): Promise<any[]> {
    const {
      ids,
      limit = 50,
      offset = 0,
      platforms,
      genres,
      priceRange,
      scoreRange,
      cacheKey,
      cacheTTL = 300 // 5 minutes default
    } = options

    // Check cache first
    if (cacheKey && this.cacheManager) {
      const cached = await this.cacheManager.get(cacheKey)
      if (cached) return cached
    }

    // Build optimized query
    let query = this.client
      .from('games')
      .select(`
        id,
        title,
        short_description,
        price_usd,
        critic_score,
        user_score,
        platforms,
        genres,
        release_date,
        image_url,
        created_at
      `)

    // Apply filters
    if (ids && ids.length > 0) {
      query = query.in('id', ids)
    }

    if (platforms && platforms.length > 0) {
      query = query.overlaps('platforms', platforms)
    }

    if (genres && genres.length > 0) {
      query = query.overlaps('genres', genres)
    }

    if (priceRange) {
      query = query.gte('price_usd', priceRange[0]).lte('price_usd', priceRange[1])
    }

    if (scoreRange) {
      query = query.gte('critic_score', scoreRange[0]).lte('critic_score', scoreRange[1])
    }

    // Apply pagination and ordering
    query = query
      .order('critic_score', { ascending: false })
      .order('user_score', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) {
      throw new Error(`Database query failed: ${error.message}`)
    }

    // Cache result
    if (cacheKey && this.cacheManager && data) {
      await this.cacheManager.set(cacheKey, data, cacheTTL)
    }

    return data || []
  }

  /**
   * Get game details with related data in single query
   */
  async getGameWithDetails(gameId: string, cacheKey?: string): Promise<any> {
    // Check cache first
    if (cacheKey && this.cacheManager) {
      const cached = await this.cacheManager.get(cacheKey)
      if (cached) return cached
    }

    const { data, error } = await this.client
      .from('games')
      .select(`
        *,
        store_links (
          store,
          url,
          price_usd
        ),
        price_history (
          store,
          price_usd,
          recorded_at
        )
      `)
      .eq('id', gameId)
      .single()

    if (error) {
      throw new Error(`Failed to get game details: ${error.message}`)
    }

    // Cache result
    if (cacheKey && this.cacheManager && data) {
      await this.cacheManager.set(cacheKey, data, 600) // 10 minutes
    }

    return data
  }

  /**
   * Batch insert/update with conflict resolution
   */
  async upsertGamesBatch(games: Record<string, any>[], batchSize: number = 100): Promise<void> {
    const batches: Record<string, any>[][] = []
    for (let i = 0; i < games.length; i += batchSize) {
      batches.push(games.slice(i, i + batchSize))
    }

    const promises = batches.map(async (batch) => {
      const { error } = await this.client
        .from('games')
        .upsert(batch, {
          onConflict: 'rawg_id',
          ignoreDuplicates: false
        })

      if (error) {
        console.error('Batch upsert error:', error)
        throw error
      }
    })

    await Promise.all(promises)
  }

  /**
   * Execute raw SQL with performance hints
   */
  async executeOptimizedQuery(sql: string, params?: any[]): Promise<any> {
    const { data, error } = await this.client.rpc('execute_sql', {
      query: sql,
      params: params || []
    })

    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`)
    }

    return data
  }
}

/**
 * Response compression and optimization utilities
 */
export class ResponseOptimizer {
  /**
   * Compress response data
   */
  static async compressResponse(data: any): Promise<Uint8Array> {
    const jsonString = JSON.stringify(data)
    const encoder = new TextEncoder()
    const input = encoder.encode(jsonString)
    
    // Use built-in compression
    const compressionStream = new CompressionStream('gzip')
    const writer = compressionStream.writable.getWriter()
    const reader = compressionStream.readable.getReader()
    
    writer.write(input)
    writer.close()
    
    const chunks: Uint8Array[] = []
    let done = false
    
    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) {
        chunks.push(value)
      }
    }
    
    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    
    return result
  }

  /**
   * Create optimized response headers
   */
  static createOptimizedHeaders(options: {
    contentType?: string
    cacheControl?: string
    compressed?: boolean
    etag?: string
  } = {}): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': options.contentType || 'application/json',
      'Cache-Control': options.cacheControl || 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    }

    if (options.compressed) {
      headers['Content-Encoding'] = 'gzip'
      headers['Vary'] = 'Accept-Encoding'
    }

    if (options.etag) {
      headers['ETag'] = options.etag
    }

    return headers
  }

  /**
   * Generate ETag for response caching
   */
  static async generateETag(data: any): Promise<string> {
    const jsonString = JSON.stringify(data)
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(jsonString)
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return `"${hashHex.slice(0, 16)}"`
  }

  /**
   * Create streaming response for large datasets
   */
  static createStreamingResponse(
    dataGenerator: AsyncGenerator<any>,
    headers?: HeadersInit
  ): Response {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        
        try {
          controller.enqueue(encoder.encode('['))
          
          let first = true
          for await (const item of dataGenerator) {
            if (!first) {
              controller.enqueue(encoder.encode(','))
            }
            controller.enqueue(encoder.encode(JSON.stringify(item)))
            first = false
          }
          
          controller.enqueue(encoder.encode(']'))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        ...headers
      }
    })
  }
}

/**
 * Database index optimization suggestions
 */
export const IndexOptimizations = {
  /**
   * Create performance indexes for common queries
   */
  createPerformanceIndexes: `
    -- Composite index for filtered game searches
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_filters 
    ON games (critic_score DESC, user_score DESC, price_usd, release_date DESC) 
    WHERE critic_score IS NOT NULL;

    -- Index for platform-based searches
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_platforms_gin 
    ON games USING gin(platforms);

    -- Index for genre-based searches  
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_genres_gin 
    ON games USING gin(genres);

    -- Index for price range queries
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_price_range 
    ON games (price_usd) 
    WHERE price_usd IS NOT NULL AND price_usd > 0;

    -- Index for full-text search optimization
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_search_optimized 
    ON games USING gin(search_text);

    -- Index for conversation queries
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_messages_lookup 
    ON conversation_messages (conversation_id, created_at DESC);

    -- Index for click tracking analytics
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_logs_analytics 
    ON click_logs (game_id, store, created_at DESC);

    -- Index for store links lookup
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_links_lookup 
    ON store_links (game_id, store);
  `,

  /**
   * Query optimization hints
   */
  queryHints: {
    gameSearch: `
      -- Use LIMIT to prevent large result sets
      -- Use specific column selection instead of SELECT *
      -- Use array operators for platform/genre filtering
      -- Consider using CTEs for complex filters
    `,
    
    vectorSearch: `
      -- Combine vector similarity with SQL filters for better performance
      -- Use appropriate similarity thresholds to limit results
      -- Consider pre-filtering before vector search for better performance
    `,
    
    aggregations: `
      -- Use materialized views for expensive aggregations
      -- Consider using window functions for ranking queries
      -- Use partial indexes for filtered aggregations
    `
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>()

  /**
   * Record query execution time
   */
  recordQueryTime(queryName: string, timeMs: number): void {
    if (!this.metrics.has(queryName)) {
      this.metrics.set(queryName, [])
    }
    
    const times = this.metrics.get(queryName)!
    times.push(timeMs)
    
    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift()
    }
  }

  /**
   * Get performance statistics
   */
  getStats(queryName: string): {
    count: number
    avg: number
    min: number
    max: number
    p95: number
  } | null {
    const times = this.metrics.get(queryName)
    if (!times || times.length === 0) return null

    const sorted = [...times].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((a, b) => a + b, 0)
    const avg = sum / count
    const min = sorted[0]
    const max = sorted[count - 1]
    const p95Index = Math.floor(count * 0.95)
    const p95 = sorted[p95Index]

    return { count, avg, min, max, p95 }
  }

  /**
   * Get all performance metrics
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {}
    
    for (const queryName of this.metrics.keys()) {
      stats[queryName] = this.getStats(queryName)
    }
    
    return stats
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics.clear()
  }
}

// Global performance monitor
export const performanceMonitor = new PerformanceMonitor()