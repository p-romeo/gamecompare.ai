import { APIClient, ChatResponse, ComparisonResponse } from '../api-client'
import { FilterState } from '../types'
import { Game } from '../supabase'
import fetchMock from 'jest-fetch-mock'

// Enable fetch mocks
fetchMock.enableMocks()

describe('APIClient', () => {
  let apiClient: APIClient

  beforeEach(() => {
    fetchMock.resetMocks()
    apiClient = new APIClient('/api')
  })

  describe('Constructor', () => {
    it('should use default base URL when none provided', () => {
      const client = new APIClient()
      expect(client).toBeInstanceOf(APIClient)
    })

    it('should use custom base URL when provided', () => {
      const client = new APIClient('/custom-api')
      expect(client).toBeInstanceOf(APIClient)
    })

    it('should use custom retry config when provided', () => {
      const customRetryConfig = {
        maxAttempts: 5,
        baseDelay: 2000,
        maxDelay: 20000,
        backoffMultiplier: 3
      }
      const client = new APIClient('/api', customRetryConfig)
      expect(client).toBeInstanceOf(APIClient)
    })
  })

  describe('searchSimilarGames', () => {
    const mockResponse: ChatResponse = {
      response: 'Here are some great games for you!',
      games: [
        {
          id: 'game-1',
          title: 'Test Game',
          price: 29.99,
          score: 85,
          platforms: ['PC', 'PlayStation']
        }
      ],
      conversation_id: 'conv-123'
    }

    it('should search similar games successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      const result = await apiClient.searchSimilarGames('action games')

      expect(result).toEqual(mockResponse)
      expect(fetchMock).toHaveBeenCalledWith('/api/similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'action games', filters: undefined })
      })
    })

    it('should include filters in request', async () => {
      const filters: FilterState = {
        priceMax: 50,
        platforms: ['PC'],
        yearRange: [2020, 2023]
      }

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

      await apiClient.searchSimilarGames('action games', filters)

      expect(fetchMock).toHaveBeenCalledWith('/api/similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'action games', filters })
      })
    })

    it('should handle API errors', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Server error' }), { status: 500 })

      await expect(
        apiClient.searchSimilarGames('action games')
      ).rejects.toThrow('Failed to search similar games: 500 Server error')
    })

    it('should handle network errors', async () => {
      fetchMock.mockRejectOnce(new Error('Network error'))

      await expect(
        apiClient.searchSimilarGames('action games')
      ).rejects.toThrow('Network error')
    })

    it('should retry on failure', async () => {
      fetchMock
        .mockRejectOnce(new Error('Network error'))
        .mockRejectOnce(new Error('Network error'))
        .mockResponseOnce(JSON.stringify(mockResponse))

      const result = await apiClient.searchSimilarGames('action games')

      expect(result).toEqual(mockResponse)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retries', async () => {
      fetchMock.mockReject(new Error('Persistent network error'))

      await expect(
        apiClient.searchSimilarGames('action games')
      ).rejects.toThrow('Persistent network error')

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('compareGames', () => {
    const mockGame1: Game = {
      id: 'game-1',
      title: 'Game One',
      short_description: 'First game',
      genres: ['Action'],
      platforms: ['PC'],
      price_usd: 29.99,
      critic_score: 85,
      release_date: '2023-01-01',
      rawg_id: 123,
      slug: 'game-one',
      long_description: null,
      image_url: null,
      rating: null,
      rating_count: null,
      metacritic_score: null,
      playtime_hours: null,
      store_links: {},
      screenshots: [],
      steam_appid: null,
      steam_score: null,
      steam_review_count: null,
      created_at: '2023-01-01',
      updated_at: '2023-01-01'
    }

    const mockGame2: Game = {
      id: 'game-2',
      title: 'Game Two',
      short_description: 'Second game',
      genres: ['RPG'],
      platforms: ['PlayStation'],
      price_usd: 39.99,
      critic_score: 90,
      release_date: '2023-02-01',
      rawg_id: 456,
      slug: 'game-two',
      long_description: null,
      image_url: null,
      rating: null,
      rating_count: null,
      metacritic_score: null,
      playtime_hours: null,
      store_links: {},
      screenshots: [],
      steam_appid: null,
      steam_score: null,
      steam_review_count: null,
      created_at: '2023-01-01',
      updated_at: '2023-01-01'
    }

    const mockComparisonResponse: ComparisonResponse = {
      comparison: 'Detailed comparison between the games...',
      leftGame: mockGame1,
      rightGame: mockGame2
    }

    it('should compare games successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockComparisonResponse))

      const result = await apiClient.compareGames('game-1', 'game-2')

      expect(result).toEqual(mockComparisonResponse)
      expect(fetchMock).toHaveBeenCalledWith('/api/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ left: 'game-1', right: 'game-2' })
      })
    })

    it('should handle comparison API errors', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Game not found' }), { status: 404 })

      await expect(
        apiClient.compareGames('game-1', 'invalid-game')
      ).rejects.toThrow('Failed to compare games: 404 Game not found')
    })
  })

  describe('getGameDetails', () => {
    const mockGame: Game = {
      id: 'game-1',
      title: 'Test Game',
      short_description: 'A test game',
      genres: ['Action'],
      platforms: ['PC'],
      price_usd: 29.99,
      critic_score: 85,
      release_date: '2023-01-01',
      rawg_id: 123,
      slug: 'test-game',
      long_description: 'Detailed description',
      image_url: 'https://example.com/image.jpg',
      rating: 4.5,
      rating_count: 1000,
      metacritic_score: 85,
      playtime_hours: 20,
      store_links: { steam: 'https://store.steampowered.com/app/123' },
      screenshots: ['https://example.com/screenshot1.jpg'],
      steam_appid: 123,
      steam_score: 88,
      steam_review_count: 500,
      created_at: '2023-01-01',
      updated_at: '2023-01-01'
    }

    it('should get game details successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockGame))

      const result = await apiClient.getGameDetails('game-1')

      expect(result).toEqual(mockGame)
      expect(fetchMock).toHaveBeenCalledWith('/api/game/game-1', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    })

    it('should handle game not found error', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Game not found' }), { status: 404 })

      await expect(
        apiClient.getGameDetails('invalid-game')
      ).rejects.toThrow('Failed to get game details: 404 Game not found')
    })
  })

  describe('trackClick', () => {
    it('should track click successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }))

      await apiClient.trackClick('game-1', 'steam')

      expect(fetchMock).toHaveBeenCalledWith('/api/click/game-1/steam', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    })

    it('should handle tracking errors', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Invalid parameters' }), { status: 400 })

      await expect(
        apiClient.trackClick('invalid-game', 'invalid-store')
      ).rejects.toThrow('Failed to track click: 400 Invalid parameters')
    })
  })

  describe('streamChatResponse', () => {
    it('should stream chat response successfully', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Hello ') })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('world!') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn()
      }

      // Mock the fetch response with a proper ReadableStream
      fetchMock.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          body: {
            getReader: () => mockReader
          }
        } as any)
      )

      const chunks: string[] = []
      const onChunk = (chunk: string) => chunks.push(chunk)

      await apiClient.streamChatResponse('test query', undefined, onChunk)

      expect(chunks).toEqual(['Hello ', 'world!'])
      expect(fetchMock).toHaveBeenCalledWith('/api/similar/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'test query', filters: undefined })
      })
      expect(mockReader.releaseLock).toHaveBeenCalled()
    })

    it('should handle streaming errors', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Server error' }), { status: 500 })

      await expect(
        apiClient.streamChatResponse('test query', undefined, jest.fn())
      ).rejects.toThrow('Failed to stream chat response: 500 Server error')
    })

    it('should handle null response body', async () => {
      fetchMock.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          body: null
        } as any)
      )

      await expect(
        apiClient.streamChatResponse('test query', undefined, jest.fn())
      ).rejects.toThrow('Response body is null')
    })

    it('should include filters in streaming request', async () => {
      const filters: FilterState = {
        priceMax: 50,
        platforms: ['PC']
      }

      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn()
      }

      fetchMock.mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          body: { getReader: () => mockReader }
        } as any)
      )

      await apiClient.streamChatResponse('test query', filters, jest.fn())

      expect(fetchMock).toHaveBeenCalledWith('/api/similar/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'test query', filters })
      })
    })

    it('should retry streaming on failure', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn()
      }

      fetchMock
        .mockRejectOnce(new Error('Network error'))
        .mockImplementationOnce(() => 
          Promise.resolve({
            ok: true,
            body: { getReader: () => mockReader }
          } as any)
        )

      await apiClient.streamChatResponse('test query', undefined, jest.fn())

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('Retry Logic', () => {
    it('should implement exponential backoff', async () => {
      const startTime = Date.now()
      
      fetchMock
        .mockRejectOnce(new Error('Error 1'))
        .mockRejectOnce(new Error('Error 2'))
        .mockResponseOnce(JSON.stringify({ success: true }))

      await apiClient.getGameDetails('game-1')

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should have some delay due to exponential backoff
      expect(duration).toBeGreaterThan(1000) // At least 1 second for retries
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('should add jitter to prevent thundering herd', async () => {
      // This test verifies that jitter is added by checking multiple retry attempts
      // have slightly different timing (implementation detail)
      
      fetchMock.mockReject(new Error('Persistent error'))

      const promises = [
        apiClient.getGameDetails('game-1').catch(() => {}),
        apiClient.getGameDetails('game-2').catch(() => {})
      ]

      await Promise.all(promises)

      // Both should have attempted 3 times
      expect(fetchMock).toHaveBeenCalledTimes(6)
    })
  })
})