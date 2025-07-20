// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables for tests
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.PINECONE_API_KEY = 'test-pinecone-key'
process.env.PINECONE_INDEX_NAME = 'test-index'

// Add TextEncoder/TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock console.warn to reduce noise in tests
global.console.warn = jest.fn()