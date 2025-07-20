import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  RateLimiter,
  withRetry,
  validateRequired,
  sanitizeString,
  sanitizeNumber,
  sanitizeDate,
  sanitizeArray,
  IngestionError,
  handleApiError
} from '../utils/api_helpers.ts'

Deno.test('RateLimiter - should allow requests within rate limit', async () => {
  const limiter = new RateLimiter({ requestsPerSecond: 10, burstLimit: 5 })
  
  const start = Date.now()
  await limiter.waitForToken()
  await limiter.waitForToken()
  const duration = Date.now() - start
  
  // Should be fast for first few requests
  assertEquals(duration < 100, true)
})

Deno.test('withRetry - should succeed on first attempt', async () => {
  let attempts = 0
  const result = await withRetry(async () => {
    attempts++
    return 'success'
  })
  
  assertEquals(result, 'success')
  assertEquals(attempts, 1)
})

Deno.test('withRetry - should retry on failure', async () => {
  let attempts = 0
  const result = await withRetry(async () => {
    attempts++
    if (attempts < 3) {
      throw new Error('Temporary failure')
    }
    return 'success'
  }, { maxAttempts: 3, baseDelay: 10 })
  
  assertEquals(result, 'success')
  assertEquals(attempts, 3)
})

Deno.test('withRetry - should throw after max attempts', async () => {
  let attempts = 0
  await assertRejects(
    async () => {
      await withRetry(async () => {
        attempts++
        throw new Error('Persistent failure')
      }, { maxAttempts: 2, baseDelay: 10 })
    },
    Error,
    'Persistent failure'
  )
  
  assertEquals(attempts, 2)
})

Deno.test('validateRequired - should validate required fields', () => {
  interface TestData {
    id: number
    name: string
    optional?: string
  }
  
  const validData = { id: 1, name: 'test' }
  const invalidData = { id: 1 }
  
  assertEquals(validateRequired<TestData>(validData, ['id', 'name']), true)
  assertEquals(validateRequired<TestData>(invalidData, ['id', 'name']), false)
  assertEquals(validateRequired<TestData>(null, ['id', 'name']), false)
})

Deno.test('sanitizeString - should sanitize string values', () => {
  assertEquals(sanitizeString('  hello  '), 'hello')
  assertEquals(sanitizeString(''), null)
  assertEquals(sanitizeString('   '), null)
  assertEquals(sanitizeString(123), null)
  assertEquals(sanitizeString(null), null)
  assertEquals(sanitizeString(undefined), null)
})

Deno.test('sanitizeNumber - should sanitize number values', () => {
  assertEquals(sanitizeNumber(123), 123)
  assertEquals(sanitizeNumber('456'), 456)
  assertEquals(sanitizeNumber('12.34'), 12.34)
  assertEquals(sanitizeNumber('invalid'), null)
  assertEquals(sanitizeNumber(null), null)
  assertEquals(sanitizeNumber(undefined), null)
})

Deno.test('sanitizeDate - should sanitize date values', () => {
  const dateStr = '2023-01-01T00:00:00.000Z'
  assertEquals(sanitizeDate(dateStr), dateStr)
  assertEquals(sanitizeDate('2023-01-01'), '2023-01-01T00:00:00.000Z')
  assertEquals(sanitizeDate('invalid-date'), null)
  assertEquals(sanitizeDate(null), null)
  assertEquals(sanitizeDate(undefined), null)
})

Deno.test('sanitizeArray - should sanitize array values', () => {
  assertEquals(sanitizeArray(['a', 'b', 'c']), ['a', 'b', 'c'])
  assertEquals(sanitizeArray(['a', '', '  ', 'b']), ['a', 'b'])
  assertEquals(sanitizeArray(['a', null, undefined, 'b']), ['a', 'b'])
  assertEquals(sanitizeArray('not-array'), [])
  assertEquals(sanitizeArray(null), [])
})

Deno.test('IngestionError - should create proper error', () => {
  const originalError = new Error('Original')
  const ingestionError = new IngestionError('Test error', 'test-source', originalError)
  
  assertEquals(ingestionError.message, 'Test error')
  assertEquals(ingestionError.source, 'test-source')
  assertEquals(ingestionError.originalError, originalError)
  assertEquals(ingestionError.name, 'IngestionError')
})

Deno.test('handleApiError - should wrap errors properly', () => {
  const originalError = new Error('API failed')
  
  try {
    handleApiError(originalError, 'test-api')
  } catch (error) {
    assertEquals(error instanceof IngestionError, true)
    assertEquals(error.message, 'test-api API error: API failed')
    assertEquals(error.source, 'test-api')
    assertEquals(error.originalError, originalError)
  }
})

Deno.test('handleApiError - should pass through IngestionError', () => {
  const ingestionError = new IngestionError('Already wrapped', 'source')
  
  try {
    handleApiError(ingestionError, 'test-api')
  } catch (error) {
    assertEquals(error, ingestionError)
  }
})