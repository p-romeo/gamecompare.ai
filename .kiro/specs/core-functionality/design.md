# Design Document

## Overview

This design focuses on implementing the minimum viable product (MVP) for GameCompare.ai. The architecture prioritizes getting core functionality working quickly while maintaining the existing codebase structure. We'll leverage the existing database schema, frontend components, and build system while implementing the missing backend functionality.

## Architecture

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API    │    │   Supabase      │
│   (React/Next)  │◄──►│   Routes         │◄──►│   Edge Functions│
│                 │    │                  │    │                 │
│   - Chat UI     │    │   - /api/chat    │    │   - api_router  │
│   - Filters     │    │   - /api/similar │    │   - data_sync   │
│   - Admin UI    │    │   - /api/admin   │    │   - admin_auth  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │   PostgreSQL    │
                                               │   + pgvector    │
                                               │                 │
                                               │   - games       │
                                               │   - game_vectors│
                                               │   - store_links │
                                               └─────────────────┘
```

### External Integrations

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   RAWG API      │    │   OpenAI API     │    │   Pinecone      │
│                 │    │                  │    │   (Optional)    │
│   - Game Data   │◄──►│   - GPT-4        │◄──►│   - Vector      │
│   - Metadata    │    │   - Embeddings   │    │     Search      │
│   - Images      │    │   - Chat         │    │   - Backup      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Components and Interfaces

### 1. Data Ingestion System

**Purpose:** Populate the database with game data from RAWG API

**Implementation:**
- Supabase Edge Function: `data_sync`
- Batch processing with rate limiting
- Upsert operations to handle updates
- Progress tracking and error handling

**Key Functions:**
```typescript
interface DataSyncService {
  syncGames(options: SyncOptions): Promise<SyncResult>
  getProgress(): Promise<SyncProgress>
  validateData(games: RawgGame[]): ValidationResult
}

interface SyncOptions {
  batchSize: number
  maxPages: number
  forceRefresh: boolean
}
```

### 2. Game Search and Recommendation API

**Purpose:** Handle chat queries and return relevant games

**Implementation:**
- Supabase Edge Function: `api_router` (enhance existing)
- Vector similarity search using pgvector
- GPT-4 integration for natural language processing
- Filter application and result ranking

**Key Functions:**
```typescript
interface GameSearchService {
  searchSimilar(query: string, filters: FilterState): Promise<SearchResult>
  generateEmbedding(text: string): Promise<number[]>
  rankResults(games: Game[], query: string): Game[]
}

interface SearchResult {
  games: Game[]
  response: string
  conversation_id: string
  total_count: number
}
```

### 3. Admin Authentication System

**Purpose:** Secure admin access using Supabase Auth

**Implementation:**
- Supabase Auth with email/password
- Protected admin routes with middleware
- Session management and token validation
- Role-based access control

**Key Functions:**
```typescript
interface AdminAuthService {
  login(email: string, password: string): Promise<AuthResult>
  logout(): Promise<void>
  getCurrentUser(): Promise<User | null>
  requireAuth(req: Request): Promise<User>
}
```

### 4. Admin Dashboard

**Purpose:** Data management interface for admins

**Implementation:**
- Next.js pages under `/admin`
- Real-time sync status monitoring
- Manual data ingestion triggers
- Basic analytics and error reporting

**Key Components:**
```typescript
interface AdminDashboard {
  SyncStatus: React.Component
  DataIngestionPanel: React.Component
  GameStatistics: React.Component
  ErrorLogs: React.Component
}
```

## Data Models

### Enhanced Game Model
```typescript
interface Game {
  id: string
  rawg_id: number
  title: string
  slug: string
  release_date: string | null
  genres: string[]
  platforms: string[]
  short_description: string | null
  long_description: string | null
  image_url: string | null
  rating: number | null
  rating_count: number | null
  metacritic_score: number | null
  playtime_hours: number | null
  price_usd: number | null
  store_links: Record<string, string>
  updated_at: string
}
```

### Sync Progress Tracking
```typescript
interface SyncProgress {
  id: string
  status: 'running' | 'completed' | 'failed'
  total_pages: number
  processed_pages: number
  games_added: number
  games_updated: number
  errors: string[]
  started_at: string
  completed_at: string | null
}
```

## Error Handling

### API Error Responses
```typescript
interface ApiError {
  error: string
  code: string
  details?: any
  timestamp: string
  request_id: string
}
```

### Error Categories
1. **Validation Errors** (400): Invalid input data
2. **Authentication Errors** (401): Missing or invalid auth
3. **Authorization Errors** (403): Insufficient permissions
4. **Not Found Errors** (404): Resource doesn't exist
5. **Rate Limit Errors** (429): Too many requests
6. **Server Errors** (500): Internal system errors

### Error Recovery Strategies
- Automatic retry with exponential backoff for API calls
- Graceful degradation when external services are unavailable
- User-friendly error messages in the frontend
- Comprehensive error logging for debugging

## Testing Strategy

### Unit Tests
- Data transformation functions
- API endpoint handlers
- Authentication middleware
- Utility functions

### Integration Tests
- End-to-end API workflows
- Database operations
- External API integrations
- Authentication flows

### Manual Testing Checklist
- [ ] User can search for games and get results
- [ ] Admin can log in and access dashboard
- [ ] Data ingestion completes successfully
- [ ] Error handling works correctly
- [ ] Application deploys without issues

## Security Considerations

### Authentication & Authorization
- Supabase Auth for admin users
- Service role keys for internal API calls
- Row-level security policies on database
- Protected admin routes with middleware

### Data Protection
- Input validation and sanitization
- SQL injection prevention through parameterized queries
- Rate limiting on public endpoints
- Secure environment variable management

### API Security
- CORS configuration for frontend domains
- Request size limits
- Authentication token validation
- Error message sanitization

## Performance Requirements

### Response Times
- Chat API: < 3 seconds for typical queries
- Search API: < 1 second for filtered results
- Admin dashboard: < 2 seconds for page loads
- Data ingestion: Process 100 games per minute

### Scalability
- Support 100 concurrent users initially
- Database optimized with proper indexes
- Vector search performance tuned
- Caching strategy for frequently accessed data

## Deployment Architecture

### Production Environment
- **Frontend**: Vercel deployment
- **Backend**: Supabase Edge Functions
- **Database**: Supabase PostgreSQL with pgvector
- **Monitoring**: Built-in Supabase monitoring

### Environment Variables
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# RAWG API
RAWG_API_KEY=

# Admin Auth
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

### Deployment Process
1. Deploy Supabase functions
2. Run database migrations
3. Deploy Next.js application to Vercel
4. Configure environment variables
5. Run initial data ingestion
6. Verify all functionality works

This design prioritizes getting a working product deployed quickly while maintaining code quality and security standards. The architecture is simple but extensible, allowing for future enhancements without major refactoring.