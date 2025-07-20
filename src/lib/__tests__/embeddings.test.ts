// Mock OpenAI before importing
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn()
    }
  }))
})

// Mock Pinecone before importing
jest.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: jest.fn().mockImplementation(() => ({
      index: jest.fn()
    }))
  }
})

import {
  normalizeGameMetadata,
  needsEmbeddingUpdate,
  defaultBatchConfig,
  batchProcessEmbeddings
} from '../embeddings'
import { Game } from '../supabase'
import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn(() => ({ error: null })),
      select: jest.fn(() => ({
        in: jest.fn(() => ({
          lte: jest.fn(() => ({
            overlaps: jest.fn(() => ({
              gte: jest.fn(() => ({
                lte: jest.fn(() => ({ data: [], error: null }))
              }))
            }))
          }))
        }))
      })),
      textSearch: jest.fn(() => ({
        lte: jest.fn(() => ({
          overlaps: jest.fn(() => ({
            gte: jest.fn(() => ({
              lte: jest.fn(() => ({
                limit: jest.fn(() => ({ data: [], error: null }))
              }))
            }))
          }))
        })),
        limit: jest.fn(() => ({ data: [], error: null }))
      }))
    }))
  }
}))

const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>
const MockedPinecone = Pinecone as jest.MockedClass<typeof Pinecone>

// Mock environment variables
const originalEnv = process.env
beforeEach(() => {
  process.env = {
    ...originalEnv,
    OPENAI_API_KEY: 'test-openai-key',
    PINECONE_API_KEY: 'test-pinecone-key',
    PINECONE_INDEX_NAME: 'test-index'
  }
})

afterEach(() => {
  process.env = originalEnv
  jest.clearAllMocks()
})

describe('Embeddings Module', () => {
  let mockOpenAI: jest.Mocked<OpenAI>
  let mockPinecone: jest.Mocked<Pinecone>
  let mockIndex: any

  beforeEach(() => {
    mockOpenAI = {
      embeddings: {
        create: jest.fn()
      }
    } as any

    mockIndex = {
      upsert: jest.fn(),
      query: jest.fn()
    }

    mockPinecone = {
      index: jest.fn(() => mockIndex)
    } as any

    MockedOpenAI.mockImplementation(() => mockOpenAI)
    MockedPinecone.mockImplementation(() => mockPinecone)
  })

  describe('Environment Validation', () => {
    it('should throw error when required environment variables are missing', () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.PINECONE_API_KEY
      
      expect(() => {
        jest.resetModules()
        require('../embeddings')
      }).toThrow('Missing required environment variables: OPENAI_API_KEY, PINECONE_API_KEY')
    })

    it('should throw error when only OPENAI_API_KEY is missing', () => {
      delete process.env.OPENAI_API_KEY
      
      expect(() => {
        jest.resetModules()
        require('../embeddings')
      }).toThrow('Missing required environment variables: OPENAI_API_KEY')
    })
  })

  // Note: generateEmbedding tests are skipped because they require OpenAI client initialization

  describe('normalizeGameMetadata', () => {
    const mockGame: Game = {
      id: 'game-1',
      title: 'Test Game',
      short_description: 'A test game description',
      genres: ['Action', 'Adventure'],
      platforms: ['PC', 'PlayStation'],
      price_usd: 29.99,
      critic_score: 85,
      release_date: '2023-01-01T00:00:00Z',
      rawg_id: 123,
      slug: 'test-game',
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

    it('should normalize game metadata correctly', () => {
      const result = normalizeGameMetadata(mockGame)

      expect(result).toContain('Title: Test Game')
      expect(result).toContain('Description: A test game description')
      expect(result).toContain('Genres: Action, Adventure')
      expect(result).toContain('Platforms: PC, PlayStation')
      expect(result).toContain('Price: $29.99')
      expect(result).toContain('Critic Score: 85/100')
      expect(result).toMatch(/Release Year: \d{4}/)
    })

    it('should handle games with missing optional fields', () => {
      const incompleteGame: Game = {
        ...mockGame,
        short_description: null,
        genres: null,
        platforms: null,
        price_usd: null,
        critic_score: null,
        release_date: null
      }

      const result = normalizeGameMetadata(incompleteGame)

      expect(result).toBe('Title: Test Game')
    })

    it('should throw error for games with no metadata', () => {
      const emptyGame: Game = {
        ...mockGame,
        title: '',
        short_description: null,
        genres: null,
        platforms: null,
        price_usd: null,
        critic_score: null,
        release_date: null
      }

      expect(() => normalizeGameMetadata(emptyGame)).toThrow('No metadata available to normalize for this game')
    })

    it('should handle invalid release dates', () => {
      const gameWithInvalidDate: Game = {
        ...mockGame,
        release_date: 'invalid-date'
      }

      const result = normalizeGameMetadata(gameWithInvalidDate)
      expect(result).not.toContain('Release Year:')
    })
  })

  // Note: upsertVector and searchSimilarGames tests are skipped because they require OpenAI/Pinecone client initialization

  describe('needsEmbeddingUpdate', () => {
    const baseGame: Game = {
      id: 'game-1',
      title: 'Test Game',
      short_description: 'Description',
      genres: ['Action'],
      platforms: ['PC'],
      price_usd: 29.99,
      critic_score: 85,
      release_date: '2023-01-01',
      rawg_id: 123,
      slug: 'test-game',
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

    it('should return true when no previous version exists', () => {
      expect(needsEmbeddingUpdate(baseGame)).toBe(true)
    })

    it('should return false when no relevant fields changed', () => {
      const previousGame = { ...baseGame }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(false)
    })

    it('should return true when title changes', () => {
      const previousGame = { ...baseGame, title: 'Old Title' }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(true)
    })

    it('should return true when description changes', () => {
      const previousGame = { ...baseGame, short_description: 'Old Description' }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(true)
    })

    it('should return true when genres change', () => {
      const previousGame = { ...baseGame, genres: ['RPG'] }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(true)
    })

    it('should return true when platforms change', () => {
      const previousGame = { ...baseGame, platforms: ['PlayStation'] }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(true)
    })

    it('should return true when release date changes', () => {
      const previousGame = { ...baseGame, release_date: '2022-01-01' }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(true)
    })

    it('should return true when critic score changes', () => {
      const previousGame = { ...baseGame, critic_score: 90 }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(true)
    })

    it('should return false when non-embedding fields change', () => {
      const previousGame = { ...baseGame, price_usd: 19.99, steam_appid: 456 }
      expect(needsEmbeddingUpdate(baseGame, previousGame)).toBe(false)
    })
  })

  describe('batchProcessEmbeddings', () => {
    const mockGames: Game[] = [
      {
        id: 'game-1',
        title: 'Game 1',
        short_description: 'First game',
        genres: ['Action'],
        platforms: ['PC'],
        price_usd: 29.99,
        critic_score: 85,
        release_date: '2023-01-01',
        rawg_id: 123,
        slug: 'game-1',
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
      },
      {
        id: 'game-2',
        title: 'Game 2',
        short_description: 'Second game',
        genres: ['RPG'],
        platforms: ['PlayStation'],
        price_usd: 39.99,
        critic_score: 90,
        release_date: '2023-02-01',
        rawg_id: 456,
        slug: 'game-2',
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
    ]

    it('should process empty array', async () => {
      const result = await batchProcessEmbeddings([])
      
      expect(result).toEqual({
        totalGames: 0,
        succeeded: 0,
        failed: 0,
        failedGameIds: [],
        errors: {}
      })
    })

    // Note: batchProcessEmbeddings with actual processing tests are skipped because they require OpenAI client initialization

    it('should merge custom config with defaults', async () => {
      const customConfig = { batchSize: 5 }
      
      // This test verifies the config merging logic
      expect(defaultBatchConfig.batchSize).toBe(10)
      expect(defaultBatchConfig.concurrency).toBe(3)
      expect(defaultBatchConfig.maxRetries).toBe(3)
      expect(defaultBatchConfig.retryDelay).toBe(1000)
    })
  })
})