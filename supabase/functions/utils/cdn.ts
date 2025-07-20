/**
 * CDN integration utilities for GameCompare.ai
 * Handles static asset optimization and delivery
 */

interface CDNConfig {
  provider: 'cloudflare' | 'aws' | 'vercel' | 'custom'
  baseUrl: string
  apiKey?: string
  zoneId?: string
  distributionId?: string
}

/**
 * CDN management for static assets and caching
 */
export class CDNManager {
  private config: CDNConfig

  constructor(config?: Partial<CDNConfig>) {
    this.config = {
      provider: (Deno.env.get('CDN_PROVIDER') as any) || 'cloudflare',
      baseUrl: Deno.env.get('CDN_BASE_URL') || '',
      apiKey: Deno.env.get('CDN_API_KEY'),
      zoneId: Deno.env.get('CDN_ZONE_ID'),
      distributionId: Deno.env.get('CDN_DISTRIBUTION_ID'),
      ...config
    }
  }

  /**
   * Generate optimized image URL with transformations
   */
  getOptimizedImageUrl(
    originalUrl: string,
    options: {
      width?: number
      height?: number
      quality?: number
      format?: 'webp' | 'avif' | 'jpeg' | 'png'
      fit?: 'cover' | 'contain' | 'fill'
    } = {}
  ): string {
    if (!this.config.baseUrl) return originalUrl

    const {
      width,
      height,
      quality = 85,
      format = 'webp',
      fit = 'cover'
    } = options

    // Encode the original URL
    const encodedUrl = encodeURIComponent(originalUrl)
    
    // Build transformation parameters
    const params = new URLSearchParams()
    if (width) params.set('w', width.toString())
    if (height) params.set('h', height.toString())
    params.set('q', quality.toString())
    params.set('f', format)
    params.set('fit', fit)
    
    return `${this.config.baseUrl}/image?url=${encodedUrl}&${params.toString()}`
  }

  /**
   * Generate responsive image URLs for different screen sizes
   */
  getResponsiveImageUrls(originalUrl: string): {
    small: string
    medium: string
    large: string
    xlarge: string
  } {
    return {
      small: this.getOptimizedImageUrl(originalUrl, { width: 320, height: 180 }),
      medium: this.getOptimizedImageUrl(originalUrl, { width: 640, height: 360 }),
      large: this.getOptimizedImageUrl(originalUrl, { width: 1280, height: 720 }),
      xlarge: this.getOptimizedImageUrl(originalUrl, { width: 1920, height: 1080 })
    }
  }

  /**
   * Purge cache for specific URLs
   */
  async purgeCache(urls: string[]): Promise<void> {
    if (!this.config.apiKey) {
      console.warn('CDN API key not configured, skipping cache purge')
      return
    }

    try {
      switch (this.config.provider) {
        case 'cloudflare':
          await this.purgeCloudflareCache(urls)
          break
        case 'aws':
          await this.purgeAWSCache(urls)
          break
        default:
          console.warn(`Cache purging not implemented for provider: ${this.config.provider}`)
      }
    } catch (error) {
      console.error('Failed to purge CDN cache:', error)
    }
  }

  /**
   * Purge Cloudflare cache
   */
  private async purgeCloudflareCache(urls: string[]): Promise<void> {
    if (!this.config.zoneId || !this.config.apiKey) {
      throw new Error('Cloudflare zone ID and API key required')
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ files: urls })
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Cloudflare cache purge failed: ${error}`)
    }

    console.log(`Purged ${urls.length} URLs from Cloudflare cache`)
  }

  /**
   * Purge AWS CloudFront cache
   */
  private async purgeAWSCache(urls: string[]): Promise<void> {
    // AWS CloudFront invalidation would require AWS SDK
    // This is a placeholder for the implementation
    console.log(`Would purge ${urls.length} URLs from AWS CloudFront`)
  }

  /**
   * Preload critical assets
   */
  async preloadAssets(urls: string[]): Promise<void> {
    const preloadPromises = urls.map(async (url) => {
      try {
        const response = await fetch(url, { method: 'HEAD' })
        if (response.ok) {
          console.log(`Preloaded asset: ${url}`)
        }
      } catch (error) {
        console.warn(`Failed to preload asset ${url}:`, error)
      }
    })

    await Promise.allSettled(preloadPromises)
  }

  /**
   * Generate cache headers for static assets
   */
  static getCacheHeaders(assetType: 'image' | 'css' | 'js' | 'font' | 'data'): HeadersInit {
    const baseHeaders = {
      'Cache-Control': 'public',
      'X-Content-Type-Options': 'nosniff'
    }

    switch (assetType) {
      case 'image':
        return {
          ...baseHeaders,
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
          'Vary': 'Accept'
        }
      
      case 'css':
      case 'js':
        return {
          ...baseHeaders,
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
        }
      
      case 'font':
        return {
          ...baseHeaders,
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
          'Access-Control-Allow-Origin': '*'
        }
      
      case 'data':
        return {
          ...baseHeaders,
          'Cache-Control': 'public, max-age=300', // 5 minutes
          'ETag': `"${Date.now()}"` // Simple ETag
        }
      
      default:
        return baseHeaders
    }
  }
}

/**
 * Asset optimization utilities
 */
export class AssetOptimizer {
  /**
   * Optimize game images for different contexts
   */
  static optimizeGameImages(game: any): any {
    if (!game.image_url) return game

    const cdnManager = new CDNManager()
    
    return {
      ...game,
      image_url: game.image_url, // Keep original
      optimized_images: {
        thumbnail: cdnManager.getOptimizedImageUrl(game.image_url, {
          width: 150,
          height: 200,
          quality: 80
        }),
        card: cdnManager.getOptimizedImageUrl(game.image_url, {
          width: 300,
          height: 400,
          quality: 85
        }),
        hero: cdnManager.getOptimizedImageUrl(game.image_url, {
          width: 800,
          height: 450,
          quality: 90
        }),
        responsive: cdnManager.getResponsiveImageUrls(game.image_url)
      }
    }
  }

  /**
   * Generate WebP and AVIF variants for better compression
   */
  static generateImageVariants(imageUrl: string): {
    webp: string
    avif: string
    jpeg: string
  } {
    const cdnManager = new CDNManager()
    
    return {
      webp: cdnManager.getOptimizedImageUrl(imageUrl, { format: 'webp' }),
      avif: cdnManager.getOptimizedImageUrl(imageUrl, { format: 'avif' }),
      jpeg: cdnManager.getOptimizedImageUrl(imageUrl, { format: 'jpeg' })
    }
  }

  /**
   * Create picture element HTML for responsive images
   */
  static createPictureElement(
    imageUrl: string,
    alt: string,
    className?: string
  ): string {
    const variants = AssetOptimizer.generateImageVariants(imageUrl)
    const cdnManager = new CDNManager()
    const responsive = cdnManager.getResponsiveImageUrls(imageUrl)

    return `
      <picture class="${className || ''}">
        <source 
          srcset="${variants.avif}" 
          type="image/avif"
          media="(min-width: 1200px)"
        />
        <source 
          srcset="${variants.webp}" 
          type="image/webp"
          media="(min-width: 768px)"
        />
        <source 
          srcset="${responsive.small}" 
          media="(max-width: 767px)"
        />
        <img 
          src="${variants.jpeg}" 
          alt="${alt}"
          loading="lazy"
          decoding="async"
        />
      </picture>
    `.trim()
  }
}

/**
 * Performance optimization for API responses
 */
export class ResponseOptimization {
  /**
   * Optimize game data for API responses
   */
  static optimizeGameData(games: any[]): any[] {
    return games.map(game => ({
      id: game.id,
      title: game.title,
      short_description: game.short_description?.slice(0, 200) + '...',
      price_usd: game.price_usd,
      critic_score: game.critic_score,
      user_score: game.user_score,
      platforms: game.platforms?.slice(0, 5), // Limit platforms
      genres: game.genres?.slice(0, 3), // Limit genres
      release_date: game.release_date,
      image_url: game.image_url,
      optimized_images: AssetOptimizer.optimizeGameImages(game).optimized_images
    }))
  }

  /**
   * Create paginated response with metadata
   */
  static createPaginatedResponse(
    data: any[],
    page: number,
    limit: number,
    total: number
  ): {
    data: any[]
    pagination: {
      page: number
      limit: number
      total: number
      pages: number
      hasNext: boolean
      hasPrev: boolean
    }
  } {
    const pages = Math.ceil(total / limit)
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      }
    }
  }

  /**
   * Compress JSON response
   */
  static async compressJSON(data: any): Promise<{
    compressed: Uint8Array
    originalSize: number
    compressedSize: number
    ratio: number
  }> {
    const jsonString = JSON.stringify(data)
    const encoder = new TextEncoder()
    const originalData = encoder.encode(jsonString)
    
    const compressionStream = new CompressionStream('gzip')
    const writer = compressionStream.writable.getWriter()
    const reader = compressionStream.readable.getReader()
    
    writer.write(originalData)
    writer.close()
    
    const chunks: Uint8Array[] = []
    let done = false
    
    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) chunks.push(value)
    }
    
    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const compressed = new Uint8Array(totalLength)
    let offset = 0
    
    for (const chunk of chunks) {
      compressed.set(chunk, offset)
      offset += chunk.length
    }
    
    const originalSize = originalData.length
    const compressedSize = compressed.length
    const ratio = compressedSize / originalSize
    
    return {
      compressed,
      originalSize,
      compressedSize,
      ratio
    }
  }
}

// Global CDN manager instance
export const cdnManager = new CDNManager()