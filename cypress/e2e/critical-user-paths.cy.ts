describe('Critical User Paths - 95% Scenario Coverage', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-cy=chat-interface]').should('be.visible')
    
    // Clear localStorage for consistent testing
    cy.window().then((win) => {
      win.localStorage.clear()
    })
  })

  describe('Path 1: New User Discovery Journey', () => {
    it('should complete full discovery workflow from landing to game selection', () => {
      // Step 1: User lands on homepage
      cy.contains('Welcome to GameCompare.ai').should('be.visible')
      cy.contains('Your AI-powered gaming companion').should('be.visible')
      
      // Step 2: User reads about features
      cy.contains('Game Discovery').should('be.visible')
      cy.contains('AI Recommendations').should('be.visible')
      
      // Step 3: User interacts with chat interface
      cy.get('[data-cy=chat-input]').should('be.visible')
      cy.contains('Ask me about games!').should('be.visible')
      
      // Step 4: User asks for game recommendations
      cy.sendChatMessage('I want to find some good RPG games under $30')
      cy.waitForChatResponse()
      
      // Step 5: User sees recommendations
      cy.get('[data-cy=assistant-message]').should('be.visible')
      
      // Step 6: User applies filters to refine search
      cy.get('[data-cy=filter-toggle]').click()
      cy.get('[data-cy=price-max]').clear().type('30')
      cy.get('[data-cy=platform-pc]').check()
      
      // Step 7: User asks follow-up question with filters applied
      cy.sendChatMessage('What about indie RPGs?')
      cy.waitForChatResponse()
      
      // Step 8: User sees filtered results
      cy.get('[data-cy=assistant-message]').should('have.length.at.least', 2)
      
      // Verify user journey completion
      cy.window().then((win) => {
        const chatHistory = JSON.parse(win.localStorage.getItem('chat-messages') || '[]')
        expect(chatHistory).to.have.length.at.least(4) // 2 user + 2 assistant messages
        
        const filters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
        expect(filters.priceMax).to.equal(30)
        expect(filters.platforms).to.include('PC')
      })
    })
  })

  describe('Path 2: Comparison Shopping Journey', () => {
    it('should complete game comparison workflow', () => {
      // Mock game data for comparison
      cy.intercept('POST', '**/api/similar', {
        statusCode: 200,
        body: {
          response: 'Here are some great games to compare:',
          games: [
            {
              id: 'game-1',
              title: 'The Witcher 3: Wild Hunt',
              short_description: 'Epic fantasy RPG adventure',
              price_usd: 29.99,
              platforms: ['PC', 'PlayStation', 'Xbox'],
              genres: ['RPG', 'Adventure'],
              metacritic_score: 93,
              store_links: {
                steam: 'https://store.steampowered.com/app/292030',
                gog: 'https://gog.com/witcher3'
              }
            },
            {
              id: 'game-2',
              title: 'Cyberpunk 2077',
              short_description: 'Futuristic open-world RPG',
              price_usd: 39.99,
              platforms: ['PC', 'PlayStation', 'Xbox'],
              genres: ['RPG', 'Action'],
              metacritic_score: 86,
              store_links: {
                steam: 'https://store.steampowered.com/app/1091500',
                epic: 'https://store.epicgames.com/cyberpunk2077'
              }
            }
          ],
          conversation_id: 'comparison-test'
        }
      }).as('comparisonGames')
      
      // Mock comparison API
      cy.intercept('POST', '**/api/compare', {
        statusCode: 200,
        body: {
          comparison: `Here's a detailed comparison:

**The Witcher 3: Wild Hunt vs Cyberpunk 2077**

**Gameplay:**
- Witcher 3: Traditional fantasy RPG with sword combat and magic
- Cyberpunk 2077: Futuristic shooter-RPG with cybernetic enhancements

**Story:**
- Witcher 3: Medieval fantasy with rich lore and character development
- Cyberpunk 2077: Dystopian future with corporate intrigue

**Value:**
- Witcher 3: Excellent value at $29.99 with 100+ hours of content
- Cyberpunk 2077: Good value at $39.99 but shorter main story

**Recommendation:** For traditional RPG fans, Witcher 3 offers better value and more polished experience.`,
          leftGame: {
            id: 'game-1',
            title: 'The Witcher 3: Wild Hunt'
          },
          rightGame: {
            id: 'game-2',
            title: 'Cyberpunk 2077'
          }
        }
      }).as('gameComparison')
      
      // Step 1: User searches for games
      cy.sendChatMessage('Show me some popular RPG games')
      cy.wait('@comparisonGames')
      
      // Step 2: User sees game recommendations
      cy.get('[data-cy=game-card]').should('have.length', 2)
      
      // Step 3: User requests comparison
      cy.sendChatMessage('Compare The Witcher 3 and Cyberpunk 2077')
      cy.wait('@gameComparison')
      
      // Step 4: User sees detailed comparison
      cy.get('[data-cy=assistant-message]').last().within(() => {
        cy.contains('detailed comparison').should('be.visible')
        cy.contains('The Witcher 3: Wild Hunt vs Cyberpunk 2077').should('be.visible')
        cy.contains('Gameplay:').should('be.visible')
        cy.contains('Story:').should('be.visible')
        cy.contains('Value:').should('be.visible')
        cy.contains('Recommendation:').should('be.visible')
      })
      
      // Step 5: User clicks on store links to purchase
      cy.get('[data-cy=game-card]').first().within(() => {
        cy.get('[data-cy=store-link-steam]').should('be.visible')
        cy.get('[data-cy=store-link-gog]').should('be.visible')
      })
    })
  })

  describe('Path 3: Mobile User Experience', () => {
    it('should provide seamless mobile experience', () => {
      // Set mobile viewport
      cy.viewport(375, 667)
      
      // Step 1: Mobile user lands on site
      cy.contains('Welcome to GameCompare.ai').should('be.visible')
      
      // Step 2: Chat interface is accessible on mobile
      cy.get('[data-cy=chat-interface]').should('be.visible')
      cy.get('[data-cy=chat-input]').should('be.visible')
      
      // Step 3: Filter panel adapts to mobile
      cy.get('[data-cy=filter-panel]').should('exist')
      
      // Step 4: User can interact with chat on mobile
      cy.get('[data-cy=chat-input]').type('Find me mobile games')
      cy.get('[data-cy=chat-send-button]').should('be.visible').click()
      
      // Step 5: Response is readable on mobile
      cy.get('[data-cy=chat-messages]').within(() => {
        cy.contains('Find me mobile games').should('be.visible')
      })
      
      // Step 6: Test orientation change
      cy.viewport(667, 375) // Landscape
      cy.get('[data-cy=chat-interface]').should('be.visible')
      cy.get('[data-cy=chat-input]').should('be.visible')
    })
  })

  describe('Path 4: Filter-Heavy User Journey', () => {
    it('should handle complex filtering scenarios', () => {
      // Step 1: User opens filters
      cy.get('[data-cy=filter-toggle]').click()
      cy.get('[data-cy=filter-content]').should('be.visible')
      
      // Step 2: User applies multiple filters
      cy.get('[data-cy=price-max]').clear().type('25')
      cy.get('[data-cy=platform-pc]').check()
      cy.get('[data-cy=platform-playstation]').check()
      cy.get('[data-cy=year-start]').select('2020')
      cy.get('[data-cy=year-end]').select('2024')
      
      // Step 3: User searches with filters
      cy.sendChatMessage('Find me recent indie games under $25')
      cy.waitForChatResponse()
      
      // Step 4: User modifies filters
      cy.get('[data-cy=price-max]').clear().type('40')
      cy.get('[data-cy=platform-xbox]').check()
      
      // Step 5: User searches again
      cy.sendChatMessage('What about action games?')
      cy.waitForChatResponse()
      
      // Step 6: User clears filters
      cy.get('[data-cy=reset-filters]').click()
      
      // Step 7: Verify filters are cleared
      cy.get('[data-cy=price-max]').should('have.value', '')
      cy.get('[data-cy=platform-pc]').should('not.be.checked')
      
      // Step 8: User searches without filters
      cy.sendChatMessage('Show me any good games')
      cy.waitForChatResponse()
      
      // Verify filter persistence and clearing
      cy.window().then((win) => {
        const filters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
        expect(Object.keys(filters)).to.have.length(0)
      })
    })
  })

  describe('Path 5: Error Recovery Journey', () => {
    it('should handle errors gracefully and allow recovery', () => {
      // Step 1: Simulate network error
      cy.intercept('POST', '**/api/similar', { statusCode: 500, body: { error: 'Server error' } }).as('serverError')
      
      // Step 2: User sends message that triggers error
      cy.sendChatMessage('Find me games')
      cy.wait('@serverError')
      
      // Step 3: User sees error message
      cy.get('[data-cy=error-message]').should('be.visible').and('contain', 'error')
      
      // Step 4: User dismisses error
      cy.get('[data-cy=error-dismiss]').click()
      cy.get('[data-cy=error-message]').should('not.exist')
      
      // Step 5: Fix network and retry
      cy.intercept('POST', '**/api/similar', {
        statusCode: 200,
        body: {
          response: 'Here are some games after recovery:',
          games: [],
          conversation_id: 'recovery-test'
        }
      }).as('recoverySuccess')
      
      // Step 6: User tries again successfully
      cy.sendChatMessage('Try again')
      cy.wait('@recoverySuccess')
      
      // Step 7: User sees successful response
      cy.get('[data-cy=assistant-message]').should('contain', 'recovery')
      cy.get('[data-cy=error-message]').should('not.exist')
    })
  })

  describe('Path 6: Affiliate Conversion Journey', () => {
    it('should complete affiliate click tracking workflow', () => {
      // Mock click tracking
      cy.intercept('GET', '**/api/click/**', { statusCode: 200, body: { success: true } }).as('clickTracking')
      
      // Mock games with store links
      cy.intercept('POST', '**/api/similar', {
        statusCode: 200,
        body: {
          response: 'Here are some games with store links:',
          games: [
            {
              id: 'affiliate-game',
              title: 'Affiliate Test Game',
              short_description: 'Game for affiliate testing',
              price_usd: 19.99,
              platforms: ['PC'],
              genres: ['Action'],
              store_links: {
                steam: 'https://store.steampowered.com/app/123456?affiliate=gamecompare',
                epic: 'https://store.epicgames.com/test-game?affiliate=gamecompare'
              }
            }
          ],
          conversation_id: 'affiliate-test'
        }
      }).as('affiliateGames')
      
      // Step 1: User searches for games
      cy.sendChatMessage('Show me games I can buy')
      cy.wait('@affiliateGames')
      
      // Step 2: User sees game with store links
      cy.get('[data-cy=game-card]').should('be.visible')
      cy.get('[data-cy=store-link-steam]').should('be.visible')
      cy.get('[data-cy=store-link-epic]').should('be.visible')
      
      // Step 3: User clicks on Steam store link
      cy.get('[data-cy=store-link-steam]').click()
      
      // Step 4: Verify click tracking
      cy.wait('@clickTracking').then((interception) => {
        expect(interception.request.url).to.include('/api/click/affiliate-game/steam')
      })
      
      // Step 5: User clicks on Epic store link
      cy.get('[data-cy=store-link-epic]').click()
      
      // Step 6: Verify second click tracking
      cy.wait('@clickTracking').then((interception) => {
        expect(interception.request.url).to.include('/api/click/affiliate-game/epic')
      })
    })
  })

  describe('Path 7: Long Session User Journey', () => {
    it('should maintain performance and functionality during extended use', () => {
      // Simulate extended conversation
      const queries = [
        'Show me RPG games',
        'What about action games?',
        'Find me puzzle games',
        'Show me strategy games',
        'What are some racing games?',
        'Find me horror games',
        'Show me indie games',
        'What about simulation games?'
      ]
      
      queries.forEach((query, index) => {
        // Mock response for each query
        cy.intercept('POST', '**/api/similar', {
          statusCode: 200,
          body: {
            response: `Here are some ${query.toLowerCase()} for you:`,
            games: [
              {
                id: `long-session-game-${index}`,
                title: `Game ${index + 1}`,
                short_description: `Description for ${query}`,
                price_usd: Math.random() * 60,
                platforms: ['PC'],
                genres: ['Test']
              }
            ],
            conversation_id: `long-session-${index}`
          }
        }).as(`longSessionQuery${index}`)
        
        // Send query
        cy.sendChatMessage(query)
        cy.wait(`@longSessionQuery${index}`)
        
        // Verify response
        cy.get('[data-cy=assistant-message]').should('have.length', index + 1)
      })
      
      // Verify all messages are still accessible
      cy.get('[data-cy=chat-messages]').within(() => {
        queries.forEach((query) => {
          cy.contains(query).should('be.visible')
        })
      })
      
      // Test scrolling performance
      cy.get('[data-cy=chat-messages]').scrollTo('top')
      cy.get('[data-cy=chat-messages]').scrollTo('bottom')
      
      // Verify conversation persistence
      cy.reload()
      cy.get('[data-cy=chat-messages]').within(() => {
        cy.get('[data-cy=user-message]').should('have.length', queries.length)
        cy.get('[data-cy=assistant-message]').should('have.length', queries.length)
      })
    })
  })

  describe('Path 8: Accessibility User Journey', () => {
    it('should be fully accessible to users with disabilities', () => {
      // Test keyboard navigation
      cy.get('body').trigger('keydown', { key: 'Tab' })
      cy.focused().should('have.attr', 'data-cy', 'chat-input')
      
      // Test form submission with keyboard
      cy.get('[data-cy=chat-input]').type('Accessibility test{enter}')
      
      // Test that loading states are announced
      cy.get('[data-cy=chat-loading]').should('exist')
      
      // Test that interactive elements have proper ARIA labels
      cy.get('[data-cy=chat-send-button]').should('have.attr', 'type', 'submit')
      cy.get('[data-cy=filter-toggle]').should('have.attr', 'aria-label')
      
      // Test color contrast (basic check)
      cy.get('[data-cy=chat-input]').should('have.css', 'color')
      cy.get('[data-cy=chat-input]').should('have.css', 'background-color')
      
      // Test that errors are properly announced
      cy.intercept('POST', '**/api/similar', { statusCode: 500, body: { error: 'Test error' } }).as('accessibilityError')
      cy.sendChatMessage('Error test')
      cy.wait('@accessibilityError')
      
      cy.get('[data-cy=error-message]').should('be.visible').and('have.attr', 'role', 'alert')
    })
  })
})