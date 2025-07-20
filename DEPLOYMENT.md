# Production Deployment Guide

This guide covers deploying GameCompare.ai to production environments with proper security, monitoring, and performance configurations.

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

### 3. Verify Index Configuration
```bash
# Check index status
curl -X GET "https://controller.your-env.pinecone.io/databases/gamecompare-vectors-prod" \
  -H "Api-Key: your-pinecone-api-key"
```

## 🌐 Frontend Deployment

### Option 1: Vercel Deployment

#### 1. Install Vercel CLI
```bash
npm install -g vercel
```

#### 2. Configure Environment Variables
Create `.env.production` file:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
```

#### 3. Deploy to Vercel
```bash
# Deploy to production
vercel --prod

# Configure custom domain
vercel domains add gamecompare.ai
```

#### 4. Configure Vercel Settings
```json
// vercel.json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

### Option 2: Netlify Deployment

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

#### 2. Deploy to Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy to production
netlify deploy --prod --dir=.next
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

### 3. Environment Security
```bash
# Rotate API keys regularly
supabase secrets set OPENAI_API_KEY=new_rotated_key

# Use strong service role keys
# Generate new service role key in Supabase dashboard
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

### 3. External Monitoring
```yaml
# Example: Uptime monitoring with UptimeRobot
monitors:
  - name: "GameCompare.ai Frontend"
    url: "https://gamecompare.ai"
    type: "http"
    interval: 300
    
  - name: "API Health Check"
    url: "https://your-project.supabase.co/functions/v1/health_check"
    type: "http"
    interval: 300
    headers:
      Authorization: "Bearer your-service-role-key"
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

### 3. CDN Configuration
```javascript
// next.config.js
module.exports = {
  images: {
    domains: ['media.rawg.io', 'steamcdn-a.akamaihd.net'],
    loader: 'custom',
    loaderFile: './image-loader.js'
  },
  async headers() {
    return [
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ]
  }
}
```

## 📈 Scaling Considerations

### 1. Database Scaling
```sql
-- Partition large tables by date
CREATE TABLE click_logs_2024 PARTITION OF click_logs
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- Create read replicas for analytics
-- (Configure in Supabase dashboard)
```

### 2. Function Scaling
```typescript
// Implement circuit breaker pattern
class CircuitBreaker {
  private failures = 0
  private lastFailTime = 0
  private readonly threshold = 5
  private readonly timeout = 60000

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open')
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold && 
           Date.now() - this.lastFailTime < this.timeout
  }

  private onSuccess(): void {
    this.failures = 0
  }

  private onFailure(): void {
    this.failures++
    this.lastFailTime = Date.now()
  }
}
```

### 3. Vector Database Scaling
```python
# Scale Pinecone index
import pinecone

# Increase replicas for higher throughput
pinecone.configure_index(
    name="gamecompare-vectors-prod",
    replicas=2,  # Increase replicas
    pod_type="p1.x2"  # Upgrade pod type
)
```

## 🔄 Data Migration

### 1. Initial Data Load
```bash
# Export from development
pg_dump -h localhost -p 54322 -U postgres -t games -t game_vectors > initial_data.sql

# Import to production
psql -h db.your-project.supabase.co -U postgres -d postgres < initial_data.sql
```

### 2. Vector Data Migration
```typescript
// Migrate vectors to production Pinecone
async function migrateVectors() {
  const devIndex = pinecone.index('gamecompare-vectors-dev')
  const prodIndex = pinecone.index('gamecompare-vectors-prod')
  
  // Fetch all vectors from dev
  const vectors = await devIndex.fetch({ ids: await getAllVectorIds() })
  
  // Batch upsert to production
  const batchSize = 100
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize)
    await prodIndex.upsert({ vectors: batch })
  }
}
```

## 🚨 Disaster Recovery

### 1. Backup Strategy
```bash
# Automated daily backups
#!/bin/bash
DATE=$(date +%Y%m%d)
pg_dump -h db.your-project.supabase.co -U postgres -d postgres > backup_$DATE.sql
aws s3 cp backup_$DATE.sql s3://gamecompare-backups/

# Retention: Keep 30 days of backups
find /backups -name "backup_*.sql" -mtime +30 -delete
```

### 2. Recovery Procedures
```bash
# Database recovery
psql -h db.your-project.supabase.co -U postgres -d postgres < backup_20240117.sql

# Vector database recovery
python migrate_vectors.py --source backup --target production

# Function redeployment
supabase functions deploy --all
```

### 3. Monitoring & Alerts
```yaml
# Example: PagerDuty integration
alerts:
  - name: "High Error Rate"
    condition: "error_rate > 5%"
    duration: "5m"
    severity: "critical"
    
  - name: "Slow Response Time"
    condition: "p95_response_time > 5s"
    duration: "10m"
    severity: "warning"
    
  - name: "Database Connection Issues"
    condition: "db_connection_errors > 10"
    duration: "2m"
    severity: "critical"
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

## 📞 Support & Maintenance

### 1. Monitoring Dashboard
- **Supabase Dashboard**: Monitor database performance and function logs
- **Pinecone Console**: Track vector database usage and performance
- **Vercel/Netlify Dashboard**: Monitor frontend performance and deployments
- **OpenAI Usage Dashboard**: Track API usage and costs

### 2. Regular Maintenance Tasks
- **Weekly**: Review error logs and performance metrics
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and rotate API keys
- **Annually**: Conduct security audit and disaster recovery testing

### 3. Escalation Procedures
1. **Level 1**: Automated alerts and basic troubleshooting
2. **Level 2**: Manual investigation and common fixes
3. **Level 3**: Deep technical investigation and code changes
4. **Level 4**: Vendor support and emergency procedures

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

---

This deployment guide provides a comprehensive foundation for production deployment. Adjust configurations based on your specific requirements, traffic patterns, and business needs.