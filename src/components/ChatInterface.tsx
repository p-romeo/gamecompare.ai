import React, { useState, useEffect, useRef } from 'react'
import { ChatMessage, FilterState } from '@/lib/types'
import { apiClient } from '@/lib/api-client'
import { FilterPanel } from './FilterPanel'

interface ChatInterfaceProps {
  initialFilters?: FilterState
}

export function ChatInterface({ initialFilters = {} }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversation history and filters from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('chat-messages')
    const savedConversationId = localStorage.getItem('conversation-id')
    const savedFilters = localStorage.getItem('chat-filters')
    
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages))
      } catch (error) {
        console.error('Failed to parse saved messages:', error)
      }
    }
    
    if (savedConversationId) {
      setConversationId(savedConversationId)
    }

    if (savedFilters) {
      try {
        const parsedFilters = JSON.parse(savedFilters)
        setFilters({ ...initialFilters, ...parsedFilters })
      } catch (error) {
        console.error('Failed to parse saved filters:', error)
      }
    }
  }, [initialFilters])

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat-messages', JSON.stringify(messages))
    }
  }, [messages])

  // Save conversation ID to localStorage
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('conversation-id', conversationId)
    }
  }, [conversationId])

  // Save filters to localStorage whenever filters change
  useEffect(() => {
    localStorage.setItem('chat-filters', JSON.stringify(filters))
  }, [filters])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    // Create assistant message for streaming
    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: ''
    }

    setMessages(prev => [...prev, assistantMessage])

    try {
      // Use streaming API for real-time response
      let fullResponse = ''
      
      await apiClient.streamChatResponse(
        userMessage.content,
        filters,
        (chunk: string) => {
          fullResponse += chunk
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: fullResponse }
                : msg
            )
          )
        }
      )

      // If streaming isn't available, fall back to regular API
      if (!fullResponse) {
        const response = await apiClient.searchSimilarGames(userMessage.content, filters)
        setConversationId(response.conversation_id)
        
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: response.response }
              : msg
          )
        )
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      setError(errorMessage)
      
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
      
      console.error('Chat error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const clearConversation = () => {
    setMessages([])
    setConversationId(null)
    setError(null)
    localStorage.removeItem('chat-messages')
    localStorage.removeItem('conversation-id')
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[600px]" data-cy="chat-interface">
      {/* Filter Panel - Desktop: sidebar, Mobile: collapsible */}
      <div className="lg:w-80 flex-shrink-0">
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          className="h-full lg:h-auto"
        />
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex flex-col bg-gray-800 rounded-lg shadow-xl">
        {/* Header with clear button */}
        {messages.length > 0 && (
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h3 className="text-white font-medium">Game Chat</h3>
            <button
              onClick={clearConversation}
              className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded hover:bg-gray-700 transition-colors"
              data-cy="clear-chat-button"
            >
              Clear Chat
            </button>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" data-cy="chat-messages">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-center">
              Ask me about games! I can help you find similar games, compare titles, or discover something new.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'assistant' ? 'justify-start' : 'justify-end'
                }`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.role === 'assistant'
                      ? 'bg-gray-700 text-gray-100'
                      : 'bg-blue-600 text-white'
                  }`}
                  data-cy={message.role === 'assistant' ? 'assistant-message' : 'user-message'}
                >
                  {message.content || (message.role === 'assistant' && isLoading ? (
                    <div className="flex items-center space-x-2" data-cy="chat-loading">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-300"></div>
                      <span>Thinking...</span>
                    </div>
                  ) : message.content)}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-red-900/50 border border-red-700 rounded-lg" data-cy="error-message" role="alert">
            <div className="flex justify-between items-start">
              <p className="text-red-200 text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-200 ml-2"
                data-cy="error-dismiss"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about games..."
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              data-cy="chat-input"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              data-cy="chat-send-button"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}