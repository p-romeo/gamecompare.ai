import { NextApiRequest, NextApiResponse } from 'next'
import { FilterState } from '@/lib/types'

interface SimilarGamesRequest {
  query: string
  filters?: FilterState
}

interface SimilarGamesResponse {
  games: Array<{
    id: string
    title: string
    price: number
    score: number
    platforms: string[]
  }>
  response: string
  conversation_id: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, filters }: SimilarGamesRequest = req.body

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' })
    }

    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase configuration')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Call our Supabase Edge Function
    const apiUrl = `${supabaseUrl}/functions/v1/api_router`
    
    console.log('Calling Supabase function:', apiUrl)
    console.log('Request payload:', { query, filters })

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, filters }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Supabase function error:', response.status, errorText)
      return res.status(response.status).json({ 
        error: `API request failed: ${response.status} ${response.statusText}` 
      })
    }

    const data: SimilarGamesResponse = await response.json()
    console.log('Supabase function response:', data)

    return res.status(200).json(data)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}