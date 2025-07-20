# Troubleshooting Guide

This guide covers common issues and their solutions for GameCompare.ai development and deployment.

## 🚨 Common Issues

### Environment & Configuration

#### Issue: "OpenAI API key not found" or "Invalid API key"
**Symptoms:**
- API returns authentication errors
- Chat responses fail to generate
- Embedding generation fails

**Solutions:**
1. **Check Environment Variables:**
   ```bash
   # Verify the key is set
   echo $OPENAI_API_KEY
   
   # For Next.js development
   cat .env.local | grep OPENAI_API_KEY
   ```

2. **Validate API Key:**
   ```bash
   # Test the key directly
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

3. **Check API Key Permissions:**
   - Ensure the key has access to GPT-4o and embedding models
   - Verify sufficient credits in OpenAI account
   - Check for rate limit restrictions

4. **Environment File Issues:**
   ```bash
   # Ensure .env.local exists and is properly formatted
   cp .env.local.example .env.local
   # Edit with your actual keys
   ```

#### Issue: "Pinecone connection failed" or "Index not found"
**Symptoms:**
- Vector search operations fail
- Embedding storage errors
- Similarity search returns no results

**Solutions:**
1. **Verify Pinecone Configuration:**
   ```bash
   # Check environment variables
   echo $PINECONE_API_KEY
   echo $PINECONE_ENV
   echo $PINECONE_INDEX_NAME
   ```

2. **Test Pinecone Connection:**
   ```javascript
   // Test script
   import { Pinecone } from '@pinecone-database/pinecone'
   
   const pinecone = new Pinecone({
     apiKey: process.env.PINECONE_API_KEY
   })
   
   const indexes = await pinecone.listIndexes()
   console.log('Available indexes:', indexes)
   ```

3. **Create Missing Index:**
   ```bash
   # Using Pinecone CLI or web interface
   # Index specs: 1536 dimensions, cosine metric
   ```

4. **Check Index Configuration:**
   - Dimension: Must be 1536 (OpenAI embedding size)
   - Metric: Cosine similarity
   - Environment: Must match PINECONE_ENV

#### Issue: "Database connection error" or "Supabase client failed"
**Symptoms:**
- API endpoints return 500 errors
- Database queries fail
- Migration errors

**Solutions:**
1. **Check Supabase Status:**
   ```bash
   supabase status
   # Should show all services running
   ```

2. **Verify Environment Variables:**
   ```bash
   echo $NEXT_PUBLIC_SUPABASE_URL
   echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
   echo $SUPABASE_SERVICE_ROLE_KEY
   ```

3. **Test Database Connection:**
   ```bash
   # Connect to local database
   supabase db connect
   
   # Test query
   SELECT version();
   ```

4. **Reset Local Database:**
   ```bash
   supabase db reset
   # This will re-run all migrations
   ```

5. **Check Migration Status:**
   ```bash
   supabase migration list
   # Verify all migrations are applied
   ```

### Development Issues

#### Issue: "Module not found" or Import Errors
**Symptoms:**
- TypeScript compilation errors
- Runtime import failures
- Missing dependency errors

**Solutions:**
1. **Clear Node Modules:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check TypeScript Configuration:**
   ```bash
   # Verify tsconfig.json paths
   npx tsc --noEmit
   ```

3. **Update Dependencies:**
   ```bash
   npm update
   npm audit fix
   ```

4. **Check Import Paths:**
   ```typescript
   // Use relative imports for local files
   import { GameCard } from '../components/GameCard'
   
   // Use absolute imports for libraries
   import { createClient } from '@supabase/supabase-js'
   ```

#### Issue: "Next.js build fails" or "Type errors"
**Symptoms:**
- Build process stops with errors
- TypeScript type checking fails
- Production build issues

**Solutions:**
1. **Fix Type Errors:**
   ```bash
   # Check all type errors
   npx tsc --noEmit
   
   # Fix common issues
   # - Add proper type annotations
   # - Update interface definitions
   # - Check for unused imports
   ```

2. **Clear Next.js Cache:**
   ```bash
   rm -rf .next
   npm run build
   ```

3. **Check Environment Variables:**
   ```bash
   # Ensure all required vars are set for build
   npm run build 2>&1 | grep -i "env"
   ```

### API & Function Issues

#### Issue: "Edge Function deployment failed"
**Symptoms:**
- Functions don't deploy to Supabase
- Runtime errors in deployed functions
- CORS issues

**Solutions:**
1. **Check Function Syntax:**
   ```bash
   # Test function locally
   supabase functions serve api_router --no-verify-jwt
   
   # Test with curl
   curl -X POST http://localhost:54321/functions/v1/api_router \
     -H "Content-Type: application/json" \
     -d '{"action": "health"}'
   ```

2. **Deploy with Verbose Output:**
   ```bash
   supabase functions deploy api_router --debug
   ```

3. **Check Function Logs:**
   ```bash
   supabase functions logs api_router
   ```

4. **Verify Dependencies:**
   ```typescript
   // Ensure all imports use Deno-compatible URLs
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
   ```

#### Issue: "API returns 500 Internal Server Error"
**Symptoms:**
- All API calls fail with 500 status
- No specific error message
- Functions appear to deploy successfully

**Solutions:**
1. **Check Function Logs:**
   ```bash
   supabase functions logs api_router --follow
   ```

2. **Add Debug Logging:**
   ```typescript
   console.log('Function started with:', {
     method: req.method,
     url: req.url,
     headers: Object.fromEntries(req.headers.entries())
   })
   ```

3. **Test Individual Components:**
   ```typescript
   // Test database connection
   const { data, error } = await supabase
     .from('games')
     .select('count')
     .limit(1)
   
   if (error) console.error('DB Error:', error)
   ```

4. **Check Environment Variables in Function:**
   ```typescript
   console.log('Environment check:', {
     hasOpenAI: !!Deno.env.get('OPENAI_API_KEY'),
     hasPinecone: !!Deno.env.get('PINECONE_API_KEY'),
     hasSupabase: !!Deno.env.get('SUPABASE_URL')
   })
   ```

### Performance Issues

#### Issue: "Slow API responses" or "Timeout errors"
**Symptoms:**
- API calls take >10 seconds
- Frequent timeout errors
- Poor user experience

**Solutions:**
1. **Check Database Performance:**
   ```sql
   -- Analyze slow queries
   SELECT query, mean_exec_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_exec_time DESC 
   LIMIT 10;
   ```

2. **Optimize Vector Searches:**
   ```typescript
   // Limit result count
   const results = await index.query({
     vector: embedding,
     topK: 10, // Don't fetch too many results
     includeMetadata: true
   })
   ```

3. **Add Caching:**
   ```typescript
   // Cache frequent queries
   const cacheKey = `similar:${queryHash}`
   let results = await redis.get(cacheKey)
   
   if (!results) {
     results = await performSearch(query)
     await redis.setex(cacheKey, 300, JSON.stringify(results))
   }
   ```

4. **Monitor External APIs:**
   ```bash
   # Check OpenAI API status
   curl -w "@curl-format.txt" -s -o /dev/null https://api.openai.com/v1/models
   ```

#### Issue: "High memory usage" or "Function crashes"
**Symptoms:**
- Edge Functions run out of memory
- Intermittent crashes during processing
- Batch operations fail

**Solutions:**
1. **Optimize Batch Processing:**
   ```typescript
   // Process in smaller batches
   const BATCH_SIZE = 10
   for (let i = 0; i < games.length; i += BATCH_SIZE) {
     const batch = games.slice(i, i + BATCH_SIZE)
     await processBatch(batch)
     
     // Allow garbage collection
     if (i % 100 === 0) {
       await new Promise(resolve => setTimeout(resolve, 100))
     }
   }
   ```

2. **Stream Large Responses:**
   ```typescript
   // Use streaming for large datasets
   const stream = new ReadableStream({
     start(controller) {
       // Stream data in chunks
     }
   })
   ```

3. **Monitor Memory Usage:**
   ```typescript
   console.log('Memory usage:', Deno.memoryUsage())
   ```

### Data Issues

#### Issue: "No search results" or "Empty responses"
**Symptoms:**
- Searches return no games
- Database appears empty
- Ingestion seems to fail silently

**Solutions:**
1. **Check Data Ingestion Status:**
   ```sql
   -- Check sync checkpoints
   SELECT * FROM sync_checkpoints;
   
   -- Check game count
   SELECT COUNT(*) FROM games;
   
   -- Check recent games
   SELECT title, updated_at FROM games 
   ORDER BY updated_at DESC LIMIT 10;
   ```

2. **Manually Trigger Ingestion:**
   ```bash
   # Test RAWG ingestion
   supabase functions invoke ingest_rawg
   
   # Check logs
   supabase functions logs ingest_rawg
   ```

3. **Verify External API Access:**
   ```bash
   # Test RAWG API
   curl "https://api.rawg.io/api/games?key=YOUR_KEY&page_size=1"
   
   # Test Steam API
   curl "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
   ```

4. **Check Vector Storage:**
   ```sql
   -- Verify embeddings exist
   SELECT COUNT(*) FROM game_vectors;
   
   -- Check for games without embeddings
   SELECT g.id, g.title 
   FROM games g 
   LEFT JOIN game_vectors gv ON g.id = gv.game_id 
   WHERE gv.game_id IS NULL;
   ```

## 🔧 Debug Tools & Commands

### Database Debugging
```bash
# Connect to database
supabase db connect

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Check active connections
SELECT * FROM pg_stat_activity WHERE state = 'active';

# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM games WHERE title ILIKE '%zelda%';
```

### Function Debugging
```bash
# Serve functions locally with debugging
supabase functions serve --debug

# Test specific function
curl -X POST http://localhost:54321/functions/v1/api_router \
  -H "Authorization: Bearer $(supabase auth get-session --format json | jq -r .access_token)" \
  -H "Content-Type: application/json" \
  -d '{"action": "similar", "query": "test"}'

# Watch function logs in real-time
supabase functions logs api_router --follow
```

### Performance Monitoring
```bash
# Check system resources
top -p $(pgrep -f "supabase\|next")

# Monitor network requests
netstat -an | grep :3000

# Check disk usage
df -h
du -sh node_modules/
```

## 🆘 Getting Help

### Before Asking for Help
1. **Check the logs** - Most issues have error messages in logs
2. **Search existing issues** - Check GitHub issues for similar problems
3. **Try the basics** - Restart services, clear caches, check environment
4. **Isolate the problem** - Test individual components

### Information to Include
When reporting issues, include:
- **Error messages** - Full error text and stack traces
- **Environment details** - OS, Node version, package versions
- **Steps to reproduce** - Exact commands and actions taken
- **Expected vs actual behavior** - What should happen vs what happens
- **Configuration** - Relevant environment variables (redacted)
- **Logs** - Function logs, browser console, terminal output

### Useful Commands for Bug Reports
```bash
# System information
node --version
npm --version
supabase --version

# Package information
npm list --depth=0

# Environment check (redact sensitive values)
env | grep -E "(OPENAI|PINECONE|SUPABASE)" | sed 's/=.*/=***/'

# Service status
supabase status
curl -s http://localhost:3000/api/health || echo "Frontend not running"
```

### Emergency Recovery
If the system is completely broken:

```bash
# Nuclear option - reset everything
supabase stop
rm -rf node_modules package-lock.json .next
npm install
supabase start
supabase db reset
npm run dev
```

## 📞 Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community help
- **Documentation**: Check README.md and API docs first
- **Logs**: Always check function and application logs

Remember: Most issues are configuration-related. Double-check environment variables, API keys, and service status before diving into complex debugging.