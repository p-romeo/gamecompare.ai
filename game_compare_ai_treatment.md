# 🎮 GameCompare.ai – Cursor Execution Blueprint (Graduate-Level)

*This document provides a meticulously detailed protocol for automated execution by the Cursor agent. Each directive is specified unambiguously to ensure consistent, repeatable results.* 📘✅🔍

---

## I. Conceptual Framework and Rationale 💡🎯🚀

**Objective:** Design and deploy a resilient, scalable system that continually ingests, normalizes, and indexes video game metadata from RAWG, Steam/SteamSpy, and OpenCritic. Employ GPT-4o for semantically precise retrieval and reasoning and implement affiliate redirections for monetization. 🔄

**Rationale:** Gamers, content creators, and guardians require accurate, contextual recommendations that respect time constraints, platform preferences, and budget. Automating data ingestion and embedding generation guarantees freshness and relevance at scale. ⚡

**Scope:**

- Relational database: Supabase Postgres extended with pgvector and pgcrypto
- ETL and API routing: Deno-based Edge Functions scheduled with pg\_cron
- Semantic index: Pinecone (1,536-dimensional embeddings)
- Front end: Next.js 14 with SSR/CSR hybrid architecture, styled with Tailwind CSS

---

## II. Foundational Definitions and Conventions 🔑📚📝

- **PROJECT\_REF:** Supabase project reference identifier, used in CLI commands and HTTP endpoints.
- **VAULT\_SECRET(****):** Retrieval of the secret named `<KEY>` from Supabase Vault (`vault.get_secret('<KEY>')` in SQL, `Deno.env.get('KEY')` in Edge Functions).
- **ISO\_TIMESTAMP:** Timestamp format `YYYY-MM-DDTHH:MM:SSZ`.
- **Embedding Dimension:** A 1,536-element float vector produced by OpenAI’s `text-embedding-3-small` endpoint.

---

## III. Architecture and Data Flow 🏗️🔄🗄️

### A. Component Overview

| Layer          | Technology                              | Responsibility                                                      |
| -------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Frontend       | Next.js 14, Tailwind CSS, shadcn/ui     | Conversational UI, game cards, responsive design                    |
| Edge Functions | Supabase Edge (TypeScript on Deno)      | Scheduled ingestion, API routing, authentication                    |
| Database       | Supabase Postgres + pgcrypto + pgvector | Stores game metadata, affiliate links, embeddings, sync checkpoints |
| Vector Index   | Pinecone (1,536 dimensions)             | Hosts semantic embeddings for similarity searches                   |
| AI Services    | OpenAI GPT-4o + Embeddings API          | Generates chat responses and embeddings                             |
| Scheduling     | pg\_cron + Supabase Cron UI             | Periodic invocation of Edge Functions                               |

### B. Directory Structure

```
/
├ supabase/
│  ├ functions/
│  │  ├ ingest_rawg.ts         # Cron-driven RAWG ingestion
│  │  ├ ingest_steam.ts        # Cron-driven Steam & SteamSpy ingestion
│  │  ├ ingest_opencritic.ts   # Cron-driven OpenCritic ingestion
│  │  └ api_router.ts          # Routes: /similar, /compare, /game, /click
│  └ migrations/
│     └ initial.sql            # Database schema definitions
├ src/
│  ├ components/              # React UI components
│  ├ pages/                   # Next.js page routes
│  └ lib/                     # Utility modules (gpt.ts, embeddings.ts)
└ .env.local                  # Placeholder environment variables
```

---

## IV. Configuration, Provisioning, and Security 🛠️🔐🧩

### A. Enable Supabase Extensions

Via Supabase Dashboard → Database → Extensions, enable:

```text
pgcrypto    # UUID generation and cryptographic utilities
pgvector    # Native vector data type for embeddings
pg_cron     # In-database scheduling for ETL jobs
```

### B. Deploy Database Schema

Add to `supabase/migrations/initial.sql` and apply:

```sql
-- Enable extensions
create extension if not exists pgcrypto;
create extension if not exists pgvector;

-- Core tables
game table
games(
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
```

### C. Manage Secrets

In Supabase Vault (Settings → Vault), insert:

```
RAWG_API_KEY
STEAM_API_KEY
STEAMSPY_API_KEY
OPENCRITIC_API_KEY
PINECONE_API_KEY
PINECONE_ENVIRONMENT
OPENAI_API_KEY
AFFILIATE_STEAM
AFFILIATE_EPIC
AFFILIATE_GOG
SERVICE_ROLE_KEY
```

Access secrets with `Deno.env.get('KEY')` or `vault.get_secret('KEY')`.

### D. CLI Setup

```bash
npm install -g supabase
deno upgrade
supabase login                   # Authenticate with personal token
supabase link --project-ref PROJECT_REF
```

### E. Security Practices

- Enforce Row-Level Security (RLS) to restrict unauthorized data access.
- Validate JWTs or API keys (`SERVICE_ROLE_KEY`) in Edge Functions.
- Rotate Vault secrets regularly; revoke outdated tokens.

---

## V. Scheduling and Cron Jobs ⏰🔃📅

Run these SQL commands, substituting `PROJECT_REF`:

```sql
-- RAWG ingestion: hourly
select cron.schedule('rawg_hourly','0 * * * *',$$
  select net.http_post(
    url:='https://'||PROJECT_REF||'.supabase.co/functions/v1/ingest_rawg',
    headers:=jsonb_build_object('Authorization','Bearer '||vault.get_secret('SERVICE_ROLE_KEY'))
  );
$$);

-- Steam ingestion: every 30 minutes
select cron.schedule('steam_30min','*/30 * * * *',$$
  select net.http_post(
    url:='https://'||PROJECT_REF||'.supabase.co/functions/v1/ingest_steam',
    headers:=jsonb_build_object('Authorization','Bearer '||vault.get_secret('SERVICE_ROLE_KEY'))
  );
$$);

-- OpenCritic ingestion: daily at 03:15 UTC
select cron.schedule('opencritic_daily','15 03 * * *',$$
  select net.http_post(
    url:='https://'||PROJECT_REF||'.supabase.co/functions/v1/ingest_opencritic',
    headers:=jsonb_build_object('Authorization','Bearer '||vault.get_secret('SERVICE_ROLE_KEY'))
  );
$$);
```

Monitor `cron.job_run_details` and configure alerts for failure rates above 1%.

---

## VI. Ingestion Function Specifications 🔄💾🧰

### A. ingest\_rawg.ts

**Trigger:** `rawg_hourly` cron

**Process:**

1. Read `last_run` from `sync_checkpoints` where `source='rawg'`.
2. Fetch paginated data from `https://api.rawg.io/api/games?updated_since={ISO_TIMESTAMP}&key={RAWG_API_KEY}`.
3. Transform results with `mapRawgToRow()` to match the `games` schema.
4. Upsert into `games` table (conflict on `rawg_id`).
5. Call `embedAndUpsert(ids)` to compute and store embeddings.
6. Update `sync_checkpoints` with the new timestamp.

**Error Handling:** Retry HTTP 5xx errors up to 3 times with exponential backoff; log to Supabase Functions log.

### B. ingest\_steam.ts

**Trigger:** `steam_30min` cron

**Process:** Retrieve Steam and SteamSpy data, normalize fields, upsert `price_usd`, `genres`, `platforms`; update `updated_at`; optionally re-embed if descriptive data changed.

### C. ingest\_opencritic.ts

**Trigger:** `opencritic_daily` cron

**Process:** Fetch critic scores for each `steam_appid`; upsert `critic_score` in `games`.

### D. api\_router.ts

**Routes:**

```
POST   /similar        → similarHandler(body: { query: string; filters?: FilterState })
POST   /compare        → compareHandler(body: { left: string; right: string })
GET    /game/:id       → gameHandler(params.id)
GET    /click/:gid/:store → clickHandler(params)  # Logs click and redirects
```

**Handler Requirements:**

- Authenticate using `SERVICE_ROLE_KEY`.
- Query Pinecone for similarity in `/similar`.
- Construct GPT prompts using metadata and embeddings for `/compare` and `/similar`.
- Return JSON matching TypeScript interfaces exactly.

---

## VII. Interface Contracts (TypeScript) 📐📊📈

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface GameSummary {
  id: string;
  title: string;
  price: number;
  score: number;
  platforms: string[];
}

export interface GameDetail extends GameSummary {
  description: string;
  genres: string[];
  playtime: number;
}

export interface FilterState {
  playtimeMax?: number;
  priceMax?: number;
  platforms?: string[];
  yearRange?: [number, number];
}
```

Props and API responses must adhere precisely to these contracts.

---

## VIII. Quality Assurance Matrix and Metrics ✅🧪📏

| Dimension                | Tool       | Metric / Threshold                                     |
| ------------------------ | ---------- | ------------------------------------------------------ |
| Unit Testing             | Jest       | ≥90% code coverage on mapper and utility modules       |
| API Integration Testing  | Supertest  | 100% compliance with OpenAPI schema                    |
| End-to-End Testing       | Cypress    | 95% scenario coverage for chat, filters, and redirects |
| Performance Benchmarking | Lighthouse | First-token latency <2s at 95th percentile             |
| Error Monitoring         | Supabase   | <1% error rate per 24h; alerts on spikes               |
| Security Audits          | CI Scanner | No critical vulnerabilities; RLS policies enforced     |

---

## IX. Cursor Task Pipeline (Detailed Sequence) 🚀🗂️📌

1. **Scaffold project** per Section III structure. Confirm file and directory names.
2. **Create **`` with placeholders for all secrets in Section IV.C.
3. **Generate migration**: add SQL from Section IV.B to `initial.sql` and apply.
4. **Implement helper modules** in `src/lib`:
   - `fetchAll(url): Promise<any[]>` for handling pagination
   - `mapRawgToRow(obj): Partial<GameRecord>` for data transformation
   - `embedAndUpsert(ids: string[]): Promise<void>` for embedding management
5. **Deploy **`` (Section VI.A); run `supabase functions deploy ingest_rawg`.
6. **Deploy **`` (Section VI.B).
7. **Deploy **`` (Section VI.C).
8. **Develop **`` with routes and handlers per Section VI.D.
9. **Build React components** in `src/components` using contracts from Section VII.
10. **Integrate GPT client** in `src/lib/gpt.ts` with streaming support.
11. **Integrate embeddings logic** in `src/lib/embeddings.ts`, targeting Pinecone.
12. **Implement **``** handler**: log to `click_logs` and redirect.
13. **Write Jest tests** for mappers and utilities.
14. **Write Supertest suites** for API endpoints.
15. **Write Cypress scenarios** for end-to-end flows.
16. **Configure Lighthouse CI** for performance validation.
17. **Draft **`` documenting setup, environment variables, development, and deployment.

Tasks must be executed sequentially to satisfy dependencies.

---

## X. Success Criteria and Monitoring 📊⏱️✅

1. **Data Currency:** `sync_checkpoints.last_run` updates according to intervals (RAWG ≤1h, Steam ≤30min, OpenCritic ≤24h).
2. **API Compliance:** Endpoints return JSON exactly matching TypeScript contracts.
3. **Latency SLA:** First-token latency <2 seconds at 95th percentile.
4. **Monetization:** Redirects include correct `aff_id` and log ≥99% of click events.
5. **Reliability:** Edge Function error rate <1% over 24h; alerts on anomalies.
6. **Security:** No critical vulnerabilities; RLS policies enforced and tested.

---

# End of Cursor Execution Blueprint 🎬🏁✨

