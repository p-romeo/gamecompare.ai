/**
 * Performance Utilities
 * Functions for monitoring, measuring, and optimizing performance
 */

/**
 * Performance timer for measuring execution time
 */
export class PerformanceTimer {
  private startTime: number
  private endTime?: number
  private label: string

  constructor(label: string = 'Operation') {
    this.label = label
    this.startTime = performance.now()
  }

  /**
   * Stop the timer and return duration
   */
  stop(): number {
    this.endTime = performance.now()
    const duration = this.endTime - this.startTime
    console.log(`${this.label} took ${duration.toFixed(2)}ms`)
    return duration
  }

  /**
   * Get current elapsed time without stopping
   */
  elapsed(): number {
    return performance.now() - this.startTime
  }
}

/**
 * Memory usage tracker
 */
export class MemoryTracker {
  private initialMemory: NodeJS.MemoryUsage
  private label: string

  constructor(label: string = 'Memory Usage') {
    this.label = label
    this.initialMemory = process.memoryUsage()
  }

  /**
   * Get current memory delta
   */
  getDelta(): {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
    formatted: {
      rss: string
      heapTotal: string
      heapUsed: string
      external: string
    }
  } {
    const current = process.memoryUsage()
    const delta = {
      rss: current.rss - this.initialMemory.rss,
      heapTotal: current.heapTotal - this.initialMemory.heapTotal,
      heapUsed: current.heapUsed - this.initialMemory.heapUsed,
      external: current.external - this.initialMemory.external
    }

    return {
      ...delta,
      formatted: {
        rss: this.formatBytes(delta.rss),
        heapTotal: this.formatBytes(delta.heapTotal),
        heapUsed: this.formatBytes(delta.heapUsed),
        external: this.formatBytes(delta.external)
      }
    }
  }

  /**
   * Log memory usage
   */
  log(): void {
    const delta = this.getDelta()
    console.log(`${this.label}:`, {
      'RSS Delta': delta.formatted.rss,
      'Heap Used Delta': delta.formatted.heapUsed,
      'Heap Total Delta': delta.formatted.heapTotal,
      'External Delta': delta.formatted.external
    })
  }

  private formatBytes(bytes: number): string {
    const sign = bytes < 0 ? '-' : '+'
    const abs = Math.abs(bytes)
    
    if (abs === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(abs) / Math.log(k))
    
    return `${sign}${parseFloat((abs / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }
}

/**
 * Function execution profiler
 */
export function profile<T extends (...args: any[]) => any>(
  fn: T,
  label?: string
): T {
  return ((...args: Parameters<T>) => {
    const timer = new PerformanceTimer(label || fn.name || 'Anonymous Function')
    const memoryTracker = new MemoryTracker(`${label || fn.name} Memory`)
    
    try {
      const result = fn(...args)
      
      // Handle async functions
      if (result instanceof Promise) {
        return result.finally(() => {
          timer.stop()
          memoryTracker.log()
        })
      }
      
      timer.stop()
      memoryTracker.log()
      return result
    } catch (error) {
      timer.stop()
      memoryTracker.log()
      throw error
    }
  }) as T
}

/**
 * Async function profiler
 */
export function profileAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  label?: string
): T {
  return (async (...args: Parameters<T>) => {
    const timer = new PerformanceTimer(label || fn.name || 'Anonymous Async Function')
    const memoryTracker = new MemoryTracker(`${label || fn.name} Memory`)
    
    try {
      const result = await fn(...args)
      timer.stop()
      memoryTracker.log()
      return result
    } catch (error) {
      timer.stop()
      memoryTracker.log()
      throw error
    }
  }) as T
}

/**
 * Batch processing with performance monitoring
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    batchSize?: number
    concurrency?: number
    onProgress?: (processed: number, total: number, duration: number) => void
    label?: string
  } = {}
): Promise<R[]> {
  const {
    batchSize = 10,
    concurrency = 3,
    onProgress,
    label = 'Batch Processing'
  } = options

  const timer = new PerformanceTimer(label)
  const memoryTracker = new MemoryTracker(`${label} Memory`)
  const results: R[] = []
  let processed = 0

  console.log(`Starting ${label}: ${items.length} items, batch size: ${batchSize}, concurrency: ${concurrency}`)

  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    
    // Process batch with controlled concurrency
    const batchResults = await Promise.all(
      batch.map(async (item, index) => {
        // Simple concurrency control
        if (index >= concurrency) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        try {
          return await processor(item)
        } catch (error) {
          console.error(`Error processing item in batch:`, error)
          throw error
        }
      })
    )
    
    results.push(...batchResults)
    processed += batch.length
    
    if (onProgress) {
      onProgress(processed, items.length, timer.elapsed())
    }
    
    // Log progress
    const progress = ((processed / items.length) * 100).toFixed(1)
    console.log(`${label} progress: ${processed}/${items.length} (${progress}%) - ${timer.elapsed().toFixed(0)}ms elapsed`)
  }

  const totalDuration = timer.stop()
  memoryTracker.log()
  
  console.log(`${label} completed: ${processed} items in ${totalDuration.toFixed(2)}ms (${(totalDuration / processed).toFixed(2)}ms per item)`)
  
  return results
}

/**
 * Cache with performance monitoring
 */
export class PerformanceCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; hits: number }>()
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0
  }
  private maxSize: number
  private ttl: number

  constructor(maxSize: number = 1000, ttl: number = 3600000) { // 1 hour default TTL
    this.maxSize = maxSize
    this.ttl = ttl
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    
    if (!entry) {
      this.stats.misses++
      return undefined
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      this.stats.misses++
      return undefined
    }
    
    entry.hits++
    this.stats.hits++
    return entry.value
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
        this.stats.evictions++
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0
    })
    
    this.stats.sets++
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    hitRate: number
    stats: { hits: number; misses: number; evictions: number }
  } {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: parseFloat(hitRate.toFixed(2)),
      stats: { ...this.stats }
    }
  }

  /**
   * Clear cache and reset stats
   */
  clear(): void {
    this.cache.clear()
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    }
  }
}

/**
 * Request timing middleware
 */
export function createTimingMiddleware(label: string = 'Request') {
  return (req: any, res: any, next: any) => {
    const timer = new PerformanceTimer(`${label} ${req.method} ${req.url}`)
    
    res.on('finish', () => {
      const duration = timer.stop()
      
      // Add timing header
      res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`)
      
      // Log slow requests
      if (duration > 1000) {
        console.warn(`Slow request detected: ${req.method} ${req.url} took ${duration.toFixed(2)}ms`)
      }
    })
    
    next()
  }
}

/**
 * Database query performance tracker
 */
export class QueryPerformanceTracker {
  private queries: Array<{
    query: string
    duration: number
    timestamp: number
    success: boolean
  }> = []

  /**
   * Track a query execution
   */
  async trackQuery<T>(
    query: string,
    executor: () => Promise<T>
  ): Promise<T> {
    const timer = new PerformanceTimer()
    let success = true
    
    try {
      const result = await executor()
      return result
    } catch (error) {
      success = false
      throw error
    } finally {
      const duration = timer.elapsed()
      
      this.queries.push({
        query: query.substring(0, 100), // Truncate long queries
        duration,
        timestamp: Date.now(),
        success
      })
      
      // Keep only last 1000 queries
      if (this.queries.length > 1000) {
        this.queries.shift()
      }
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected (${duration.toFixed(2)}ms):`, query.substring(0, 200))
      }
    }
  }

  /**
   * Get query performance statistics
   */
  getStats(): {
    totalQueries: number
    averageDuration: number
    slowQueries: number
    failedQueries: number
    recentQueries: Array<{ query: string; duration: number; success: boolean }>
  } {
    const totalQueries = this.queries.length
    const averageDuration = totalQueries > 0 
      ? this.queries.reduce((sum, q) => sum + q.duration, 0) / totalQueries 
      : 0
    const slowQueries = this.queries.filter(q => q.duration > 1000).length
    const failedQueries = this.queries.filter(q => !q.success).length
    const recentQueries = this.queries
      .slice(-10)
      .map(({ query, duration, success }) => ({ query, duration, success }))

    return {
      totalQueries,
      averageDuration: parseFloat(averageDuration.toFixed(2)),
      slowQueries,
      failedQueries,
      recentQueries
    }
  }

  /**
   * Clear query history
   */
  clear(): void {
    this.queries = []
  }
}

/**
 * Global performance monitoring
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: Map<string, number[]> = new Map()
  private timers: Map<string, PerformanceTimer> = new Map()

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  /**
   * Start timing an operation
   */
  startTimer(key: string): void {
    this.timers.set(key, new PerformanceTimer(key))
  }

  /**
   * Stop timing an operation and record the metric
   */
  stopTimer(key: string): number {
    const timer = this.timers.get(key)
    if (!timer) {
      console.warn(`No timer found for key: ${key}`)
      return 0
    }

    const duration = timer.stop()
    this.recordMetric(key, duration)
    this.timers.delete(key)
    
    return duration
  }

  /**
   * Record a metric value
   */
  recordMetric(key: string, value: number): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, [])
    }
    
    const values = this.metrics.get(key)!
    values.push(value)
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift()
    }
  }

  /**
   * Get statistics for a metric
   */
  getMetricStats(key: string): {
    count: number
    average: number
    min: number
    max: number
    p95: number
    p99: number
  } | null {
    const values = this.metrics.get(key)
    if (!values || values.length === 0) {
      return null
    }

    const sorted = [...values].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((a, b) => a + b, 0)
    
    return {
      count,
      average: parseFloat((sum / count).toFixed(2)),
      min: sorted[0],
      max: sorted[count - 1],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    }
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, ReturnType<typeof this.getMetricStats>> {
    const result: Record<string, ReturnType<typeof this.getMetricStats>> = {}
    
    for (const key of this.metrics.keys()) {
      result[key] = this.getMetricStats(key)
    }
    
    return result
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear()
    this.timers.clear()
  }
}

// Global performance monitor instance
export const performanceMonitor = PerformanceMonitor.getInstance()