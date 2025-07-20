-- Test script for enhanced database schema
-- This script validates the new schema with sample data

-- Test data insertion
BEGIN;

-- Insert test game data
INSERT INTO games (rawg_id, title, release_date, genres, platforms, short_description, price_usd, critic_score, steam_appid) VALUES
(12345, 'Test Game One', '2023-01-15', ARRAY['Action', 'Adventure'], ARRAY['PC', 'PlayStation 5'], 'An exciting action-adventure game with stunning visuals', 59.99, 85, 123456),
(12346, 'Test Game Two', '2023-06-20', ARRAY['RPG', 'Fantasy'], ARRAY['PC', 'Xbox Series X'], 'Epic fantasy RPG with deep character customization', 49.99, 92, 123457),
(12347, 'Test Game Three', '2024-03-10', ARRAY['Strategy', 'Simulation'], ARRAY['PC'], 'Complex strategy simulation for hardcore gamers', 39.99, 78, 123458);

-- Test that search_text column is automatically populated
SELECT title, search_text FROM games WHERE rawg_id IN (12345, 12346, 12347);

-- Insert test price history data
INSERT INTO price_history (game_id, store, price_usd) 
SELECT id, 'steam', price_usd FROM games WHERE rawg_id = 12345;

INSERT INTO price_history (game_id, store, price_usd) 
SELECT id, 'epic', price_usd * 0.9 FROM games WHERE rawg_id = 12345;

-- Insert test conversation data
INSERT INTO conversations (session_id) VALUES ('test-session-123');

INSERT INTO conversation_messages (conversation_id, role, content, metadata)
SELECT 
  c.id,
  'user',
  'I want to find games similar to The Witcher 3',
  '{"query_type": "similarity_search"}'::jsonb
FROM conversations c WHERE session_id = 'test-session-123';

INSERT INTO conversation_messages (conversation_id, role, content, metadata)
SELECT 
  c.id,
  'assistant',
  'Here are some great RPGs similar to The Witcher 3...',
  '{"games_recommended": 3, "response_time_ms": 1250}'::jsonb
FROM conversations c WHERE session_id = 'test-session-123';

-- Test queries to validate functionality

-- Test full-text search functionality
SELECT title, ts_rank(search_text, to_tsquery('english', 'action & adventure')) as rank
FROM games 
WHERE search_text @@ to_tsquery('english', 'action & adventure')
ORDER BY rank DESC;

-- Test price history queries
SELECT g.title, ph.store, ph.price_usd, ph.recorded_at
FROM games g
JOIN price_history ph ON g.id = ph.game_id
WHERE g.rawg_id = 12345
ORDER BY ph.recorded_at DESC;

-- Test conversation queries
SELECT 
  cs.session_id,
  cs.message_count,
  cs.last_message_at,
  cm.role,
  cm.content
FROM conversation_summaries cs
JOIN conversation_messages cm ON cs.id = cm.conversation_id
WHERE cs.session_id = 'test-session-123'
ORDER BY cm.created_at;

-- Test games with current prices view
SELECT title, current_price_store, current_price, price_updated_at
FROM games_with_current_prices
WHERE rawg_id IN (12345, 12346, 12347);

-- Test index usage with EXPLAIN
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM games 
WHERE search_text @@ to_tsquery('english', 'fantasy & rpg');

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM games 
WHERE price_usd BETWEEN 40 AND 60 
ORDER BY critic_score DESC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM price_history 
WHERE game_id = (SELECT id FROM games WHERE rawg_id = 12345)
ORDER BY recorded_at DESC;

-- Validate constraints
-- This should fail due to invalid role
DO $$
BEGIN
  INSERT INTO conversation_messages (conversation_id, role, content)
  SELECT id, 'invalid_role', 'test' FROM conversations LIMIT 1;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Role constraint working correctly';
END $$;

-- This should fail due to invalid store
DO $$
BEGIN
  INSERT INTO price_history (game_id, store, price_usd)
  SELECT id, 'invalid_store', 10.00 FROM games LIMIT 1;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Store constraint working correctly';
END $$;

-- Test trigger functionality
-- Insert a new message and verify conversation updated_at changes
UPDATE conversations SET updated_at = '2023-01-01 00:00:00'::timestamptz WHERE session_id = 'test-session-123';

INSERT INTO conversation_messages (conversation_id, role, content)
SELECT id, 'user', 'Another test message' FROM conversations WHERE session_id = 'test-session-123';

-- Verify the trigger updated the conversation timestamp
SELECT session_id, updated_at > '2023-01-01 00:00:00'::timestamptz as trigger_worked
FROM conversations WHERE session_id = 'test-session-123';

-- Clean up test data
ROLLBACK;