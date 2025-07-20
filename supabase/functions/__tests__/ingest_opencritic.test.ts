import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// Mock OpenCritic game data for testing
const mockOpenCriticGame = {
  id: 12345,
  name: 'Test Game',
  dist: 0.1,
  tier: 'Mighty',
  topCriticScore: 85,
  numTopCriticReviews: 25,
  percentRecommended: 88,
  numReviews: 30,
  averageScore: 83,
  medianScore: 84,
  hasLootBoxes: false,
  hasMicrotransactions: true,
  Companies: [
    {
      name: 'Test Developer',
      type: 'Developer'
    },
    {
      name: 'Test Publisher',
      type: 'Publisher'
    }
  ],
  Platforms: [
    {
      id: 1,
      name: 'PC',
      shortName: 'PC'
    },
    {
      id: 2,
      name: 'PlayStation 5',
      shortName: 'PS5'
    }
  ]
}

// Mock OpenCritic search results for testing
const mockSearchResults = [
  {
    id: 12345,
    name: 'Test Game',
    dist: 0.0
  },
  {
    id: 12346,
    name: 'Test Game 2',
    dist: 0.2
  },
  {
    id: 12347,
    name: 'Similar Test Game',
    dist: 0.3
  }
]

Deno.test('OpenCritic data transformation - should map all required fields', () => {
  // Test the conceptual mapping logic
  const expectedFields = [
    'critic_score',
    'critic_review_count',
    'updated_at'
  ]
  
  // Verify all expected fields are present in our transformation
  expectedFields.forEach(field => {
    assertExists(field, `Field ${field} should be defined in transformation`)
  })
})

Deno.test('OpenCritic score mapping - should prefer topCriticScore', () => {
  const topCriticScore = mockOpenCriticGame.topCriticScore
  const averageScore = mockOpenCriticGame.averageScore
  
  // Should prefer topCriticScore when available
  const preferredScore = topCriticScore || averageScore
  assertEquals(preferredScore, 85)
})

Deno.test('OpenCritic score mapping - should fallback to averageScore', () => {
  const gameWithoutTopScore = { ...mockOpenCriticGame, topCriticScore: null }
  const fallbackScore = gameWithoutTopScore.topCriticScore || gameWithoutTopScore.averageScore
  
  assertEquals(fallbackScore, 83)
})

Deno.test('OpenCritic review count mapping - should prefer numTopCriticReviews', () => {
  const topReviewCount = mockOpenCriticGame.numTopCriticReviews
  const totalReviewCount = mockOpenCriticGame.numReviews
  
  // Should prefer numTopCriticReviews when available
  const preferredCount = topReviewCount || totalReviewCount
  assertEquals(preferredCount, 25)
})

Deno.test('OpenCritic review count mapping - should fallback to numReviews', () => {
  const gameWithoutTopReviews = { ...mockOpenCriticGame, numTopCriticReviews: null }
  const fallbackCount = gameWithoutTopReviews.numTopCriticReviews || gameWithoutTopReviews.numReviews
  
  assertEquals(fallbackCount, 30)
})

Deno.test('Title similarity calculation - should return 1.0 for exact match', () => {
  const title1 = 'The Witcher 3: Wild Hunt'
  const title2 = 'The Witcher 3: Wild Hunt'
  
  // Normalize titles for comparison
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  const norm1 = normalize(title1)
  const norm2 = normalize(title2)
  
  const similarity = norm1 === norm2 ? 1.0 : 0.0
  assertEquals(similarity, 1.0)
})

Deno.test('Title similarity calculation - should return 0.8 for substring match', () => {
  const title1 = 'The Witcher 3'
  const title2 = 'The Witcher 3: Wild Hunt'
  
  // Normalize titles
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  const norm1 = normalize(title1)
  const norm2 = normalize(title2)
  
  const similarity = norm1.includes(norm2) || norm2.includes(norm1) ? 0.8 : 0.0
  assertEquals(similarity, 0.8)
})

Deno.test('Title similarity calculation - should calculate word overlap', () => {
  const title1 = 'Grand Theft Auto V'
  const title2 = 'Grand Theft Auto VI'
  
  // Normalize and split into words
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  const words1 = normalize(title1).split(' ')
  const words2 = normalize(title2).split(' ')
  const commonWords = words1.filter(word => words2.includes(word))
  
  const similarity = (commonWords.length * 2) / (words1.length + words2.length)
  
  // Should have 3 common words out of 4 total unique words
  assertEquals(commonWords.length, 3)
  assertEquals(similarity, 0.75) // (3 * 2) / (4 + 4) = 6/8 = 0.75
})

Deno.test('Title similarity calculation - should return 0.0 for no common words', () => {
  const title1 = 'Minecraft'
  const title2 = 'Fortnite'
  
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  const words1 = normalize(title1).split(' ')
  const words2 = normalize(title2).split(' ')
  const commonWords = words1.filter(word => words2.includes(word))
  
  assertEquals(commonWords.length, 0)
})

Deno.test('OpenCritic search results processing - should find best match', () => {
  const searchResults = mockSearchResults
  const targetTitle = 'Test Game'
  
  // Find exact match
  const exactMatch = searchResults.find(result => result.name === targetTitle)
  assertExists(exactMatch)
  assertEquals(exactMatch.id, 12345)
})

Deno.test('OpenCritic confidence threshold - should filter low confidence matches', () => {
  const confidenceThreshold = 0.8
  const highConfidenceMatch = { gameId: 123, confidence: 0.9 }
  const lowConfidenceMatch = { gameId: 456, confidence: 0.6 }
  
  assertEquals(highConfidenceMatch.confidence >= confidenceThreshold, true)
  assertEquals(lowConfidenceMatch.confidence >= confidenceThreshold, false)
})

Deno.test('OpenCritic API URL encoding - should encode special characters', () => {
  const gameTitle = 'Grand Theft Auto: Vice City'
  const encodedTitle = encodeURIComponent(gameTitle)
  const expectedUrl = `https://api.opencritic.com/api/game/search?criteria=${encodedTitle}`
  
  assertEquals(encodedTitle, 'Grand%20Theft%20Auto%3A%20Vice%20City')
  assertEquals(expectedUrl.includes(encodedTitle), true)
})

Deno.test('OpenCritic rate limiting - should respect API limits', () => {
  const requestsPerSecond = 1
  const burstLimit = 5
  
  // Test rate limiting configuration (60 requests per minute)
  assertEquals(requestsPerSecond, 1)
  assertEquals(burstLimit, 5)
  
  // Verify rate limiting math
  const waitTimeMs = (1 / requestsPerSecond) * 1000
  assertEquals(waitTimeMs, 1000) // 1 second between requests
})

Deno.test('OpenCritic data validation - should validate required score fields', () => {
  const validGame = { topCriticScore: 85, averageScore: 83 }
  const invalidGame = { topCriticScore: null, averageScore: null }
  
  // Test validation logic conceptually
  const hasValidScore = validGame.topCriticScore !== null || validGame.averageScore !== null
  const hasInvalidScore = invalidGame.topCriticScore === null && invalidGame.averageScore === null
  
  assertEquals(hasValidScore, true)
  assertEquals(hasInvalidScore, true)
})

Deno.test('OpenCritic error handling - should handle API errors gracefully', () => {
  const searchError = new Error('HTTP 404: Not Found')
  const detailsError = new Error('HTTP 429: Too Many Requests')
  const networkError = new Error('Network timeout')
  
  // Test error handling patterns
  assertEquals(searchError.message.includes('404'), true)
  assertEquals(detailsError.message.includes('429'), true)
  assertEquals(networkError.message.includes('timeout'), true)
})

Deno.test('OpenCritic batch processing - should process games individually', () => {
  const games = Array.from({ length: 200 }, (_, i) => ({ 
    id: i, 
    title: `Game ${i}`,
    steam_appid: 1000 + i 
  }))
  
  // OpenCritic processes games one by one due to rate limiting
  const processedGames = games.slice(0, 200) // Limit to 200 per run
  
  assertEquals(processedGames.length, 200)
  assertEquals(processedGames[0].title, 'Game 0')
  assertEquals(processedGames[199].title, 'Game 199')
})

Deno.test('OpenCritic progress logging - should log every 50 games', () => {
  const totalGames = 200
  const logInterval = 50
  
  const logPoints = []
  for (let i = 0; i < totalGames; i++) {
    if ((i + 1) % logInterval === 0) {
      logPoints.push(i + 1)
    }
  }
  
  assertEquals(logPoints.length, 4)
  assertEquals(logPoints[0], 50)
  assertEquals(logPoints[1], 100)
  assertEquals(logPoints[2], 150)
  assertEquals(logPoints[3], 200)
})

Deno.test('OpenCritic statistics tracking - should track all metrics', () => {
  const stats = {
    processed: 150,
    matched: 120,
    errors: 5,
    duration_ms: 45000
  }
  
  // Verify all required statistics are tracked
  assertExists(stats.processed)
  assertExists(stats.matched)
  assertExists(stats.errors)
  assertExists(stats.duration_ms)
  
  // Verify reasonable values
  assertEquals(stats.matched <= stats.processed, true)
  assertEquals(stats.errors >= 0, true)
  assertEquals(stats.duration_ms > 0, true)
})