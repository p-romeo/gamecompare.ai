describe('Game Recommendations and Filtering', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-cy=chat-interface]').should('be.visible')
    
    // Clear localStorage
    cy.window().then((win) => {
      win.localStorage.clear()
    })
  })

  it('should display and interact with filter panel', () => {
    // Check that filter panel is visible
    cy.get('[data-cy=filter-panel]').should('be.visible')
    
    // Check price filter
    cy.get('[data-cy=price-filter]').should('be.visible')
    cy.get('[data-cy=price-min]').should('be.visible')
    cy.get('[data-cy=price-max]').should('be.visible')
    
    // Check platform filter
    cy.get('[data-cy=platform-filter]').should('be.visible')
    cy.get('[data-cy=platform-pc]').should('be.visible')
    cy.get('[data-cy=platform-playstation]').should('be.visible')
    cy.get('[data-cy=platform-xbox]').should('be.visible')
    cy.get('[data-cy=platform-nintendo]').should('be.visible')
    
    // Check playtime filter
    cy.get('[data-cy=playtime-filter]').should('be.visible')
    cy.get('[data-cy=playtime-short]').should('be.visible')
    cy.get('[data-cy=playtime-medium]').should('be.visible')
    cy.get('[data-cy=playtime-long]').should('be.visible')
    
    // Check year range filter
    cy.get('[data-cy=year-filter]').should('be.visible')
    cy.get('[data-cy=year-start]').should('be.visible')
    cy.get('[data-cy=year-end]').should('be.visible')
  })

  it('should apply price filters correctly', () => {
    // Set price range
    cy.get('[data-cy=price-min]').clear().type('10')
    cy.get('[data-cy=price-max]').clear().type('50')
    
    // Send a query
    cy.sendChatMessage('Find me some good games')
    cy.waitForChatResponse()
    
    // Check that filters are applied (mock API should receive filter parameters)
    cy.window().then((win) => {
      const savedFilters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
      expect(savedFilters.priceMin).to.equal(10)
      expect(savedFilters.priceMax).to.equal(50)
    })
  })

  it('should apply platform filters correctly', () => {
    // Select specific platforms
    cy.get('[data-cy=platform-pc]').check()
    cy.get('[data-cy=platform-playstation]').check()
    
    // Send a query
    cy.sendChatMessage('Show me RPG games')
    cy.waitForChatResponse()
    
    // Check that platform filters are saved
    cy.window().then((win) => {
      const savedFilters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
      expect(savedFilters.platforms).to.include('PC')
      expect(savedFilters.platforms).to.include('PlayStation')
      expect(savedFilters.platforms).to.not.include('Xbox')
    })
  })

  it('should apply playtime filters correctly', () => {
    // Select playtime preference
    cy.get('[data-cy=playtime-short]').check()
    
    // Send a query
    cy.sendChatMessage('Find me quick games to play')
    cy.waitForChatResponse()
    
    // Check that playtime filter is saved
    cy.window().then((win) => {
      const savedFilters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
      expect(savedFilters.playtime).to.equal('short')
    })
  })

  it('should apply year range filters correctly', () => {
    // Set year range
    cy.get('[data-cy=year-start]').clear().type('2020')
    cy.get('[data-cy=year-end]').clear().type('2024')
    
    // Send a query
    cy.sendChatMessage('What are some recent games?')
    cy.waitForChatResponse()
    
    // Check that year filters are saved
    cy.window().then((win) => {
      const savedFilters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
      expect(savedFilters.yearStart).to.equal(2020)
      expect(savedFilters.yearEnd).to.equal(2024)
    })
  })

  it('should persist filter settings across sessions', () => {
    // Set multiple filters
    cy.get('[data-cy=price-min]').clear().type('20')
    cy.get('[data-cy=platform-pc]').check()
    cy.get('[data-cy=playtime-medium]').check()
    
    // Reload the page
    cy.reload()
    
    // Check that filters are restored
    cy.get('[data-cy=price-min]').should('have.value', '20')
    cy.get('[data-cy=platform-pc]').should('be.checked')
    cy.get('[data-cy=playtime-medium]').should('be.checked')
  })

  it('should clear all filters when reset button is clicked', () => {
    // Set some filters
    cy.get('[data-cy=price-min]').clear().type('15')
    cy.get('[data-cy=platform-xbox]').check()
    cy.get('[data-cy=playtime-long]').check()
    
    // Click reset filters button
    cy.get('[data-cy=reset-filters]').click()
    
    // Check that all filters are cleared
    cy.get('[data-cy=price-min]').should('have.value', '')
    cy.get('[data-cy=platform-xbox]').should('not.be.checked')
    cy.get('[data-cy=playtime-long]').should('not.be.checked')
    
    // Check localStorage is cleared
    cy.window().then((win) => {
      const savedFilters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
      expect(Object.keys(savedFilters)).to.have.length(0)
    })
  })

  it('should display game recommendations with proper information', () => {
    // Mock API response with game data
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here are some great RPG games for you:',
        games: [
          {
            id: '1',
            title: 'The Witcher 3',
            short_description: 'Epic fantasy RPG',
            price_usd: 29.99,
            platforms: ['PC', 'PlayStation', 'Xbox'],
            genres: ['RPG', 'Adventure'],
            metacritic_score: 93,
            steam_app_id: 292030
          },
          {
            id: '2',
            title: 'Cyberpunk 2077',
            short_description: 'Futuristic RPG',
            price_usd: 39.99,
            platforms: ['PC', 'PlayStation', 'Xbox'],
            genres: ['RPG', 'Action'],
            metacritic_score: 86,
            steam_app_id: 1091500
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('gameRecommendations')
    
    // Send query for RPG games
    cy.sendChatMessage('Show me some RPG games')
    cy.wait('@gameRecommendations')
    
    // Check that game cards are displayed
    cy.get('[data-cy=game-card]').should('have.length', 2)
    
    // Check first game card content
    cy.get('[data-cy=game-card]').first().within(() => {
      cy.contains('The Witcher 3').should('be.visible')
      cy.contains('Epic fantasy RPG').should('be.visible')
      cy.contains('$29.99').should('be.visible')
      cy.contains('93').should('be.visible') // Metacritic score
      cy.get('[data-cy=platform-badge]').should('contain', 'PC')
      cy.get('[data-cy=genre-badge]').should('contain', 'RPG')
    })
    
    // Check second game card content
    cy.get('[data-cy=game-card]').last().within(() => {
      cy.contains('Cyberpunk 2077').should('be.visible')
      cy.contains('Futuristic RPG').should('be.visible')
      cy.contains('$39.99').should('be.visible')
      cy.contains('86').should('be.visible')
    })
  })

  it('should handle game comparison requests', () => {
    // Mock comparison API response
    cy.intercept('POST', '**/api/compare', {
      statusCode: 200,
      body: {
        comparison: 'Here\'s a detailed comparison between The Witcher 3 and Cyberpunk 2077...',
        leftGame: {
          id: '1',
          title: 'The Witcher 3',
          short_description: 'Epic fantasy RPG'
        },
        rightGame: {
          id: '2',
          title: 'Cyberpunk 2077',
          short_description: 'Futuristic RPG'
        }
      }
    }).as('gameComparison')
    
    // Send comparison request
    cy.sendChatMessage('Compare The Witcher 3 and Cyberpunk 2077')
    cy.wait('@gameComparison')
    
    // Check that comparison is displayed
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('detailed comparison').should('be.visible')
      cy.contains('The Witcher 3').should('be.visible')
      cy.contains('Cyberpunk 2077').should('be.visible')
    })
  })

  it('should handle empty search results gracefully', () => {
    // Mock empty results
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'I couldn\'t find any games matching your criteria. Try adjusting your filters.',
        games: [],
        conversation_id: 'test-conversation'
      }
    }).as('emptyResults')
    
    // Send query with very restrictive filters
    cy.get('[data-cy=price-max]').clear().type('1')
    cy.sendChatMessage('Find me games under $1')
    cy.wait('@emptyResults')
    
    // Check that appropriate message is displayed
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('couldn\'t find any games').should('be.visible')
    })
    
    // Check that no game cards are displayed
    cy.get('[data-cy=game-card]').should('not.exist')
  })
})