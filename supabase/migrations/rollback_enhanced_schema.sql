-- Rollback script for enhanced database schema
-- Run this script to undo the enhanced schema changes

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS conversation_summaries;
DROP VIEW IF EXISTS games_with_current_prices;

-- Drop triggers and functions
DROP TRIGGER IF EXISTS conversation_messages_update_conversation ON conversation_messages;
DROP FUNCTION IF EXISTS update_conversation_updated_at();

-- Drop indexes (in reverse order of creation)
DROP INDEX IF EXISTS sync_checkpoints_last_run_idx;
DROP INDEX IF EXISTS click_logs_clicked_at_idx;
DROP INDEX IF EXISTS click_logs_store_idx;
DROP INDEX IF EXISTS click_logs_game_id_idx;
DROP INDEX IF EXISTS conversation_messages_created_at_idx;
DROP INDEX IF EXISTS conversation_messages_conversation_id_idx;
DROP INDEX IF EXISTS conversations_created_at_idx;
DROP INDEX IF EXISTS conversations_session_id_idx;
DROP INDEX IF EXISTS price_history_game_store_date_idx;
DROP INDEX IF EXISTS price_history_recorded_at_idx;
DROP INDEX IF EXISTS price_history_store_idx;
DROP INDEX IF EXISTS price_history_game_id_idx;
DROP INDEX IF EXISTS game_vectors_embedding_idx;
DROP INDEX IF EXISTS store_links_store_idx;
DROP INDEX IF EXISTS games_steam_appid_idx;
DROP INDEX IF EXISTS games_platforms_idx;
DROP INDEX IF EXISTS games_genres_idx;
DROP INDEX IF EXISTS games_critic_score_idx;
DROP INDEX IF EXISTS games_price_usd_idx;
DROP INDEX IF EXISTS games_release_date_idx;
DROP INDEX IF EXISTS games_search_text_idx;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS conversation_messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS price_history;

-- Remove computed column from games table
ALTER TABLE games DROP COLUMN IF EXISTS search_text;

-- Note: We don't drop the original tables (games, store_links, game_vectors, etc.)
-- as they were part of the initial schema and may contain important data