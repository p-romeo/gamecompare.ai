import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Game ID is required' })
    }

    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase configuration')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Call our Supabase Edge Function
    const apiUrl = `${supabaseUrl}/functions/v1/api_router/game/${id}`
    
    console.log('Calling Supabase function for game details:', apiUrl)

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Supabase function error:', response.status, errorText)
      return res.status(response.status).json({ 
        error: `API request failed: ${response.status} ${response.statusText}` 
      })
    }

    const data = await response.json()
    console.log('Game details response:', data)

    return res.status(200).json(data)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}