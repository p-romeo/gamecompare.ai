// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Custom command to select elements by data-cy attribute
Cypress.Commands.add('dataCy', (value: string) => {
  return cy.get(`[data-cy=${value}]`)
})

// Custom command to wait for chat response
Cypress.Commands.add('waitForChatResponse', () => {
  // Wait for loading indicator to appear and disappear
  cy.get('[data-cy=chat-loading]', { timeout: 1000 }).should('exist')
  cy.get('[data-cy=chat-loading]', { timeout: 15000 }).should('not.exist')
})

// Custom command to send chat message
Cypress.Commands.add('sendChatMessage', (message: string) => {
  cy.get('[data-cy=chat-input]').clear().type(message)
  cy.get('[data-cy=chat-send-button]').click()
})

// Custom command to check responsive design
Cypress.Commands.add('checkResponsive', () => {
  // Test mobile viewport
  cy.viewport(375, 667) // iPhone SE
  cy.wait(500)
  cy.get('[data-cy=chat-interface]').should('be.visible')
  
  // Test tablet viewport
  cy.viewport(768, 1024) // iPad
  cy.wait(500)
  cy.get('[data-cy=chat-interface]').should('be.visible')
  
  // Test desktop viewport
  cy.viewport(1280, 720) // Desktop
  cy.wait(500)
  cy.get('[data-cy=chat-interface]').should('be.visible')
})

// Custom command for Lighthouse audit
Cypress.Commands.add('lighthouse', (options = {}) => {
  const defaultOptions = {
    performance: 90,
    accessibility: 90,
    'best-practices': 90,
    seo: 90,
    pwa: 50
  }
  
  const auditOptions = { ...defaultOptions, ...options }
  
  // Run Lighthouse audit
  cy.task('lighthouse', {
    url: Cypress.config().baseUrl,
    options: {
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
      },
    },
    thresholds: auditOptions
  })
})

// Add custom assertions
chai.use((chai, utils) => {
  chai.Assertion.addMethod('havePerformanceScore', function (expectedScore: number) {
    const obj = this._obj
    const actualScore = obj.lhr.categories.performance.score * 100
    
    this.assert(
      actualScore >= expectedScore,
      `expected performance score to be at least ${expectedScore}, but got ${actualScore}`,
      `expected performance score to be less than ${expectedScore}, but got ${actualScore}`,
      expectedScore,
      actualScore
    )
  })
})