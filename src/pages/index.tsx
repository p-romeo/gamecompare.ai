import React, { ErrorInfo, Component, ReactNode } from 'react'
import Head from 'next/head'
import { ChatInterface } from '@/components/ChatInterface'

// Error Boundary Component
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: ReactNode
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Chat interface error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 text-center">
          <h3 className="text-red-400 font-medium mb-2">Something went wrong</h3>
          <p className="text-red-200 text-sm mb-4">
            The chat interface encountered an error. Please refresh the page to try again.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function Home() {
  return (
    <>
      <Head>
        <title>GameCompare.ai - AI-Powered Game Recommendations</title>
        <meta name="description" content="Find your perfect game with AI-powered recommendations and intelligent filtering. Chat with our AI to discover games tailored to your preferences." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="keywords" content="games, AI recommendations, game discovery, game comparison, gaming, video games" />
        <meta property="og:title" content="GameCompare.ai - AI-Powered Game Recommendations" />
        <meta property="og:description" content="Find your perfect game with AI-powered recommendations and intelligent filtering." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GameCompare.ai - AI-Powered Game Recommendations" />
        <meta name="twitter:description" content="Find your perfect game with AI-powered recommendations and intelligent filtering." />
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href="https://gamecompare.ai" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-4 py-8 lg:py-16">
          {/* Header Section */}
          <header className="text-center mb-8 lg:mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 lg:mb-8">
              Welcome to GameCompare.ai
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 mb-6 max-w-3xl mx-auto">
              Your AI-powered gaming companion for finding the perfect game. 
              Chat with our intelligent assistant to discover games tailored to your preferences.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                🎮 <span>Game Discovery</span>
              </span>
              <span className="flex items-center gap-1">
                🤖 <span>AI Recommendations</span>
              </span>
              <span className="flex items-center gap-1">
                🔍 <span>Smart Filtering</span>
              </span>
              <span className="flex items-center gap-1">
                💬 <span>Interactive Chat</span>
              </span>
            </div>
          </header>

          {/* Chat Interface Section */}
          <section className="max-w-7xl mx-auto">
            <ErrorBoundary>
              <ChatInterface />
            </ErrorBoundary>
          </section>

          {/* Features Section */}
          <section className="mt-16 lg:mt-24">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl lg:text-3xl font-bold text-center mb-8 lg:mb-12">
                How It Works
              </h2>
              <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
                <div className="text-center p-6 bg-gray-800/50 rounded-lg">
                  <div className="text-3xl mb-4">💬</div>
                  <h3 className="text-lg font-semibold mb-2">Chat with AI</h3>
                  <p className="text-gray-400 text-sm">
                    Tell our AI what kind of games you're looking for using natural language
                  </p>
                </div>
                <div className="text-center p-6 bg-gray-800/50 rounded-lg">
                  <div className="text-3xl mb-4">🎯</div>
                  <h3 className="text-lg font-semibold mb-2">Smart Filtering</h3>
                  <p className="text-gray-400 text-sm">
                    Use advanced filters for price, platform, playtime, and release year
                  </p>
                </div>
                <div className="text-center p-6 bg-gray-800/50 rounded-lg">
                  <div className="text-3xl mb-4">🎮</div>
                  <h3 className="text-lg font-semibold mb-2">Discover Games</h3>
                  <p className="text-gray-400 text-sm">
                    Get personalized recommendations with direct links to purchase
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}