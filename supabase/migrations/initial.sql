-- Enable extensions
create extension if not exists pgcrypto;
create extension if not exists pgvector;
create extension if not exists pg_cron;

-- Core tables
create table games(
  id uuid primary key default gen_random_uuid(),
  rawg_id int unique not null,
  title text not null,
  release_date date,
  genres text[],
  platforms text[],
  short_description text,
  price_usd numeric,
  critic_score numeric,
  steam_appid int,
  updated_at timestamptz not null default now()
);

create table store_links(
  game_id uuid references games(id) on delete cascade,
  store text not null,
  url text not null,
  primary key(game_id, store)
);

create table game_vectors(
  game_id uuid primary key references games(id) on delete cascade,
  embedding vector(1536) not null
);

create table sync_checkpoints(
  source text primary key,
  last_run timestamptz
);

create table click_logs(
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id),
  store text,
  clicked_at timestamptz not null default now()
);