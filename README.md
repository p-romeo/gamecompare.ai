# GameCompare.ai

An AI-powered game recommendation platform that helps users discover games through conversational AI. The system combines semantic search with large language models to provide intelligent, personalized game recommendations.

## ✨ Features

- **Conversational AI**: Natural language game discovery using GPT-4o
- **Semantic Search**: Vector-based game matching with OpenAI embeddings
- **Game Comparison**: Side-by-side detailed game analysis
- **Smart Filtering**: Filter by price, platform, playtime, and release year
- **Affiliate Integration**: Monetization through tracked store redirects
- **Real-time Streaming**: Live AI responses for better user experience
- **Multi-source Data**: Aggregated data from RAWG, Steam, and OpenCritic

## 🏗️ Tech Stack

- **Frontend**: Next.js 14 with TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Supabase Edge Functions (Deno runtime)
- **Database**: Supabase Postgres with pgvector and pgcrypto extensions
- **Vector Search**: Pinecone (1,536-dimensional embeddings)
- **AI Services**: OpenAI GPT-4o and text-embedding-3-small
- **Testing**: Jest (unit), Cypress (E2E), Lighthouse (performance)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase CLI
- Docker (for local Supabase)

### 1. Clone and Install
```bash
git clone <repository-url>
cd gamecompare-ai
npm install
```

### 2. Environment Setup
```bash
cp .env.local.example .env.local
# Edit .env.local with your API keys
```

### 3. Database Setup
```bash
npm run supabase:start
supabase db reset
```

### 4. Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

> **📖 For detailed setup instructions, see [docs/deployment.md](./docs/deployment.md)**

## 📚 Documentation

- **[API Documentation](./docs/api.md)** - Complete API reference and integration guide
- **[Deployment Guide](./docs/deployment.md)** - Production deployment and environment setup
- **[Security Guide](./docs/security.md)** - Security implementation and best practices
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

## 🧪 Testing

```bash
npm run test              # Run all unit tests
npm run test:e2e          # Run Cypress E2E tests
npm run test:performance  # Performance tests with Lighthouse
```

**Test Coverage**: >90% on utility modules, full API endpoint coverage, critical user workflows

## 📈 Performance Targets

- **Response Time**: <2s first token at P95
- **Error Rate**: <1% over 24h periods
- **Uptime**: >99.9% availability
- **Lighthouse Scores**: >90 across all metrics

## 🔧 Development

### Project Structure
```
├── src/                    # Frontend application
│   ├── components/         # React components
│   ├── lib/               # Utility libraries
│   └── pages/             # Next.js pages and API routes
├── supabase/              # Backend services
│   ├── functions/         # Edge Functions
│   └── migrations/        # Database migrations
├── docs/                  # Documentation
├── cypress/               # E2E tests
└── scripts/               # Build and utility scripts
```

### Code Standards
- TypeScript strict mode with comprehensive type safety
- ESLint + Prettier for consistent code formatting
- Automated testing with >90% coverage requirements
- Security-first development practices

## 🚀 Deployment

**Quick Deploy:**
```bash
npm run build
vercel --prod
```

> **📖 For complete deployment instructions, see [docs/deployment.md](./docs/deployment.md)**

## 🔍 Troubleshooting

**Common Issues:**
- OpenAI API key configuration
- Pinecone connection setup
- Database migration issues
- Environment variable problems

> **📖 For detailed troubleshooting, see [docs/troubleshooting.md](./docs/troubleshooting.md)**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm run test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

**Development Guidelines:**
- Follow TypeScript strict mode and project standards
- Write comprehensive tests for new functionality
- Update documentation for API changes
- Follow security best practices

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

- **Documentation**: See [docs/](./docs/) directory for comprehensive guides
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Security**: See [docs/security.md](./docs/security.md) for security policies

---

Built with ❤️ using Next.js, Supabase, and OpenAI