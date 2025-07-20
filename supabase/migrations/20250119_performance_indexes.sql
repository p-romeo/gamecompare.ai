-- Performance optimization indexes for GameCompare.ai
-- This migration adds indexes to improve query performance

-- Composite index for filtered game searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_filters 
ON games (critic_score DESC, user_score DESC, price_usd, release_date DESC) 
WHERE critic_score IS NOT NULL;

-- Index for platform-based searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_platforms_gin 
ON games USING gin(platforms);

-- Index for genre-based searches  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_genres_gin 
ON games USING gin(genres);

-- Index for price range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_price_range 
ON games (price_usd) 
WHERE price_usd IS NOT NULL AND price_usd > 0;

-- Index for full-text search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_search_optimized 
ON games USING gin(search_text);

-- Index for conversation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_messages_lookup 
ON conversation_messages (conversation_id, created_at DESC);

-- Index for click tracking analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_click_logs_analytics 
ON click_logs (game_id, store, created_at DESC);

-- Index for store links lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_links_lookup 
ON store_links (game_id, store);

-- Index for sync checkpoints
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_checkpoints_source 
ON sync_checkpoints (source);

-- Index for price history queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_history_game_time 
ON price_history (game_id, recorded_at DESC);

-- Index for monitoring metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_monitoring_metrics_time 
ON monitoring_metrics (recorded_at DESC);

-- Index for function metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_function_metrics_lookup 
ON function_metrics (function_name, endpoint, recorded_at DESC);

-- Partial index for active games (games with recent activity)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_active 
ON games (updated_at DESC, critic_score DESC) 
WHERE updated_at > (now() - interval '30 days');

-- Index for game vectors (if using pgvector)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_vectors_cosine 
ON game_vectors USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Analyze tables to update statistics
ANALYZE games;
ANALYZE conversation_messages;
ANALYZE click_logs;
ANALYZE store_links;
ANALYZE price_history;
ANALYZE monitoring_metrics;
ANALYZE function_metrics;

-- Create materialized view for popular games
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_games AS
SELECT 
  g.*,
  COALESCE(click_counts.click_count, 0) as total_clicks,
  COALESCE(g.critic_score, 0) + COALESCE(g.user_score, 0) + 
  (COALESCE(click_counts.click_count, 0) * 0.1) as popularity_score
FROM games g
LEFT JOIN (
  SELECT 
    game_id,
    COUNT(*) as click_count
  FROM click_logs 
  WHERE created_at > (now() - interval '30 days')
  GROUP BY game_id
) click_counts ON g.id = click_counts.game_id
WHERE g.critic_score IS NOT NULL OR g.user_score IS NOT NULL
ORDER BY popularity_score DESC;

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_popular_games_score 
ON popular_games (popularity_score DESC);

-- Create refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_popular_games()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY popular_games;
END;
$$ LANGUAGE plpgsql;

-- Schedule materialized view refresh (requires pg_cron extension)
-- This will refresh the popular games view every hour
SELECT cron.schedule(
  'refresh-popular-games',
  '0 * * * *', -- Every hour
  'SELECT refresh_popular_games();'
);

-- Create function to get performance statistics
CREATE OR REPLACE FUNCTION get_performance_stats()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  table_size text,
  index_size text,
  total_size text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname||'.'||tablename as table_name,
    n_tup_ins + n_tup_upd as row_count,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) + pg_indexes_size(schemaname||'.'||tablename)) as total_size
  FROM pg_stat_user_tables 
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to analyze slow queries
CREATE OR REPLACE FUNCTION get_slow_queries()
RETURNS TABLE (
  query text,
  calls bigint,
  total_time double precision,
  mean_time double precision,
  rows bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pg_stat_statements.query,
    pg_stat_statements.calls,
    pg_stat_statements.total_exec_time,
    pg_stat_statements.mean_exec_time,
    pg_stat_statements.rows
  FROM pg_stat_statements 
  WHERE pg_stat_statements.mean_exec_time > 100 -- queries taking more than 100ms on average
  ORDER BY pg_stat_statements.mean_exec_time DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION refresh_popular_games() TO authenticated;
GRANT EXECUTE ON FUNCTION get_performance_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_slow_queries() TO authenticated;
GRANT SELECT ON popular_games TO authenticated;