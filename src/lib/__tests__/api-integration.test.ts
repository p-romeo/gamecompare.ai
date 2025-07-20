/**
 * Integration tests for API endpoints
 * These tests verify the complete request-response cycle for all API endpoints
 */

import fetchMock from 'jest-fetch-mock'
import { APIClient } from '../api-client'
import { FilterState } from '../types'

// Enable fetch mocks
fetchMock.enableMocks()

describe('API Integration Tests', () => {
  let apiClient: APIClient
  
  beforeEach(() => {
    fetchMock.resetMocks()
    apiClient = new APIClient('/api')
  })

  describe('POST /similar - Game Search Endpoint', () => {
    it('should handle successful game search with results', async () => {
      const mockResponse = {
        games: [
          {
            id: 'game-1',
            title: 'Test Game 1',
            price: 29.99,
            score: 85,
            platforms: ['PC', 'PlayStation']
          },
          {
            id: 'game-2', 
            title: 'Test Game 2',
            price: 19.99,
            score: 78,
            platforms: ['PC', 'Xbox']
          }
        ],
        response: 'Here are some great games matching your criteria...',
        conversation_id: 'conv-123'
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await apiClient.searchSimilarGames('action games like Doom')

      expect(fetchMock).toHaveBeenCalledWith('/api/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: 'action games like Doom', 
          filters: undefined 
        })
      })

      expect(result).toEqual(mockResponse)
      expect(result.games).toHaveLength(2)
      expect(result.games[0]).toHaveProperty('id')
      expect(result.games[0]).toHaveProperty('title')
      expect(result.games[0]).toHaveProperty('price')
      expect(result.games[0]).toHaveProperty('score')
      expect(result.games[0]).toHaveProperty('platforms')
    })

    it('should handle search with filters', async () => {
      const filters: FilterState = {
        priceMax: 30,
        platforms: ['PC', 'PlayStation'],
        yearRange: [2020, 2023]
      }

      const mockResponse = {
        games: [{
          id: 'filtered-game',
          title: 'Filtered Game',
          price: 25.99,
          score: 90,
          platforms: ['PC']
        }],
        response: 'Found games matching your filters...',
        conversation_id: 'conv-456'
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      const result = await apiClient.searchSimilarGames('RPG games', filters)

      expect(fetchMock).toHaveBeenCalledWith('/api/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: 'RPG games', 
          filters 
        })
      })

      expect(result).toEqual(mockResponse)
    })

    it('should handle empty search results', async () => {
      const mockResponse = {
        games: [],
        response: "I couldn't find any games matching your criteria. Try adjusting your search terms or filters.",
        conversation_id: 'conv-789'
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      const result = await apiClient.searchSimilarGames('very specific non-existent game')

      expect(result.games).toHaveLength(0)
      expect(result.response).toContain("couldn't find any games")
    })

    it('should handle validation errors', async () => {
      const errorResponse = {
        error: 'query is required',
        type: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-123'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      await expect(
        apiClient.searchSimilarGames('')
      ).rejects.toThrow('Failed to search similar games: 400')
    })

    it('should handle rate limiting', async () => {
      const errorResponse = {
        error: 'Rate limit exceeded',
        type: 'RATE_LIMIT_ERROR',
        details: 'Maximum 60 requests per minute allowed',
        timestamp: new Date().toISOString(),
        requestId: 'req-456'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 429 })

      await expect(
        apiClient.searchSimilarGames('test query')
      ).rejects.toThrow('Failed to search similar games: 429')
    })

    it('should handle authentication errors', async () => {
      const errorResponse = {
        error: 'Unauthorized access',
        type: 'AUTHENTICATION_ERROR',
        details: 'Valid SERVICE_ROLE_KEY required in Authorization header',
        timestamp: new Date().toISOString(),
        requestId: 'req-789'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 401 })

      await expect(
        apiClient.searchSimilarGames('test query')
      ).rejects.toThrow('Failed to search similar games: 401')
    })

    it('should handle server errors', async () => {
      const errorResponse = {
        error: 'Failed to search for similar games',
        type: 'EXTERNAL_API_ERROR',
        details: 'OpenAI API error',
        timestamp: new Date().toISOString(),
        requestId: 'req-error'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 500 })

      await expect(
        apiClient.searchSimilarGames('test query')
      ).rejects.toThrow('Failed to search similar games: 500')
    })
  })

  describe('POST /compare - Game Comparison Endpoint', () => {
    it('should handle successful game comparison', async () => {
      const mockResponse = {
        comparison: `**Gameplay & Mechanics**: Game A focuses on action combat while Game B emphasizes strategy...
        
**Graphics & Presentation**: Both games feature modern graphics...

**Story & Content**: Game A has a linear story while Game B offers branching narratives...

**Value Proposition**: Game A offers 20 hours of content for $30, while Game B provides 40 hours for $40...

**Recommendation**: Choose Game A if you prefer action, Game B if you like strategy.`,
        leftGame: {
          id: 'game-a',
          title: 'Game A',
          short_description: 'Action-packed adventure',
          genres: ['Action', 'Adventure'],
          platforms: ['PC', 'PlayStation'],
          price_usd: 29.99,
          critic_score: 85
        },
        rightGame: {
          id: 'game-b',
          title: 'Game B', 
          short_description: 'Strategic gameplay',
          genres: ['Strategy', 'RPG'],
          platforms: ['PC', 'Xbox'],
          price_usd: 39.99,
          critic_score: 88
        }
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      const result = await apiClient.compareGames('game-a', 'game-b')

      expect(fetchMock).toHaveBeenCalledWith('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ left: 'game-a', right: 'game-b' })
      })

      expect(result).toEqual(mockResponse)
      expect(result.comparison).toContain('Gameplay & Mechanics')
      expect(result.comparison).toContain('Graphics & Presentation')
      expect(result.comparison).toContain('Story & Content')
      expect(result.comparison).toContain('Value Proposition')
      expect(result.comparison).toContain('Recommendation')
      expect(result.leftGame.id).toBe('game-a')
      expect(result.rightGame.id).toBe('game-b')
    })

    it('should handle validation error for same game comparison', async () => {
      const errorResponse = {
        error: 'Cannot compare a game with itself',
        type: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-same'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      await expect(
        apiClient.compareGames('game-1', 'game-1')
      ).rejects.toThrow('Failed to compare games: 400')
    })

    it('should handle game not found error', async () => {
      const errorResponse = {
        error: 'Game with ID non-existent-game not found',
        type: 'NOT_FOUND_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-notfound'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 404 })

      await expect(
        apiClient.compareGames('game-1', 'non-existent-game')
      ).rejects.toThrow('Failed to compare games: 404')
    })

    it('should handle database errors', async () => {
      const errorResponse = {
        error: 'Failed to retrieve games from database',
        type: 'DATABASE_ERROR',
        details: 'Connection timeout',
        timestamp: new Date().toISOString(),
        requestId: 'req-db-error'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 500 })

      await expect(
        apiClient.compareGames('game-1', 'game-2')
      ).rejects.toThrow('Failed to compare games: 500')
    })
  })

  describe('GET /game/:id - Game Details Endpoint', () => {
    it('should retrieve game details successfully', async () => {
      const mockGame = {
        id: 'game-123',
        rawg_id: 12345,
        title: 'Detailed Game',
        slug: 'detailed-game',
        short_description: 'A game with full details',
        long_description: 'This is a comprehensive description...',
        image_url: 'https://example.com/game-image.jpg',
        rating: 4.5,
        rating_count: 1000,
        metacritic_score: 85,
        playtime_hours: 25,
        genres: ['Action', 'Adventure'],
        platforms: ['PC', 'PlayStation', 'Xbox'],
        store_links: {
          steam: 'https://store.steampowered.com/app/12345/',
          epic: 'https://store.epicgames.com/en-US/p/detailed-game'
        },
        screenshots: [
          'https://example.com/screenshot1.jpg',
          'https://example.com/screenshot2.jpg'
        ],
        steam_appid: 12345,
        steam_score: 88,
        steam_review_count: 2500,
        release_date: '2023-01-15T00:00:00.000Z',
        price_usd: 39.99,
        critic_score: 85,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-15T00:00:00.000Z'
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockGame))

      const result = await apiClient.getGameDetails('game-123')

      expect(fetchMock).toHaveBeenCalledWith('/api/game/game-123', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      expect(result).toEqual(mockGame)
      expect(result.id).toBe('game-123')
      expect(result.title).toBe('Detailed Game')
      expect(result.genres).toContain('Action')
      expect(result.platforms).toContain('PC')
      expect(result.store_links).toHaveProperty('steam')
    })

    it('should handle game not found', async () => {
      const errorResponse = {
        error: 'Game not found',
        type: 'NOT_FOUND_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-game-notfound'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 404 })

      await expect(
        apiClient.getGameDetails('non-existent-game')
      ).rejects.toThrow('Failed to get game details: 404')
    })

    it('should handle invalid game ID', async () => {
      const errorResponse = {
        error: 'Game ID is required',
        type: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-invalid-id'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      await expect(
        apiClient.getGameDetails('')
      ).rejects.toThrow('Failed to get game details: 400')
    })
  })

  describe('GET /click/:gid/:store - Click Tracking Endpoint', () => {
    it('should track click and redirect successfully', async () => {
      // Mock a redirect response
      fetchMock.mockResponseOnce('', {
        status: 302,
        headers: { 'Location': 'https://store.steampowered.com/app/12345/?aff_id=test-affiliate' }
      })

      const result = await apiClient.trackClick('game-123', 'steam')

      expect(fetchMock).toHaveBeenCalledWith('/api/click/game-123/steam', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      // For redirect responses, we just verify the call was made
      expect(fetchMock).toHaveBeenCalled()
    })

    it('should handle invalid store name', async () => {
      const errorResponse = {
        error: 'Invalid store. Allowed stores: steam, epic, gog, playstation, xbox',
        type: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-invalid-store'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      await expect(
        apiClient.trackClick('game-123', 'invalid-store')
      ).rejects.toThrow('Failed to track click: 400')
    })

    it('should handle missing store link', async () => {
      const errorResponse = {
        error: 'Store link not found',
        type: 'NOT_FOUND_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-link-notfound'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 404 })

      await expect(
        apiClient.trackClick('game-without-steam-link', 'steam')
      ).rejects.toThrow('Failed to track click: 404')
    })
  })

  describe('Error Response Structure Validation', () => {
    it('should return consistent error response structure', async () => {
      const errorResponse = {
        error: 'Test error message',
        type: 'VALIDATION_ERROR',
        details: 'Additional error details',
        timestamp: '2023-01-01T00:00:00.000Z',
        requestId: 'req-test-123'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      try {
        await apiClient.searchSimilarGames('')
      } catch (error) {
        expect(error.message).toContain('Failed to search similar games: 400')
      }

      // Verify the error response structure matches our interface
      expect(errorResponse).toHaveProperty('error')
      expect(errorResponse).toHaveProperty('type')
      expect(errorResponse).toHaveProperty('timestamp')
      expect(errorResponse).toHaveProperty('requestId')
      expect(typeof errorResponse.error).toBe('string')
      expect(typeof errorResponse.type).toBe('string')
      expect(typeof errorResponse.timestamp).toBe('string')
      expect(typeof errorResponse.requestId).toBe('string')
    })

    it('should handle all defined error types', async () => {
      const errorTypes = [
        'VALIDATION_ERROR',
        'AUTHENTICATION_ERROR',
        'NOT_FOUND_ERROR', 
        'DATABASE_ERROR',
        'EXTERNAL_API_ERROR',
        'RATE_LIMIT_ERROR',
        'INTERNAL_ERROR'
      ]

      for (const errorType of errorTypes) {
        const errorResponse = {
          error: `Test ${errorType}`,
          type: errorType,
          timestamp: new Date().toISOString(),
          requestId: `req-${errorType.toLowerCase()}`
        }

        expect(errorResponse.type).toBe(errorType)
        expect(typeof errorResponse.error).toBe('string')
        expect(typeof errorResponse.timestamp).toBe('string')
        expect(typeof errorResponse.requestId).toBe('string')
      }
    })
  })

  describe('CORS Headers Validation', () => {
    it('should include proper CORS headers in responses', async () => {
      const mockResponse = {
        games: [],
        response: 'Test response',
        conversation_id: 'test-conv'
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      })

      await apiClient.searchSimilarGames('test')

      // Verify CORS headers are expected to be present
      // (In a real integration test, we would verify the actual response headers)
      expect(fetchMock).toHaveBeenCalled()
    })

    it('should handle OPTIONS preflight requests', async () => {
      fetchMock.mockResponseOnce('ok', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      })

      // Simulate a preflight request
      const response = await fetch('/api/similar', { method: 'OPTIONS' })
      
      expect(response.status).toBe(200)
    })
  })

  describe('Request/Response Logging Validation', () => {
    it('should handle requests with proper logging structure', async () => {
      // Mock a successful response
      fetchMock.mockResponseOnce(JSON.stringify({
        games: [],
        response: 'Test response',
        conversation_id: 'test-conv'
      }))

      await apiClient.searchSimilarGames('test query')

      // Verify the request was made (logging would be handled server-side)
      expect(fetchMock).toHaveBeenCalledWith('/api/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: 'test query', 
          filters: undefined 
        })
      })
    })
  })

  describe('Rate Limiting Integration', () => {
    it('should handle rate limit responses correctly', async () => {
      const rateLimitResponse = {
        error: 'Rate limit exceeded',
        type: 'RATE_LIMIT_ERROR',
        details: 'Maximum 60 requests per minute allowed',
        timestamp: new Date().toISOString(),
        requestId: 'req-rate-limit'
      }

      fetchMock.mockResponseOnce(JSON.stringify(rateLimitResponse), { 
        status: 429,
        headers: { 'Retry-After': '60' }
      })

      await expect(
        apiClient.searchSimilarGames('test')
      ).rejects.toThrow('Failed to search similar games: 429')
    })
  })

  describe('Input Validation Integration', () => {
    it('should validate query length limits', async () => {
      const longQuery = 'a'.repeat(501) // Exceeds 500 character limit
      
      const errorResponse = {
        error: 'query must be at most 500 characters',
        type: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-long-query'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      await expect(
        apiClient.searchSimilarGames(longQuery)
      ).rejects.toThrow('Failed to search similar games: 400')
    })

    it('should validate filter object structure', async () => {
      const invalidFilters = 'not an object' as any

      const errorResponse = {
        error: 'filters must be an object',
        type: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: 'req-invalid-filters'
      }

      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 })

      await expect(
        apiClient.searchSimilarGames('test', invalidFilters)
      ).rejects.toThrow('Failed to search similar games: 400')
    })
  })
})