/**
 * Validation Utilities
 * Common validation functions and schemas
 */

/**
 * Email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * URL validation
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * UUID validation
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Game ID validation (supports both UUID and numeric IDs)
 */
export function isValidGameId(id: string): boolean {
  return isValidUUID(id) || /^\d+$/.test(id)
}

/**
 * Price validation
 */
export function isValidPrice(price: number): boolean {
  return typeof price === 'number' && price >= 0 && price <= 1000 && !isNaN(price)
}

/**
 * Year validation
 */
export function isValidYear(year: number): boolean {
  const currentYear = new Date().getFullYear()
  return typeof year === 'number' && year >= 1970 && year <= currentYear + 5
}

/**
 * Platform validation
 */
export function isValidPlatform(platform: string): boolean {
  const validPlatforms = [
    'PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X/S', 'Xbox One',
    'Nintendo Switch', 'iOS', 'Android', 'Mac', 'Linux'
  ]
  return validPlatforms.includes(platform)
}

/**
 * Genre validation
 */
export function isValidGenre(genre: string): boolean {
  const validGenres = [
    'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports',
    'Racing', 'Puzzle', 'Platformer', 'Fighting', 'Shooter', 'Horror',
    'Survival', 'Sandbox', 'MMORPG', 'Indie', 'Casual'
  ]
  return validGenres.includes(genre)
}

/**
 * Query validation for search
 */
export function isValidSearchQuery(query: string): boolean {
  return typeof query === 'string' && 
         query.trim().length >= 1 && 
         query.trim().length <= 200 &&
         !/[<>{}[\]\\]/.test(query) // Basic XSS prevention
}

import { FilterState } from '../types'

/**
 * Filter state validation
 */
export function validateFilterState(filters: any): filters is FilterState {
  if (!filters || typeof filters !== 'object') {
    return true // Empty filters are valid
  }

  // Validate priceMax
  if (filters.priceMax !== undefined) {
    if (!isValidPrice(filters.priceMax)) {
      return false
    }
  }

  // Validate platforms
  if (filters.platforms !== undefined) {
    if (!Array.isArray(filters.platforms)) {
      return false
    }
    if (!filters.platforms.every(isValidPlatform)) {
      return false
    }
  }

  // Validate yearRange
  if (filters.yearRange !== undefined) {
    if (!Array.isArray(filters.yearRange) || filters.yearRange.length !== 2) {
      return false
    }
    const [startYear, endYear] = filters.yearRange
    if (!isValidYear(startYear) || !isValidYear(endYear) || startYear > endYear) {
      return false
    }
  }

  return true
}

/**
 * Game data validation
 */
export interface GameValidationResult {
  isValid: boolean
  errors: string[]
}

export function validateGameData(game: any): GameValidationResult {
  const errors: string[] = []

  // Required fields
  if (!game.id || !isValidGameId(game.id)) {
    errors.push('Invalid or missing game ID')
  }

  if (!game.title || typeof game.title !== 'string' || game.title.trim().length === 0) {
    errors.push('Invalid or missing game title')
  }

  // Optional but validated fields
  if (game.price_usd !== null && game.price_usd !== undefined && !isValidPrice(game.price_usd)) {
    errors.push('Invalid price')
  }

  if (game.release_date && !isValidDate(game.release_date)) {
    errors.push('Invalid release date')
  }

  if (game.genres && (!Array.isArray(game.genres) || !game.genres.every(isValidGenre))) {
    errors.push('Invalid genres')
  }

  if (game.platforms && (!Array.isArray(game.platforms) || !game.platforms.every(isValidPlatform))) {
    errors.push('Invalid platforms')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Date validation
 */
export function isValidDate(date: string): boolean {
  const parsedDate = new Date(date)
  return !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 1970
}

/**
 * Sanitize and validate user input
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    return ''
  }

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>{}[\]\\]/g, '') // Basic XSS prevention
    .replace(/\s+/g, ' ') // Normalize whitespace
}

/**
 * Validate API request body
 */
export function validateApiRequest(body: any, requiredFields: string[]): {
  isValid: boolean
  errors: string[]
  sanitized: any
} {
  const errors: string[] = []
  const sanitized: any = {}

  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: ['Request body must be an object'],
      sanitized: {}
    }
  }

  // Check required fields
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      errors.push(`Missing required field: ${field}`)
    } else {
      sanitized[field] = body[field]
    }
  }

  // Sanitize string fields
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value)
    } else {
      sanitized[key] = value
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  }
}

/**
 * Rate limiting validation
 */
export function validateRateLimit(
  requests: number,
  windowMs: number,
  limit: number
): { allowed: boolean; resetTime: number } {
  const now = Date.now()
  const resetTime = now + windowMs

  return {
    allowed: requests < limit,
    resetTime
  }
}

/**
 * Environment variable validation
 */
export function validateEnvironmentConfig(config: Record<string, string | undefined>): {
  isValid: boolean
  missing: string[]
} {
  const missing: string[] = []

  for (const [key, value] of Object.entries(config)) {
    if (!value || value.trim().length === 0) {
      missing.push(key)
    }
  }

  return {
    isValid: missing.length === 0,
    missing
  }
}