describe('Responsive Design and Mobile Compatibility', () => {
  const viewports = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'iPad', width: 768, height: 1024 },
    { name: 'iPad Pro', width: 1024, height: 1366 },
    { name: 'Desktop', width: 1280, height: 720 },
    { name: 'Large Desktop', width: 1920, height: 1080 }
  ]

  beforeEach(() => {
    cy.visit('/')
    
    // Clear localStorage
    cy.window().then((win) => {
      win.localStorage.clear()
    })
  })

  viewports.forEach((viewport) => {
    it(`should display correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      // Set viewport
      cy.viewport(viewport.width, viewport.height)
      
      // Wait for page to load
      cy.get('[data-cy=chat-interface]').should('be.visible')
      
      // Check main header is visible and properly sized
      cy.contains('h1', 'Welcome to GameCompare.ai').should('be.visible')
      
      // Check that chat interface is visible and accessible
      cy.get('[data-cy=chat-input]').should('be.visible')
      cy.get('[data-cy=chat-send-button]').should('be.visible')
      
      // Check filter panel visibility (may be collapsed on mobile)
      if (viewport.width >= 1024) {
        // Desktop: filter panel should be visible as sidebar
        cy.get('[data-cy=filter-panel]').should('be.visible')
      } else {
        // Mobile/Tablet: filter panel may be collapsible
        cy.get('[data-cy=filter-panel]').should('exist')
      }
      
      // Test basic interaction
      cy.get('[data-cy=chat-input]').type('test message')
      cy.get('[data-cy=chat-send-button]').should('not.be.disabled')
      
      // Check that elements don't overflow
      cy.get('body').then(($body) => {
        const bodyWidth = $body.width()
        expect(bodyWidth).to.be.at.most(viewport.width)
      })
    })
  })

  it('should handle mobile touch interactions', () => {
    // Set mobile viewport
    cy.viewport(375, 667)
    
    // Test touch interactions on chat input
    cy.get('[data-cy=chat-input]')
      .trigger('touchstart')
      .type('Mobile touch test')
      .trigger('touchend')
    
    // Test touch on send button
    cy.get('[data-cy=chat-send-button]')
      .trigger('touchstart')
      .trigger('touchend')
      .click()
    
    // Check that message was sent
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Mobile touch test').should('be.visible')
    })
  })

  it('should adapt filter panel for mobile devices', () => {
    // Test mobile viewport
    cy.viewport(375, 667)
    
    // Check if filter panel has mobile-specific behavior
    cy.get('[data-cy=filter-panel]').should('exist')
    
    // If there's a toggle button for mobile filters
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy=filter-toggle]').length > 0) {
        // Test filter panel toggle
        cy.get('[data-cy=filter-toggle]').click()
        cy.get('[data-cy=filter-content]').should('be.visible')
        
        // Close filter panel
        cy.get('[data-cy=filter-toggle]').click()
        cy.get('[data-cy=filter-content]').should('not.be.visible')
      }
    })
  })

  it('should maintain chat functionality across different screen sizes', () => {
    const testMessage = 'Responsive test message'
    
    viewports.slice(0, 3).forEach((viewport) => {
      // Set viewport
      cy.viewport(viewport.width, viewport.height)
      
      // Clear previous messages
      cy.window().then((win) => {
        win.localStorage.clear()
      })
      cy.reload()
      
      // Send a message
      cy.get('[data-cy=chat-input]').clear().type(testMessage)
      cy.get('[data-cy=chat-send-button]').click()
      
      // Check message appears
      cy.get('[data-cy=chat-messages]').within(() => {
        cy.contains(testMessage).should('be.visible')
      })
      
      // Check that chat area is properly sized
      cy.get('[data-cy=chat-messages]').then(($chatArea) => {
        const chatWidth = $chatArea.width()
        expect(chatWidth).to.be.at.most(viewport.width - 32) // Account for padding
      })
    })
  })

  it('should handle game cards responsively', () => {
    // Mock game data
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here are some games:',
        games: [
          {
            id: '1',
            title: 'Responsive Test Game 1',
            short_description: 'A game to test responsive design',
            price_usd: 19.99,
            platforms: ['PC', 'PlayStation', 'Xbox'],
            genres: ['Action', 'Adventure']
          },
          {
            id: '2',
            title: 'Responsive Test Game 2',
            short_description: 'Another game for responsive testing',
            price_usd: 29.99,
            platforms: ['PC', 'Nintendo Switch'],
            genres: ['RPG', 'Strategy']
          }
        ],
        conversation_id: 'test-conversation'
      }
    }).as('responsiveGames')
    
    viewports.forEach((viewport) => {
      // Set viewport
      cy.viewport(viewport.width, viewport.height)
      
      // Send query
      cy.get('[data-cy=chat-input]').clear().type('Show me responsive games')
      cy.get('[data-cy=chat-send-button]').click()
      cy.wait('@responsiveGames')
      
      // Check that game cards are displayed properly
      cy.get('[data-cy=game-card]').should('have.length', 2)
      
      // Check that game cards don't overflow
      cy.get('[data-cy=game-card]').each(($card) => {
        const cardWidth = $card.width()
        expect(cardWidth).to.be.at.most(viewport.width - 64) // Account for margins
      })
      
      // Check that text is readable (not too small)
      cy.get('[data-cy=game-card]').first().within(() => {
        cy.contains('Responsive Test Game 1').should('be.visible')
        cy.contains('$19.99').should('be.visible')
      })
    })
  })

  it('should handle orientation changes on mobile devices', () => {
    // Portrait mode
    cy.viewport(375, 667)
    cy.get('[data-cy=chat-interface]').should('be.visible')
    
    // Send a message in portrait
    cy.get('[data-cy=chat-input]').type('Portrait message')
    cy.get('[data-cy=chat-send-button]').click()
    
    // Switch to landscape mode
    cy.viewport(667, 375)
    
    // Check that interface still works
    cy.get('[data-cy=chat-interface]').should('be.visible')
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Portrait message').should('be.visible')
    })
    
    // Send a message in landscape
    cy.get('[data-cy=chat-input]').type('Landscape message')
    cy.get('[data-cy=chat-send-button]').click()
    
    // Check both messages are visible
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Portrait message').should('be.visible')
      cy.contains('Landscape message').should('be.visible')
    })
  })

  it('should maintain accessibility on all screen sizes', () => {
    viewports.forEach((viewport) => {
      cy.viewport(viewport.width, viewport.height)
      
      // Check that interactive elements are large enough for touch
      cy.get('[data-cy=chat-send-button]').then(($button) => {
        const buttonHeight = $button.height()
        const buttonWidth = $button.width()
        
        // Minimum touch target size should be 44px (iOS) or 48px (Android)
        expect(buttonHeight).to.be.at.least(40)
        expect(buttonWidth).to.be.at.least(40)
      })
      
      // Check that text is readable
      cy.get('[data-cy=chat-input]').should('have.css', 'font-size').then((fontSize) => {
        const size = parseInt(fontSize)
        expect(size).to.be.at.least(14) // Minimum readable font size
      })
      
      // Check color contrast (basic check)
      cy.get('[data-cy=chat-input]').should('have.css', 'color')
      cy.get('[data-cy=chat-input]').should('have.css', 'background-color')
    })
  })

  it('should handle long content gracefully on small screens', () => {
    cy.viewport(375, 667)
    
    const longMessage = 'This is a very long message that should test how the chat interface handles text wrapping and display on small mobile screens. '.repeat(5)
    
    // Send long message
    cy.get('[data-cy=chat-input]').type(longMessage)
    cy.get('[data-cy=chat-send-button]').click()
    
    // Check that message is displayed without horizontal overflow
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains(longMessage.substring(0, 50)).should('be.visible')
    })
    
    // Check that no horizontal scrollbar appears
    cy.get('[data-cy=chat-messages]').then(($chatArea) => {
      expect($chatArea[0].scrollWidth).to.be.at.most($chatArea[0].clientWidth + 5) // Small tolerance
    })
  })

  it('should provide good user experience on tablet devices', () => {
    // iPad viewport
    cy.viewport(768, 1024)
    
    // Check that layout uses available space efficiently
    cy.get('[data-cy=chat-interface]').should('be.visible')
    cy.get('[data-cy=filter-panel]').should('be.visible')
    
    // Test that both portrait and landscape work well
    cy.viewport(1024, 768) // Landscape
    
    cy.get('[data-cy=chat-interface]').should('be.visible')
    cy.get('[data-cy=filter-panel]').should('be.visible')
    
    // Send a message to test functionality
    cy.get('[data-cy=chat-input]').type('Tablet test message')
    cy.get('[data-cy=chat-send-button]').click()
    
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Tablet test message').should('be.visible')
    })
  })
})