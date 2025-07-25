/**
 * Data Processing and Transformation Utilities
 * Common functions for data manipulation, sanitization, and transformation
 */

/**
 * Data validation helpers
 */
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

/**
 * Sanitize string values
 */
export function sanitizeString(value: any): string | null {
  if (typeof value !== 'string') {
    return null
  }
  
  return value.trim() || null
}

/**
 * Sanitize numeric values
 */
export function sanitizeNumber(value: any): number | null {
  const num = Number(value)
  return isNaN(num) ? null : num
}

/**
 * Sanitize date values
 */
export function sanitizeDate(value: any): string | null {
  if (!value) return null
  
  try {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date.toISOString()
  } catch {
    return null
  }
}

/**
 * Sanitize array values
 */
export function sanitizeArray(value: any): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  
  return value
    .map(item => sanitizeString(item))
    .filter((item): item is string => item !== null)
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T
  }
  
  if (typeof obj === 'object') {
    const cloned = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }
  
  return obj
}

/**
 * Merge objects deeply
 */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  if (!sources.length) return target
  
  const source = sources.shift()
  if (!source) return target

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {} as T[Extract<keyof T, string>]
      }
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key] as T[Extract<keyof T, string>]
    }
  }

  return deepMerge(target, ...sources)
}

/**
 * Remove undefined and null values from object
 */
export function removeEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {}
  
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== null) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        const cleaned = removeEmpty(obj[key])
        if (Object.keys(cleaned).length > 0) {
          result[key] = cleaned as T[Extract<keyof T, string>]
        }
      } else {
        result[key] = obj[key]
      }
    }
  }
  
  return result
}

/**
 * Group array items by a key
 */
export function groupBy<T, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key])
    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

/**
 * Create a unique array based on a key
 */
export function uniqueBy<T, K extends keyof T>(array: T[], key: K): T[] {
  const seen = new Set()
  return array.filter(item => {
    const keyValue = item[key]
    if (seen.has(keyValue)) {
      return false
    }
    seen.add(keyValue)
    return true
  })
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Flatten nested arrays
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  return array.reduce<T[]>((acc, item) => {
    if (Array.isArray(item)) {
      acc.push(...flatten(item))
    } else {
      acc.push(item)
    }
    return acc
  }, [])
}

/**
 * Sort array by multiple criteria
 */
export function sortBy<T>(
  array: T[],
  ...criteria: Array<keyof T | ((item: T) => any)>
): T[] {
  return array.sort((a, b) => {
    for (const criterion of criteria) {
      let aValue: any
      let bValue: any
      
      if (typeof criterion === 'function') {
        aValue = criterion(a)
        bValue = criterion(b)
      } else {
        aValue = a[criterion]
        bValue = b[criterion]
      }
      
      if (aValue < bValue) return -1
      if (aValue > bValue) return 1
    }
    return 0
  })
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      func(...args)
    }
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))
  const sign = bytes < 0 ? '-' : ''
  
  return `${sign}${formatted} ${sizes[i]}`
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Generate a hash from a string
 */
export function hashString(str: string): string {
  let hash = 0
  if (str.length === 0) return hash.toString()
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36)
}

/**
 * Generate a random ID
 */
export function generateId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  
  return result
}

/**
 * Check if two objects are deeply equal
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  
  if (a == null || b == null) return false
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    
    if (keysA.length !== keysB.length) return false
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false
      if (!deepEqual(a[key], b[key])) return false
    }
    
    return true
  }
  
  return false
}