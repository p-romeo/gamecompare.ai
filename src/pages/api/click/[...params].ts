import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { params } = req.query

    if (!params || !Array.isArray(params) || params.length !== 2) {
      return res.status(400).json({ error: 'Invalid parameters. Expected /click/[gameId]/[store]' })
    }

    const [gameId, store] = params

    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase configuration')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Call our Supabase Edge Function
    const apiUrl = `${supabaseUrl}/functions/v1/api_router/click/${gameId}/${store}`
    
    console.log('Calling Supabase function for click tracking:', apiUrl)

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

    // Handle redirect response
    if (response.status === 302) {
      const location = response.headers.get('Location')
      if (location) {
        return res.redirect(302, location)
      }
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}