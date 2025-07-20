describe('Affiliate Link Tracking', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-cy=chat-interface]').should('be.visible')
    
    // Clear localStorage
    cy.window().then((win) => {
      win.localStorage.clear()
    })
  })

  it('should display store links on game cards', () => {
    // Mock API response with game data including store links
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here are some great games:',
        games: [
          {
            id: '1',
            title: 'Test Game',
            short_description: 'A test game',
            price_usd: 19.99,
            platforms: ['PC'],
            genres: ['Action'],
            steam_app_id: 123456,
            store_links: {
              steam: 'https://store.steampowered.com/app/123456',
              epic: 'https://store.epicgames.com/test-game',
              gog: 'https://gog.com/test-game'
            }
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('gamesWithStoreLinks')
    
    // Send query
    cy.sendChatMessage('Show me some games')
    cy.wait('@gamesWithStoreLinks')
    
    // Check that store links are displayed
    cy.get('[data-cy=game-card]').first().within(() => {
      cy.get('[data-cy=store-link-steam]').should('be.visible').and('contain', 'Steam')
      cy.get('[data-cy=store-link-epic]').should('be.visible').and('contain', 'Epic')
      cy.get('[data-cy=store-link-gog]').should('be.visible').and('contain', 'GOG')
    })
  })

  it('should track clicks on store links', () => {
    // Mock click tracking API
    cy.intercept('GET', '**/api/click/**', {
      statusCode: 200,
      body: { success: true }
    }).as('clickTracking')
    
    // Mock game data
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here\'s a game for you:',
        games: [
          {
            id: 'game-123',
            title: 'Test Game',
            short_description: 'A test game',
            price_usd: 19.99,
            platforms: ['PC'],
            genres: ['Action'],
            steam_app_id: 123456,
            store_links: {
              steam: 'https://store.steampowered.com/app/123456'
            }
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('gameData')
    
    // Send query and get game
    cy.sendChatMessage('Show me a game')
    cy.wait('@gameData')
    
    // Click on Steam store link
    cy.get('[data-cy=store-link-steam]').click()
    
    // Verify click tracking API was called
    cy.wait('@clickTracking').then((interception) => {
      expect(interception.request.url).to.include('/api/click/game-123/steam')
    })
  })

  it('should handle click tracking failures gracefully', () => {
    // Mock click tracking API failure
    cy.intercept('GET', '**/api/click/**', {
      statusCode: 500,
      body: { error: 'Tracking failed' }
    }).as('clickTrackingError')
    
    // Mock game data
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here\'s a game for you:',
        games: [
          {
            id: 'game-456',
            title: 'Another Test Game',
            short_description: 'Another test game',
            price_usd: 29.99,
            platforms: ['PC'],
            genres: ['RPG'],
            steam_app_id: 789012,
            store_links: {
              steam: 'https://store.steampowered.com/app/789012'
            }
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('gameData2')
    
    // Send query and get game
    cy.sendChatMessage('Show me another game')
    cy.wait('@gameData2')
    
    // Click on Steam store link
    cy.get('[data-cy=store-link-steam]').click()
    
    // Verify click tracking was attempted
    cy.wait('@clickTrackingError')
    
    // User should still be redirected despite tracking failure
    // (This would normally open a new tab, but in Cypress we just verify the click was handled)
    cy.get('[data-cy=store-link-steam]').should('be.visible')
  })

  it('should generate proper affiliate URLs', () => {
    // Mock game data with affiliate parameters
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here are some games with affiliate links:',
        games: [
          {
            id: 'affiliate-game',
            title: 'Affiliate Test Game',
            short_description: 'Game with affiliate links',
            price_usd: 39.99,
            platforms: ['PC'],
            genres: ['Strategy'],
            steam_app_id: 555666,
            store_links: {
              steam: 'https://store.steampowered.com/app/555666?affiliate_id=gamecompare',
              epic: 'https://store.epicgames.com/affiliate-test-game?epic_affiliate=gamecompare',
              gog: 'https://gog.com/affiliate-test-game?affiliate=gamecompare'
            }
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('affiliateGames')
    
    // Send query
    cy.sendChatMessage('Show me games with affiliate links')
    cy.wait('@affiliateGames')
    
    // Check that affiliate parameters are present in links
    cy.get('[data-cy=game-card]').first().within(() => {
      cy.get('[data-cy=store-link-steam]')
        .should('have.attr', 'href')
        .and('include', 'affiliate_id=gamecompare')
      
      cy.get('[data-cy=store-link-epic]')
        .should('have.attr', 'href')
        .and('include', 'epic_affiliate=gamecompare')
      
      cy.get('[data-cy=store-link-gog]')
        .should('have.attr', 'href')
        .and('include', 'affiliate=gamecompare')
    })
  })

  it('should open store links in new tabs', () => {
    // Mock game data
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here\'s a game:',
        games: [
          {
            id: 'new-tab-game',
            title: 'New Tab Test Game',
            short_description: 'Game to test new tab opening',
            price_usd: 24.99,
            platforms: ['PC'],
            genres: ['Indie'],
            steam_app_id: 777888,
            store_links: {
              steam: 'https://store.steampowered.com/app/777888'
            }
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('newTabGame')
    
    // Send query
    cy.sendChatMessage('Show me a game for new tab test')
    cy.wait('@newTabGame')
    
    // Check that store links have target="_blank" and rel="noopener noreferrer"
    cy.get('[data-cy=store-link-steam]')
      .should('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener noreferrer')
  })

  it('should display pricing information correctly', () => {
    // Mock game data with various pricing scenarios
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here are games with different pricing:',
        games: [
          {
            id: 'free-game',
            title: 'Free Game',
            short_description: 'A free-to-play game',
            price_usd: 0,
            platforms: ['PC'],
            genres: ['Free to Play']
          },
          {
            id: 'paid-game',
            title: 'Paid Game',
            short_description: 'A premium game',
            price_usd: 59.99,
            platforms: ['PC'],
            genres: ['AAA']
          },
          {
            id: 'sale-game',
            title: 'On Sale Game',
            short_description: 'A game on sale',
            price_usd: 19.99,
            original_price_usd: 39.99,
            platforms: ['PC'],
            genres: ['Indie']
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('pricingGames')
    
    // Send query
    cy.sendChatMessage('Show me games with different prices')
    cy.wait('@pricingGames')
    
    // Check free game pricing
    cy.get('[data-cy=game-card]').first().within(() => {
      cy.contains('Free Game').should('be.visible')
      cy.get('[data-cy=price]').should('contain', 'Free')
    })
    
    // Check paid game pricing
    cy.get('[data-cy=game-card]').eq(1).within(() => {
      cy.contains('Paid Game').should('be.visible')
      cy.get('[data-cy=price]').should('contain', '$59.99')
    })
    
    // Check sale game pricing
    cy.get('[data-cy=game-card]').last().within(() => {
      cy.contains('On Sale Game').should('be.visible')
      cy.get('[data-cy=price-current]').should('contain', '$19.99')
      cy.get('[data-cy=price-original]').should('contain', '$39.99')
      cy.get('[data-cy=discount-badge]').should('be.visible')
    })
  })

  it('should track multiple store clicks for analytics', () => {
    let clickCount = 0
    
    // Mock click tracking with counter
    cy.intercept('GET', '**/api/click/**', (req) => {
      clickCount++
      req.reply({ statusCode: 200, body: { success: true, clickId: clickCount } })
    }).as('multipleClicks')
    
    // Mock game data with multiple stores
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here\'s a game available on multiple stores:',
        games: [
          {
            id: 'multi-store-game',
            title: 'Multi Store Game',
            short_description: 'Available everywhere',
            price_usd: 29.99,
            platforms: ['PC'],
            genres: ['Action'],
            store_links: {
              steam: 'https://store.steampowered.com/app/999000',
              epic: 'https://store.epicgames.com/multi-store-game',
              gog: 'https://gog.com/multi-store-game'
            }
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('multiStoreGame')
    
    // Send query
    cy.sendChatMessage('Show me a game on multiple stores')
    cy.wait('@multiStoreGame')
    
    // Click on different store links
    cy.get('[data-cy=store-link-steam]').click()
    cy.wait('@multipleClicks')
    
    cy.get('[data-cy=store-link-epic]').click()
    cy.wait('@multipleClicks')
    
    cy.get('[data-cy=store-link-gog]').click()
    cy.wait('@multipleClicks')
    
    // Verify all clicks were tracked
    cy.get('@multipleClicks.all').should('have.length', 3)
  })
})