import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FilterPanel } from '../FilterPanel'
import { FilterState } from '@/lib/types'

describe('FilterPanel', () => {
  const mockOnFiltersChange = jest.fn()
  const defaultFilters: FilterState = {}

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders collapsed by default', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    expect(screen.getByText('Filters')).toBeInTheDocument()
    expect(screen.queryByText('Max Price')).not.toBeInTheDocument()
    expect(screen.queryByText('Max Playtime (hours)')).not.toBeInTheDocument()
    expect(screen.queryByText('Release Year')).not.toBeInTheDocument()
    expect(screen.queryByText('Platforms')).not.toBeInTheDocument()
  })

  it('expands when expand button is clicked', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    expect(screen.getByText('Max Price')).toBeInTheDocument()
    expect(screen.getByText('Max Playtime (hours)')).toBeInTheDocument()
    expect(screen.getByText('Release Year')).toBeInTheDocument()
    expect(screen.getByText('Platforms')).toBeInTheDocument()
  })

  it('collapses when collapse button is clicked', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    expect(screen.getByText('Max Price')).toBeInTheDocument()
    
    const collapseButton = screen.getByLabelText('Collapse filters')
    fireEvent.click(collapseButton)
    
    expect(screen.queryByText('Max Price')).not.toBeInTheDocument()
  })

  it('shows active indicator when filters are applied', () => {
    const filtersWithValues: FilterState = {
      priceMax: 50,
      platforms: ['PC', 'PlayStation']
    }
    
    render(<FilterPanel filters={filtersWithValues} onFiltersChange={mockOnFiltersChange} />)
    
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('handles price filter changes', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    // Find the price input by looking for the one with step="5" and min="0"
    const priceInputs = screen.getAllByDisplayValue('')
    const priceInput = priceInputs.find(input => 
      input.getAttribute('type') === 'number' && 
      input.getAttribute('step') === '5' &&
      input.getAttribute('min') === '0'
    )
    fireEvent.change(priceInput!, { target: { value: '75' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ priceMax: 75 })
  })

  it('handles playtime filter changes', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const playtimeInputs = screen.getAllByDisplayValue('')
    const playtimeInput = playtimeInputs.find(input => 
      input.getAttribute('placeholder') === 'Any' && 
      input.getAttribute('max') === '200' &&
      input.getAttribute('min') === '1'
    )
    
    fireEvent.change(playtimeInput!, { target: { value: '40' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ playtimeMax: 40 })
  })

  it('handles platform filter changes', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const pcCheckbox = screen.getByLabelText('PC')
    fireEvent.click(pcCheckbox)
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ platforms: ['PC'] })
  })

  it('handles multiple platform selections', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const pcCheckbox = screen.getByLabelText('PC')
    const playstationCheckbox = screen.getByLabelText('PlayStation')
    
    fireEvent.click(pcCheckbox)
    fireEvent.click(playstationCheckbox)
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ platforms: ['PC'] })
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ platforms: ['PC', 'PlayStation'] })
  })

  it('handles platform deselection', () => {
    const filtersWithPlatforms: FilterState = {
      platforms: ['PC', 'PlayStation']
    }
    
    render(<FilterPanel filters={filtersWithPlatforms} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const pcCheckbox = screen.getByLabelText('PC')
    fireEvent.click(pcCheckbox)
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ platforms: ['PlayStation'] })
  })

  it('handles year range filter changes', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    // Find the "From" year select by looking for the one with "From" label
    const fromLabel = screen.getByText('From')
    const fromYearSelect = fromLabel.parentElement?.querySelector('select')
    fireEvent.change(fromYearSelect!, { target: { value: '2020' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ yearRange: [2020, new Date().getFullYear()] })
  })

  it('clears all filters when clear button is clicked', () => {
    const filtersWithValues: FilterState = {
      priceMax: 50,
      playtimeMax: 40,
      platforms: ['PC', 'PlayStation'],
      yearRange: [2020, 2023]
    }
    
    render(<FilterPanel filters={filtersWithValues} onFiltersChange={mockOnFiltersChange} />)
    
    const clearButton = screen.getByText('Clear')
    fireEvent.click(clearButton)
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({})
  })

  it('updates local state when props change', () => {
    const { rerender } = render(
      <FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />
    )
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    
    const newFilters: FilterState = { priceMax: 100 }
    rerender(<FilterPanel filters={newFilters} onFiltersChange={mockOnFiltersChange} />)
    
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('handles range slider changes for price', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const priceSliders = screen.getAllByDisplayValue('200')
    const priceSlider = priceSliders.find(slider => slider.getAttribute('type') === 'range' && slider.getAttribute('step') === '5')
    fireEvent.change(priceSlider!, { target: { value: '150' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ priceMax: 150 })
  })

  it('handles range slider changes for playtime', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const playtimeSliders = screen.getAllByDisplayValue('200')
    const playtimeSlider = playtimeSliders.find(slider => slider.getAttribute('type') === 'range' && slider.getAttribute('step') === '1')
    fireEvent.change(playtimeSlider!, { target: { value: '120' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ playtimeMax: 120 })
  })

  it('removes filter when value is cleared', () => {
    const filtersWithPrice: FilterState = { priceMax: 50 }
    
    render(<FilterPanel filters={filtersWithPrice} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const priceInputs = screen.getAllByDisplayValue('50')
    const priceInput = priceInputs.find(input => input.getAttribute('type') === 'number')
    fireEvent.change(priceInput!, { target: { value: '' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ priceMax: undefined })
  })

  it('applies custom className', () => {
    const { container } = render(
      <FilterPanel 
        filters={defaultFilters} 
        onFiltersChange={mockOnFiltersChange} 
        className="custom-class"
      />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('shows all platform options', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    const expectedPlatforms = [
      'PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 
      'iOS', 'Android', 'Mac', 'Linux'
    ]
    
    expectedPlatforms.forEach(platform => {
      expect(screen.getByLabelText(platform)).toBeInTheDocument()
    })
  })

  it('handles year range with both min and max values', () => {
    render(<FilterPanel filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />)
    
    const expandButton = screen.getByLabelText('Expand filters')
    fireEvent.click(expandButton)
    
    // Find the "From" and "To" year selects by their labels
    const fromLabel = screen.getByText('From')
    const toLabel = screen.getByText('To')
    const fromYearSelect = fromLabel.parentElement?.querySelector('select')
    const toYearSelect = toLabel.parentElement?.querySelector('select')
    
    fireEvent.change(fromYearSelect!, { target: { value: '2020' } })
    fireEvent.change(toYearSelect!, { target: { value: '2023' } })
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ yearRange: [2020, new Date().getFullYear()] })
    expect(mockOnFiltersChange).toHaveBeenCalledWith({ yearRange: [2020, 2023] })
  })
})