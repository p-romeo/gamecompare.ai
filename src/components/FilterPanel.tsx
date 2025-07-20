import React, { useState, useEffect } from 'react'
import { FilterState } from '@/lib/types'

interface FilterPanelProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  className?: string
}

const PLATFORMS = [
  'PC',
  'PlayStation',
  'Xbox',
  'Nintendo Switch',
  'iOS',
  'Android',
  'Mac',
  'Linux'
]

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 30 }, (_, i) => CURRENT_YEAR - i)

export function FilterPanel({ filters, onFiltersChange, className = '' }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [localFilters, setLocalFilters] = useState<FilterState>(filters)

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handlePlatformToggle = (platform: string) => {
    const currentPlatforms = localFilters.platforms || []
    const newPlatforms = currentPlatforms.includes(platform)
      ? currentPlatforms.filter(p => p !== platform)
      : [...currentPlatforms, platform]
    
    handleFilterChange('platforms', newPlatforms.length > 0 ? newPlatforms : undefined)
  }

  const handleYearRangeChange = (type: 'min' | 'max', year: number | undefined) => {
    const currentRange = localFilters.yearRange || [undefined, undefined]
    const newRange: [number | undefined, number | undefined] = type === 'min' 
      ? [year, currentRange[1]]
      : [currentRange[0], year]
    
    // Remove undefined values and ensure valid range
    const cleanRange = newRange.filter(y => y !== undefined) as number[]
    if (cleanRange.length === 0) {
      handleFilterChange('yearRange', undefined)
    } else if (cleanRange.length === 1) {
      handleFilterChange('yearRange', type === 'min' ? [cleanRange[0], CURRENT_YEAR] : [1990, cleanRange[0]])
    } else {
      const [min, max] = cleanRange.sort((a, b) => a - b)
      handleFilterChange('yearRange', [min, max])
    }
  }

  const clearFilters = () => {
    const emptyFilters: FilterState = {}
    setLocalFilters(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const hasActiveFilters = Object.keys(localFilters).some(key => {
    const value = localFilters[key as keyof FilterState]
    return value !== undefined && value !== null && 
           (Array.isArray(value) ? value.length > 0 : true)
  })

  return (
    <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`} data-cy="filter-panel">
      {/* Filter Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <h3 className="text-white font-medium">Filters</h3>
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
              data-cy="reset-filters"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors"
            aria-label={isExpanded ? 'Collapse filters' : 'Expand filters'}
            data-cy="filter-toggle"
          >
            <svg
              className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter Content */}
      {isExpanded && (
        <div className="p-4 space-y-6" data-cy="filter-content">
          {/* Price Filter */}
          <div data-cy="price-filter">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Price
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                max="200"
                step="5"
                value={localFilters.priceMax || ''}
                onChange={(e) => handleFilterChange('priceMax', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Any"
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                data-cy="price-max"
              />
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={localFilters.priceMax || 200}
                onChange={(e) => handleFilterChange('priceMax', Number(e.target.value))}
                className="flex-1 accent-blue-600"
              />
            </div>
          </div>

          {/* Playtime Filter */}
          <div data-cy="playtime-filter">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Playtime (hours)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                value={localFilters.playtimeMax || ''}
                onChange={(e) => handleFilterChange('playtimeMax', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Any"
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                data-cy="playtime-max"
              />
              <input
                type="range"
                min="1"
                max="200"
                step="1"
                value={localFilters.playtimeMax || 200}
                onChange={(e) => handleFilterChange('playtimeMax', Number(e.target.value))}
                className="flex-1 accent-blue-600"
              />
            </div>
          </div>

          {/* Year Range Filter */}
          <div data-cy="year-filter">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Release Year
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From</label>
                <select
                  value={localFilters.yearRange?.[0] || ''}
                  onChange={(e) => handleYearRangeChange('min', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  data-cy="year-start"
                >
                  <option value="">Any</option>
                  {YEAR_OPTIONS.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <select
                  value={localFilters.yearRange?.[1] || ''}
                  onChange={(e) => handleYearRangeChange('max', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  data-cy="year-end"
                >
                  <option value="">Any</option>
                  {YEAR_OPTIONS.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Platform Filter */}
          <div data-cy="platform-filter">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Platforms
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map(platform => (
                <label
                  key={platform}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-gray-700 p-2 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={localFilters.platforms?.includes(platform) || false}
                    onChange={() => handlePlatformToggle(platform)}
                    className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    data-cy={`platform-${platform.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                  <span className="text-gray-300 text-sm">{platform}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}