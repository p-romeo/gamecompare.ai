import React from 'react'
import { GameSummary } from '@/lib/types'

interface GameCardProps {
  game: GameSummary
  onCompare?: () => void
}

export function GameCard({ game, onCompare }: GameCardProps) {
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