describe('Chat Workflow - Complete User Journey', () => {
  beforeEach(() => {
    // Visit the homepage
    cy.visit('/')
    
    // Wait for the page to load completely
    cy.get('[data-cy=chat-interface]').should('be.visible')
    
    // Clear any existing chat history
    cy.window().then((win) => {
      win.localStorage.clear()
    })
  })

  it('should display the homepage with all key elements', () => {
    // Check page title and meta information
    cy.title().should('contain', 'GameCompare.ai')
    cy.get('head meta[name="description"]').should('have.attr', 'content').and('include', 'AI-powered')
    
    // Check main heading and description
    cy.contains('h1', 'Welcome to GameCompare.ai').should('be.visible')
    cy.contains('Your AI-powered gaming companion').should('be.visible')
    
    // Check feature highlights
    cy.contains('Game Discovery').should('be.visible')
    cy.contains('AI Recommendations').should('be.visible')
    cy.contains('Smart Filtering').should('be.visible')
    cy.contains('Interactive Chat').should('be.visible')
    
    // Check "How It Works" section
    cy.contains('h2', 'How It Works').should('be.visible')
    cy.contains('Chat with AI').should('be.visible')
    cy.contains('Smart Filtering').should('be.visible')
    cy.contains('Discover Games').should('be.visible')
  })

  it('should have functional chat interface with proper initial state', () => {
    // Check chat interface components
    cy.get('[data-cy=chat-interface]').should('be.visible')
    cy.get('[data-cy=filter-panel]').should('be.visible')
    cy.get('[data-cy=chat-input]').should('be.visible').and('have.attr', 'placeholder', 'Ask about games...')
    cy.get('[data-cy=chat-send-button]').should('be.visible').and('contain', 'Send')
    
    // Check initial empty state
    cy.contains('Ask me about games!').should('be.visible')
    
    // Check that send button is disabled when input is empty
    cy.get('[data-cy=chat-send-button]').should('be.disabled')
    
    // Check that send button becomes enabled when typing
    cy.get('[data-cy=chat-input]').type('test')
    cy.get('[data-cy=chat-send-button]').should('not.be.disabled')
    
    // Clear input and check button is disabled again
    cy.get('[data-cy=chat-input]').clear()
    cy.get('[data-cy=chat-send-button]').should('be.disabled')
  })

  it('should handle basic chat interaction flow', () => {
    // Send a simple message
    cy.sendChatMessage('I want to find RPG games')
    
    // Check that user message appears
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('I want to find RPG games').should('be.visible')
    })
    
    // Wait for AI response (with mock or actual API)
    cy.waitForChatResponse()
    
    // Check that AI response appears
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.get('[data-cy=assistant-message]').should('exist').and('be.visible')
    })
    
    // Check that input is cleared after sending
    cy.get('[data-cy=chat-input]').should('have.value', '')
  })

  it('should persist conversation history in localStorage', () => {
    // Send multiple messages
    cy.sendChatMessage('Show me action games')
    cy.waitForChatResponse()
    
    cy.sendChatMessage('What about indie games?')
    cy.waitForChatResponse()
    
    // Reload the page
    cy.reload()
    
    // Check that conversation history is restored
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Show me action games').should('be.visible')
      cy.contains('What about indie games?').should('be.visible')
      cy.get('[data-cy=assistant-message]').should('have.length.at.least', 2)
    })
  })

  it('should handle clear conversation functionality', () => {
    // Send a message first
    cy.sendChatMessage('Find me puzzle games')
    cy.waitForChatResponse()
    
    // Check that clear button appears
    cy.get('[data-cy=clear-chat-button]').should('be.visible')
    
    // Click clear button
    cy.get('[data-cy=clear-chat-button]').click()
    
    // Check that messages are cleared
    cy.contains('Ask me about games!').should('be.visible')
    cy.get('[data-cy=chat-messages] [data-cy=user-message]').should('not.exist')
    cy.get('[data-cy=chat-messages] [data-cy=assistant-message]').should('not.exist')
    
    // Check that localStorage is cleared
    cy.window().then((win) => {
      expect(win.localStorage.getItem('chat-messages')).to.be.null
      expect(win.localStorage.getItem('conversation-id')).to.be.null
    })
  })

  it('should handle error states gracefully', () => {
    // Intercept API calls to simulate error
    cy.intercept('POST', '**/api/**', { statusCode: 500, body: { error: 'Server error' } }).as('apiError')
    
    // Send a message
    cy.sendChatMessage('Find me games')
    
    // Wait for error response
    cy.wait('@apiError')
    
    // Check that error message is displayed
    cy.get('[data-cy=error-message]').should('be.visible').and('contain', 'error')
    
    // Check that error can be dismissed
    cy.get('[data-cy=error-dismiss]').click()
    cy.get('[data-cy=error-message]').should('not.exist')
  })

  it('should handle loading states properly', () => {
    // Intercept API calls to add delay
    cy.intercept('POST', '**/api/**', (req) => {
      req.reply((res) => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(res), 2000)
        })
      })
    }).as('slowApi')
    
    // Send a message
    cy.sendChatMessage('Show me strategy games')
    
    // Check loading state
    cy.get('[data-cy=chat-loading]').should('be.visible')
    cy.get('[data-cy=chat-input]').should('be.disabled')
    cy.get('[data-cy=chat-send-button]').should('be.disabled').and('contain', 'Sending...')
    
    // Wait for response
    cy.wait('@slowApi')
    
    // Check that loading state is cleared
    cy.get('[data-cy=chat-loading]').should('not.exist')
    cy.get('[data-cy=chat-input]').should('not.be.disabled')
    cy.get('[data-cy=chat-send-button]').should('contain', 'Send')
  })

  it('should support keyboard shortcuts', () => {
    // Test Enter key to send message
    cy.get('[data-cy=chat-input]').type('Test message{enter}')
    
    // Check that message was sent
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Test message').should('be.visible')
    })
    
    // Test Shift+Enter for new line (if supported)
    cy.get('[data-cy=chat-input]').type('Line 1{shift+enter}Line 2')
    cy.get('[data-cy=chat-input]').should('contain.value', 'Line 1\nLine 2')
  })

  it('should handle long messages and scrolling', () => {
    const longMessage = 'This is a very long message that should test the chat interface scrolling behavior and message display capabilities. '.repeat(10)
    
    // Send long message
    cy.sendChatMessage(longMessage)
    cy.waitForChatResponse()
    
    // Check that message is displayed properly
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains(longMessage.substring(0, 50)).should('be.visible')
    })
    
    // Send multiple messages to test scrolling
    for (let i = 1; i <= 5; i++) {
      cy.sendChatMessage(`Message ${i}`)
      cy.waitForChatResponse()
    }
    
    // Check that latest message is visible (auto-scroll)
    cy.get('[data-cy=chat-messages]').within(() => {
      cy.contains('Message 5').should('be.visible')
    })
  })
})