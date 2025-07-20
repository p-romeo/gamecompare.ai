# Enhanced Database Schema Documentation

## Overview

This migration enhances the GameCompare.ai database with improved search capabilities, conversation tracking, price history, and performance optimizations.

## New Features

### 1. Computed Search Text Column

- **Table**: `games`
- **Column**: `search_text` (tsvector, computed)
- **Purpose**: Provides full-text search fallback when vector search is unavailable
- **Content**: Combines title, description, genres, and platforms into searchable text

### 2. Price History Tracking

- **Table**: `price_history`
- **Purpose**: Track price changes over time across different stores
- **Constraints**: Store values limited to supported platforms
- **Indexes**: Optimized for game/store/date queries

### 3. Conversation Tracking

- **Tables**: `conversations`, `conversation_messages`
- **Purpose**: Enable chat continuity and conversation history
- **Features**: 
  - Session-based conversation grouping
  - Message role validation (user/assistant)
  - Metadata storage for additional context
  - Automatic timestamp updates via triggers

## Performance Optimizations

### Indexes Added

#### Games Table
- `games_search_text_idx`: GIN index for full-text search
- `games_release_date_idx`: Date-based sorting
- `games_price_usd_idx`: Price range queries
- `games_critic_score_idx`: Score-based sorting
- `games_genres_idx`: Genre filtering (GIN)
- `games_platforms_idx`: Platform filtering (GIN)
- `games_steam_appid_idx`: Steam integration lookups

#### Vector Search
- `game_vectors_embedding_idx`: IVFFlat index for vector similarity

#### Price History
- `price_history_game_id_idx`: Game-based queries
- `price_history_store_idx`: Store-based queries
- `price_history_recorded_at_idx`: Time-based sorting
- `price_history_game_store_date_idx`: Composite index for latest prices

#### Conversation Tables
- `conversations_session_id_idx`: Session lookups
- `conversations_created_at_idx`: Time-based sorting
- `conversation_messages_conversation_id_idx`: Message retrieval
- `conversation_messages_created_at_idx`: Message ordering

## Views

### games_with_current_prices
Combines games with their most recent price information from each store.

### conversation_summaries
Provides conversation statistics including message counts and last activity.

## Triggers

### update_conversation_updated_at()
Automatically updates conversation `updated_at` timestamp when new messages are added.

## Usage Examples

### Full-Text Search Fallback
```sql
SELECT title, ts_rank(search_text, to_tsquery('english', 'action & adventure')) as rank
FROM games 
WHERE search_text @@ to_tsquery('english', 'action & adventure')
ORDER BY rank DESC;
```

### Price History Queries
```sql
-- Get latest price for each store
SELECT DISTINCT ON (store) store, price_usd, recorded_at
FROM price_history 
WHERE game_id = $1 
ORDER BY store, recorded_at DESC;
```

### Conversation Retrieval
```sql
-- Get conversation with messages
SELECT c.session_id, cm.role, cm.content, cm.created_at
FROM conversations c
JOIN conversation_messages cm ON c.id = cm.conversation_id
WHERE c.session_id = $1
ORDER BY cm.created_at;
```

## Testing

Run the test script to validate the schema:
```sql
\i supabase/migrations/test_enhanced_schema.sql
```

The test script validates:
- Computed column functionality
- Index performance
- Constraint enforcement
- Trigger behavior
- View functionality

## Migration Notes

- All changes are additive and backward compatible
- Existing data is preserved
- Computed columns are automatically populated
- Indexes are created concurrently where possible
- Views provide convenient access patterns

## Performance Impact

- Initial migration may take time on large datasets due to index creation
- Computed columns add minimal storage overhead
- Indexes improve query performance at the cost of write performance
- Vector index creation requires sufficient memory allocation