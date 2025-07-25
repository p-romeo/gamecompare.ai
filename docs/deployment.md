# Deployment Guide

This comprehensive guide covers deploying GameCompare.ai to production environments with proper security, monitoring, and performance configurations.

## 🚀 Deployment Overview

### Architecture Components
- **Frontend**: Next.js application (Vercel/Netlify recommended)
- **Backend**: Supabase Edge Functions
- **Database**: Supabase PostgreSQL with extensions
- **Vector Database**: Pinecone hosted service
- **AI Services**: OpenAI API integration

### Prerequisites
- Supabase Pro account (for production features)
- Pinecone account with production index
- OpenAI API account with sufficient credits
- Domain name and SSL certificate
- Monitoring service accounts (optional)

## 📋 Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Supabase project created and configured
- [ ] Pinecone production index created (1536 dimensions, cosine metric)
- [ ] OpenAI API key with GPT-4o and embeddings access
- [ ] Domain name configured with DNS
- [ ] SSL certificates obtained
- [ ] Monitoring services configured

### 2. Security Configuration
- [ ] Row Level Security (RLS) policies enabled
- [ ] API keys rotated and secured
- [ ] CORS policies configured
- [ ] Rate limiting implemented
- [ ] Input validation enabled
- [ ] Security headers configured

### 3. Performance Optimization
- [ ] Database indexes created
- [ ] Connection pooling configured
- [ ] CDN setup for static assets
- [ ] Caching strategies implemented
- [ ] Performance monitoring enabled

## 🏗️ Supabase Project Setup

### 1. Create Production Project
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Create new project (or use existing)
supabase projects create gamecompare-ai-prod

# Link local project to production
supabase link --project-ref your-project-ref
```

### 2. Configure Database Extensions
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify extensions
SELECT * FROM pg_extension WHERE extname IN ('pgcrypto', 'pgvector', 'pg_cron');
```

### 3. Deploy Database Schema
```bash
# Deploy all migrations
supabase db push

# Verify migration status
supabase migration list --remote
```

### 4. Configure Row Level Security
```sql
-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Public read access" ON games FOR SELECT USING (true);
CREATE POLICY "Public read access" ON store_links FOR SELECT USING (true);

-- Create policies for service role access
CREATE POLICY "Service role full access" ON games FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON game_vectors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON conversation_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON click_logs FOR ALL USING (auth.role() = 'service_role');
```

### 5. Deploy Edge Functions
```bash
# Deploy all functions
supabase functions deploy api_router
supabase functions deploy ingest_rawg
supabase functions deploy ingest_steam
supabase functions deploy ingest_opencritic
supabase functions deploy health_check
supabase functions deploy monitoring_dashboard

# Verify deployment
supabase functions list
```

### 6. Configure Environment Variables
```bash
# Set production environment variables
supabase secrets set OPENAI_API_KEY=your_production_openai_key
supabase secrets set PINECONE_API_KEY=your_production_pinecone_key
supabase secrets set PINECONE_ENV=your_production_pinecone_env
supabase secrets set PINECONE_INDEX_NAME=gamecompare-vectors-prod

# Verify secrets
supabase secrets list
```

## 🔧 Pinecone Index Setup

### 1. Create Production Index
```python
# Using Pinecone Python client
import pinecone

pinecone.init(
    api_key="your-pinecone-api-key",
    environment="your-pinecone-environment"
)

# Create index with production specifications
pinecone.create_index(
    name="gamecompare-vectors-prod",
    dimension=1536,  # OpenAI embedding dimension
    metric="cosine",
    pods=1,  # Start with 1 pod, scale as needed
    replicas=1,
    pod_type="p1.x1"  # Performance optimized
)
```

### 2. Configure Index Settings
```javascript
// Using Pinecone JavaScript client
import { Pinecone } from '@pinecone-database/pinecone'

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

const index = pinecone.index('gamecompare-vectors-prod')

// Configure metadata filtering
await index.configureIndex({
  replicas: 1,
  podType: 'p1.x1'
})
```

## 🌐 Frontend Deployment

### Vercel Deployment (Recommended)

#### 1. Install Vercel CLI
```bash
npm install -g vercel
```

#### 2. Configure Environment Variables
Copy `.env.production.example` to `.env.production`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=sk-proj-your_openai_key

# Pinecone
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENV=your_pinecone_environment
PINECONE_INDEX_NAME=gamecompare-vectors-prod
```

#### 3. Deploy to Vercel
```bash
# Deploy to production
vercel --prod

# Configure custom domain
vercel domains add gamecompare.ai
```

#### 4. Vercel Configuration
The project includes a pre-configured `vercel.json` with:
- Security headers (X-Frame-Options, X-XSS-Protection, etc.)
- Caching optimization
- Function timeout settings
- Build command configuration

### Alternative: Netlify Deployment

#### 1. Configure Build Settings
```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

## 🔒 Security Configuration

### 1. API Security
```typescript
// supabase/functions/api_router.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://gamecompare.ai',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30 // Reduced for production
```

### 2. Database Security
```sql
-- Create read-only role for analytics
CREATE ROLE analytics_reader;
GRANT CONNECT ON DATABASE postgres TO analytics_reader;
GRANT USAGE ON SCHEMA public TO analytics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_reader;

-- Revoke unnecessary permissions
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
```

## 📊 Monitoring Setup

### 1. Supabase Monitoring
```sql
-- Enable query statistics
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';

-- Create monitoring views
CREATE VIEW api_performance AS
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%games%'
ORDER BY mean_exec_time DESC;
```

### 2. Application Monitoring
```typescript
// Add to Edge Functions
import { MonitoringClient } from './utils/monitoring.ts'

const monitoring = new MonitoringClient({
  projectId: Deno.env.get('SUPABASE_PROJECT_ID'),
  apiKey: Deno.env.get('MONITORING_API_KEY')
})

// Track function performance
const startTime = Date.now()
try {
  // Function logic
  await monitoring.recordMetric('api_request_success', 1)
} catch (error) {
  await monitoring.recordMetric('api_request_error', 1)
  throw error
} finally {
  const duration = Date.now() - startTime
  await monitoring.recordMetric('api_request_duration', duration)
}
```

## 🚀 Performance Optimization

### 1. Database Optimization
```sql
-- Create performance indexes
CREATE INDEX CONCURRENTLY idx_games_search_gin ON games USING gin(search_text);
CREATE INDEX CONCURRENTLY idx_games_genres_gin ON games USING gin(genres);
CREATE INDEX CONCURRENTLY idx_games_platforms_gin ON games USING gin(platforms);
CREATE INDEX CONCURRENTLY idx_games_price_range ON games(price_usd) WHERE price_usd IS NOT NULL;

-- Analyze table statistics
ANALYZE games;
ANALYZE game_vectors;
ANALYZE conversations;

-- Configure connection pooling
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
```

### 2. Edge Function Optimization
```typescript
// Connection pooling for database
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    db: {
      schema: 'public',
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Cache frequently accessed data
const gameCache = new Map<string, Game>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getCachedGame(gameId: string): Promise<Game | null> {
  const cached = gameCache.get(gameId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached
  }
  
  const game = await fetchGameFromDB(gameId)
  if (game) {
    gameCache.set(gameId, { ...game, cachedAt: Date.now() })
  }
  return game
}
```

## ✅ Post-Deployment Verification

### 1. Smoke Tests
```bash
# Test API endpoints
curl -X POST https://your-project.supabase.co/functions/v1/api_router \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "similar", "query": "test game"}'

# Test health check
curl https://your-project.supabase.co/functions/v1/health_check

# Test frontend
curl -I https://gamecompare.ai
```

### 2. Performance Tests
```bash
# Load testing with Artillery
npm install -g artillery
artillery run load-test.yml

# Monitor during load test
watch -n 1 'curl -s https://your-project.supabase.co/functions/v1/health_check | jq .data.metrics'
```

### 3. Security Verification
```bash
# SSL certificate check
openssl s_client -connect gamecompare.ai:443 -servername gamecompare.ai

# Security headers check
curl -I https://gamecompare.ai | grep -E "(X-Frame-Options|X-XSS-Protection|X-Content-Type-Options)"

# CORS check
curl -H "Origin: https://malicious-site.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS https://your-project.supabase.co/functions/v1/api_router
```

## 🎯 Success Metrics

### Performance Targets
- **Response Time**: <2s for 95th percentile
- **Uptime**: >99.9% availability
- **Error Rate**: <0.1% of requests
- **Data Freshness**: <24 hours for game data

### Business Metrics
- **User Engagement**: Track chat interactions and game clicks
- **Conversion Rate**: Monitor affiliate link click-through rates
- **Cost Efficiency**: Optimize API usage and infrastructure costs
- **User Satisfaction**: Monitor error rates and response quality

## 🚨 Deployment Readiness Status

### ✅ Ready for Production
- **Build Status**: ✅ Production build successful
- **Security**: ✅ All vulnerabilities resolved (Next.js updated to 14.2.30)
- **Testing**: ✅ Core functionality verified
- **Configuration**: ✅ Production-ready configs in place
- **Documentation**: ✅ Complete deployment guide available

### 📋 Final Deployment Checklist
- [ ] Production environment variables configured in Vercel
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate verified
- [ ] Monitoring and alerting set up
- [ ] Backup procedures documented
- [ ] Team access and permissions configured

## 📞 Support & Maintenance

### 1. Monitoring Dashboard
- **Supabase Dashboard**: Monitor database performance and function logs
- **Pinecone Console**: Track vector database usage and performance
- **Vercel Dashboard**: Monitor frontend performance and deployments
- **OpenAI Usage Dashboard**: Track API usage and costs

### 2. Regular Maintenance Tasks
- **Weekly**: Review error logs and performance metrics
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and rotate API keys
- **Annually**: Conduct security audit and disaster recovery testing

### 3. Emergency Procedures
1. **Level 1**: Automated alerts and basic troubleshooting
2. **Level 2**: Manual investigation and common fixes
3. **Level 3**: Deep technical investigation and code changes
4. **Level 4**: Vendor support and emergency procedures

---

This deployment guide provides a comprehensive foundation for production deployment. The application is ready for deployment with all security measures in place and core functionality verified.