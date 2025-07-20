/**
 * Redis-based caching utility for GameCompare.ai
 * Provides caching for frequently accessed game data and API responses
 */

interface CacheConfig {
  host: string
  port: number
  password?: string
  db?: number
  keyPrefix?: string
}

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

/**
 * Redis cache client for high-performance data caching
 */
export class RedisCache {
  private config: CacheConfig
  private client: any = null
  private connected: boolean = false

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      host: Deno.env.get('REDIS_HOST') || 'localhost',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD'),
      db: parseInt(Deno.env.get('REDIS_DB') || '0'),
      keyPrefix: 'gamecompare:',
      ...config
    }
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.connected) return

    try {
      // Import Redis client dynamically
      const { connect } = await import('https://deno.land/x/redis@v0.32.3/mod.ts')
      
      this.client = await connect({
        hostname: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db
      })
      
      this.connected = true
      console.log('Redis cache connected successfully')
    } catch (error) {
      console.error('Failed to connect to Redis:', error)
      throw error
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit()
      this.connected = false
    }
  }

  /**
   * Generate cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.config.keyPrefix}${key}`
  }

  /**
   * Set cache entry with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    if (!this.connected) await this.connect()

    const cacheEntry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttlSeconds
    }

    const cacheKey = this.getKey(key)
    await this.client.setex(cacheKey, ttlSeconds, JSON.stringify(cacheEntry))
  }

  /**
   * Get cache entry
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) await this.connect()

    try {
      const cacheKey = this.getKey(key)
      const result = await this.client.get(cacheKey)
      
      if (!result) return null

      const cacheEntry: CacheEntry<T> = JSON.parse(result)
      
      // Check if entry has expired (additional safety check)
      const now = Date.now()
      const age = (now - cacheEntry.timestamp) / 1000
      
      if (age > cacheEntry.ttl) {
        // Entry expired, delete it
        await this.delete(key)
        return null
      }

      return cacheEntry.data
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<void> {
    if (!this.connected) await this.connect()

    const cacheKey = this.getKey(key)
    await this.client.del(cacheKey)
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    if (!this.connected) await this.connect()

    const cacheKey = this.getKey(key)
    const result = await this.client.exists(cacheKey)
    return result === 1
  }

  /**
   * Set multiple cache entries
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    if (!this.connected) await this.connect()

    const pipeline = this.client.pipeline()
    
    for (const entry of entries) {
      const cacheEntry: CacheEntry<T> = {
        data: entry.value,
        timestamp: Date.now(),
        ttl: entry.ttl || 3600
      }
      
      const cacheKey = this.getKey(entry.key)
      pipeline.setex(cacheKey, entry.ttl || 3600, JSON.stringify(cacheEntry))
    }
    
    await pipeline.exec()
  }

  /**
   * Get multiple cache entries
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    if (!this.connected) await this.connect()

    const cacheKeys = keys.map(key => this.getKey(key))
    const results = await this.client.mget(...cacheKeys)
    
    return results.map((result: string | null) => {
      if (!result) return null
      
      try {
        const cacheEntry: CacheEntry<T> = JSON.parse(result)
        
        // Check expiration
        const now = Date.now()
        const age = (now - cacheEntry.timestamp) / 1000
        
        if (age > cacheEntry.ttl) {
          return null
        }
        
        return cacheEntry.data
      } catch (error) {
        console.error('Cache parse error:', error)
        return null
      }
    })
  }

  /**
   * Increment counter
   */
  async incr(key: string, ttl?: number): Promise<number> {
    if (!this.connected) await this.connect()

    const cacheKey = this.getKey(key)
    const result = await this.client.incr(cacheKey)
    
    if (ttl && result === 1) {
      // Set TTL only on first increment
      await this.client.expire(cacheKey, ttl)
    }
    
    return result
  }

  /**
   * Clear all cache entries with prefix
   */
  async clear(): Promise<void> {
    if (!this.connected) await this.connect()

    const pattern = `${this.config.keyPrefix}*`
    const keys = await this.client.keys(pattern)
    
    if (keys.length > 0) {
      await this.client.del(...keys)
    }
  }
}

/**
 * In-memory cache fallback for when Redis is unavailable
 */
export class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>()
  private maxSize: number
  private cleanupInterval: number

  constructor(maxSize: number = 1000, cleanupIntervalMs: number = 60000) {
    this.maxSize = maxSize
    this.cleanupInterval = cleanupIntervalMs
    
    // Start cleanup timer
    setInterval(() => this.cleanup(), this.cleanupInterval)
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, value: T, ttlSeconds: number = 3600): void {
    // Remove oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttlSeconds
    }

    this.cache.set(key, entry)
  }

  /**
   * Get cache entry
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check expiration
    const now = Date.now()
    const age = (now - entry.timestamp) / 1000

    if (age > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Delete cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Check if key exists
   */
  exists(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // Check expiration
    const now = Date.now()
    const age = (now - entry.timestamp) / 1000

    if (age > entry.ttl) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Clear expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    
    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000
      if (age > entry.ttl) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    }
  }
}

/**
 * Unified cache interface that tries Redis first, falls back to memory
 */
export class CacheManager {
  private redisCache: RedisCache
  private memoryCache: MemoryCache
  private useRedis: boolean

  constructor() {
    this.redisCache = new RedisCache()
    this.memoryCache = new MemoryCache()
    this.useRedis = Deno.env.get('REDIS_HOST') !== undefined
  }

  /**
   * Initialize cache connections
   */
  async initialize(): Promise<void> {
    if (this.useRedis) {
      try {
        await this.redisCache.connect()
        console.log('Cache manager initialized with Redis')
      } catch (error) {
        console.warn('Redis unavailable, falling back to memory cache:', error)
        this.useRedis = false
      }
    } else {
      console.log('Cache manager initialized with memory cache only')
    }
  }

  /**
   * Set cache entry
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    if (this.useRedis) {
      try {
        await this.redisCache.set(key, value, ttlSeconds)
        return
      } catch (error) {
        console.error('Redis set failed, using memory cache:', error)
        this.useRedis = false
      }
    }
    
    this.memoryCache.set(key, value, ttlSeconds)
  }

  /**
   * Get cache entry
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis) {
      try {
        const result = await this.redisCache.get<T>(key)
        if (result !== null) return result
      } catch (error) {
        console.error('Redis get failed, using memory cache:', error)
        this.useRedis = false
      }
    }
    
    return this.memoryCache.get<T>(key)
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<void> {
    if (this.useRedis) {
      try {
        await this.redisCache.delete(key)
      } catch (error) {
        console.error('Redis delete failed:', error)
      }
    }
    
    this.memoryCache.delete(key)
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (this.useRedis) {
      try {
        return await this.redisCache.exists(key)
      } catch (error) {
        console.error('Redis exists failed:', error)
        this.useRedis = false
      }
    }
    
    return this.memoryCache.exists(key)
  }

  /**
   * Disconnect from cache
   */
  async disconnect(): Promise<void> {
    if (this.useRedis) {
      await this.redisCache.disconnect()
    }
  }
}

// Cache key generators for consistent naming
export const CacheKeys = {
  game: (gameId: string) => `game:${gameId}`,
  similarGames: (query: string, filters?: any) => {
    const filterHash = filters ? btoa(JSON.stringify(filters)).slice(0, 8) : 'none'
    const queryHash = btoa(query).slice(0, 12)
    return `similar:${queryHash}:${filterHash}`
  },
  gameComparison: (leftId: string, rightId: string) => {
    const sortedIds = [leftId, rightId].sort()
    return `compare:${sortedIds[0]}:${sortedIds[1]}`
  },
  gamesByPlatform: (platform: string) => `games:platform:${platform}`,
  gamesByGenre: (genre: string) => `games:genre:${genre}`,
  topGames: (limit: number = 50) => `games:top:${limit}`,
  priceHistory: (gameId: string) => `price:${gameId}`,
  userSession: (sessionId: string) => `session:${sessionId}`,
  rateLimitCounter: (ip: string) => `ratelimit:${ip}`,
  apiResponse: (endpoint: string, params: string) => `api:${endpoint}:${params}`
}

// Global cache instance
export const cacheManager = new CacheManager()