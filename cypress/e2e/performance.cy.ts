describe('Performance Testing with Lighthouse', () => {
  beforeEach(() => {
    // Clear cache and localStorage for consistent testing
    cy.clearCookies()
    cy.clearLocalStorage()
    
    // Visit the page
    cy.visit('/')
    
    // Wait for initial load
    cy.get('[data-cy=chat-interface]').should('be.visible')
  })

  it('should meet performance benchmarks on desktop', () => {
    // Run Lighthouse audit for desktop
    cy.lighthouse({
      performance: 90,
      accessibility: 90,
      'best-practices': 90,
      seo: 90
    })
  })

  it('should meet performance benchmarks on mobile', () => {
    // Set mobile viewport
    cy.viewport(375, 667)
    
    // Run Lighthouse audit for mobile
    cy.task('lighthouse', {
      url: Cypress.config().baseUrl,
      options: {
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          disabled: false,
        },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
      },
      thresholds: {
        performance: 85,
        accessibility: 90,
        'best-practices': 90,
        seo: 90
      }
    })
  })

  it('should have fast initial page load', () => {
    // Measure page load performance
    cy.window().then((win) => {
      const performance = win.performance
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      
      // Check key timing metrics
      expect(navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart).to.be.lessThan(1000)
      expect(navigation.loadEventEnd - navigation.loadEventStart).to.be.lessThan(2000)
      
      // Check First Contentful Paint (if available)
      const paintEntries = performance.getEntriesByType('paint')
      const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint')
      if (fcp) {
        expect(fcp.startTime).to.be.lessThan(2000)
      }
    })
  })

  it('should handle chat interactions with good performance', () => {
    // Mock API with realistic delay
    cy.intercept('POST', '**/api/similar', (req) => {
      req.reply((res) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              statusCode: 200,
              body: {
                response: 'Here are some performance test games:',
                games: [
                  {
                    id: '1',
                    title: 'Performance Test Game',
                    short_description: 'A game for performance testing',
                    price_usd: 19.99,
                    platforms: ['PC'],
                    genres: ['Action']
                  }
                ],
                conversation_id: 'perf-test'
              }
            })
          }, 500) // Realistic API delay
        })
      })
    }).as('perfTestApi')
    
    // Measure chat interaction performance
    const startTime = Date.now()
    
    cy.get('[data-cy=chat-input]').type('Show me games for performance testing')
    cy.get('[data-cy=chat-send-button]').click()
    
    // Wait for response
    cy.wait('@perfTestApi')
    cy.get('[data-cy=game-card]').should('be.visible')
    
    // Check that total interaction time is reasonable
    cy.then(() => {
      const endTime = Date.now()
      const totalTime = endTime - startTime
      expect(totalTime).to.be.lessThan(3000) // Should complete within 3 seconds
    })
  })

  it('should efficiently handle multiple game cards', () => {
    // Mock API with many games
    const manyGames = Array.from({ length: 20 }, (_, i) => ({
      id: `game-${i}`,
      title: `Performance Game ${i + 1}`,
      short_description: `Description for game ${i + 1}`,
      price_usd: Math.random() * 60,
      platforms: ['PC', 'PlayStation', 'Xbox'],
      genres: ['Action', 'Adventure', 'RPG']
    }))
    
    cy.intercept('POST', '**/api/similar', {
      statusCode: 200,
      body: {
        response: 'Here are many games for performance testing:',
        games: manyGames,
        conversation_id: 'many-games-test'
      }
    }).as('manyGamesApi')
    
    // Send query
    const startTime = Date.now()
    cy.get('[data-cy=chat-input]').type('Show me many games')
    cy.get('[data-cy=chat-send-button]').click()
    
    // Wait for all game cards to render
    cy.wait('@manyGamesApi')
    cy.get('[data-cy=game-card]').should('have.length', 20)
    
    // Check rendering performance
    cy.then(() => {
      const endTime = Date.now()
      const renderTime = endTime - startTime
      expect(renderTime).to.be.lessThan(5000) // Should render within 5 seconds
    })
    
    // Check that scrolling is smooth
    cy.get('[data-cy=chat-messages]').scrollTo('bottom', { duration: 1000 })
    cy.get('[data-cy=chat-messages]').scrollTo('top', { duration: 1000 })
  })

  it('should maintain performance with conversation history', () => {
    // Build up conversation history
    const messages = [
      'Show me RPG games',
      'What about action games?',
      'Find me indie games',
      'Show me strategy games',
      'What are some puzzle games?'
    ]
    
    // Mock API responses
    messages.forEach((message, index) => {
      cy.intercept('POST', '**/api/similar', {
        statusCode: 200,
        body: {
          response: `Here are some games for: ${message}`,
          games: [
            {
              id: `history-game-${index}`,
              title: `History Game ${index + 1}`,
              short_description: `Game for message ${index + 1}`,
              price_usd: 29.99,
              platforms: ['PC'],
              genres: ['Test']
            }
          ],
          conversation_id: `history-${index}`
        }
      }).as(`historyApi${index}`)
    })
    
    // Send all messages
    messages.forEach((message, index) => {
      cy.get('[data-cy=chat-input]').clear().type(message)
      cy.get('[data-cy=chat-send-button]').click()
      cy.wait(`@historyApi${index}`)
    })
    
    // Check that all messages are still visible and performant
    cy.get('[data-cy=chat-messages]').within(() => {
      messages.forEach((message) => {
        cy.contains(message).should('be.visible')
      })
    })
    
    // Test scrolling performance with history
    const scrollStart = Date.now()
    cy.get('[data-cy=chat-messages]').scrollTo('top', { duration: 500 })
    cy.get('[data-cy=chat-messages]').scrollTo('bottom', { duration: 500 })
    
    cy.then(() => {
      const scrollTime = Date.now() - scrollStart
      expect(scrollTime).to.be.lessThan(2000) // Scrolling should be smooth
    })
  })

  it('should handle filter changes efficiently', () => {
    // Test filter performance
    const filterStart = Date.now()
    
    // Apply multiple filters quickly
    cy.get('[data-cy=price-min]').clear().type('10')
    cy.get('[data-cy=price-max]').clear().type('50')
    cy.get('[data-cy=platform-pc]').check()
    cy.get('[data-cy=platform-playstation]').check()
    cy.get('[data-cy=playtime-medium]').check()
    
    // Check that filters are applied quickly
    cy.then(() => {
      const filterTime = Date.now() - filterStart
      expect(filterTime).to.be.lessThan(1000) // Filter changes should be instant
    })
    
    // Check that localStorage updates are efficient
    cy.window().then((win) => {
      const savedFilters = JSON.parse(win.localStorage.getItem('chat-filters') || '{}')
      expect(savedFilters.priceMin).to.equal(10)
      expect(savedFilters.priceMax).to.equal(50)
      expect(savedFilters.platforms).to.include('PC')
      expect(savedFilters.platforms).to.include('PlayStation')
    })
  })

  it('should have efficient memory usage', () => {
    // Check initial memory usage
    cy.window().then((win) => {
      if ('memory' in win.performance) {
        const initialMemory = (win.performance as any).memory.usedJSHeapSize
        
        // Perform memory-intensive operations
        const largeData = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(1000)
        }))
        
        // Store in component state (simulate heavy usage)
        win.localStorage.setItem('test-data', JSON.stringify(largeData))
        
        // Clean up
        win.localStorage.removeItem('test-data')
        
        // Force garbage collection if available
        if ('gc' in win) {
          (win as any).gc()
        }
        
        // Check memory after cleanup
        setTimeout(() => {
          const finalMemory = (win.performance as any).memory.usedJSHeapSize
          const memoryIncrease = finalMemory - initialMemory
          
          // Memory increase should be reasonable (less than 10MB)
          expect(memoryIncrease).to.be.lessThan(10 * 1024 * 1024)
        }, 1000)
      }
    })
  })

  it('should handle network conditions gracefully', () => {
    // Simulate slow network
    cy.intercept('POST', '**/api/similar', (req) => {
      req.reply((res) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              statusCode: 200,
              body: {
                response: 'Slow network response',
                games: [],
                conversation_id: 'slow-network'
              }
            })
          }, 3000) // 3 second delay
        })
      })
    }).as('slowNetwork')
    
    // Send message
    cy.get('[data-cy=chat-input]').type('Test slow network')
    cy.get('[data-cy=chat-send-button]').click()
    
    // Check that loading state is shown
    cy.get('[data-cy=chat-loading]').should('be.visible')
    cy.get('[data-cy=chat-send-button]').should('be.disabled')
    
    // Wait for slow response
    cy.wait('@slowNetwork')
    
    // Check that loading state is cleared
    cy.get('[data-cy=chat-loading]').should('not.exist')
    cy.get('[data-cy=chat-send-button]').should('not.be.disabled')
  })

  it('should optimize images and assets', () => {
    // Check that images are optimized
    cy.get('img').each(($img) => {
      // Check that images have proper loading attributes
      cy.wrap($img).should('have.attr', 'loading', 'lazy')
      
      // Check that images have alt text for accessibility
      cy.wrap($img).should('have.attr', 'alt')
    })
    
    // Check CSS and JS bundle sizes (basic check)
    cy.window().then((win) => {
      const resources = win.performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      
      resources.forEach((resource) => {
        if (resource.name.includes('.css')) {
          // CSS files should be reasonably sized (less than 500KB)
          expect(resource.transferSize).to.be.lessThan(500 * 1024)
        }
        
        if (resource.name.includes('.js')) {
          // JS files should be reasonably sized (less than 1MB)
          expect(resource.transferSize).to.be.lessThan(1024 * 1024)
        }
      })
    })
  })
})