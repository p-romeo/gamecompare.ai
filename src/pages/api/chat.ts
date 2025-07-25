import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, filters } = req.body

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const response = await fetch(`${supabaseUrl}/functions/v1/api_router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ query, filters })
    })

    if (!response.ok) {
      throw new Error(`Supabase function failed: ${response.status}`)
    }

    const data = await response.json()

    // For now, just return the data from Supabase
    // Later we will add the GPT-4o integration here
    const chatResponse = {
      response: `I found ${data.games.length} games matching your query.`,
      games: data.games
    }

    res.status(200).json(chatResponse)
  } catch (error) {
    console.error('Chat API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    res.status(500).json({ error: errorMessage })
  }
} 