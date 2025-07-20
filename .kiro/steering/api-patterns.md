# API Development Patterns

## Edge Function Structure

### Standard Function Template
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    // Function logic here
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

### Error Handling Patterns
- Always wrap main logic in try-catch blocks
- Log errors with context for debugging
- Return consistent error response format
- Use appropriate HTTP status codes
- Implement retry logic for external API calls (3 attempts with exponential backoff)

### Data Transformation Patterns
- Create dedicated mapper functions (e.g., `mapRawgToRow()`)
- Validate input data before processing
- Handle missing or malformed data gracefully
- Use TypeScript interfaces for type safety

## API Endpoint Standards

### Required Endpoints
- `POST /similar` - Semantic game search
- `POST /compare` - Game comparison
- `GET /game/:id` - Game details
- `GET /click/:gid/:store` - Affiliate link tracking

### Response Format
All API responses must match TypeScript interfaces:
```typescript
interface ApiResponse<T> {
  data?: T
  error?: string
  timestamp: string
}
```

### Authentication
- Internal functions: Use SERVICE_ROLE_KEY
- Public endpoints: Validate JWT tokens
- Rate limiting for public endpoints