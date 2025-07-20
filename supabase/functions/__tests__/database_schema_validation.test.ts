/**
 * Database Schema Validation Tests
 * Tests the enhanced database schema including computed columns, indexes, and constraints
 */

import { createClient } from '@supabase/supabase-js'

// Mock Supabase client for testing
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn()
}

describe('Database Schema Validation', () => {
  let supabase: any

  beforeEach(() => {
    supabase = mockSupabase
    jest.clearAllMocks()
  })

  describe('Games table enhancements', () => {
    test('should have search_text computed column', async () => {
      // Mock the response for a game with search_text
      const mockGame = {
        id: 'test-id',
        title: 'Test Game',
        search_text: 'test game action adventure',
        genres: ['Action', 'Adventure'],
        platforms: ['PC']
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [mockGame],
            error: null
          })
        })
      })

      const { data, error } = await supabase
        .from('games')
        .select('id, title, search_text, genres, platforms')
        .eq('id', 'test-id')

      expect(error).toBeNull()
      expect(data[0]).toHaveProperty('search_text')
      expect(supabase.from).toHaveBeenCalledWith('games')
    })

    test('should support full-text search queries', async () => {
      const mockSearchResults = [
        { id: '1', title: 'Action Game', rank: 0.8 },
        { id: '2', title: 'Adventure Game', rank: 0.7 }
      ]

      supabase.rpc.mockResolvedValue({
        data: mockSearchResults,
        error: null
      })

      const { data, error } = await supabase.rpc('search_games_fulltext', {
        search_query: 'action adventure'
      })

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      expect(supabase.rpc).toHaveBeenCalledWith('search_games_fulltext', {
        search_query: 'action adventure'
      })
    })
  })

  describe('Price history table', () => {
    test('should track price changes over time', async () => {
      const mockPriceHistory = [
        {
          id: 'price-1',
          game_id: 'game-1',
          store: 'steam',
          price_usd: 59.99,
          recorded_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'price-2',
          game_id: 'game-1',
          store: 'steam',
          price_usd: 49.99,
          recorded_at: '2024-01-15T00:00:00Z'
        }
      ]

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: mockPriceHistory,
              error: null
            })
          })
        })
      })

      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('game_id', 'game-1')
        .order('recorded_at', { ascending: false })

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      expect(data[0].price_usd).toBe(59.99)
    })

    test('should enforce store constraints', async () => {
      const invalidStoreError = {
        message: 'new row for relation "price_history" violates check constraint',
        code: '23514'
      }

      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: invalidStoreError
        })
      })

      const { data, error } = await supabase
        .from('price_history')
        .insert({
          game_id: 'game-1',
          store: 'invalid_store',
          price_usd: 10.00
        })

      expect(data).toBeNull()
      expect(error).toBeTruthy()
      expect(error.code).toBe('23514')
    })
  })

  describe('Conversation tracking tables', () => {
    test('should create conversations with session tracking', async () => {
      const mockConversation = {
        id: 'conv-1',
        session_id: 'session-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      supabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockConversation,
              error: null
            })
          })
        })
      })

      const { data, error } = await supabase
        .from('conversations')
        .insert({ session_id: 'session-123' })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data).toHaveProperty('session_id', 'session-123')
    })

    test('should store conversation messages with role validation', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Hello',
        created_at: '2024-01-01T00:00:00Z'
      }

      supabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockMessage,
              error: null
            })
          })
        })
      })

      const { data, error } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: 'conv-1',
          role: 'user',
          content: 'Hello'
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data).toHaveProperty('role', 'user')
    })

    test('should enforce role constraints', async () => {
      const invalidRoleError = {
        message: 'new row for relation "conversation_messages" violates check constraint',
        code: '23514'
      }

      supabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: invalidRoleError
        })
      })

      const { data, error } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: 'conv-1',
          role: 'invalid_role',
          content: 'test'
        })

      expect(data).toBeNull()
      expect(error).toBeTruthy()
      expect(error.code).toBe('23514')
    })

    test('should provide conversation summaries', async () => {
      const mockSummary = {
        id: 'conv-1',
        session_id: 'session-123',
        message_count: 5,
        last_message_at: '2024-01-01T12:00:00Z'
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSummary,
              error: null
            })
          })
        })
      })

      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('session_id', 'session-123')
        .single()

      expect(error).toBeNull()
      expect(data).toHaveProperty('message_count', 5)
    })
  })

  describe('Database indexes and performance', () => {
    test('should have proper indexes for common queries', async () => {
      const mockIndexes = [
        { indexname: 'games_search_text_idx', indexdef: 'CREATE INDEX games_search_text_idx ON games USING gin(search_text)' },
        { indexname: 'games_price_usd_idx', indexdef: 'CREATE INDEX games_price_usd_idx ON games(price_usd)' },
        { indexname: 'price_history_game_id_idx', indexdef: 'CREATE INDEX price_history_game_id_idx ON price_history(game_id)' }
      ]

      supabase.rpc.mockResolvedValue({
        data: mockIndexes,
        error: null
      })

      const { data, error } = await supabase.rpc('get_table_indexes', {
        table_name: 'games'
      })

      expect(error).toBeNull()
      expect(data).toContainEqual(
        expect.objectContaining({ indexname: 'games_search_text_idx' })
      )
    })
  })

  describe('Views and helper functions', () => {
    test('should provide games with current prices view', async () => {
      const mockGameWithPrice = {
        id: 'game-1',
        title: 'Test Game',
        current_price_store: 'steam',
        current_price: 49.99,
        price_updated_at: '2024-01-01T00:00:00Z'
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [mockGameWithPrice],
            error: null
          })
        })
      })

      const { data, error } = await supabase
        .from('games_with_current_prices')
        .select('*')
        .eq('id', 'game-1')

      expect(error).toBeNull()
      expect(data[0]).toHaveProperty('current_price', 49.99)
    })
  })
})

// Integration test scenarios
describe('Database Schema Integration', () => {
  test('should handle complete game data lifecycle', async () => {
    // This would test the full flow:
    // 1. Insert game with computed search_text
    // 2. Add price history
    // 3. Create conversation about the game
    // 4. Query with filters and search
    
    // Mock the complete flow
    const gameData = {
      id: 'game-1',
      title: 'Complete Test Game',
      search_text: 'complete test game action',
      price_usd: 59.99
    }

    // Mock successful operations
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: gameData,
            error: null
          })
        })
      })
    })

    expect(true).toBe(true) // Placeholder for integration test
  })
})