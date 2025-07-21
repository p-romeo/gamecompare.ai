import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, filters } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // For now, return a simple response until Supabase is set up
    res.status(200).write('data: {"type":"message","content":"API endpoint is working! Please set up Supabase to enable full functionality."}\n\n');
    res.status(200).write('data: {"type":"done"}\n\n');
    res.end();

  } catch (error) {
    console.error('Stream API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}