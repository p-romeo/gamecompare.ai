import { NextApiRequest, NextApiResponse } from 'next'
import { FilterState } from '@/lib/types'

interface StreamRequest {
  query: string
  filters?: FilterState
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query, filters }: StreamRequest = req.body

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' })
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase configuration')
      res.write('data: {"type":"error","content":"Server configuration error"}\n\n')
      res.end()
      return
    }

    try {
      // Call our Supabase Edge Function
      const apiUrl = `${supabaseUrl}/functions/v1/api_router`
      
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
        res.write(`data: {"type":"error","content":"API request failed: ${response.status}"}\n\n`)
        res.end()
        return
      }

      const data = await response.json()
      
      // Stream the response in chunks to simulate real-time typing
      const responseText = data.response || 'I found some games for you!'
      const words = responseText.split(' ')
      
      for (let i = 0; i < words.length; i++) {
        const chunk = i === 0 ? words[i] : ' ' + words[i]
        res.write(`data: {"type":"chunk","content":"${chunk.replace(/"/g, '\\"')}"}\n\n`)
        
        // Add a small delay to simulate typing
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      // Send the games data
      if (data.games && data.games.length > 0) {
        res.write(`data: {"type":"games","content":${JSON.stringify(data.games)}}\n\n`)
      }
      
      // Send completion signal
      res.write('data: {"type":"done"}\n\n')
      res.end()

    } catch (error) {
      console.error('Stream processing error:', error)
      res.write(`data: {"type":"error","content":"${error instanceof Error ? error.message : 'Processing error'}"}\n\n`)
      res.end()
    }

  } catch (error) {
    console.error('Stream API error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}