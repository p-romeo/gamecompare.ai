/**
 * Conversation Management Utilities
 * Handles conversation persistence, session management, and message tracking
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface Conversation {
  id: string
  session_id: string | null
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, any>
  created_at: string
}

export interface ConversationSummary {
  id: string
  session_id: string | null
  created_at: string
  updated_at: string
  message_count: number
  last_message_at: string | null
}

export class ConversationManager {
  private supabase: SupabaseClient

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Creates a new conversation
   */
  async createConversation(sessionId?: string): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversations')
      .insert({ session_id: sessionId })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`)
    }

    return data
  }

  /**
   * Gets or creates a conversation by session ID
   */
  async getOrCreateConversation(sessionId: string): Promise<Conversation> {
    // Try to find existing conversation
    const { data: existing, error: findError } = await this.supabase
      .from('conversations')
      .select()
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (existing && !findError) {
      return existing
    }

    // Create new conversation if none found
    return await this.createConversation(sessionId)
  }

  /**
   * Adds a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>
  ): Promise<ConversationMessage> {
    const { data, error } = await this.supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        metadata
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to add message: ${error.message}`)
    }

    return data
  }

  /**
   * Gets conversation history with messages
   */
  async getConversationHistory(
    conversationId: string,
    limit: number = 50
  ): Promise<ConversationMessage[]> {
    const { data, error } = await this.supabase
      .from('conversation_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get conversation history: ${error.message}`)
    }

    return data || []
  }

  /**
   * Gets conversation by session ID with recent messages
   */
  async getSessionConversation(
    sessionId: string,
    messageLimit: number = 10
  ): Promise<{ conversation: Conversation; messages: ConversationMessage[] }> {
    const conversation = await this.getOrCreateConversation(sessionId)
    const messages = await this.getConversationHistory(conversation.id, messageLimit)

    return { conversation, messages }
  }

  /**
   * Gets conversation summaries for a session
   */
  async getConversationSummaries(
    sessionId?: string,
    limit: number = 20
  ): Promise<ConversationSummary[]> {
    let query = this.supabase
      .from('conversation_summaries')
      .select()
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to get conversation summaries: ${error.message}`)
    }

    return data || []
  }

  /**
   * Deletes old conversations and messages
   * Used for cleanup jobs
   */
  async cleanupOldConversations(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const { data, error } = await this.supabase
      .from('conversations')
      .delete()
      .lt('updated_at', cutoffDate.toISOString())
      .select('id')

    if (error) {
      throw new Error(`Failed to cleanup old conversations: ${error.message}`)
    }

    return data?.length || 0
  }

  /**
   * Updates conversation metadata
   */
  async updateConversationMetadata(
    conversationId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    // Store metadata in the most recent message for simplicity
    const { error } = await this.supabase
      .from('conversation_messages')
      .update({ metadata })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      throw new Error(`Failed to update conversation metadata: ${error.message}`)
    }
  }

  /**
   * Gets conversation context for AI prompts
   * Returns recent messages formatted for GPT context
   */
  async getConversationContext(
    conversationId: string,
    maxMessages: number = 5
  ): Promise<string> {
    const messages = await this.getConversationHistory(conversationId, maxMessages)
    
    if (messages.length === 0) {
      return ''
    }

    const context = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')

    return `Previous conversation:\n${context}\n\nCurrent request:`
  }

  /**
   * Validates session ID format
   */
  static isValidSessionId(sessionId: string): boolean {
    // Session ID should be a non-empty string with reasonable length
    return typeof sessionId === 'string' && 
           sessionId.length > 0 && 
           sessionId.length <= 100 &&
           /^[a-zA-Z0-9_-]+$/.test(sessionId)
  }

  /**
   * Generates a new session ID
   */
  static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Session management utilities
 */
export class SessionManager {
  private static readonly SESSION_COOKIE_NAME = 'gamecompare_session'
  private static readonly SESSION_HEADER_NAME = 'x-session-id'

  /**
   * Extracts session ID from request headers or generates a new one
   */
  static getOrCreateSessionId(req: Request): string {
    // Try to get session ID from header first
    const headerSessionId = req.headers.get(SessionManager.SESSION_HEADER_NAME)
    if (headerSessionId && ConversationManager.isValidSessionId(headerSessionId)) {
      return headerSessionId
    }

    // Try to get from cookie
    const cookieHeader = req.headers.get('cookie')
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim())
      const sessionCookie = cookies.find(c => c.startsWith(`${SessionManager.SESSION_COOKIE_NAME}=`))
      if (sessionCookie) {
        const sessionId = sessionCookie.split('=')[1]
        if (ConversationManager.isValidSessionId(sessionId)) {
          return sessionId
        }
      }
    }

    // Generate new session ID
    return ConversationManager.generateSessionId()
  }

  /**
   * Creates response headers with session ID
   */
  static createSessionHeaders(sessionId: string, existingHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      ...existingHeaders,
      [SessionManager.SESSION_HEADER_NAME]: sessionId,
      'Set-Cookie': `${SessionManager.SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000` // 30 days
    }
  }
}

/**
 * Conversation cleanup job
 * Can be called periodically to clean up old conversations
 */
export async function runConversationCleanup(
  supabaseUrl: string,
  serviceRoleKey: string,
  retentionDays: number = 30
): Promise<{ deleted: number; error?: string }> {
  try {
    const manager = new ConversationManager(supabaseUrl, serviceRoleKey)
    const deleted = await manager.cleanupOldConversations(retentionDays)
    
    console.log(`Conversation cleanup completed: ${deleted} conversations deleted`)
    return { deleted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Conversation cleanup failed: ${errorMessage}`)
    return { deleted: 0, error: errorMessage }
  }
}