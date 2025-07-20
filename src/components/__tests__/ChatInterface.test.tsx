import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatInterface } from '../ChatInterface'
import { apiClient } from '@/lib/api-client'

// Mock the API client
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    streamChatResponse: jest.fn(),
    searchSimilarGames: jest.fn(),
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

describe('ChatInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('renders initial state correctly', () => {
    render(<ChatInterface />)
    
    expect(screen.getByText('Ask me about games! I can help you find similar games, compare titles, or discover something new.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask about games...')).toBeInTheDocument()
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  it('loads conversation history from localStorage on mount', () => {
    const savedMessages = JSON.stringify([
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there!' }
    ])
    const savedConversationId = 'conv-123'
    
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'chat-messages') return savedMessages
      if (key === 'conversation-id') return savedConversationId
      return null
    })

    render(<ChatInterface />)
    
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
    expect(screen.getByText('Clear Chat')).toBeInTheDocument()
  })

  it('handles form submission with streaming response', async () => {
    const mockStreamResponse = jest.fn()
    ;(apiClient.streamChatResponse as jest.Mock).mockImplementation(
      async (query, filters, onChunk) => {
        onChunk('Hello! ')
        onChunk('I can help you find games.')
      }
    )

    render(<ChatInterface />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    const submitButton = screen.getByText('Send')
    
    fireEvent.change(input, { target: { value: 'Find me RPG games' } })
    fireEvent.click(submitButton)
    
    expect(screen.getByText('Find me RPG games')).toBeInTheDocument()
    expect(screen.getByText('Sending...')).toBeInTheDocument()
    
    await waitFor(() => {
      expect(screen.getByText('Hello! I can help you find games.')).toBeInTheDocument()
    })
    
    expect(apiClient.streamChatResponse).toHaveBeenCalledWith(
      'Find me RPG games',
      undefined,
      expect.any(Function)
    )
  })

  it('falls back to regular API when streaming fails', async () => {
    ;(apiClient.streamChatResponse as jest.Mock).mockImplementation(
      async (query, filters, onChunk) => {
        // Simulate streaming not working (no chunks)
      }
    )
    ;(apiClient.searchSimilarGames as jest.Mock).mockResolvedValue({
      response: 'Here are some great RPG games!',
      games: [],
      conversation_id: 'conv-456'
    })

    render(<ChatInterface />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    const submitButton = screen.getByText('Send')
    
    fireEvent.change(input, { target: { value: 'Find me RPG games' } })
    fireEvent.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Here are some great RPG games!')).toBeInTheDocument()
    })
    
    expect(apiClient.searchSimilarGames).toHaveBeenCalledWith('Find me RPG games', undefined)
  })

  it('handles API errors gracefully', async () => {
    ;(apiClient.streamChatResponse as jest.Mock).mockRejectedValue(
      new Error('Network error')
    )

    render(<ChatInterface />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    const submitButton = screen.getByText('Send')
    
    fireEvent.change(input, { target: { value: 'Find me RPG games' } })
    fireEvent.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
    
    // User message should still be visible
    expect(screen.getByText('Find me RPG games')).toBeInTheDocument()
  })

  it('clears conversation when clear button is clicked', async () => {
    // Set up initial messages
    const savedMessages = JSON.stringify([
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there!' }
    ])
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'chat-messages') return savedMessages
      return null
    })

    render(<ChatInterface />)
    
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
    
    const clearButton = screen.getByText('Clear Chat')
    fireEvent.click(clearButton)
    
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(screen.queryByText('Hi there!')).not.toBeInTheDocument()
    expect(screen.getByText('Ask me about games! I can help you find similar games, compare titles, or discover something new.')).toBeInTheDocument()
    
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('chat-messages')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('conversation-id')
  })

  it('saves messages to localStorage when messages change', async () => {
    ;(apiClient.streamChatResponse as jest.Mock).mockImplementation(
      async (query, filters, onChunk) => {
        onChunk('Test response')
      }
    )

    render(<ChatInterface />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.submit(input.closest('form')!)
    
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'chat-messages',
        expect.stringContaining('Test message')
      )
    })
  })

  it('disables input and button when loading', async () => {
    let resolveStream: (value: void) => void
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve
    })
    
    ;(apiClient.streamChatResponse as jest.Mock).mockImplementation(
      async (query, filters, onChunk) => {
        onChunk('Response')
        await streamPromise
      }
    )

    render(<ChatInterface />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    const submitButton = screen.getByText('Send')
    
    fireEvent.change(input, { target: { value: 'Test' } })
    fireEvent.click(submitButton)
    
    expect(input).toBeDisabled()
    expect(screen.getByText('Sending...')).toBeDisabled()
    
    // Resolve the stream to complete loading
    resolveStream()
    
    await waitFor(() => {
      expect(input).not.toBeDisabled()
    })
    
    // Add text to input to enable the send button
    fireEvent.change(input, { target: { value: 'Another test' } })
    
    expect(screen.getByText('Send')).not.toBeDisabled()
  })

  it('passes filters to API calls', async () => {
    const filters = {
      priceMax: 50,
      platforms: ['PC', 'PlayStation'],
      playtimeMax: 40
    }
    
    ;(apiClient.streamChatResponse as jest.Mock).mockImplementation(
      async (query, filters, onChunk) => {
        onChunk('Filtered response')
      }
    )

    render(<ChatInterface filters={filters} />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    fireEvent.change(input, { target: { value: 'Find games' } })
    fireEvent.submit(input.closest('form')!)
    
    await waitFor(() => {
      expect(apiClient.streamChatResponse).toHaveBeenCalledWith(
        'Find games',
        filters,
        expect.any(Function)
      )
    })
  })

  it('dismisses error when close button is clicked', async () => {
    ;(apiClient.streamChatResponse as jest.Mock).mockRejectedValue(
      new Error('Test error')
    )

    render(<ChatInterface />)
    
    const input = screen.getByPlaceholderText('Ask about games...')
    fireEvent.change(input, { target: { value: 'Test' } })
    fireEvent.submit(input.closest('form')!)
    
    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument()
    })
    
    const closeButton = screen.getByText('×')
    fireEvent.click(closeButton)
    
    expect(screen.queryByText('Test error')).not.toBeInTheDocument()
  })
})