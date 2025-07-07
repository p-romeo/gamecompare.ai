import React, { useState, useEffect } from 'react'
import { GameSummary } from '@/lib/types'
import { trackClick, getGameDetails } from '@/lib/api-client'

interface GameCardProps {
  game: GameSummary
  onCompare?: () => void
}

interface StoreLink {
  store: string
  url: string
}

export function GameCard({ game, onCompare }: GameCardProps) {
  const [storeLinks, setStoreLinks] = useState<StoreLink[]>([])
  const [showStores, setShowStores] = useState(false)

  // Get store links when component mounts
  useEffect(() => {
    // For now, create mock store links since we don't have store_links populated yet
    // This will be replaced with actual data from getGameDetails once store links are ingested
    const mockStores = ['steam', 'epic', 'gog'].map(store => ({
      store,
      url: trackClick(game.id, store)
    }))
    setStoreLinks(mockStores)
  }, [game.id])

  const handleStoreClick = (storeUrl: string) => {
    // Open store link in new tab (trackClick URL handles the redirect)
    window.open(storeUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-lg hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-semibold text-white mb-2">{game.title}</h3>
      <div className="flex justify-between items-center mb-2">
        <span className="text-green-400 font-medium">
          ${game.price.toFixed(2)}
        </span>
        <span className="text-yellow-400">
          ⭐ {game.score}/100
        </span>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {game.platforms.map((platform) => (
          <span
            key={platform}
            className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
          >
            {platform}
          </span>
        ))}
      </div>
      
      {/* Store Links Section */}
      {showStores && storeLinks.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-2">Buy from:</p>
          <div className="flex gap-2">
            {storeLinks.map((link) => (
              <button
                key={link.store}
                onClick={() => handleStoreClick(link.url)}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors capitalize"
              >
                {link.store}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button 
          onClick={() => setShowStores(!showStores)}
          className="flex-1 bg-blue-600 text-white py-2 px-3 rounded hover:bg-blue-700 transition-colors text-sm"
        >
          {showStores ? 'Hide Stores' : 'Buy Game'}
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