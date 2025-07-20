-- Enhanced Database Schema Migration
-- This migration adds computed search columns, conversation tracking, price history, and performance indexes

-- Add computed search_text column to games table for better full-text search
ALTER TABLE games ADD COLUMN search_text tsvector 
  GENERATED ALWAYS AS (
    to_tsvector('english', 
      coalesce(title, '') || ' ' || 
      coalesce(short_description, '') || ' ' || 
      array_to_string(coalesce(genres, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(platforms, '{}'), ' ')
    )
  ) STORED;

-- Create price history table for tracking price changes over time
CREATE TABLE price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES games(id) ON DELETE CASCADE,
  store text NOT NULL,
  price_usd numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_history_store_check CHECK (store IN ('steam', 'epic', 'gog', 'playstation', 'xbox', 'nintendo'))
);

-- Create conversation tracking tables
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for improved query performance

-- Index for full-text search fallback when vector search is unavailable
CREATE INDEX games_search_text_idx ON games USING gin(search_text);

-- Indexes for common game queries
CREATE INDEX games_release_date_idx ON games(release_date DESC);
CREATE INDEX games_price_usd_idx ON games(price_usd) WHERE price_usd IS NOT NULL;
CREATE INDEX games_critic_score_idx ON games(critic_score DESC) WHERE critic_score IS NOT NULL;
CREATE INDEX games_genres_idx ON games USING gin(genres);
CREATE INDEX games_platforms_idx ON games USING gin(platforms);
CREATE INDEX games_steam_appid_idx ON games(steam_appid) WHERE steam_appid IS NOT NULL;

-- Indexes for store_links table
CREATE INDEX store_links_store_idx ON store_links(store);

-- Indexes for game_vectors table (vector similarity search)
CREATE INDEX game_vectors_embedding_idx ON game_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes for price_history table
CREATE INDEX price_history_game_id_idx ON price_history(game_id);
CREATE INDEX price_history_store_idx ON price_history(store);
CREATE INDEX price_history_recorded_at_idx ON price_history(recorded_at DESC);
CREATE INDEX price_history_game_store_date_idx ON price_history(game_id, store, recorded_at DESC);

-- Indexes for conversation tables
CREATE INDEX conversations_session_id_idx ON conversations(session_id);
CREATE INDEX conversations_created_at_idx ON conversations(created_at DESC);
CREATE INDEX conversation_messages_conversation_id_idx ON conversation_messages(conversation_id);
CREATE INDEX conversation_messages_created_at_idx ON conversation_messages(created_at DESC);

-- Indexes for click_logs table
CREATE INDEX click_logs_game_id_idx ON click_logs(game_id);
CREATE INDEX click_logs_store_idx ON click_logs(store);
CREATE INDEX click_logs_clicked_at_idx ON click_logs(clicked_at DESC);

-- Indexes for sync_checkpoints table
CREATE INDEX sync_checkpoints_last_run_idx ON sync_checkpoints(last_run DESC);

-- Add function to automatically update conversation updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations 
  SET updated_at = now() 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update conversation timestamp when messages are added
CREATE TRIGGER conversation_messages_update_conversation
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_updated_at();

-- Add helpful views for common queries

-- View for games with their latest prices
CREATE VIEW games_with_current_prices AS
SELECT 
  g.*,
  ph.store as current_price_store,
  ph.price_usd as current_price,
  ph.recorded_at as price_updated_at
FROM games g
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (store) store, price_usd, recorded_at
  FROM price_history 
  WHERE game_id = g.id 
  ORDER BY store, recorded_at DESC
) ph ON true;

-- View for conversation summaries
CREATE VIEW conversation_summaries AS
SELECT 
  c.id,
  c.session_id,
  c.created_at,
  c.updated_at,
  COUNT(cm.id) as message_count,
  MAX(cm.created_at) as last_message_at
FROM conversations c
LEFT JOIN conversation_messages cm ON c.id = cm.conversation_id
GROUP BY c.id, c.session_id, c.created_at, c.updated_at;

-- Add comments for documentation
COMMENT ON TABLE price_history IS 'Tracks price changes for games across different stores over time';
COMMENT ON TABLE conversations IS 'Stores chat conversation sessions for continuity';
COMMENT ON TABLE conversation_messages IS 'Individual messages within conversations';
COMMENT ON COLUMN games.search_text IS 'Computed full-text search vector for fallback when vector search is unavailable';
COMMENT ON VIEW games_with_current_prices IS 'Games with their most recent price information from each store';
COMMENT ON VIEW conversation_summaries IS 'Summary statistics for conversations including message counts';