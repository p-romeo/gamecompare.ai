# Database Conventions and Patterns

## Schema Design Principles

### Table Naming
- Use lowercase with underscores (snake_case)
- Plural nouns for table names (e.g., `games`, `store_links`)
- Descriptive names that clearly indicate purpose

### Column Conventions
- Primary keys: `id uuid primary key default gen_random_uuid()`
- Foreign keys: `{table}_id` format
- Timestamps: Use `timestamptz` type, default to `now()`
- Arrays: Use PostgreSQL array types (e.g., `text[]` for genres)

### Required Extensions
```sql
create extension if not exists pgcrypto;  -- UUID generation
create extension if not exists pgvector;  -- Vector embeddings
create extension if not exists pg_cron;   -- Scheduled jobs
```

## Data Ingestion Patterns

### Sync Checkpoints
Always track ingestion progress:
```sql
-- Update checkpoint after successful ingestion
insert into sync_checkpoints (source, last_run) 
values ('rawg', now()) 
on conflict (source) do update set last_run = now();
```

### Upsert Operations
Use conflict resolution for data updates:
```sql
insert into games (rawg_id, title, release_date, ...)
values ($1, $2, $3, ...)
on conflict (rawg_id) do update set
  title = excluded.title,
  updated_at = now();
```

### Vector Storage
- Store embeddings in separate `game_vectors` table
- Use 1,536-dimensional vectors for OpenAI embeddings
- Index vectors for similarity search performance

## Query Optimization

### Indexing Strategy
- Primary keys automatically indexed
- Foreign keys should be indexed
- Vector columns need specialized indexes
- Composite indexes for common query patterns

### Performance Considerations
- Use `EXPLAIN ANALYZE` to optimize slow queries
- Implement pagination for large result sets
- Consider materialized views for complex aggregations
- Monitor query performance with Supabase metrics

## Security Patterns

### Row-Level Security (RLS)
- Enable RLS on all user-facing tables
- Create policies for different access levels
- Test policies thoroughly before deployment

### Data Validation
- Use CHECK constraints for data integrity
- Validate foreign key relationships
- Sanitize input data before storage