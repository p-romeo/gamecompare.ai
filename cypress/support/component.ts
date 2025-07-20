// ***********************************************************
// This example support/component.ts is processed and
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

// Component testing setup would go here
// Currently not using component testing, so this is commented out
// Example use:
// cy.mount(<MyComponent />)
// import { mount } from 'cypress/react18'
// Cypress.Commands.add('mount', mount)

// declare global {
//   namespace Cypress {
//     interface Chainable {
//       mount: typeof mount
//     }
//   }
// }