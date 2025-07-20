-- Schema Validation Script
-- This script validates that all required schema enhancements are in place

-- Check if search_text column exists and is properly configured
SELECT 
  column_name, 
  data_type, 
  is_generated,
  generation_expression
FROM information_schema.columns 
WHERE table_name = 'games' 
  AND column_name = 'search_text';

-- Check if price_history table exists with proper structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'price_history'
ORDER BY ordinal_position;

-- Check if conversation tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('conversations', 'conversation_messages')
  AND table_schema = 'public';

-- Check if required indexes exist
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('games', 'price_history', 'conversations', 'conversation_messages')
  AND indexname LIKE '%_idx'
ORDER BY tablename, indexname;

-- Check if views exist
SELECT table_name, table_type
FROM information_schema.tables 
WHERE table_name IN ('games_with_current_prices', 'conversation_summaries')
  AND table_schema = 'public';

-- Check if trigger function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'update_conversation_updated_at'
  AND routine_schema = 'public';

-- Check if trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'conversation_messages_update_conversation';

-- Validate constraints
SELECT 
  tc.constraint_name,
  tc.table_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name IN ('price_history', 'conversation_messages')
  AND tc.constraint_type = 'CHECK';

-- Test sample data insertion (will be rolled back)
BEGIN;

-- Test game insertion with search_text generation
INSERT INTO games (rawg_id, title, genres, platforms, short_description) 
VALUES (999999, 'Schema Test Game', ARRAY['Action'], ARRAY['PC'], 'Test description');

-- Verify search_text was generated
SELECT title, search_text IS NOT NULL as has_search_text 
FROM games WHERE rawg_id = 999999;

-- Test price_history insertion
INSERT INTO price_history (game_id, store, price_usd)
SELECT id, 'steam', 29.99 FROM games WHERE rawg_id = 999999;

-- Test conversation creation
INSERT INTO conversations (session_id) VALUES ('validation-test');

-- Test message insertion and trigger
INSERT INTO conversation_messages (conversation_id, role, content)
SELECT id, 'user', 'Test message' FROM conversations WHERE session_id = 'validation-test';

-- Verify trigger updated conversation timestamp
SELECT 
  session_id,
  updated_at > created_at as trigger_worked
FROM conversations 
WHERE session_id = 'validation-test';

-- Test constraint validations (these should fail)
DO $validation$
BEGIN
  -- Test invalid role constraint
  BEGIN
    INSERT INTO conversation_messages (conversation_id, role, content)
    SELECT id, 'invalid_role', 'test' FROM conversations WHERE session_id = 'validation-test';
    RAISE EXCEPTION 'Role constraint failed to work';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Role constraint working correctly';
  END;

  -- Test invalid store constraint
  BEGIN
    INSERT INTO price_history (game_id, store, price_usd)
    SELECT id, 'invalid_store', 10.00 FROM games WHERE rawg_id = 999999;
    RAISE EXCEPTION 'Store constraint failed to work';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Store constraint working correctly';
  END;
END $validation$;

ROLLBACK;

-- Final validation summary
SELECT 
  'Schema validation complete' as status,
  now() as validated_at;