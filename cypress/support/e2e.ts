// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Import code coverage support
import '@cypress/code-coverage/support'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Global configuration
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false here prevents Cypress from failing the test
  // on uncaught exceptions that might occur in the application
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false
  }
  if (err.message.includes('Non-Error promise rejection captured')) {
    return false
  }
  return true
})

// Custom commands for better test readability
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to select DOM element by data-cy attribute.
       * @example cy.dataCy('greeting')
       */
      dataCy(value: string): Chainable<JQuery<HTMLElement>>
      
      /**
       * Custom command to wait for chat response
       * @example cy.waitForChatResponse()
       */
      waitForChatResponse(): Chainable<void>
      
      /**
       * Custom command to type in chat input and send
       * @example cy.sendChatMessage('Find me RPG games')
       */
      sendChatMessage(message: string): Chainable<void>
      
      /**
       * Custom command to check responsive design
       * @example cy.checkResponsive()
       */
      checkResponsive(): Chainable<void>
      
      /**
       * Custom command to run Lighthouse audit
       * @example cy.lighthouse()
       */
      lighthouse(options?: any): Chainable<void>
    }
  }
}