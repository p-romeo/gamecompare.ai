import 'openai/shims/node'
import OpenAI from 'openai'
import { Game } from './supabase'

/**
 * Validates that required environment variables are set
 */
function validateEnvironmentVariables(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY')
  }
}

// Validate environment variables at module initialization
validateEnvironmentVariables()

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

export interface GameContext {
  game: Game
  similarity_score: number
}

export interface GPTClient {
  generateChatResponse(prompt: string, context: GameContext[]): Promise<string>
  generateComparison(leftGame: Game, rightGame: Game): Promise<string>
  streamResponse(prompt: string, context: GameContext[], onChunk: (chunk: string) => void): Promise<void>
}

/**
 * Retry configuration for API calls
 */
interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
}

/**
 * Implements exponential backoff retry logic
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === config.maxAttempts) {
        break
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      )
      
      // Add jitter to prevent thundering herd
      const jitteredDelay = delay + Math.random() * 1000
      
      console.warn(`Attempt ${attempt} failed, retrying in ${jitteredDelay}ms:`, lastError.message)
      await new Promise(resolve => setTimeout(resolve, jitteredDelay))
    }
  }
  
  throw lastError!
}

/**
 * Constructs a system prompt for game recommendations
 */
function buildSystemPrompt(): string {
  return `You are GameCompare.ai, an expert game recommendation assistant. Your role is to help users discover games that match their preferences through intelligent, conversational recommendations.

Key guidelines:
- Provide personalized game recommendations based on user queries
- Include specific details about gameplay, genres, platforms, and pricing when available
- Be conversational and engaging, not robotic
- Focus on games that are contextually relevant to the user's request
- Mention key differentiators between recommended games
- Include platform availability and current pricing when provided
- Keep responses concise but informative (2-3 paragraphs max)
- If asked about game comparisons, provide balanced analysis covering gameplay, graphics, story, and value

Always base your recommendations on the provided game context data. Do not recommend games that aren't in the provided context.`
}

/**
 * Formats game context for inclusion in prompts
 */
function formatGameContext(context: GameContext[]): string {
  if (context.length === 0) {
    return "No games found matching your criteria."
  }

  const gameDescriptions = context.map((ctx, index) => {
    const game = ctx.game
    const parts = [
      `${index + 1}. **${game.title}**`,
      game.short_description ? `Description: ${game.short_description}` : null,
      game.genres?.length ? `Genres: ${game.genres.join(', ')}` : null,
      game.platforms?.length ? `Platforms: ${game.platforms.join(', ')}` : null,
      game.price_usd !== null ? `Price: $${game.price_usd}` : null,
      game.critic_score !== null ? `Critic Score: ${game.critic_score}/100` : null,
      game.release_date ? `Released: ${new Date(game.release_date).getFullYear()}` : null,
      `Similarity Score: ${(ctx.similarity_score * 100).toFixed(1)}%`
    ].filter(Boolean)

    return parts.join('\n   ')
  }).join('\n\n')

  return `Here are the most relevant games based on your query:\n\n${gameDescriptions}`
}

/**
 * Constructs a user prompt with context
 */
function buildUserPrompt(userQuery: string, context: GameContext[]): string {
  const contextSection = formatGameContext(context)
  
  return `User Query: "${userQuery}"

${contextSection}

Please provide personalized game recommendations based on this context. Focus on the most relevant games and explain why they match the user's request.`
}

/**
 * GPT client implementation with streaming support and conversation handling
 */
export class GPTClientImpl implements GPTClient {
  /**
   * Generates a complete chat response for game recommendations
   */
  async generateChatResponse(prompt: string, context: GameContext[]): Promise<string> {
    return withRetry(async () => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(prompt, context) }
          ],
          temperature: 0.7,
          max_tokens: 800,
          top_p: 0.9,
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          throw new Error('No response content generated')
        }

        return content.trim()
      } catch (error) {
        console.error('Error generating chat response:', error)
        throw new Error(`Failed to generate chat response: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })
  }

  /**
   * Generates a structured comparison between two games
   */
  async generateComparison(leftGame: Game, rightGame: Game): Promise<string> {
    return withRetry(async () => {
      try {
        const comparisonPrompt = `Compare these two games in detail:

**Game 1: ${leftGame.title}**
- Description: ${leftGame.short_description || 'No description available'}
- Genres: ${leftGame.genres?.join(', ') || 'Unknown'}
- Platforms: ${leftGame.platforms?.join(', ') || 'Unknown'}
- Price: ${leftGame.price_usd !== null ? `$${leftGame.price_usd}` : 'Price not available'}
- Critic Score: ${leftGame.critic_score !== null ? `${leftGame.critic_score}/100` : 'No score available'}
- Release Date: ${leftGame.release_date ? new Date(leftGame.release_date).getFullYear() : 'Unknown'}

**Game 2: ${rightGame.title}**
- Description: ${rightGame.short_description || 'No description available'}
- Genres: ${rightGame.genres?.join(', ') || 'Unknown'}
- Platforms: ${rightGame.platforms?.join(', ') || 'Unknown'}
- Price: ${rightGame.price_usd !== null ? `$${rightGame.price_usd}` : 'Price not available'}
- Critic Score: ${rightGame.critic_score !== null ? `${rightGame.critic_score}/100` : 'No score available'}
- Release Date: ${rightGame.release_date ? new Date(rightGame.release_date).getFullYear() : 'Unknown'}

Provide a structured comparison covering:
1. **Gameplay & Mechanics**: How do they differ in core gameplay?
2. **Graphics & Presentation**: Visual style and technical aspects
3. **Story & Content**: Narrative depth and content volume
4. **Value Proposition**: Which offers better value for money?
5. **Recommendation**: Which game would you recommend and for what type of player?

Keep the comparison balanced and informative.`

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: 'You are a game expert providing detailed, balanced comparisons between games. Focus on factual differences and provide clear recommendations based on different player preferences.' 
            },
            { role: 'user', content: comparisonPrompt }
          ],
          temperature: 0.6,
          max_tokens: 1000,
          top_p: 0.9,
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          throw new Error('No comparison content generated')
        }

        return content.trim()
      } catch (error) {
        console.error('Error generating comparison:', error)
        throw new Error(`Failed to generate comparison: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })
  }

  /**
   * Streams a chat response in real-time for better user experience
   */
  async streamResponse(
    prompt: string, 
    context: GameContext[], 
    onChunk: (chunk: string) => void
  ): Promise<void> {
    return withRetry(async () => {
      try {
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(prompt, context) }
          ],
          temperature: 0.7,
          max_tokens: 800,
          top_p: 0.9,
          stream: true,
        })

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            onChunk(content)
          }
        }
      } catch (error) {
        console.error('Error streaming response:', error)
        throw new Error(`Failed to stream response: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })
  }
}

// Export singleton instance
export const gptClient = new GPTClientImpl()

// Export types and utilities
export { buildSystemPrompt, formatGameContext, buildUserPrompt }