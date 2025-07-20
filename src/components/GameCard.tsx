import React from 'react'
import { GameSummary } from '@/lib/types'
import { apiClient } from '@/lib/api-client'

interface GameCardProps {
  game: GameSummary
  onCompare?: () => void
}

const STORE_ICONS: Record<string, string> = {
  steam: '🎮',
  epic: '🎯',
  gog: '🎲',
  playstation: '🎮',
  xbox: '🎮',
  nintendo: '🎮',
  origin: '🎮',
  uplay: '🎮'
}

const STORE_COLORS: Record<string, string> = {
  steam: 'bg-blue-600 hover:bg-blue-700',
  epic: 'bg-gray-600 hover:bg-gray-700',
  gog: 'bg-purple-600 hover:bg-purple-700',
  playstation: 'bg-blue-700 hover:bg-blue-800',
  xbox: 'bg-green-600 hover:bg-green-700',
  nintendo: 'bg-red-600 hover:bg-red-700',
  origin: 'bg-orange-600 hover:bg-orange-700',
  uplay: 'bg-indigo-600 hover:bg-indigo-700'
}

export function GameCard({ game, onCompare }: GameCardProps) {
  const handleStoreClick = async (store: string, url: string) => {
    try {
      // Track the click
      await apiClient.trackClick(game.id, store)
      
      // Open the store link in a new tab
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Failed to track click:', error)
      // Still open the link even if tracking fails
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const formatPrice = (price: number) => {
    if (price === 0) return 'Free'
    return `$${price.toFixed(2)}`
  }

  const formatScore = (score: number) => {
    if (score === 0) return 'N/A'
    return `${score}/100`
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-lg hover:shadow-xl transition-shadow" data-cy="game-card">
      <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">{game.title}</h3>
      
      <div className="flex justify-between items-center mb-3">
        <span className={`font-medium ${game.price === 0 ? 'text-green-400' : 'text-green-400'}`} data-cy="price">
          ${formatPrice(game.price)}
        </span>
        <span className="text-yellow-400 flex items-center">
          ⭐ {formatScore(game.score)}
        </span>
      </div>
      
      <div className="flex flex-wrap gap-1 mb-3">
        {game.platforms.map((platform) => (
          <span
            key={platform}
            className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
            data-cy="platform-badge"
          >
            {platform}
          </span>
        ))}
      </div>

      {/* Store Links */}
      {game.storeLinks && game.storeLinks.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-2">Available on:</p>
          <div className="flex flex-wrap gap-1">
            {game.storeLinks.map((storeLink) => (
              <button
                key={storeLink.store}
                onClick={() => handleStoreClick(storeLink.store, storeLink.url)}
                className={`text-xs px-2 py-1 rounded text-white transition-colors flex items-center gap-1 ${
                  STORE_COLORS[storeLink.store.toLowerCase()] || 'bg-gray-600 hover:bg-gray-700'
                }`}
                title={`Buy on ${storeLink.store}`}
                data-cy={`store-link-${storeLink.store.toLowerCase()}`}
              >
                <span>{STORE_ICONS[storeLink.store.toLowerCase()] || '🛒'}</span>
                <span className="capitalize">{storeLink.store}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex gap-2">
        <button className="flex-1 bg-blue-600 text-white py-2 px-3 rounded hover:bg-blue-700 transition-colors text-sm">
          View Details
        </button>
        {onCompare && (
          <button
            onClick={onCompare}
            className="flex-1 bg-gray-700 text-white py-2 px-3 rounded hover:bg-gray-600 transition-colors text-sm"
          >
            Compare
          </button>
        )}
      </div>
    </div>
  )
}