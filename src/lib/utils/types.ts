/**
 * Type Utilities and Common Types
 * Shared type definitions and type utility functions
 */

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Make all properties required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P]
}

/**
 * Extract keys of a certain type
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never
}[keyof T]

/**
 * Omit properties by type
 */
export type OmitByType<T, U> = Omit<T, KeysOfType<T, U>>

/**
 * Pick properties by type
 */
export type PickByType<T, U> = Pick<T, KeysOfType<T, U>>

/**
 * Make specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Make specific properties required
 */
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * Common API response wrapper
 */
export interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
  timestamp: string
  requestId?: string
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta
}

/**
 * Filter state for game searches
 */
export interface FilterState {
  priceMax?: number
  platforms?: string[]
  yearRange?: [number, number]
  genres?: string[]
  minRating?: number
}

/**
 * Game summary for search results
 */
export interface GameSummary {
  id: string
  title: string
  short_description?: string
  genres: string[]
  platforms: string[]
  price_usd?: number
  critic_score?: number
  release_date?: string
  image_url?: string
}

/**
 * Full game details
 */
export interface Game extends GameSummary {
  rawg_id?: number
  steam_appid?: number
  long_description?: string
  developer?: string
  publisher?: string
  tags?: string[]
  screenshots?: string[]
  system_requirements?: Record<string, any>
  store_links?: StoreLink[]
  updated_at: string
  created_at: string
}

/**
 * Store link information
 */
export interface StoreLink {
  store: string
  url: string
  price?: number
  currency?: string
}

/**
 * User preferences
 */
export interface UserPreferences {
  favoriteGenres: string[]
  preferredPlatforms: string[]
  priceRange: [number, number]
  contentRating: string
  language: string
}

/**
 * Chat conversation
 */
export interface Conversation {
  id: string
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  games?: GameSummary[]
  timestamp: string
}

/**
 * Search context for AI
 */
export interface SearchContext {
  query: string
  filters?: FilterState
  previousMessages?: ChatMessage[]
  userPreferences?: UserPreferences
}

/**
 * AI response with games
 */
export interface ChatResponse {
  response: string
  games: GameSummary[]
  conversation_id: string
  confidence?: number
}

/**
 * Game comparison result
 */
export interface ComparisonResponse {
  comparison: string
  leftGame: Game
  rightGame: Game
  categories: ComparisonCategory[]
}

/**
 * Comparison category
 */
export interface ComparisonCategory {
  name: string
  leftScore: number
  rightScore: number
  explanation: string
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  responseTime: number
  dbQueryTime?: number
  aiProcessingTime?: number
  cacheHitRate?: number
  memoryUsage?: number
}

/**
 * Error details
 */
export interface ErrorDetails {
  code: string
  message: string
  field?: string
  details?: Record<string, any>
  timestamp: string
  requestId?: string
}

/**
 * Batch processing result
 */
export interface BatchResult<T> {
  successful: T[]
  failed: Array<{ item: any; error: string }>
  totalProcessed: number
  duration: number
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  hits: number
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
}

/**
 * Monitoring data
 */
export interface MonitoringData {
  timestamp: string
  metrics: Record<string, number>
  alerts?: Alert[]
}

/**
 * Alert information
 */
export interface Alert {
  id: string
  type: 'warning' | 'error' | 'info'
  message: string
  timestamp: string
  resolved?: boolean
}

/**
 * Configuration options
 */
export interface ConfigOptions {
  apiKeys: {
    openai: string
    pinecone: string
    supabase: {
      url: string
      anonKey: string
      serviceKey: string
    }
  }
  cache: {
    ttl: number
    maxSize: number
  }
  rateLimit: {
    windowMs: number
    maxRequests: number
  }
  performance: {
    slowQueryThreshold: number
    slowRequestThreshold: number
  }
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test'
  PORT?: string
  DATABASE_URL?: string
  REDIS_URL?: string
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
}

/**
 * Type guards
 */
export function isGame(obj: any): obj is Game {
  return obj && 
         typeof obj.id === 'string' && 
         typeof obj.title === 'string' &&
         Array.isArray(obj.genres) &&
         Array.isArray(obj.platforms)
}

export function isGameSummary(obj: any): obj is GameSummary {
  return obj && 
         typeof obj.id === 'string' && 
         typeof obj.title === 'string' &&
         Array.isArray(obj.genres) &&
         Array.isArray(obj.platforms)
}

export function isFilterState(obj: any): obj is FilterState {
  if (!obj || typeof obj !== 'object') return true // Empty filters are valid
  
  const validKeys = ['priceMax', 'platforms', 'yearRange', 'genres', 'minRating']
  const objKeys = Object.keys(obj)
  
  // Check if all keys are valid
  if (!objKeys.every(key => validKeys.includes(key))) {
    return false
  }
  
  // Validate individual fields
  if (obj.priceMax !== undefined && (typeof obj.priceMax !== 'number' || obj.priceMax < 0)) {
    return false
  }
  
  if (obj.platforms !== undefined && !Array.isArray(obj.platforms)) {
    return false
  }
  
  if (obj.yearRange !== undefined && (!Array.isArray(obj.yearRange) || obj.yearRange.length !== 2)) {
    return false
  }
  
  if (obj.genres !== undefined && !Array.isArray(obj.genres)) {
    return false
  }
  
  if (obj.minRating !== undefined && (typeof obj.minRating !== 'number' || obj.minRating < 0 || obj.minRating > 100)) {
    return false
  }
  
  return true
}

export function isApiResponse<T>(obj: any): obj is ApiResponse<T> {
  return obj && 
         typeof obj.timestamp === 'string' &&
         (obj.data !== undefined || obj.error !== undefined)
}

export function isChatResponse(obj: any): obj is ChatResponse {
  return obj && 
         typeof obj.response === 'string' &&
         Array.isArray(obj.games) &&
         typeof obj.conversation_id === 'string'
}

/**
 * Utility type for function parameters
 */
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never

/**
 * Utility type for function return type
 */
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any

/**
 * Utility type for promise resolution type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T

/**
 * Utility type for array element type
 */
export type ArrayElement<T> = T extends (infer U)[] ? U : never

/**
 * Utility type for object values
 */
export type ValueOf<T> = T[keyof T]

/**
 * Utility type for creating a union from object keys
 */
export type KeysAsUnion<T> = keyof T

/**
 * Utility type for creating a union from object values
 */
export type ValuesAsUnion<T> = T[keyof T]

/**
 * Utility type for nullable values
 */
export type Nullable<T> = T | null

/**
 * Utility type for optional values
 */
export type Optional<T> = T | undefined

/**
 * Utility type for creating a type with all properties as strings
 */
export type Stringify<T> = {
  [K in keyof T]: string
}

/**
 * Utility type for creating a type with all properties as numbers
 */
export type Numberify<T> = {
  [K in keyof T]: number
}