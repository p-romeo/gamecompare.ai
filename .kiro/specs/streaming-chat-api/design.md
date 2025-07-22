# Design Document

## Overview

This design adds a streaming endpoint `/api/similar/stream` to the existing Supabase Edge Function API router. The endpoint will provide real-time streaming responses for chat interactions while maintaining the same security, validation, and conversation tracking as the existing `/api/similar` endpoint.

## Architecture

### High-Level Flow
1. Client sends POST request to `/api/similar/stream` with query and filters
2. API router validates request and applies security checks
3. System retrieves similar games using existing search functionality
4. GPT client streams response chunks in real-time
5. Each chunk is sent to client as Server-Sent Events (SSE)
6. Conversation history is updated after streaming completes

### Integration Points
- **Existing API Router**: Add new route handler alongside existing `/api/similar` endpoint
- **GPT Client**: Use existing `streamResponse` method for generating streaming responses
- **Conversation Manager**: Leverage existing conversation tracking and session management
- **Security Manager**: Apply same security checks and rate limiting
- **Monitoring**: Use existing performance and business metrics collection

## Components and Interfaces

### Streaming Response Format
The endpoint will use Server-Sent Events (SSE) format for streaming:
```
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked

[chunk1][chunk2][chunk3]...
```

### Request/Response Schema
**Request** (same as existing `/api/similar`):
```typescript
interface StreamingRequest {
  query: string           // Required, 1-500 characters
  filters?: FilterState   // Optional filters object
  conversation_id?: string // Optional conversation ID
}
```

**Response**: Streaming text chunks followed by connection close

### Route Handler Implementation
```typescript
if (pathSegments[2] === 'similar' && pathSegments[3] === 'stream' && req.method === 'POST') {
  // Streaming endpoint logic
}
```

## Data Models

### Streaming Context
```typescript
interface StreamingContext {
  requestId: string
  sessionId: string
  conversationId: string
  startTime: number
  clientIp: string
  userAgent: string
}
```

### Chunk Metadata
```typescript
interface ChunkMetadata {
  chunkCount: number
  totalCharacters: number
  streamDuration: number
}
```

## Error Handling

### Streaming-Specific Errors
1. **Stream Initialization Failure**: Return 500 with error details
2. **Client Disconnection**: Log gracefully and clean up resources
3. **GPT Streaming Error**: Log error and close stream properly
4. **Conversation Save Error**: Log but don't interrupt stream

### Error Response Format
For pre-stream errors, use existing error response format:
```typescript
interface ErrorResponse {
  error: string
  type: ErrorType
  details?: string
  timestamp: string
  requestId: string
}
```

### Graceful Degradation
- If streaming fails during initialization, return standard error response
- If streaming fails mid-stream, close connection gracefully
- Client should implement fallback to non-streaming endpoint

## Testing Strategy

### Unit Tests
- Test route handler with valid/invalid inputs
- Test streaming response generation
- Test error handling scenarios
- Test conversation tracking integration

### Integration Tests
- Test end-to-end streaming flow
- Test client disconnection handling
- Test concurrent streaming requests
- Test fallback behavior

### Performance Tests
- Measure streaming latency vs non-streaming
- Test memory usage during long streams
- Test concurrent streaming capacity
- Validate cleanup after stream completion

## Implementation Details

### Security Considerations
- Apply same authentication and rate limiting as existing endpoints
- Validate input using existing validation schema
- Implement proper CORS headers for streaming
- Handle client disconnections securely

### Performance Optimizations
- Use existing caching for game search results
- Stream chunks immediately without buffering
- Implement proper cleanup for abandoned streams
- Monitor memory usage during streaming

### Monitoring and Logging
- Log streaming requests with same format as existing endpoints
- Track streaming-specific metrics (chunk count, stream duration)
- Monitor client disconnection rates
- Alert on streaming failure rates

### Conversation Integration
- Use existing ConversationManager for session handling
- Save user message before streaming starts
- Save complete assistant response after streaming ends
- Handle conversation errors gracefully without breaking stream

## Deployment Considerations

### Backwards Compatibility
- Existing `/api/similar` endpoint remains unchanged
- New streaming endpoint is additive only
- Client can fallback to non-streaming if needed

### Resource Management
- Implement proper stream cleanup on completion/error
- Monitor concurrent streaming connections
- Set reasonable timeouts for streaming requests

### Configuration
- Use existing environment variables and configuration
- No new configuration required for basic functionality
- Optional: Add streaming-specific timeout configurations