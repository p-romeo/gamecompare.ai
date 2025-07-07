import React from 'react'
import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <title>GameCompare.ai - AI-Powered Game Recommendations</title>
        <meta name="description" content="Find your perfect game with AI-powered recommendations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-4 py-16">
          <h1 className="text-5xl font-bold text-center mb-8">
            Welcome to GameCompare.ai
          </h1>
          <p className="text-xl text-center text-gray-300 mb-12">
            Your AI-powered gaming companion for finding the perfect game
          </p>
          <div className="max-w-2xl mx-auto">
            {/* TODO: Add chat interface component here */}
            <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
              <p className="text-gray-400 text-center">
                Chat interface coming soon...
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}