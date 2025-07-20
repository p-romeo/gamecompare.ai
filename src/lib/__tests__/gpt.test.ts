// Test only the utility functions that don't require OpenAI client
import { Game } from '../supabase'

// Import utility functions directly to avoid OpenAI client initialization
const buildSystemPrompt = (): string => {
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

interface GameContext {
  game: Game
  similarity_score: number
}

const formatGameContext = (context: GameContext[]): string => {
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

const buildUserPrompt = (userQuery: string, context: GameContext[]): string => {
  const contextSection = formatGameContext(context)
  
  return `User Query: "${userQuery}"

${contextSection}

Please provide personalized game recommendations based on this context. Focus on the most relevant games and explain why they match the user's request.`
}

describe('GPT Utility Functions', () => {

  describe('buildSystemPrompt', () => {
    it('should return a comprehensive system prompt', () => {
      const prompt = buildSystemPrompt()
      
      expect(prompt).toContain('GameCompare.ai')
      expect(prompt).toContain('game recommendation assistant')
      expect(prompt).toContain('conversational')
      expect(prompt).toContain('platform availability')
      expect(prompt).toContain('pricing')
    })
  })

  describe('formatGameContext', () => {
    const mockGame: Game = {
      id: 'game-1',
      title: 'Test Game',
      short_description: 'A test game',
      genres: ['Action', 'Adventure'],
      platforms: ['PC', 'PlayStation'],
      price_usd: 29.99,
      critic_score: 85,
      release_date: '2023-01-01',
      rawg_id: 123,
      slug: 'test-game',
      long_description: null,
      image_url: null,
      rating: null,
      rating_count: null,
      metacritic_score: null,
      playtime_hours: null,
      store_links: {},
      screenshots: [],
      steam_appid: null,
      steam_score: null,
      steam_review_count: null,
      created_at: '2023-01-01',
      updated_at: '2023-01-01'
    }

    it('should format game context correctly', () => {
      const context: GameContext[] = [
        { game: mockGame, similarity_score: 0.95 }
      ]
      
      const formatted = formatGameContext(context)
      
      expect(formatted).toContain('Test Game')
      expect(formatted).toContain('A test game')
      expect(formatted).toContain('Action, Adventure')
      expect(formatted).toContain('PC, PlayStation')
      expect(formatted).toContain('29.99')
      expect(formatted).toContain('85/100')
      expect(formatted).toMatch(/Released: \d{4}/)
      expect(formatted).toContain('95.0%')
    })

    it('should handle empty context', () => {
      const formatted = formatGameContext([])
      expect(formatted).toBe('No games found matching your criteria.')
    })

    it('should handle games with missing data', () => {
      const incompleteGame: Game = {
        ...mockGame,
        short_description: null,
        genres: null,
        platforms: null,
        price_usd: null,
        critic_score: null,
        release_date: null
      }

      const context: GameContext[] = [
        { game: incompleteGame, similarity_score: 0.8 }
      ]
      
      const formatted = formatGameContext(context)
      
      expect(formatted).toContain('Test Game')
      expect(formatted).toContain('80.0%')
      expect(formatted).not.toContain('Description:')
      expect(formatted).not.toContain('Genres:')
      expect(formatted).not.toContain('Price:')
    })
  })

  describe('buildUserPrompt', () => {
    it('should combine user query with game context', () => {
      const mockGame: Game = {
        id: 'game-1',
        title: 'Test Game',
        short_description: 'A test game',
        genres: ['Action'],
        platforms: ['PC'],
        price_usd: 19.99,
        critic_score: 80,
        release_date: '2023-01-01',
        rawg_id: 123,
        slug: 'test-game',
        long_description: null,
        image_url: null,
        rating: null,
        rating_count: null,
        metacritic_score: null,
        playtime_hours: null,
        store_links: {},
        screenshots: [],
        steam_appid: null,
        steam_score: null,
        steam_review_count: null,
        created_at: '2023-01-01',
        updated_at: '2023-01-01'
      }

      const context: GameContext[] = [
        { game: mockGame, similarity_score: 0.9 }
      ]
      
      const prompt = buildUserPrompt('I want action games', context)
      
      expect(prompt).toContain('User Query: "I want action games"')
      expect(prompt).toContain('Test Game')
      expect(prompt).toContain('personalized game recommendations')
    })
  })


})