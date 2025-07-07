import React, { useState } from 'react'
import { ChatMessage } from '@/lib/types'
import { searchSimilarGames, streamChunks, APIError } from '@/lib/api-client'

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message])
  }

  const updateLastMessage = (content: string) => {
    setMessages(prev => {
      const updated = [...prev]
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + content
        }
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading) {
      return
    }

    const userQuery = input.trim()
    setInput('')
    setError(null)
    setIsLoading(true)

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userQuery
    }
    addMessage(userMessage)

    // Add assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: ''
    }
    addMessage(assistantMessage)

    try {
      // Call the API for similar games
      const { response } = await searchSimilarGames(userQuery)
      
      // Stream the response
      for await (const chunk of streamChunks(response)) {
        updateLastMessage(chunk)
      }
      
    } catch (err) {
      console.error('Chat error:', err)
      
      let errorMessage = 'Sorry, something went wrong. Please try again.'
      if (err instanceof APIError) {
        errorMessage = err.message
      } else if (err instanceof Error) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      
      // Update the assistant message with error
      updateLastMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[600px] bg-gray-800 rounded-lg shadow-xl">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center space-y-4">
            <p className="text-gray-400">
              Ask me about games! I can help you find similar games, compare titles, or discover something new.
            </p>
            <div className="text-sm text-gray-500">
              <p>Try asking:</p>
              <ul className="mt-2 space-y-1">
                <li>• "Games like The Witcher 3"</li>
                <li>• "Best indie platformers under $20"</li>
                <li>• "RPGs for Nintendo Switch"</li>
              </ul>
            </div>
          </div>
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
                } ${message.content === '' && isLoading ? 'animate-pulse' : ''}`}
              >
                {message.content === '' && isLoading ? (
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
              </div>
            </div>
          ))
        )}
        {error && (
          <div className="bg-red-600 text-white px-4 py-2 rounded-lg">
            <p className="font-medium">Error:</p>
            <p>{error}</p>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about games..."
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}