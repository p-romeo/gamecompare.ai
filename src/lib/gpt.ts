import OpenAI from 'openai'
import { GameSummary, GameDetail, FilterState } from './types'

/**
 * Validates that OpenAI API key is set
 */
function validateOpenAIKey(): void {
  if (typeof window !== 'undefined') {
    // Client-side - OpenAI should not be used on client
    throw new Error('OpenAI client cannot be used on client side')
  }
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
}

// Initialize OpenAI client (server-side only)
let openai: OpenAI

function getOpenAIClient(): OpenAI {
  if (typeof window !== 'undefined') {
    throw new Error('OpenAI client cannot be used on client side')
  }
  
  if (!openai) {
    validateOpenAIKey()
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })
  }
  
  return openai
}

/**
 * Generates a prompt for finding similar games based on user query and found games
 */
function createSimilarGamesPrompt(query: string, games: GameSummary[], filters?: FilterState): string {
  const filtersText = filters ? `
Filters applied:
${filters.priceMax ? `- Max price: $${filters.priceMax}` : ''}
${filters.playtimeMax ? `- Max playtime: ${filters.playtimeMax} hours` : ''}
${filters.platforms?.length ? `- Platforms: ${filters.platforms.join(', ')}` : ''}
${filters.yearRange ? `- Release years: ${filters.yearRange[0]}-${filters.yearRange[1]}` : ''}
` : ''

  return `You are GameCompare.ai, an expert gaming assistant. A user asked: "${query}"

I found these similar games using AI semantic search:
${games.map((game, i) => `
${i + 1}. ${game.title}
   - Price: $${game.price}
   - Score: ${game.score}/100
   - Platforms: ${game.platforms.join(', ')}
`).join('')}

${filtersText}

Please provide a helpful, conversational response that:
1. Acknowledges their request
2. Explains why these games match their query
3. Highlights the best options based on price, score, and platforms
4. Mentions any standout features or why they'd enjoy these games
5. Asks if they'd like more details or comparisons

Keep it natural and engaging, like talking to a friend about games. Be concise but informative.`
}

/**
 * Generates a prompt for comparing two games
 */
function createCompareGamesPrompt(leftGame: GameDetail, rightGame: GameDetail): string {
  return `You are GameCompare.ai, comparing these two games for a user:

**${leftGame.title}**
- Price: $${leftGame.price}
- Score: ${leftGame.score}/100
- Genres: ${leftGame.genres.join(', ')}
- Platforms: ${leftGame.platforms.join(', ')}
- Playtime: ~${leftGame.playtime} hours
- Description: ${leftGame.description}

**${rightGame.title}**
- Price: $${rightGame.price}
- Score: ${rightGame.score}/100
- Genres: ${rightGame.genres.join(', ')}
- Platforms: ${rightGame.platforms.join(', ')}
- Playtime: ~${rightGame.playtime} hours
- Description: ${rightGame.description}

Please provide a balanced comparison that covers:
1. **Price & Value**: Which offers better value for money?
2. **Quality**: Compare critic scores and overall polish
3. **Gameplay**: How do the genres and playtime compare?
4. **Platform Availability**: Platform differences that matter
5. **Recommendation**: Which one should they choose and why?

Be conversational and help them make the best choice for their preferences. Focus on practical differences that matter to players.`
}

/**
 * Streams a GPT response for similar games recommendation
 */
export async function streamSimilarGamesResponse(
  query: string,
  games: GameSummary[],
  filters?: FilterState
): Promise<ReadableStream<Uint8Array>> {
  try {
    const prompt = createSimilarGamesPrompt(query, games, filters)

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are GameCompare.ai, a helpful and knowledgeable gaming assistant. Be conversational, concise, and focus on helping users find great games.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1000,
    })

    // Create a readable stream from the OpenAI stream
    const encoder = new TextEncoder()
    
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(content))
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })
  } catch (error) {
    console.error('Error streaming similar games response:', error)
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generates a complete GPT response for game comparison (non-streaming)
 */
export async function generateGameComparison(
  leftGame: GameDetail,
  rightGame: GameDetail
): Promise<string> {
  try {
    const prompt = createCompareGamesPrompt(leftGame, rightGame)

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are GameCompare.ai, a helpful gaming assistant specializing in detailed game comparisons. Be thorough but accessible.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1200,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response generated from OpenAI')
    }

    return content
  } catch (error) {
    console.error('Error generating game comparison:', error)
    throw new Error(`Failed to generate comparison: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generates an embedding for a user query (reuses embeddings.ts function)
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty')
    }

    const response = await getOpenAIClient().embeddings.create({
      model: 'text-embedding-3-small',
      input: query.trim(),
      encoding_format: 'float',
    })

    const embedding = response.data[0]?.embedding
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI')
    }

    return embedding
  } catch (error) {
    console.error('Error generating query embedding:', error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Helper function to convert a ReadableStream to a Response for API endpoints
 */
export function createStreamingResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
} 