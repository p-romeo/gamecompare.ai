/**
 * Consolidated Utility Functions Index
 * Central export point for all utility functions organized by functionality
 */

// API and HTTP utilities
export * from './api'
export * from './http'

// Data processing utilities
export * from './data'
export * from './validation'

// Error handling utilities
export * from './errors'

// Performance and caching utilities
export * from './performance'
export * from './monitoring'

// Type utilities and definitions
export * from './types'

// Re-export commonly used utilities for convenience
export { 
  withRetry, 
  HttpClient, 
  RateLimiter 
} from './api'

export { 
  deepClone, 
  deepMerge, 
  groupBy, 
  uniqueBy, 
  formatBytes, 
  formatDuration 
} from './data'

export { 
  AppError, 
  ValidationError, 
  APIError, 
  handleApiError, 
  validateEnvironmentVariables 
} from './errors'

export { 
  PerformanceTimer, 
  MemoryTracker, 
  profile, 
  profileAsync, 
  performanceMonitor 
} from './performance'

export {
  MonitoringClient,
  globalMonitoring,
  recordMetric,
  recordFunctionMetric,
  getSystemHealth,
  getPerformanceStats,
  createPerformanceTimer,
  createDatabaseMonitor,
  createAPIMonitor,
  ALERT_THRESHOLDS
} from './monitoring'

export { 
  createApiResponse, 
  createErrorResponse, 
  createResponse, 
  HttpStatus, 
  ContentType 
} from './http'

export { 
  isValidEmail, 
  isValidUrl, 
  isValidGameId, 
  validateFilterState, 
  sanitizeInput 
} from './validation'