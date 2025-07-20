# API Documentation

## Overview

GameCompare.ai provides a RESTful API through Supabase Edge Functions for game recommendations, comparisons, and affiliate tracking. All endpoints use JSON for request/response data and require proper authentication.

## Base URL
```
https://your-project.supabase.co/functions/v1/
```

## Authentication

All API endpoints require authentication using the SERVICE_ROLE_KEY:

```http
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json
```

## Rate Limiting

- **Limit**: 60 requests per minute per IP
- **Headers**: Rate limit info included in response headers
- **Exceeded**: Returns 429 status with retry information

## Error Handling

### Error Response Format
```json
{
  "error": "Error message",
  "type": "ERROR_TYPE",
  "details": "Additional error details",
  "timestamp": "2024-01-17T10:30:00Z",
  "requestId": "req_123456"
}
```

### Error Types
- `VALIDATION_ERROR`: Invalid request parameters
- `AUTHENTICATION_ERROR`: Invalid or missing auth token
- `NOT_FOUND_ERROR`: Requested resource not found
- `DATABASE_ERROR`: Database operation failed
- `EXTERNAL_API_ERROR`: External service unavailable
- `RATE_LIMIT_ERROR`: Rate limit exceeded
- `INTERNAL_ERROR`: Unexpected server error

## Endpoints

### 1. Similar Games Search

Find games similar to a natural language query using semantic search.

**Endpoint**: `POST /api_router`

**Request Body**:
```json
{
  "action": "similar",
  "query": "games like Zelda with open world exploration",
  "filters": {
    "maxPrice": 60,
    "minPrice": 0,
    "platforms": ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
    "minYear": 2020,
    "maxYear": 2024,
    "genres": ["Action", "Adventure"],
    "minPlaytime": 10,
    "maxPlaytime": 100
  },
  "limit": 10,
  "conversationId": "optional-conversation-uuid"
}
```

**Request Parameters**:
- `action` (required): Must be "similar"
- `query` (required): Natural language search query
- `filters` (optional): Filter constraints
  - `maxPrice`: Maximum price in USD
  - `minPrice`: Minimum price in USD
  - `platforms`: Array of platform names
  - `minYear`/`maxYear`: Release year range
  - `genres`: Array of genre names
  - `minPlaytime`/`maxPlaytime`: Playtime in hours
- `limit` (optional): Number of results (default: 10, max: 50)
- `conversationId` (optional): Continue existing conversation

**Response**:
```json
{
  "data": {
    "response": "Based on your interest in open-world games like Zelda, here are some great recommendations:\n\n**The Witcher 3: Wild Hunt** is an excellent choice with its vast open world, engaging story, and exploration mechanics similar to Breath of the Wild...",
    "games": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "The Witcher 3: Wild Hunt",
        "shortDescription": "An open-world RPG with rich storytelling and exploration",
        "priceUsd": 39.99,
        "platforms": ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
        "genres": ["Action", "RPG"],
        "releaseDate": "2015-05-19",
        "criticScore": 93,
        "steamAppid": 292030,
        "storeLinks": {
          "steam": "https://store.steampowered.com/app/292030/",
          "epic": "https://store.epicgames.com/en-US/p/the-witcher-3-wild-hunt",
          "gog": "https://www.gog.com/game/the_witcher_3_wild_hunt"
        },
        "similarityScore": 0.89
      }
    ],
    "conversationId": "550e8400-e29b-41d4-a716-446655440001",
    "totalResults": 25,
    "processingTime": 1.2
  },
  "timestamp": "2024-01-17T10:30:00Z",
  "requestId": "req_123456"
}
```

### 2. Game Comparison

Compare two games side-by-side with detailed analysis.

**Endpoint**: `POST /api_router`

**Request Body**:
```json
{
  "action": "compare",
  "leftGameId": "550e8400-e29b-41d4-a716-446655440000",
  "rightGameId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Response**:
```json
{
  "data": {
    "comparison": "## The Witcher 3 vs Cyberpunk 2077\n\n### Gameplay\n**The Witcher 3** offers traditional fantasy RPG mechanics with sword combat, magic signs, and alchemy systems...\n\n**Cyberpunk 2077** features futuristic FPS-RPG gameplay with cybernetic enhancements, hacking, and multiple combat approaches...",
    "leftGame": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "The Witcher 3: Wild Hunt",
      "priceUsd": 39.99,
      "criticScore": 93,
      "platforms": ["PC", "PlayStation", "Xbox", "Nintendo Switch"]
    },
    "rightGame": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Cyberpunk 2077",
      "priceUsd": 59.99,
      "criticScore": 86,
      "platforms": ["PC", "PlayStation", "Xbox"]
    },
    "summary": {
      "winner": "The Witcher 3: Wild Hunt",
      "reasoning": "Better overall polish, more consistent gameplay experience, and higher critical acclaim",
      "categories": {
        "gameplay": "The Witcher 3",
        "graphics": "Cyberpunk 2077",
        "story": "The Witcher 3",
        "value": "The Witcher 3"
      }
    }
  },
  "timestamp": "2024-01-17T10:30:00Z",
  "requestId": "req_123457"
}
```

### 3. Game Details

Get detailed information about a specific game.

**Endpoint**: `POST /api_router`

**Request Body**:
```json
{
  "action": "game",
  "gameId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "rawgId": 3328,
    "title": "The Witcher 3: Wild Hunt",
    "releaseDate": "2015-05-19",
    "genres": ["Action", "RPG"],
    "platforms": ["PC", "PlayStation", "Xbox", "Nintendo Switch"],
    "shortDescription": "An open-world RPG with rich storytelling and exploration",
    "priceUsd": 39.99,
    "criticScore": 93,
    "steamAppid": 292030,
    "storeLinks": {
      "steam": "https://store.steampowered.com/app/292030/",
      "epic": "https://store.epicgames.com/en-US/p/the-witcher-3-wild-hunt",
      "gog": "https://www.gog.com/game/the_witcher_3_wild_hunt"
    },
    "updatedAt": "2024-01-17T08:00:00Z"
  },
  "timestamp": "2024-01-17T10:30:00Z",
  "requestId": "req_123458"
}
```

### 4. Click Tracking

Track affiliate link clicks for monetization.

**Endpoint**: `POST /api_router`

**Request Body**:
```json
{
  "action": "click",
  "gameId": "550e8400-e29b-41d4-a716-446655440000",
  "store": "steam"
}
```

**Response**:
```json
{
  "data": {
    "redirectUrl": "https://store.steampowered.com/app/292030/?utm_source=gamecompare&utm_medium=affiliate&utm_campaign=recommendation",
    "tracked": true,
    "clickId": "click_123456"
  },
  "timestamp": "2024-01-17T10:30:00Z",
  "requestId": "req_123459"
}
```

### 5. Health Check

Check system health and status.

**Endpoint**: `GET /health_check`

**Response**:
```json
{
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 86400,
    "services": {
      "database": "healthy",
      "pinecone": "healthy",
      "openai": "healthy"
    },
    "metrics": {
      "totalGames": 50000,
      "lastIngestion": "2024-01-17T02:00:00Z",
      "avgResponseTime": 1.2,
      "errorRate": 0.001
    }
  },
  "timestamp": "2024-01-17T10:30:00Z"
}
```

## Data Types

### Game Object
```typescript
interface Game {
  id: string
  rawgId: number
  title: string
  releaseDate: string
  genres: string[]
  platforms: string[]
  shortDescription: string
  priceUsd: number
  criticScore: number
  steamAppid: number
  storeLinks: Record<string, string>
  updatedAt: string
}
```

### Filter Object
```typescript
interface FilterState {
  maxPrice?: number
  minPrice?: number
  platforms?: string[]
  minYear?: number
  maxYear?: number
  genres?: string[]
  minPlaytime?: number
  maxPlaytime?: number
}
```

### Game Summary
```typescript
interface GameSummary {
  id: string
  title: string
  shortDescription: string
  priceUsd: number
  platforms: string[]
  genres: string[]
  releaseDate: string
  criticScore: number
  steamAppid: number
  storeLinks: Record<string, string>
  similarityScore?: number
}
```

## Usage Examples

### JavaScript/TypeScript Client

```typescript
class GameCompareClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  async searchSimilarGames(query: string, filters?: FilterState) {
    const response = await fetch(`${this.baseUrl}/api_router`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'similar',
        query,
        filters
      })
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }

    return response.json()
  }

  async compareGames(leftGameId: string, rightGameId: string) {
    const response = await fetch(`${this.baseUrl}/api_router`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'compare',
        leftGameId,
        rightGameId
      })
    })

    return response.json()
  }

  async trackClick(gameId: string, store: string) {
    const response = await fetch(`${this.baseUrl}/api_router`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'click',
        gameId,
        store
      })
    })

    return response.json()
  }
}

// Usage
const client = new GameCompareClient(
  'https://your-project.supabase.co/functions/v1',
  'your-service-role-key'
)

const results = await client.searchSimilarGames(
  'indie puzzle games with great art',
  { maxPrice: 30, platforms: ['PC', 'Nintendo Switch'] }
)
```

### cURL Examples

```bash
# Search for similar games
curl -X POST https://your-project.supabase.co/functions/v1/api_router \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "similar",
    "query": "atmospheric horror games",
    "filters": {
      "maxPrice": 50,
      "platforms": ["PC"]
    }
  }'

# Compare two games
curl -X POST https://your-project.supabase.co/functions/v1/api_router \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "compare",
    "leftGameId": "game-uuid-1",
    "rightGameId": "game-uuid-2"
  }'

# Track affiliate click
curl -X POST https://your-project.supabase.co/functions/v1/api_router \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "click",
    "gameId": "game-uuid",
    "store": "steam"
  }'
```

## Best Practices

### Performance Optimization
- Use appropriate `limit` values to avoid large responses
- Implement client-side caching for repeated requests
- Use conversation IDs to maintain context efficiently

### Error Handling
- Always check response status codes
- Implement exponential backoff for rate limit errors
- Log request IDs for debugging support

### Security
- Never expose SERVICE_ROLE_KEY in client-side code
- Implement proper CORS policies for web applications
- Validate and sanitize all user inputs

### Monitoring
- Track API response times and error rates
- Monitor rate limit usage patterns
- Set up alerts for service degradation

## Support

For API support and questions:
- Check the main [README.md](./README.md) for general setup
- Open GitHub issues for bugs or feature requests
- Review error logs with request IDs for debugging