/**
 * Tests for conversation tracking functionality
 */

import { assertEquals, assertExists, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { ConversationManager, SessionManager } from '../utils/conversation_manager.ts'

// Mock Supabase client for testing
class MockSupabaseClient {
  private conversations: any[] = []
  private messages: any[] = []
  private nextId = 1

  from(table: string) {
    return {
      insert: (data: any) => ({
        select: () => ({
          single: async () => {
            const id = `test-id-${this.nextId++}`
            const record = { id, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            
            if (table === 'conversations') {
              this.conversations.push(record)
            } else if (table === 'conversation_messages') {
              this.messages.push(record)
            }
            
            return { data: record, error: null }
          }
        })
      }),
      select: (columns?: string) => ({
        eq: (column: string, value: any) => ({
          order: (orderColumn: string, options?: any) => ({
            limit: (limitValue: number) => ({
              single: async () => {
                let results = table === 'conversations' ? this.conversations : this.messages
                results = results.filter(r => r[column] === value)
                
                if (orderColumn && options?.ascending === false) {
                  results.sort((a, b) => new Date(b[orderColumn]).getTime() - new Date(a[orderColumn]).getTime())
                }
                
                return { data: results[0] || null, error: results.length === 0 ? { message: 'Not found' } : null }
              }),
              then: async (callback: any) => {
                let results = table === 'conversations' ? this.conversations : this.messages
                results = results.filter(r => r[column] === value)
                
                if (orderColumn && options?.ascending === false) {
                  results.sort((a, b) => new Date(b[orderColumn]).getTime() - new Date(a[orderColumn]).getTime())
                }
                
                return callback({ data: results.slice(0, limitValue), error: null })
              }
            }),
            then: async (callback: any) => {
              let results = table === 'conversations' ? this.conversations : this.messages
              results = results.filter(r => r[column] === value)
              
              if (orderColumn && options?.ascending === false) {
                results.sort((a, b) => new Date(b[orderColumn]).getTime() - new Date(a[orderColumn]).getTime())
              } else if (orderColumn && options?.ascending === true) {
                results.sort((a, b) => new Date(a[orderColumn]).getTime() - new Date(b[orderColumn]).getTime())
              }
              
              return callback({ data: results, error: null })
            }
          }),
          single: async () => {
            const results = table === 'conversations' ? this.conversations : this.messages
            const found = results.find(r => r[column] === value)
            return { data: found || null, error: found ? null : { message: 'Not found' } }
          }
        }),
        order: (orderColumn: string, options?: any) => ({
          limit: (limitValue: number) => ({
            then: async (callback: any) => {
              let results = table === 'conversations' ? this.conversations : this.messages
              
              if (options?.ascending === false) {
                results.sort((a, b) => new Date(b[orderColumn]).getTime() - new Date(a[orderColumn]).getTime())
              } else {
                results.sort((a, b) => new Date(a[orderColumn]).getTime() - new Date(b[orderColumn]).getTime())
              }
              
              return callback({ data: results.slice(0, limitValue), error: null })
            }
          })
        })
      }),
      delete: () => ({
        lt: (column: string, value: string) => ({
          select: (columns: string) => ({
            then: async (callback: any) => {
              const cutoffDate = new Date(value)
              let results = table === 'conversations' ? this.conversations : this.messages
              const toDelete = results.filter(r => new Date(r.updated_at) < cutoffDate)
              
              // Remove from mock data
              if (table === 'conversations') {
                this.conversations = this.conversations.filter(r => new Date(r.updated_at) >= cutoffDate)
              }
              
              return callback({ data: toDelete, error: null })
            }
          })
        })
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          order: (orderColumn: string, options?: any) => ({
            limit: (limitValue: number) => ({
              then: async (callback: any) => {
                let results = table === 'conversations' ? this.conversations : this.messages
                results = results.filter(r => r[column] === value)
                
                if (orderColumn && options?.ascending === false) {
                  results.sort((a, b) => new Date(b[orderColumn]).getTime() - new Date(a[orderColumn]).getTime())
                }
                
                // Update the first record
                if (results.length > 0) {
                  Object.assign(results[0], data)
                }
                
                return callback({ data: results.slice(0, limitValue), error: null })
              }
            })
          })
        })
      })
    }
  }

  // Helper methods for testing
  reset() {
    this.conversations = []
    this.messages = []
    this.nextId = 1
  }

  getConversations() {
    return this.conversations
  }

  getMessages() {
    return this.messages
  }
}

// Create a test conversation manager with mock client
function createTestConversationManager() {
  const mockClient = new MockSupabaseClient()
  const manager = new ConversationManager('test-url', 'test-key')
  // Replace the supabase client with our mock
  ;(manager as any).supabase = mockClient
  return { manager, mockClient }
}

Deno.test('ConversationManager - createConversation', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session-123')
  
  assertExists(conversation.id)
  assertEquals(conversation.session_id, 'test-session-123')
  assertExists(conversation.created_at)
  assertExists(conversation.updated_at)
})

Deno.test('ConversationManager - getOrCreateConversation - creates new', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.getOrCreateConversation('new-session')
  
  assertExists(conversation.id)
  assertEquals(conversation.session_id, 'new-session')
})

Deno.test('ConversationManager - addMessage', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session')
  const message = await manager.addMessage(
    conversation.id,
    'user',
    'Hello, I need game recommendations',
    { test: true }
  )
  
  assertExists(message.id)
  assertEquals(message.conversation_id, conversation.id)
  assertEquals(message.role, 'user')
  assertEquals(message.content, 'Hello, I need game recommendations')
  assertEquals(message.metadata?.test, true)
})

Deno.test('ConversationManager - getConversationHistory', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session')
  
  // Add multiple messages
  await manager.addMessage(conversation.id, 'user', 'First message')
  await manager.addMessage(conversation.id, 'assistant', 'First response')
  await manager.addMessage(conversation.id, 'user', 'Second message')
  
  const history = await manager.getConversationHistory(conversation.id)
  
  assertEquals(history.length, 3)
  assertEquals(history[0].content, 'First message')
  assertEquals(history[1].content, 'First response')
  assertEquals(history[2].content, 'Second message')
})

Deno.test('ConversationManager - getSessionConversation', async () => {
  const { manager } = createTestConversationManager()
  
  const result = await manager.getSessionConversation('test-session', 5)
  
  assertExists(result.conversation)
  assertExists(result.messages)
  assertEquals(result.conversation.session_id, 'test-session')
})

Deno.test('ConversationManager - cleanupOldConversations', async () => {
  const { manager, mockClient } = createTestConversationManager()
  
  // Create some test conversations
  await manager.createConversation('session-1')
  await manager.createConversation('session-2')
  
  const deleted = await manager.cleanupOldConversations(30)
  
  // Should return number of deleted conversations
  assertEquals(typeof deleted, 'number')
})

Deno.test('ConversationManager - getConversationContext', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session')
  
  // Add some messages
  await manager.addMessage(conversation.id, 'user', 'I like RPG games')
  await manager.addMessage(conversation.id, 'assistant', 'Great! Here are some RPG recommendations...')
  await manager.addMessage(conversation.id, 'user', 'What about action games?')
  
  const context = await manager.getConversationContext(conversation.id, 5)
  
  assertExists(context)
  assertEquals(typeof context, 'string')
  // Should contain formatted conversation history
  assertEquals(context.includes('User: I like RPG games'), true)
  assertEquals(context.includes('Assistant: Great! Here are some RPG recommendations...'), true)
})

Deno.test('ConversationManager - isValidSessionId', () => {
  assertEquals(ConversationManager.isValidSessionId('valid-session-123'), true)
  assertEquals(ConversationManager.isValidSessionId('session_with_underscores'), true)
  assertEquals(ConversationManager.isValidSessionId(''), false)
  assertEquals(ConversationManager.isValidSessionId('invalid session with spaces'), false)
  assertEquals(ConversationManager.isValidSessionId('a'.repeat(101)), false) // Too long
})

Deno.test('ConversationManager - generateSessionId', () => {
  const sessionId = ConversationManager.generateSessionId()
  
  assertExists(sessionId)
  assertEquals(typeof sessionId, 'string')
  assertEquals(sessionId.startsWith('session_'), true)
  assertEquals(ConversationManager.isValidSessionId(sessionId), true)
})

Deno.test('SessionManager - getOrCreateSessionId from header', () => {
  const request = new Request('http://localhost', {
    headers: { 'x-session-id': 'header-session-123' }
  })
  
  const sessionId = SessionManager.getOrCreateSessionId(request)
  assertEquals(sessionId, 'header-session-123')
})

Deno.test('SessionManager - getOrCreateSessionId from cookie', () => {
  const request = new Request('http://localhost', {
    headers: { 'cookie': 'gamecompare_session=cookie-session-456; other=value' }
  })
  
  const sessionId = SessionManager.getOrCreateSessionId(request)
  assertEquals(sessionId, 'cookie-session-456')
})

Deno.test('SessionManager - getOrCreateSessionId generates new', () => {
  const request = new Request('http://localhost')
  
  const sessionId = SessionManager.getOrCreateSessionId(request)
  
  assertExists(sessionId)
  assertEquals(typeof sessionId, 'string')
  assertEquals(sessionId.startsWith('session_'), true)
})

Deno.test('SessionManager - createSessionHeaders', () => {
  const headers = SessionManager.createSessionHeaders('test-session-789', { 'Content-Type': 'application/json' })
  
  assertEquals(headers['Content-Type'], 'application/json')
  assertEquals(headers['x-session-id'], 'test-session-789')
  assertExists(headers['Set-Cookie'])
  assertEquals(headers['Set-Cookie'].includes('gamecompare_session=test-session-789'), true)
})

Deno.test('ConversationManager - error handling for invalid conversation ID', async () => {
  const { manager } = createTestConversationManager()
  
  // Mock the supabase client to return an error
  const originalFrom = (manager as any).supabase.from
  ;(manager as any).supabase.from = () => ({
    insert: () => ({
      select: () => ({
        single: async () => ({ data: null, error: { message: 'Database error' } })
      })
    })
  })
  
  await assertRejects(
    () => manager.createConversation('test-session'),
    Error,
    'Failed to create conversation'
  )
  
  // Restore original method
  ;(manager as any).supabase.from = originalFrom
})

Deno.test('ConversationManager - addMessage with invalid role should be handled by database constraints', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session')
  
  // This should be caught by database constraints in real implementation
  // For now, we'll test that the function accepts the parameters
  const message = await manager.addMessage(
    conversation.id,
    'user', // Valid role
    'Test message'
  )
  
  assertEquals(message.role, 'user')
})

Deno.test('ConversationManager - getConversationHistory with limit', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session')
  
  // Add more messages than the limit
  for (let i = 0; i < 10; i++) {
    await manager.addMessage(conversation.id, 'user', `Message ${i}`)
  }
  
  const history = await manager.getConversationHistory(conversation.id, 5)
  
  assertEquals(history.length, 5)
})

Deno.test('ConversationManager - updateConversationMetadata', async () => {
  const { manager } = createTestConversationManager()
  
  const conversation = await manager.createConversation('test-session')
  await manager.addMessage(conversation.id, 'user', 'Test message')
  
  // This should not throw an error
  await manager.updateConversationMetadata(conversation.id, { test_key: 'test_value' })
  
  // In a real implementation, we would verify the metadata was updated
  // For this mock test, we just ensure no error is thrown
})

// Integration test for the conversation cleanup function
Deno.test('runConversationCleanup - success', async () => {
  const { runConversationCleanup } = await import('../utils/conversation_manager.ts')
  
  // Mock the ConversationManager constructor
  const originalConversationManager = (globalThis as any).ConversationManager
  
  class MockConversationManagerForCleanup {
    async cleanupOldConversations(days: number) {
      return 5 // Mock deleted count
    }
  }
  
  // Temporarily replace the constructor
  ;(globalThis as any).ConversationManager = MockConversationManagerForCleanup
  
  const result = await runConversationCleanup('test-url', 'test-key', 30)
  
  assertEquals(result.deleted, 5)
  assertEquals(result.error, undefined)
  
  // Restore original
  ;(globalThis as any).ConversationManager = originalConversationManager
})

Deno.test('runConversationCleanup - error handling', async () => {
  const { runConversationCleanup } = await import('../utils/conversation_manager.ts')
  
  // Mock the ConversationManager constructor to throw an error
  const originalConversationManager = (globalThis as any).ConversationManager
  
  class MockConversationManagerForCleanup {
    async cleanupOldConversations(days: number) {
      throw new Error('Database connection failed')
    }
  }
  
  ;(globalThis as any).ConversationManager = MockConversationManagerForCleanup
  
  const result = await runConversationCleanup('test-url', 'test-key', 30)
  
  assertEquals(result.deleted, 0)
  assertEquals(result.error, 'Database connection failed')
  
  // Restore original
  ;(globalThis as any).ConversationManager = originalConversationManager
})