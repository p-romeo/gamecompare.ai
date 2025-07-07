# 🎮 GameCompare.ai - AI-Powered Game Discovery

An intelligent game recommendation system that uses OpenAI GPT-4o and semantic search to help users discover their perfect games.

## ✨ Features

- **AI-Powered Chat**: Ask natural language questions about games
- **Semantic Search**: Find similar games using vector embeddings
- **Game Comparison**: AI-generated detailed comparisons between games
- **Real-time Data**: Automated ingestion from RAWG, Steam, and OpenCritic
- **Affiliate Integration**: Monetization through tracked store links
- **Responsive UI**: Beautiful Tailwind CSS interface

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- OpenAI API access
- Pinecone account

### 1. Clone and Install

```bash
git clone <your-repo>
cd gamecompare.ai
npm install
```

### 2. Environment Setup

```bash
# Copy the example environment file
cp .env.local.example .env.local

# Edit .env.local with your actual API keys
# See .env.local.example for all required services
```

### 3. Database Setup

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Start local Supabase (optional for development)
supabase start

# Deploy database schema
supabase db push

# Deploy Edge Functions
supabase functions deploy
```

### 4. Vector Database Setup

Create a Pinecone index with:
- **Dimension**: 1536 (for OpenAI embeddings)
- **Metric**: cosine
- **Name**: gamecompare-vectors (or update PINECONE_INDEX_NAME)

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your AI game assistant!

## 📋 Required API Keys

| Service | Purpose | How to Get |
|---------|---------|------------|
| **Supabase** | Database + Auth + Edge Functions | [supabase.com](https://supabase.com) |
| **OpenAI** | GPT-4o + Embeddings | [platform.openai.com](https://platform.openai.com) |
| **Pinecone** | Vector Database | [pinecone.io](https://pinecone.io) |
| **RAWG** | Game Metadata | [rawg.io/apidocs](https://rawg.io/apidocs) |
| **Steam** | Game Data + Prices | [steamcommunity.com/dev](https://steamcommunity.com/dev) |
| **OpenCritic** | Critic Scores | [opencritic.com](https://opencritic.com) |

## 🔧 Configuration

### Environment Variables

All configuration is handled through environment variables. See `.env.local.example` for:

- ✅ Database connections
- ✅ AI service keys  
- ✅ Game data APIs
- ✅ Affiliate program IDs
- ✅ Detailed setup instructions

### Supabase Edge Functions

The project includes 4 Edge Functions:

- `ingest_rawg` - Hourly RAWG data ingestion
- `ingest_steam` - Steam/SteamSpy data every 30 minutes  
- `ingest_opencritic` - Daily critic score updates
- `api_router` - Main API with `/similar`, `/compare`, `/game/:id`, `/click` endpoints

### Automated Data Ingestion

Once deployed, the system automatically:

1. ⏰ Fetches new games from RAWG every hour
2. 💰 Updates prices from Steam every 30 minutes
3. ⭐ Syncs critic scores from OpenCritic daily
4. 🤖 Generates embeddings for semantic search
5. 📊 Stores vectors in both Supabase and Pinecone

## 🎯 Architecture

```
Frontend (Next.js) → API Router (Edge Function) → AI Services
                                ↓
                           Game Database (Supabase)
                                ↓
                         Vector Search (Pinecone)
```

- **Frontend**: React + Next.js + Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL with pgvector extension
- **AI**: OpenAI GPT-4o + text-embedding-3-small
- **Vector DB**: Pinecone for semantic similarity search
- **Data Sources**: RAWG, Steam, SteamSpy, OpenCritic

## 🚦 Project Status

✅ **Complete and Ready**:
- Database schema with vector support
- AI integration (OpenAI GPT + embeddings)
- API endpoints with streaming responses  
- Frontend chat interface
- Click tracking for affiliate links
- Automated data ingestion framework

🔄 **In Progress**:
- External API data fetching (RAWG, Steam, OpenCritic)
- Production deployment configuration
- Comprehensive testing suite

## 💡 Usage Examples

Ask your AI assistant:

- *"Games like The Witcher 3 but under $30"*
- *"Best indie platformers for Nintendo Switch"*  
- *"Compare Cyberpunk 2077 vs GTA V"*
- *"RPGs with great stories released in 2023"*

The AI will find semantically similar games and provide intelligent recommendations with price, platform, and review information.

## 📄 License

MIT License - see LICENSE file for details.

---

**Ready to discover your next favorite game?** 🎮✨
