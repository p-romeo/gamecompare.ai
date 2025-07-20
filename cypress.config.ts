import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    setupNodeEvents(on, config) {
      // Code coverage setup
      require('@cypress/code-coverage/task')(on, config)
      
      // Lighthouse task
      on('task', {
        lighthouse: async ({ url, options, thresholds }) => {
          const lighthouse = require('lighthouse')
          const chromeLauncher = require('chrome-launcher')
          
          const chrome = await chromeLauncher.launch({
            chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
          })
          
          const result = await lighthouse(url, {
            port: chrome.port,
            ...options
          })
          
          await chrome.kill()
          
          // Check thresholds
          const scores = {
            performance: result.lhr.categories.performance.score * 100,
            accessibility: result.lhr.categories.accessibility.score * 100,
            'best-practices': result.lhr.categories['best-practices'].score * 100,
            seo: result.lhr.categories.seo.score * 100,
            pwa: result.lhr.categories.pwa ? result.lhr.categories.pwa.score * 100 : 0
          }
          
          const failures = []
          for (const [category, threshold] of Object.entries(thresholds)) {
            if (scores[category] < threshold) {
              failures.push(`${category}: ${scores[category]} < ${threshold}`)
            }
          }
          
          if (failures.length > 0) {
            throw new Error(`Lighthouse thresholds not met: ${failures.join(', ')}`)
          }
          
          return { scores, result: result.lhr }
        }
      })
      
      // Lighthouse integration
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.name === 'chrome') {
          launchOptions.args.push('--disable-dev-shm-usage')
          launchOptions.args.push('--disable-gpu')
          launchOptions.args.push('--no-sandbox')
        }
        return launchOptions
      })

      return config
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
    env: {
      coverage: true
    }
  },
  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
    setupNodeEvents(on, config) {
      require('@cypress/code-coverage/task')(on, config)
      return config
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/component.ts'
  },
});
