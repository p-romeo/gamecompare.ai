import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GameCard } from '../GameCard'
import { GameSummary } from '@/lib/types'
import { apiClient } from '@/lib/api-client'

// Mock the API client
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    trackClick: jest.fn(),
  },
}))

// Mock window.open
const mockWindowOpen = jest.fn()
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
})

describe('GameCard', () => {
  const mockGame: GameSummary = {
    id: 'game-123',
    title: 'Test Game',
    price: 29.99,
    score: 85,
    platforms: ['PC', 'PlayStation', 'Xbox'],
    storeLinks: [
      { store: 'steam', url: 'https://store.steampowered.com/app/123' },
      { store: 'epic', url: 'https://store.epicgames.com/game/123' },
      { store: 'gog', url: 'https://www.gog.com/game/123' }
    ]
  }

  const mockOnCompare = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockWindowOpen.mockClear()
  })

  it('renders game information correctly', () => {
    render(<GameCard game={mockGame} />)
    
    expect(screen.getByText('Test Game')).toBeInTheDocument()
    expect(screen.getByText('$29.99')).toBeInTheDocument()
    expect(screen.getByText('⭐ 85/100')).toBeInTheDocument()
    expect(screen.getByText('PC')).toBeInTheDocument()
    expect(screen.getByText('PlayStation')).toBeInTheDocument()
    expect(screen.getByText('Xbox')).toBeInTheDocument()
  })

  it('formats free games correctly', () => {
    const freeGame = { ...mockGame, price: 0 }
    render(<GameCard game={freeGame} />)
    
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('formats games with no score correctly', () => {
    const noScoreGame = { ...mockGame, score: 0 }
    render(<GameCard game={noScoreGame} />)
    
    expect(screen.getByText('⭐ N/A')).toBeInTheDocument()
  })

  it('renders store links when available', () => {
    render(<GameCard game={mockGame} />)
    
    expect(screen.getByText('Available on:')).toBeInTheDocument()
    expect(screen.getByText('Steam')).toBeInTheDocument()
    expect(screen.getByText('Epic')).toBeInTheDocument()
    expect(screen.getByText('Gog')).toBeInTheDocument()
  })

  it('does not render store links section when no links available', () => {
    const gameWithoutLinks = { ...mockGame, storeLinks: undefined }
    render(<GameCard game={gameWithoutLinks} />)
    
    expect(screen.queryByText('Available on:')).not.toBeInTheDocument()
  })

  it('does not render store links section when links array is empty', () => {
    const gameWithEmptyLinks = { ...mockGame, storeLinks: [] }
    render(<GameCard game={gameWithEmptyLinks} />)
    
    expect(screen.queryByText('Available on:')).not.toBeInTheDocument()
  })

  it('tracks clicks and opens store links', async () => {
    ;(apiClient.trackClick as jest.Mock).mockResolvedValue(undefined)
    
    render(<GameCard game={mockGame} />)
    
    const steamButton = screen.getByText('Steam')
    fireEvent.click(steamButton)
    
    await waitFor(() => {
      expect(apiClient.trackClick).toHaveBeenCalledWith('game-123', 'steam')
    })
    
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://store.steampowered.com/app/123',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('opens store link even when tracking fails', async () => {
    ;(apiClient.trackClick as jest.Mock).mockRejectedValue(new Error('Tracking failed'))
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    render(<GameCard game={mockGame} />)
    
    const epicButton = screen.getByText('Epic')
    fireEvent.click(epicButton)
    
    await waitFor(() => {
      expect(apiClient.trackClick).toHaveBeenCalledWith('game-123', 'epic')
    })
    
    expect(consoleSpy).toHaveBeenCalledWith('Failed to track click:', expect.any(Error))
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://store.epicgames.com/game/123',
      '_blank',
      'noopener,noreferrer'
    )
    
    consoleSpy.mockRestore()
  })

  it('applies correct store colors and icons', () => {
    render(<GameCard game={mockGame} />)
    
    const steamButton = screen.getByText('Steam').closest('button')
    const epicButton = screen.getByText('Epic').closest('button')
    const gogButton = screen.getByText('Gog').closest('button')
    
    expect(steamButton).toHaveClass('bg-blue-600', 'hover:bg-blue-700')
    expect(epicButton).toHaveClass('bg-gray-600', 'hover:bg-gray-700')
    expect(gogButton).toHaveClass('bg-purple-600', 'hover:bg-purple-700')
  })

  it('uses default colors for unknown stores', () => {
    const gameWithUnknownStore = {
      ...mockGame,
      storeLinks: [{ store: 'unknown', url: 'https://unknown.com' }]
    }
    
    render(<GameCard game={gameWithUnknownStore} />)
    
    const unknownButton = screen.getByText('Unknown').closest('button')
    expect(unknownButton).toHaveClass('bg-gray-600', 'hover:bg-gray-700')
  })

  it('shows compare button when onCompare is provided', () => {
    render(<GameCard game={mockGame} onCompare={mockOnCompare} />)
    
    const compareButton = screen.getByText('Compare')
    expect(compareButton).toBeInTheDocument()
    
    fireEvent.click(compareButton)
    expect(mockOnCompare).toHaveBeenCalled()
  })

  it('does not show compare button when onCompare is not provided', () => {
    render(<GameCard game={mockGame} />)
    
    expect(screen.queryByText('Compare')).not.toBeInTheDocument()
  })

  it('shows view details button', () => {
    render(<GameCard game={mockGame} />)
    
    expect(screen.getByText('View Details')).toBeInTheDocument()
  })

  it('handles store names with proper capitalization', () => {
    const gameWithMixedCaseStore = {
      ...mockGame,
      storeLinks: [{ store: 'playStation', url: 'https://playstation.com' }]
    }
    
    render(<GameCard game={gameWithMixedCaseStore} />)
    
    expect(screen.getByText('Playstation')).toBeInTheDocument()
  })

  it('shows correct tooltip for store buttons', () => {
    render(<GameCard game={mockGame} />)
    
    const steamButton = screen.getByTitle('Buy on steam')
    const epicButton = screen.getByTitle('Buy on epic')
    const gogButton = screen.getByTitle('Buy on gog')
    
    expect(steamButton).toBeInTheDocument()
    expect(epicButton).toBeInTheDocument()
    expect(gogButton).toBeInTheDocument()
  })

  it('handles multiple clicks on the same store link', async () => {
    ;(apiClient.trackClick as jest.Mock).mockResolvedValue(undefined)
    
    render(<GameCard game={mockGame} />)
    
    const steamButton = screen.getByText('Steam')
    
    fireEvent.click(steamButton)
    fireEvent.click(steamButton)
    
    await waitFor(() => {
      expect(apiClient.trackClick).toHaveBeenCalledTimes(2)
    })
    
    expect(mockWindowOpen).toHaveBeenCalledTimes(2)
  })

  it('formats price with correct currency symbol', () => {
    const expensiveGame = { ...mockGame, price: 59.99 }
    render(<GameCard game={expensiveGame} />)
    
    expect(screen.getByText('$59.99')).toBeInTheDocument()
  })

  it('handles games with long titles', () => {
    const longTitleGame = {
      ...mockGame,
      title: 'This is a Very Long Game Title That Should Be Truncated Properly'
    }
    
    render(<GameCard game={longTitleGame} />)
    
    const titleElement = screen.getByText(longTitleGame.title)
    expect(titleElement).toHaveClass('line-clamp-2')
  })

  it('handles games with many platforms', () => {
    const multiPlatformGame = {
      ...mockGame,
      platforms: ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'iOS', 'Android']
    }
    
    render(<GameCard game={multiPlatformGame} />)
    
    multiPlatformGame.platforms.forEach(platform => {
      expect(screen.getByText(platform)).toBeInTheDocument()
    })
  })
})