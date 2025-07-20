/**
 * Integration tests for API router conversation tracking functionality
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// Mock environment variables
Deno.env.set('SUPABASE_URL', 'http://localhost:54321')
Deno.env.set('SERVICE_ROLE_KEY', 'test-service-role-key')

// Mock the conversation manager module
const mockConversationManager = {
  conversations: new Map(),
  messages: new Map(),
  nextId: 1,

  async getOrCreateConversation(sessionId: string) {
    const existing = Array.from(this.conversations.values()).find(c => c.session_id === sessionId)
    if (existing) return existing
    
    const conversation = {
      id: `conv-${this.nextId++}`,
      session_id: sessionId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    this.conversations.set(conversation.id, conversation)
    return conversation
  },

  async addMessage(conversationId: string, role: string, content: string, metadata?: any) {
    const message = {
      id: `msg-${this.nextId++}`,
      conversation_id: conversationId,
      role,
      content,
      metadata,
      created_at: new Date().toISOString()
    }
    this.messages.set(message.id, message)
    return message
  },

  async getConversationHistory(conversationId: string, limit: number = 50) {
    return Array.from(this.messages.values())
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, limit)
  },

  async getConversationContext(conversationId: string, maxMessages: number = 5) {
    const messages = await this.getConversationHistory(conversationId, maxMessages)
    if (messages.length === 0) return ''
    
    const context = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')
    
    return `Previous conversation:\n${context}\n\nCurrent request:`
  },

  async getSessionConversation(sessionId: string, messageLimit: number = 10) {
    const conversation = await this.getOrCreateConversation(sessionId)
    const messages = await this.getConversationHistory(conversation.id, messageLimit)
    return { conversation, messages }
  },

  async getConversationSummaries(sessionId?: string, limit: number = 20) {
    const conversations = Array.from(this.conversations.values())
    let filtered = sessionId ? conversations.filter(c => c.session_id === sessionId) : conversations
    
    return filtered.slice(0, limit).map(c => ({
      ...c,
      message_count: Array.from(this.messages.values()).filter(m => m.conversation_id === c.id).length,
      last_message_at: Array.from(this.messages.values())
        .filter(m => m.conversation_id === c.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at || null
    }))
  },

  reset() {
    this.conversations.clear()
    this.messages.clear()
    this.nextId = 1
  }
}

// Mock session manager
const mockSessionManager = {
  getOrCreateSessionId(req: Request): string {
    const headerSessionId = req.headers.get('x-session-id')
    if (headerSessionId) return headerSessionId
    
    const cookieHeader = req.headers.get('cookie')
    if (cookieHeader) {
      const sessionCookie = cookieHeader.split(';').find(c => c.trim().startsWith('gamecompare_session='))
      if (sessionCookie) {
        return sessionCookie.split('=')[1]
      }
    }
    
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },

  createSessionHeaders(sessionId: string, existingHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      ...existingHeaders,
      'x-session-id': sessionId,
      'Set-Cookie': `gamecompare_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`
    }
  }
}

// Mock the imports in the API router
const mockModules = {
  '../../src/lib/embeddings.ts': {
    searchSimilarGamesWithFilters: async (query: string, filters: any, limit: number) => {
      // Mock similar games response
      return [
        {
          game: {
            id: 'game-1',
            title: 'Test Game 1',
            price_usd: 29.99,
            critic_score: 85,
            platforms: ['PC', 'PlayStation 5']
          },
          similarity_score: 0.95
        },
        {
          game: {
            id: 'game-2',
            title: 'Test Game 2',
            price_usd: 39.99,
            critic_score: 78,
            platforms: ['PC', 'Xbox Series X']
          },
          similarity_score: 0.87
        }
      ]
    }
  },
  '../../src/lib/gpt.ts': {
    gptClient: {
      generateChatResponse: async (query: string, gameContext: any[]) => {
        return `Based on your query "${query}", I recommend these ${gameContext.length} games that match your preferences.`
      }
    }
  },
  './utils/conversation_manager.ts': {
    ConversationManager: class {
      constructor(url: string, key: string) {}
      
      async getOrCreateConversation(sessionId: string) {
        return mockConversationManager.getOrCreateConversation(sessionId)
      }
      
      async addMessage(conversationId: string, role: string, content: string, metadata?: any) {
        return mockConversationManager.addMessage(conversationId, role, content, metadata)
      }
      
      async getConversationHistory(conversationId: string, limit?: number) {
        return mockConversationManager.getConversationHistory(conversationId, limit)
      }
      
      async getConversationContext(conversationId: string, maxMessages?: number) {
        return mockConversationManager.getConversationContext(conversationId, maxMessages)
      }
      
      async getSessionConversation(sessionId: string, messageLimit?: number) {
        return mockConversationManager.getSessionConversation(sessionId, messageLimit)
      }
      
      async getConversationSummaries(sessionId?: string, limit?: number) {
        return mockConversationManager.getConversationSummaries(sessionId, limit)
      }
      
      static isValidSessionId(sessionId: string): boolean {
        return typeof sessionId === 'string' && 
               sessionId.length > 0 && 
               sessionId.length <= 100 &&
               /^[a-zA-Z0-9_-]+$/.test(sessionId)
      }
    },
    SessionManager: mockSessionManager
  }
}

// Helper function to create test requests
function createTestRequest(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Request {
  const url = `http://localhost:54321/functions/v1${path}`
  const requestHeaders = {
    'Authorization': 'Bearer test-service-role-key',
    'Content-Type': 'application/json',
    ...headers
  }
  
  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined
  })
}

// Mock Supabase client
const mockSupabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: { message: 'Not found' } })
      })
    })
  })
}

Deno.test('API Router - POST /similar with conversation tracking', async () => {
  mockConversationManager.reset()
  
  // Mock the dynamic imports
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  // Create test request
  const request = createTestRequest('POST', '/similar', {
    query: 'I want action RPG games',
    filters: { priceMax: 50 }
  }, {
    'x-session-id': 'test-session-123'
  })
  
  // Import and test the API router
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertExists(responseData.conversation_id)
  assertExists(responseData.games)
  assertExists(responseData.response)
  assertEquals(responseData.games.length, 2)
  
  // Verify conversation was created
  const conversations = Array.from(mockConversationManager.conversations.values())
  assertEquals(conversations.length, 1)
  assertEquals(conversations[0].session_id, 'test-session-123')
  
  // Verify messages were added
  const messages = Array.from(mockConversationManager.messages.values())
  assertEquals(messages.length, 2) // User message + assistant response
  assertEquals(messages[0].role, 'user')
  assertEquals(messages[0].content, 'I want action RPG games')
  assertEquals(messages[1].role, 'assistant')
  
  // Verify session headers
  assertEquals(response.headers.get('x-session-id'), 'test-session-123')
  assertExists(response.headers.get('Set-Cookie'))
  
  // Restore original import
  globalThis.import = originalImport
})

Deno.test('API Router - POST /similar with existing conversation', async () => {
  mockConversationManager.reset()
  
  // Pre-create a conversation
  const existingConversation = await mockConversationManager.getOrCreateConversation('existing-session')
  await mockConversationManager.addMessage(existingConversation.id, 'user', 'Previous message')
  await mockConversationManager.addMessage(existingConversation.id, 'assistant', 'Previous response')
  
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('POST', '/similar', {
    query: 'What about strategy games?',
    conversation_id: existingConversation.id
  }, {
    'x-session-id': 'existing-session'
  })
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertEquals(responseData.conversation_id, existingConversation.id)
  
  // Verify new messages were added to existing conversation
  const messages = await mockConversationManager.getConversationHistory(existingConversation.id)
  assertEquals(messages.length, 4) // 2 existing + 2 new
  assertEquals(messages[2].content, 'What about strategy games?')
  
  globalThis.import = originalImport
})

Deno.test('API Router - GET /conversation with session_id', async () => {
  mockConversationManager.reset()
  
  // Create test conversation with messages
  const conversation = await mockConversationManager.getOrCreateConversation('test-session-456')
  await mockConversationManager.addMessage(conversation.id, 'user', 'Hello')
  await mockConversationManager.addMessage(conversation.id, 'assistant', 'Hi there!')
  
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('GET', '/conversation?session_id=test-session-456')
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertExists(responseData.conversation_id)
  assertEquals(responseData.session_id, 'test-session-456')
  assertExists(responseData.messages)
  assertEquals(responseData.messages.length, 2)
  assertEquals(responseData.messages[0].content, 'Hello')
  assertEquals(responseData.messages[1].content, 'Hi there!')
  
  globalThis.import = originalImport
})

Deno.test('API Router - GET /conversation with conversation_id', async () => {
  mockConversationManager.reset()
  
  const conversation = await mockConversationManager.getOrCreateConversation('test-session-789')
  await mockConversationManager.addMessage(conversation.id, 'user', 'Test message')
  
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('GET', `/conversation?conversation_id=${conversation.id}`)
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertEquals(responseData.conversation_id, conversation.id)
  assertExists(responseData.messages)
  assertEquals(responseData.messages.length, 1)
  assertEquals(responseData.messages[0].content, 'Test message')
  
  globalThis.import = originalImport
})

Deno.test('API Router - GET /conversation summaries', async () => {
  mockConversationManager.reset()
  
  // Create multiple conversations
  const conv1 = await mockConversationManager.getOrCreateConversation('session-1')
  const conv2 = await mockConversationManager.getOrCreateConversation('session-2')
  await mockConversationManager.addMessage(conv1.id, 'user', 'Message 1')
  await mockConversationManager.addMessage(conv2.id, 'user', 'Message 2')
  
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('GET', '/conversation')
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertExists(responseData.summaries)
  assertEquals(responseData.summaries.length, 2)
  assertEquals(responseData.summaries[0].message_count, 1)
  assertEquals(responseData.summaries[1].message_count, 1)
  
  globalThis.import = originalImport
})

Deno.test('API Router - conversation tracking with no games found', async () => {
  mockConversationManager.reset()
  
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (specifier === '../../src/lib/embeddings.ts') {
      return {
        searchSimilarGamesWithFilters: async () => [] // No games found
      }
    }
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('POST', '/similar', {
    query: 'very specific game that does not exist'
  }, {
    'x-session-id': 'no-results-session'
  })
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertEquals(responseData.games.length, 0)
  assertExists(responseData.conversation_id)
  assertEquals(responseData.response.includes("couldn't find any games"), true)
  
  // Verify conversation was still created and messages saved
  const conversations = Array.from(mockConversationManager.conversations.values())
  assertEquals(conversations.length, 1)
  
  const messages = Array.from(mockConversationManager.messages.values())
  assertEquals(messages.length, 2) // User query + assistant "no results" response
  
  globalThis.import = originalImport
})

Deno.test('API Router - conversation tracking error handling', async () => {
  mockConversationManager.reset()
  
  // Mock conversation manager to throw errors
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (specifier === './utils/conversation_manager.ts') {
      return {
        ConversationManager: class {
          constructor() {}
          async getOrCreateConversation() {
            throw new Error('Database connection failed')
          }
          async addMessage() {
            throw new Error('Failed to save message')
          }
          async getConversationContext() {
            throw new Error('Failed to get context')
          }
        },
        SessionManager: mockSessionManager
      }
    }
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('POST', '/similar', {
    query: 'test query'
  })
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  // Should still return 200 even if conversation tracking fails
  assertEquals(response.status, 200)
  
  const responseData = await response.json()
  assertExists(responseData.games)
  assertExists(responseData.response)
  assertExists(responseData.conversation_id) // Should have fallback UUID
  
  globalThis.import = originalImport
})

Deno.test('API Router - invalid session ID validation', async () => {
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('GET', '/conversation?session_id=invalid session with spaces')
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 400)
  
  const responseData = await response.json()
  assertEquals(responseData.error.includes('Invalid session ID format'), true)
  
  globalThis.import = originalImport
})

Deno.test('API Router - conversation limit validation', async () => {
  const originalImport = globalThis.import
  globalThis.import = async (specifier: string) => {
    if (mockModules[specifier as keyof typeof mockModules]) {
      return mockModules[specifier as keyof typeof mockModules]
    }
    return originalImport(specifier)
  }
  
  const request = createTestRequest('GET', '/conversation?limit=150') // Over limit
  
  const { default: handler } = await import('../api_router.ts')
  const response = await handler(request)
  
  assertEquals(response.status, 400)
  
  const responseData = await response.json()
  assertEquals(responseData.error.includes('Limit must be between 1 and 100'), true)
  
  globalThis.import = originalImport
})