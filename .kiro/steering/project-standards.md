# Project Standards and Guidelines

## Tech Stack Standards

### Core Technologies
- **Frontend**: Next.js 14 with TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Supabase Edge Functions (Deno runtime)
- **Database**: Supabase Postgres with pgvector and pgcrypto extensions
- **Vector Search**: Pinecone (1,536-dimensional embeddings)
- **AI Services**: OpenAI GPT-4o and text-embedding-3-small

### Code Quality Standards

#### TypeScript
- Use strict TypeScript configuration
- Define interfaces for all API contracts and data models
- Prefer type safety over `any` types
- Use proper error handling with typed exceptions

#### React/Next.js
- Use functional components with hooks
- Implement proper error boundaries
- Follow Next.js 14 app router patterns when applicable
- Use SSR/CSR hybrid architecture appropriately

#### Database
- Always use parameterized queries to prevent SQL injection
- Implement Row-Level Security (RLS) policies
- Use proper indexing for performance
- Follow migration-based schema changes

#### API Design
- RESTful endpoints with consistent naming
- Proper HTTP status codes
- JSON responses matching TypeScript interfaces
- Authentication using SERVICE_ROLE_KEY for internal functions

### Performance Standards
- First-token latency <2 seconds at 95th percentile
- Code coverage ≥90% for utility modules
- Error rate <1% over 24-hour periods
- Lighthouse performance scores >90

### Security Requirements
- All secrets stored in Supabase Vault
- JWT validation for authenticated endpoints
- Input validation and sanitization
- Regular security audits and dependency updates