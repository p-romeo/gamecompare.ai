# Pinecone Vector Database Setup Guide

This guide covers setting up Pinecone vector database for GameCompare.ai's semantic search functionality.

## 📋 Prerequisites

- Pinecone account (free tier available)
- Python 3.7+ or Node.js 16+ for setup scripts
- OpenAI API access for embedding generation

## 🚀 Account Setup

### 1. Create Pinecone Account
1. Visit [Pinecone.io](https://www.pinecone.io/)
2. Sign up for a free account
3. Verify your email address
4. Complete account setup

### 2. Get API Credentials
1. Navigate to the Pinecone console
2. Go to "API Keys" section
3. Copy your API key and environment name
4. Note your available regions

## 🏗️ Index Configuration

### Development Index Setup

#### Using Pinecone Console (Recommended)
1. **Login to Pinecone Console**
   - Go to [app.pinecone.io](https://app.pinecone.io/)
   - Click "Create Index"

2. **Configure Index Settings**
   ```
   Index Name: gamecompare-vectors-dev
   Dimensions: 1536
   Metric: cosine
   Pod Type: s1.x1 (Starter)
   Replicas: 1
   ```

3. **Advanced Settings**
   ```
   Metadata Config: 
   {
     "indexed": ["genre", "platform", "price_range", "release_year"]
   }
   ```

#### Using Python Client
```python
import pinecone

# Initialize Pinecone
pinecone.init(
    api_key="your-api-key",
    environment="your-environment"  # e.g., "us-east-1-aws"
)

# Create development index
pinecone.create_index(
    name="gamecompare-vectors-dev",
    dimension=1536,  # OpenAI text-embedding-3-small dimension
    metric="cosine",
    pods=1,
    replicas=1,
    pod_type="s1.x1",
    metadata_config={
        "indexed": ["genre", "platform", "price_range", "release_year"]
    }
)

# Verify index creation
print("Available indexes:", pinecone.list_indexes())
```

#### Using JavaScript Client
```javascript
import { Pinecone } from '@pinecone-database/pinecone'

const pinecone = new Pinecone({
  apiKey: 'your-api-key'
})

// Create development index
await pinecone.createIndex({
  name: 'gamecompare-vectors-dev',
  dimension: 1536,
  metric: 'cosine',
  spec: {
    serverless: {
      cloud: 'aws',
      region: 'us-east-1'
    }
  }
})

// Wait for index to be ready
await pinecone.describeIndex('gamecompare-vectors-dev')
```

### Production Index Setup

#### Production Configuration
```python
# Production index with higher performance
pinecone.create_index(
    name="gamecompare-vectors-prod",
    dimension=1536,
    metric="cosine",
    pods=2,  # Higher capacity
    replicas=1,
    pod_type="p1.x1",  # Performance optimized
    metadata_config={
        "indexed": ["genre", "platform", "price_range", "release_year"]
    }
)
```

#### Serverless Option (Recommended for Production)
```javascript
await pinecone.createIndex({
  name: 'gamecompare-vectors-prod',
  dimension: 1536,
  metric: 'cosine',
  spec: {
    serverless: {
      cloud: 'aws',
      region: 'us-east-1'
    }
  }
})
```

## 🔧 Configuration Details

### Index Specifications

| Setting | Development | Production | Notes |
|---------|-------------|------------|-------|
| **Dimensions** | 1536 | 1536 | OpenAI text-embedding-3-small |
| **Metric** | cosine | cosine | Best for semantic similarity |
| **Pod Type** | s1.x1 | p1.x1 | Starter vs Performance |
| **Pods** | 1 | 2+ | Scale based on QPS needs |
| **Replicas** | 1 | 1-2 | For high availability |

### Metadata Schema
```json
{
  "indexed": [
    "genre",
    "platform", 
    "price_range",
    "release_year",
    "rating_category"
  ]
}
```

### Vector Metadata Structure
```json
{
  "game_id": "uuid-string",
  "title": "Game Title",
  "genre": ["Action", "Adventure"],
  "platform": ["PC", "PlayStation", "Xbox"],
  "price_range": "20-40",
  "release_year": 2023,
  "rating_category": "mature"
}
```

## 📊 Data Population

### Initial Data Load Script
```python
import pinecone
import openai
from supabase import create_client
import json
from typing import List, Dict

# Configuration
PINECONE_API_KEY = "your-pinecone-key"
PINECONE_ENV = "your-environment"
OPENAI_API_KEY = "your-openai-key"
SUPABASE_URL = "your-supabase-url"
SUPABASE_KEY = "your-supabase-key"

# Initialize clients
pinecone.init(api_key=PINECONE_API_KEY, environment=PINECONE_ENV)
openai.api_key = OPENAI_API_KEY
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def generate_embedding(text: str) -> List[float]:
    """Generate embedding for text using OpenAI"""
    response = openai.Embedding.create(
        model="text-embedding-3-small",
        input=text
    )
    return response['data'][0]['embedding']

def create_search_text(game: Dict) -> str:
    """Create searchable text from game data"""
    parts = [
        game.get('title', ''),
        game.get('short_description', ''),
        ' '.join(game.get('genres', [])),
        ' '.join(game.get('platforms', []))
    ]
    return ' '.join(filter(None, parts))

def populate_vectors():
    """Populate Pinecone index with game vectors"""
    index = pinecone.Index("gamecompare-vectors-dev")
    
    # Fetch games from Supabase
    response = supabase.table('games').select('*').execute()
    games = response.data
    
    batch_size = 100
    for i in range(0, len(games), batch_size):
        batch = games[i:i + batch_size]
        vectors = []
        
        for game in batch:
            # Generate embedding
            search_text = create_search_text(game)
            embedding = generate_embedding(search_text)
            
            # Prepare metadata
            metadata = {
                "game_id": game['id'],
                "title": game['title'],
                "genre": game.get('genres', []),
                "platform": game.get('platforms', []),
                "price_range": categorize_price(game.get('price_usd')),
                "release_year": extract_year(game.get('release_date')),
                "rating_category": categorize_rating(game.get('critic_score'))
            }
            
            vectors.append({
                "id": game['id'],
                "values": embedding,
                "metadata": metadata
            })
        
        # Upsert batch to Pinecone
        index.upsert(vectors=vectors)
        print(f"Processed {i + len(batch)} games")

def categorize_price(price: float) -> str:
    """Categorize price into ranges"""
    if not price:
        return "free"
    elif price < 10:
        return "0-10"
    elif price < 20:
        return "10-20"
    elif price < 40:
        return "20-40"
    elif price < 60:
        return "40-60"
    else:
        return "60+"

def extract_year(date_str: str) -> int:
    """Extract year from date string"""
    if not date_str:
        return None
    try:
        return int(date_str[:4])
    except:
        return None

def categorize_rating(score: float) -> str:
    """Categorize critic score"""
    if not score:
        return "unrated"
    elif score >= 90:
        return "excellent"
    elif score >= 80:
        return "great"
    elif score >= 70:
        return "good"
    elif score >= 60:
        return "mixed"
    else:
        return "poor"

if __name__ == "__main__":
    populate_vectors()
```

### Incremental Updates
```python
def update_game_vector(game_id: str, game_data: Dict):
    """Update a single game vector"""
    index = pinecone.Index("gamecompare-vectors-dev")
    
    # Generate new embedding
    search_text = create_search_text(game_data)
    embedding = generate_embedding(search_text)
    
    # Update metadata
    metadata = {
        "game_id": game_id,
        "title": game_data['title'],
        "genre": game_data.get('genres', []),
        "platform": game_data.get('platforms', []),
        "price_range": categorize_price(game_data.get('price_usd')),
        "release_year": extract_year(game_data.get('release_date')),
        "rating_category": categorize_rating(game_data.get('critic_score'))
    }
    
    # Upsert to Pinecone
    index.upsert(vectors=[{
        "id": game_id,
        "values": embedding,
        "metadata": metadata
    }])
```

## 🔍 Testing & Validation

### Index Health Check
```python
def check_index_health():
    """Check Pinecone index health and statistics"""
    index = pinecone.Index("gamecompare-vectors-dev")
    
    # Get index stats
    stats = index.describe_index_stats()
    print(f"Total vectors: {stats['total_vector_count']}")
    print(f"Index fullness: {stats['index_fullness']}")
    
    # Test query
    test_embedding = generate_embedding("action adventure games")
    results = index.query(
        vector=test_embedding,
        top_k=5,
        include_metadata=True
    )
    
    print("Test query results:")
    for match in results['matches']:
        print(f"- {match['metadata']['title']} (score: {match['score']:.3f})")
```

### Search Quality Testing
```python
def test_search_quality():
    """Test search quality with known queries"""
    index = pinecone.Index("gamecompare-vectors-dev")
    
    test_queries = [
        "open world RPG games",
        "indie puzzle platformers",
        "multiplayer shooter games",
        "story-driven adventure games"
    ]
    
    for query in test_queries:
        print(f"\nQuery: {query}")
        embedding = generate_embedding(query)
        results = index.query(
            vector=embedding,
            top_k=3,
            include_metadata=True
        )
        
        for match in results['matches']:
            metadata = match['metadata']
            print(f"- {metadata['title']} ({metadata['genre']}) - {match['score']:.3f}")
```

## 📈 Performance Optimization

### Query Optimization
```python
def optimized_search(query: str, filters: Dict = None):
    """Optimized search with filtering"""
    index = pinecone.Index("gamecompare-vectors-prod")
    
    # Generate query embedding
    embedding = generate_embedding(query)
    
    # Build filter
    filter_dict = {}
    if filters:
        if filters.get('genres'):
            filter_dict['genre'] = {"$in": filters['genres']}
        if filters.get('platforms'):
            filter_dict['platform'] = {"$in": filters['platforms']}
        if filters.get('price_range'):
            filter_dict['price_range'] = filters['price_range']
        if filters.get('min_year'):
            filter_dict['release_year'] = {"$gte": filters['min_year']}
    
    # Execute search
    results = index.query(
        vector=embedding,
        top_k=20,
        include_metadata=True,
        filter=filter_dict if filter_dict else None
    )
    
    return results
```

### Batch Operations
```python
def batch_upsert(vectors: List[Dict], batch_size: int = 100):
    """Efficiently upsert vectors in batches"""
    index = pinecone.Index("gamecompare-vectors-prod")
    
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch)
        
        # Rate limiting
        time.sleep(0.1)
```

## 🔒 Security & Access Control

### API Key Management
```bash
# Store API keys securely
export PINECONE_API_KEY="your-api-key"
export PINECONE_ENV="your-environment"

# Use environment variables in code
import os
pinecone.init(
    api_key=os.getenv("PINECONE_API_KEY"),
    environment=os.getenv("PINECONE_ENV")
)
```

### Access Patterns
```python
# Read-only client for search operations
class ReadOnlyPineconeClient:
    def __init__(self, api_key: str, environment: str, index_name: str):
        pinecone.init(api_key=api_key, environment=environment)
        self.index = pinecone.Index(index_name)
    
    def search(self, vector: List[float], **kwargs):
        return self.index.query(vector=vector, **kwargs)
    
    # Disable write operations
    def upsert(self, *args, **kwargs):
        raise PermissionError("Write operations not allowed")
```

## 📊 Monitoring & Maintenance

### Usage Monitoring
```python
def monitor_usage():
    """Monitor Pinecone usage and costs"""
    # Check index statistics
    stats = index.describe_index_stats()
    
    # Log metrics
    print(f"Vector count: {stats['total_vector_count']}")
    print(f"Index size: {stats['index_fullness']}")
    
    # Alert if approaching limits
    if stats['index_fullness'] > 0.8:
        send_alert("Pinecone index approaching capacity")
```

### Maintenance Tasks
```python
def cleanup_old_vectors():
    """Remove vectors for deleted games"""
    # Get active game IDs from database
    active_games = get_active_game_ids()
    
    # Get all vector IDs from Pinecone
    all_vectors = get_all_vector_ids()
    
    # Find orphaned vectors
    orphaned = set(all_vectors) - set(active_games)
    
    # Delete orphaned vectors
    if orphaned:
        index.delete(ids=list(orphaned))
        print(f"Deleted {len(orphaned)} orphaned vectors")
```

## 🚨 Troubleshooting

### Common Issues

#### "Index not found"
```python
# Check if index exists
indexes = pinecone.list_indexes()
if "gamecompare-vectors-dev" not in indexes:
    print("Index does not exist. Create it first.")
```

#### "Dimension mismatch"
```python
# Verify embedding dimensions
embedding = generate_embedding("test")
print(f"Embedding dimension: {len(embedding)}")
# Should be 1536 for text-embedding-3-small
```

#### "Rate limit exceeded"
```python
import time
import random

def rate_limited_operation(operation, max_retries=3):
    for attempt in range(max_retries):
        try:
            return operation()
        except pinecone.exceptions.RateLimitError:
            wait_time = (2 ** attempt) + random.uniform(0, 1)
            time.sleep(wait_time)
    raise Exception("Max retries exceeded")
```

### Performance Issues
```python
# Check query performance
import time

start_time = time.time()
results = index.query(vector=embedding, top_k=10)
query_time = time.time() - start_time

if query_time > 1.0:  # Alert if query takes >1 second
    print(f"Slow query detected: {query_time:.2f}s")
```

## 📞 Support Resources

- **Pinecone Documentation**: [docs.pinecone.io](https://docs.pinecone.io/)
- **Community Forum**: [community.pinecone.io](https://community.pinecone.io/)
- **Status Page**: [status.pinecone.io](https://status.pinecone.io/)
- **Support Email**: support@pinecone.io

## 💰 Cost Optimization

### Free Tier Limits
- **Starter Plan**: 1 pod, 5M vectors, 2 queries/second
- **Paid Plans**: Start at $70/month for higher performance

### Cost Monitoring
```python
def estimate_costs(vector_count: int, queries_per_month: int):
    """Estimate monthly Pinecone costs"""
    # Starter pod can handle ~1M vectors
    pods_needed = max(1, vector_count // 1000000)
    
    # Base cost per pod per month
    base_cost = pods_needed * 70
    
    # Additional query costs (if exceeding free tier)
    if queries_per_month > 100000:
        excess_queries = queries_per_month - 100000
        query_cost = excess_queries * 0.0004  # $0.0004 per 1K queries
    else:
        query_cost = 0
    
    total_cost = base_cost + query_cost
    print(f"Estimated monthly cost: ${total_cost:.2f}")
    return total_cost
```

This setup guide provides everything needed to configure Pinecone for GameCompare.ai's vector search functionality. Follow the steps sequentially and test thoroughly before moving to production.