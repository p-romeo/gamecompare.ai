# GameCompare.ai

An AI-powered game recommendation platform that helps users discover games through conversational AI. The system combines semantic search with large language models to provide intelligent, personalized game recommendations.

## 🎮 Features

- **Conversational AI**: Natural language game discovery using GPT-4o
- **Semantic Search**: Vector-based game matching with OpenAI embeddings
- **Game Comparison**: Side-by-side detailed game analysis
- **Smart Filtering**: Filter by price, platform, playtime, and release year
- **Affiliate Integration**: Monetization through tracked store redirects
- **Real-time Streaming**: Live AI responses for better user experience
- **Multi-source Data**: Aggregated data from RAWG, Steam, and OpenCritic

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 14 with TypeScript, Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno runtime)
- **Database**: Supabase Postgres with pgvector extension
- **Vector Search**: Pinecone (1,536-dimensional embeddings)
- **AI Services**: OpenAI GPT-4o and text-embedding-3-small
- **Testing**: Jest (unit), Cypress (E2E), Lighthouse (performance)

### System Components
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js UI    │───▶│  Edge Functions │───▶│   OpenAI API    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Supabase DB    │◀───│  Data Ingestion │───▶│  External APIs  │
│   + pgvector    │    │   Functions     │    │ (RAWG/Steam)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Pinecone      │
                       │ Vector Database │
                       └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase CLI
- Docker (for local Supabase)

### 1. Clone and Install
```bash
git clone <repository-url>
cd gamecompare-ai
npm install
```

### 2. Environment Setup
Copy the environment template and fill in your API keys:
```bash
cp .env.local.example .env.local
```

Required environment variables:
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Pinecone Configuration  
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_ENV=your_pinecone_environment_here
PINECONE_INDEX_NAME=gamecompare-vectors

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 3. Database Setup
Start local Supabase and run migrations:
```bash
npm run supabase:start
supabase db reset
```

### 4. Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 📊 Database Schema

### Core Tables
- **games**: Game metadata from multiple sources
- **game_vectors**: Vector embeddings for semantic search
- **store_links**: Affiliate links for game stores
- **conversations**: Chat session tracking
- **click_logs**: Affiliate link click tracking
- **sync_checkpoints**: Data ingestion progress tracking

### Key Extensions
- **pgvector**: Vector similarity search
- **pgcrypto**: UUID generation
- **pg_cron**: Scheduled data ingestion

## 🔌 API Endpoints

### Chat & Recommendations
```http
POST /api_router
Content-Type: application/json
Authorization: Bearer <SERVICE_ROLE_KEY>

# Similar Games Search
{
  "action": "similar",
  "query": "games like Zelda with open world",
  "filters": {
    "maxPrice": 60,
    "platforms": ["PC", "PlayStation"],
    "minYear": 2020
  }
}

# Game Comparison
{
  "action": "compare",
  "leftGameId": "uuid-1",
  "rightGameId": "uuid-2"
}

# Game Details
{
  "action": "game",
  "gameId": "uuid"
}

# Click Tracking
{
  "action": "click",
  "gameId": "uuid",
  "store": "steam"
}
```

### Response Format
```typescript
interface ApiResponse<T> {
  data?: T
  error?: string
  timestamp: string
  requestId: string
}

interface ChatResponse {
  response: string
  games: GameSummary[]
  conversationId: string
}
```

## 🔄 Data Ingestion

### Automated Ingestion
The system automatically ingests data from multiple sources:

- **RAWG API**: Game metadata, descriptions, genres
- **Steam Web API**: Pricing, platform availability
- **OpenCritic API**: Professional review scores

### Manual Ingestion
Trigger data ingestion manually:
```bash
# RAWG data ingestion
supabase functions invoke ingest_rawg

# Steam data ingestion  
supabase functions invoke ingest_steam

# OpenCritic scores
supabase functions invoke ingest_opencritic
```

### Scheduling
Data ingestion runs automatically via pg_cron:
- RAWG: Daily at 2 AM UTC
- Steam: Daily at 3 AM UTC  
- OpenCritic: Weekly on Sundays at 4 AM UTC

## 🧪 Testing

### Unit Tests
```bash
npm run test              # Run all unit tests
npm run test:watch        # Watch mode for development
```

### End-to-End Tests
```bash
npm run test:e2e          # Run Cypress tests
npm run test:e2e:open     # Open Cypress UI
npm run test:performance  # Performance tests with Lighthouse
```

### Test Coverage
- Unit tests: >90% coverage on utility modules
- Integration tests: All API endpoints
- E2E tests: Critical user workflows
- Performance tests: Lighthouse scores >90

## 📈 Monitoring & Performance

### Key Metrics
- **Response Time**: <2s first token at P95
- **Error Rate**: <1% over 24h periods
- **Uptime**: >99.9% availability
- **Data Freshness**: <24h for game data

### Health Checks
```bash
# System health
curl https://your-project.supabase.co/functions/v1/health_check

# Monitoring dashboard
curl https://your-project.supabase.co/functions/v1/monitoring_dashboard
```

## 🔧 Development

### Project Structure
```
├── src/
│   ├── components/          # React components
│   ├── lib/                # Utility libraries
│   ├── pages/              # Next.js pages
│   └── styles/             # CSS and Tailwind
├── supabase/
│   ├── functions/          # Edge Functions
│   ├── migrations/         # Database migrations
│   └── config.toml         # Supabase configuration
├── cypress/                # E2E tests
└── __tests__/             # Unit tests
```

### Code Quality
- TypeScript strict mode enabled
- ESLint + Prettier for code formatting
- Husky pre-commit hooks
- Automated testing in CI/CD

### Adding New Features
1. Update database schema with migrations
2. Create/update Edge Functions for API logic
3. Add frontend components and pages
4. Write comprehensive tests
5. Update documentation

## 🚀 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production deployment instructions.

### Quick Deploy Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Edge Functions deployed
- [ ] Pinecone index created
- [ ] Monitoring alerts configured
- [ ] Security policies enabled

## 🔍 Troubleshooting

### Common Issues

#### "OpenAI API key not found"
- Verify `OPENAI_API_KEY` in environment variables
- Check API key has sufficient credits and permissions

#### "Pinecone connection failed"
- Verify `PINECONE_API_KEY` and `PINECONE_ENV` are correct
- Ensure Pinecone index exists with 1,536 dimensions

#### "Database connection error"
- Check Supabase URL and keys in environment
- Verify database is running: `supabase status`

#### "Slow API responses"
- Check Pinecone index performance
- Monitor database query performance
- Verify OpenAI API rate limits

### Debug Mode
Enable detailed logging:
```bash
export DEBUG=gamecompare:*
npm run dev
```

### Performance Debugging
```bash
# Analyze bundle size
npm run build
npm run analyze

# Database query analysis
# Connect to database and run:
# EXPLAIN ANALYZE SELECT ...
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm run test:all`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Write tests for new functionality
- Update documentation for API changes
- Follow existing code patterns and conventions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas

---

Built with ❤️ using Next.js, Supabase, and OpenAI