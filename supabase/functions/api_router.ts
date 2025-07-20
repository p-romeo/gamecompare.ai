import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ConversationManager, SessionManager } from './utils/conversation_manager.ts'
import { MonitoringClient, MetricData, FunctionMetric } from './utils/monitoring.ts'
import { cacheManager, CacheKeys } from './utils/cache.ts'
import { connectionPool, OptimizedQueryBuilder, ResponseOptimizer, performanceMonitor } from './utils/performance.ts'
import { cdnManager, ResponseOptimization } from './utils/cdn.ts'
import { securityManager } from './utils/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Error types for structured error handling
 */
enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Structured error response
 */
interface ErrorResponse {
  error: string
  type: ErrorType
  details?: string
  timestamp: string
  requestId: string
}

/**
 * Rate limiting store (in-memory for simplicity)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60 // 60 requests per minute

/**
 * Logging utility with structured format
 */
function logRequest(
  method: string,
  path: string,
  requestId: string,
  clientIp?: string,
  userAgent?: string
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    type: 'REQUEST',
    requestId,
    method,
    path,
    clientIp,
    userAgent
  }))
}

function logError(
  error: Error | string,
  requestId: string,
  context?: Record<string, any>
): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    type: 'ERROR',
    requestId,
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    context
  }))
}

function logResponse(
  requestId: string,
  status: number,
  duration: number,
  path: string
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    type: 'RESPONSE',
    requestId,
    status,
    duration,
    path
  }))
}

/**
 * Creates a structured error response with security headers
 */
function createErrorResponse(
  error: string,
  type: ErrorType,
  status: number,
  requestId: string,
  details?: string
): Response {
  const errorResponse: ErrorResponse = {
    error,
    type,
    details,
    timestamp: new Date().toISOString(),
    requestId
  }

  logError(error, requestId, { type, status, details })

  return new Response(
    JSON.stringify(errorResponse),
    { 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        ...securityManager.getSecurityHeaders()
      }, 
      status 
    }
  )
}

/**
 * Creates a secure response with consistent security headers
 */
function createSecureResponse(
  data: any,
  status: number = 200,
  additionalHeaders: HeadersInit = {}
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        ...securityManager.getSecurityHeaders(),
        ...additionalHeaders
      }
    }
  )
}

/**
 * Validates and sanitizes request input
 */
function validateAndSanitizeInput(input: any, schema: Record<string, any>): any {
  const sanitized: any = {}
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = input[key]
    
    if (rules.required && (value === undefined || value === null)) {
      throw new Error(`${key} is required`)
    }
    
    if (value !== undefined && value !== null) {
      if (rules.type === 'string') {
        if (typeof value !== 'string') {
          throw new Error(`${key} must be a string`)
        }
        sanitized[key] = value.trim()
        
        if (rules.minLength && sanitized[key].length < rules.minLength) {
          throw new Error(`${key} must be at least ${rules.minLength} characters`)
        }
        
        if (rules.maxLength && sanitized[key].length > rules.maxLength) {
          throw new Error(`${key} must be at most ${rules.maxLength} characters`)
        }
      } else if (rules.type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`${key} must be an object`)
        }
        sanitized[key] = value
      }
    }
  }
  
  return sanitized
}

/**
 * Rate limiting check
 */
function checkRateLimit(clientIp: string): boolean {
  const now = Date.now()
  const key = clientIp
  const current = rateLimitStore.get(key)
  
  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }
  
  current.count++
  return true
}

/**
 * Gets client IP address from request
 */
function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('x-real-ip') ||
         req.headers.get('cf-connecting-ip') ||
         'unknown'
}

interface FilterState {
  playtimeMax?: number
  priceMax?: number
  platforms?: string[]
  yearRange?: [number, number]
}

serve(async (req) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()
  const clientIp = getClientIp(req)
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const url = new URL(req.url)
  const path = url.pathname

  // Initialize cache manager
  await cacheManager.initialize()

  // Log incoming request
  logRequest(req.method, path, requestId, clientIp, userAgent)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    const response = new Response('ok', { headers: { ...corsHeaders, ...securityManager.getSecurityHeaders() } })
    logResponse(requestId, 200, Date.now() - startTime, path)
    return response
  }

  try {
    // Comprehensive security check
    const securityCheck = await securityManager.checkRequest(req)
    if (!securityCheck.allowed) {
      const response = createErrorResponse(
        securityCheck.reason || 'Security check failed',
        ErrorType.RATE_LIMIT_ERROR,
        429,
        requestId,
        securityCheck.reason
      )
      logResponse(requestId, 429, Date.now() - startTime, path)
      return response
    }

    // Legacy rate limiting check (now handled by security manager, but keeping for compatibility)
    if (!checkRateLimit(clientIp)) {
      const response = createErrorResponse(
        'Rate limit exceeded',
        ErrorType.RATE_LIMIT_ERROR,
        429,
        requestId,
        `Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute allowed`
      )
      logResponse(requestId, 429, Date.now() - startTime, path)
      return response
    }

    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      const response = createErrorResponse(
        'Unauthorized access',
        ErrorType.AUTHENTICATION_ERROR,
        401,
        requestId,
        'Valid SERVICE_ROLE_KEY required in Authorization header'
      )
      logResponse(requestId, 401, Date.now() - startTime, path)
      return response
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Initialize conversation manager and monitoring client
    const conversationManager = new ConversationManager(supabaseUrl, serviceRoleKey)
    const monitoring = new MonitoringClient(supabaseUrl, serviceRoleKey)

    // Parse URL and route
    const pathSegments = path.split('/').filter(Boolean)
    
    // Route handling
    if (pathSegments[2] === 'similar' && req.method === 'POST') {
      // POST /similar - Find similar games
      try {
        const requestBody = await req.json()
        
        // Validate and sanitize input
        const validatedInput = validateAndSanitizeInput(requestBody, {
          query: { type: 'string', required: true, minLength: 1, maxLength: 500 },
          filters: { type: 'object', required: false },
          conversation_id: { type: 'string', required: false }
        })

        const { query, filters, conversation_id } = validatedInput

        // Check cache for similar games query
        const cacheKey = CacheKeys.similarGames(query, filters)
        const cachedResult = await cacheManager.get(cacheKey)
        
        if (cachedResult) {
          // Return cached result with fresh conversation tracking
          const sessionId = SessionManager.getOrCreateSessionId(req)
          const responseHeaders = SessionManager.createSessionHeaders(sessionId, { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-Cache': 'HIT'
          })
          
          const response = createSecureResponse(
            {
              ...cachedResult,
              conversation_id: conversation_id || crypto.randomUUID()
            },
            200,
            { 
              ...SessionManager.createSessionHeaders(sessionId, {}),
              'X-Cache': 'HIT'
            }
          )
          
          // Record cache hit metric
          performanceMonitor.recordQueryTime('similar_games_cached', Date.now() - startTime)
          logResponse(requestId, 200, Date.now() - startTime, path)
          return response
        }

        // Handle session management
        const sessionId = SessionManager.getOrCreateSessionId(req)
        let conversation

        try {
          if (conversation_id) {
            // Try to get existing conversation
            const messages = await conversationManager.getConversationHistory(conversation_id, 1)
            if (messages.length > 0) {
              conversation = { id: conversation_id }
            } else {
              // Conversation ID provided but doesn't exist, create new one
              conversation = await conversationManager.getOrCreateConversation(sessionId)
            }
          } else {
            // No conversation ID provided, get or create conversation for session
            conversation = await conversationManager.getOrCreateConversation(sessionId)
          }

          // Add user message to conversation
          await conversationManager.addMessage(
            conversation.id,
            'user',
            query,
            { 
              filters,
              request_id: requestId,
              client_ip: clientIp,
              user_agent: userAgent
            }
          )
        } catch (conversationError) {
          // Log conversation error but don't fail the request
          logError(`Conversation tracking failed: ${conversationError}`, requestId, { sessionId, conversation_id })
          // Create fallback conversation ID
          conversation = { id: crypto.randomUUID() }
        }

        // Import required modules
        const { searchSimilarGamesWithFilters } = await import('../../src/lib/embeddings.ts')
        const { gptClient } = await import('../../src/lib/gpt.ts')
        
        // Get conversation context for better AI responses
        let conversationContext = ''
        try {
          conversationContext = await conversationManager.getConversationContext(conversation.id, 5)
        } catch (contextError) {
          logError(`Failed to get conversation context: ${contextError}`, requestId)
        }
        
        // Search for similar games with filters
        const similarGames = await searchSimilarGamesWithFilters(query, filters, 10)
        
        if (similarGames.length === 0) {
          const noResultsResponse = "I couldn't find any games matching your criteria. Try adjusting your search terms or filters."
          
          // Add assistant response to conversation
          try {
            await conversationManager.addMessage(
              conversation.id,
              'assistant',
              noResultsResponse,
              { 
                games_found: 0,
                response_time_ms: Date.now() - startTime,
                request_id: requestId
              }
            )
          } catch (conversationError) {
            logError(`Failed to save assistant message: ${conversationError}`, requestId)
          }

          const response = createSecureResponse(
            { 
              games: [], 
              response: noResultsResponse,
              conversation_id: conversation.id
            },
            200,
            SessionManager.createSessionHeaders(sessionId, {})
          )
          logResponse(requestId, 200, Date.now() - startTime, path)
          return response
        }

        // Generate GPT response with game context and conversation history
        const gameContext = similarGames.map(sg => ({
          game: sg.game,
          similarity_score: sg.similarity_score
        }))
        
        const enhancedQuery = conversationContext ? `${conversationContext}\n\n${query}` : query
        const gptResponse = await gptClient.generateChatResponse(enhancedQuery, gameContext)
        
        // Transform games to GameSummary format
        const gameSummaries = similarGames.map(sg => ({
          id: sg.game.id,
          title: sg.game.title,
          price: sg.game.price_usd || 0,
          score: sg.game.critic_score || 0,
          platforms: sg.game.platforms || []
        }))

        // Add assistant response to conversation
        try {
          await conversationManager.addMessage(
            conversation.id,
            'assistant',
            gptResponse,
            { 
              games_found: similarGames.length,
              games_recommended: gameSummaries.map(g => ({ id: g.id, title: g.title })),
              response_time_ms: Date.now() - startTime,
              request_id: requestId
            }
          )
        } catch (conversationError) {
          logError(`Failed to save assistant message: ${conversationError}`, requestId)
        }
        
        // Prepare response data
        const responseData = {
          games: gameSummaries,
          response: gptResponse,
          conversation_id: conversation.id
        }

        // Cache the result for future requests (5 minutes TTL)
        await cacheManager.set(cacheKey, responseData, 300)
        
        // Record business metrics for successful search
        const searchMetrics: MetricData[] = [
          {
            name: 'search_requests_total',
            value: 1,
            tags: { 
              has_filters: filters ? 'true' : 'false',
              games_found: similarGames.length.toString(),
              response_time_bucket: Math.floor((Date.now() - startTime) / 1000).toString()
            }
          },
          {
            name: 'ai_responses_total',
            value: 1,
            tags: { endpoint: 'similar' }
          }
        ]
        
        // Record metrics asynchronously
        monitoring.recordMetrics(searchMetrics).catch(console.error)
        
        // Record performance metrics
        performanceMonitor.recordQueryTime('similar_games_full', Date.now() - startTime)
        
        const response = createSecureResponse(
          responseData,
          200,
          {
            ...SessionManager.createSessionHeaders(sessionId, {}),
            'X-Cache': 'MISS'
          }
        )
        logResponse(requestId, 200, Date.now() - startTime, path)
        return response
      } catch (error) {
        if (error instanceof Error && error.message.includes('required') || error.message.includes('must be')) {
          const response = createErrorResponse(
            error.message,
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }
        
        const response = createErrorResponse(
          'Failed to search for similar games',
          ErrorType.EXTERNAL_API_ERROR,
          500,
          requestId,
          error instanceof Error ? error.message : 'Unknown error'
        )
        logResponse(requestId, 500, Date.now() - startTime, path)
        return response
      }
    }
    
    if (pathSegments[2] === 'compare' && req.method === 'POST') {
      // POST /compare - Compare two games
      try {
        const requestBody = await req.json()
        
        // Validate and sanitize input
        const validatedInput = validateAndSanitizeInput(requestBody, {
          left: { type: 'string', required: true, minLength: 1, maxLength: 100 },
          right: { type: 'string', required: true, minLength: 1, maxLength: 100 }
        })

        const { left, right } = validatedInput

        if (left === right) {
          const response = createErrorResponse(
            'Cannot compare a game with itself',
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }

        // Check cache for comparison
        const cacheKey = CacheKeys.gameComparison(left, right)
        const cachedComparison = await cacheManager.get(cacheKey)
        
        if (cachedComparison) {
          const response = createSecureResponse(
            cachedComparison,
            200,
            { 'X-Cache': 'HIT' }
          )
          
          // Record cache hit metric
          performanceMonitor.recordQueryTime('game_comparison_cached', Date.now() - startTime)
          logResponse(requestId, 200, Date.now() - startTime, path)
          return response
        }

        // Retrieve both games from database
        const { data: games, error } = await supabase
          .from('games')
          .select('*')
          .in('id', [left, right])
        
        if (error) {
          const response = createErrorResponse(
            'Failed to retrieve games from database',
            ErrorType.DATABASE_ERROR,
            500,
            requestId,
            error.message
          )
          logResponse(requestId, 500, Date.now() - startTime, path)
          return response
        }

        if (!games || games.length === 0) {
          const response = createErrorResponse(
            'No games found with the provided IDs',
            ErrorType.NOT_FOUND_ERROR,
            404,
            requestId
          )
          logResponse(requestId, 404, Date.now() - startTime, path)
          return response
        }

        if (games.length === 1) {
          const missingId = games[0].id === left ? right : left
          const response = createErrorResponse(
            `Game with ID ${missingId} not found`,
            ErrorType.NOT_FOUND_ERROR,
            404,
            requestId
          )
          logResponse(requestId, 404, Date.now() - startTime, path)
          return response
        }

        // Find the correct games by ID
        const leftGame = games.find(g => g.id === left)
        const rightGame = games.find(g => g.id === right)

        if (!leftGame || !rightGame) {
          const response = createErrorResponse(
            'One or both games not found',
            ErrorType.NOT_FOUND_ERROR,
            404,
            requestId
          )
          logResponse(requestId, 404, Date.now() - startTime, path)
          return response
        }

        // Import GPT client and generate comparison
        const { gptClient } = await import('../../src/lib/gpt.ts')
        const comparison = await gptClient.generateComparison(leftGame, rightGame)
        
        // Prepare response data
        const responseData = {
          comparison,
          leftGame,
          rightGame
        }

        // Cache the comparison result (10 minutes TTL)
        await cacheManager.set(cacheKey, responseData, 600)
        
        // Record business metrics for comparison
        const comparisonMetrics: MetricData[] = [
          {
            name: 'comparison_requests_total',
            value: 1,
            tags: { 
              response_time_bucket: Math.floor((Date.now() - startTime) / 1000).toString()
            }
          },
          {
            name: 'ai_responses_total',
            value: 1,
            tags: { endpoint: 'compare' }
          }
        ]
        
        // Record metrics asynchronously
        monitoring.recordMetrics(comparisonMetrics).catch(console.error)
        
        // Record performance metrics
        performanceMonitor.recordQueryTime('game_comparison_full', Date.now() - startTime)
        
        const response = createSecureResponse(
          responseData,
          200,
          { 'X-Cache': 'MISS' }
        )
        logResponse(requestId, 200, Date.now() - startTime, path)
        return response
      } catch (error) {
        if (error instanceof Error && (error.message.includes('required') || error.message.includes('must be'))) {
          const response = createErrorResponse(
            error.message,
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }
        
        const response = createErrorResponse(
          'Failed to compare games',
          ErrorType.EXTERNAL_API_ERROR,
          500,
          requestId,
          error instanceof Error ? error.message : 'Unknown error'
        )
        logResponse(requestId, 500, Date.now() - startTime, path)
        return response
      }
    }
    
    if (pathSegments[2] === 'game' && pathSegments[3] && req.method === 'GET') {
      // GET /game/:id - Get game details
      try {
        const gameId = pathSegments[3]
        
        // Basic validation of game ID
        if (!gameId || gameId.trim().length === 0) {
          const response = createErrorResponse(
            'Game ID is required',
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }

        // Check cache for game details
        const cacheKey = CacheKeys.game(gameId.trim())
        const cachedGame = await cacheManager.get(cacheKey)
        
        if (cachedGame) {
          const response = createSecureResponse(
            cachedGame,
            200,
            { 'X-Cache': 'HIT' }
          )
          
          // Record cache hit metric
          performanceMonitor.recordQueryTime('game_details_cached', Date.now() - startTime)
          logResponse(requestId, 200, Date.now() - startTime, path)
          return response
        }
        
        const { data: game, error } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId.trim())
          .single()
        
        if (error) {
          const response = createErrorResponse(
            'Failed to retrieve game from database',
            ErrorType.DATABASE_ERROR,
            500,
            requestId,
            error.message
          )
          logResponse(requestId, 500, Date.now() - startTime, path)
          return response
        }
        
        if (!game) {
          const response = createErrorResponse(
            'Game not found',
            ErrorType.NOT_FOUND_ERROR,
            404,
            requestId
          )
          logResponse(requestId, 404, Date.now() - startTime, path)
          return response
        }

        // Cache the game details (15 minutes TTL)
        await cacheManager.set(cacheKey, game, 900)
        
        // Record performance metrics
        performanceMonitor.recordQueryTime('game_details_full', Date.now() - startTime)
        
        const response = createSecureResponse(
          game,
          200,
          { 'X-Cache': 'MISS' }
        )
        logResponse(requestId, 200, Date.now() - startTime, path)
        return response
      } catch (error) {
        const response = createErrorResponse(
          'Failed to get game details',
          ErrorType.INTERNAL_ERROR,
          500,
          requestId,
          error instanceof Error ? error.message : 'Unknown error'
        )
        logResponse(requestId, 500, Date.now() - startTime, path)
        return response
      }
    }
    
    if (pathSegments[2] === 'conversation' && req.method === 'GET') {
      // GET /conversation?session_id=xxx - Get conversation history
      try {
        const url = new URL(req.url)
        const sessionId = url.searchParams.get('session_id')
        const conversationId = url.searchParams.get('conversation_id')
        const limit = parseInt(url.searchParams.get('limit') || '20')
        
        if (limit < 1 || limit > 100) {
          const response = createErrorResponse(
            'Limit must be between 1 and 100',
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }

        let result
        
        if (conversationId) {
          // Get specific conversation history
          if (!ConversationManager.isValidSessionId(conversationId)) {
            const response = createErrorResponse(
              'Invalid conversation ID format',
              ErrorType.VALIDATION_ERROR,
              400,
              requestId
            )
            logResponse(requestId, 400, Date.now() - startTime, path)
            return response
          }
          
          const messages = await conversationManager.getConversationHistory(conversationId, limit)
          result = { conversation_id: conversationId, messages }
        } else if (sessionId) {
          // Get conversation for session
          if (!ConversationManager.isValidSessionId(sessionId)) {
            const response = createErrorResponse(
              'Invalid session ID format',
              ErrorType.VALIDATION_ERROR,
              400,
              requestId
            )
            logResponse(requestId, 400, Date.now() - startTime, path)
            return response
          }
          
          const sessionConversation = await conversationManager.getSessionConversation(sessionId, limit)
          result = {
            conversation_id: sessionConversation.conversation.id,
            session_id: sessionId,
            messages: sessionConversation.messages
          }
        } else {
          // Get conversation summaries
          const summaries = await conversationManager.getConversationSummaries(undefined, limit)
          result = { summaries }
        }
        
        const response = createSecureResponse(result, 200)
        logResponse(requestId, 200, Date.now() - startTime, path)
        return response
      } catch (error) {
        const response = createErrorResponse(
          'Failed to retrieve conversation history',
          ErrorType.DATABASE_ERROR,
          500,
          requestId,
          error instanceof Error ? error.message : 'Unknown error'
        )
        logResponse(requestId, 500, Date.now() - startTime, path)
        return response
      }
    }
    
    if (pathSegments[2] === 'click' && pathSegments[3] && pathSegments[4] && req.method === 'GET') {
      // GET /click/:gid/:store - Log click and redirect
      try {
        const gameId = pathSegments[3]
        const store = pathSegments[4]
        
        // Validate input
        if (!gameId || !store || gameId.trim().length === 0 || store.trim().length === 0) {
          const response = createErrorResponse(
            'Game ID and store are required',
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }

        // Validate store name (only allow known stores)
        const validStores = ['steam', 'epic', 'gog', 'playstation', 'xbox']
        if (!validStores.includes(store.toLowerCase())) {
          const response = createErrorResponse(
            `Invalid store. Allowed stores: ${validStores.join(', ')}`,
            ErrorType.VALIDATION_ERROR,
            400,
            requestId
          )
          logResponse(requestId, 400, Date.now() - startTime, path)
          return response
        }
        
        // Log click (don't fail if this fails, just log the error)
        try {
          await supabase
            .from('click_logs')
            .insert({ game_id: gameId.trim(), store: store.toLowerCase() })
        } catch (clickLogError) {
          logError(`Failed to log click: ${clickLogError}`, requestId, { gameId, store })
        }
        
        // Get redirect URL
        const { data: link, error } = await supabase
          .from('store_links')
          .select('url')
          .eq('game_id', gameId.trim())
          .eq('store', store.toLowerCase())
          .single()
        
        if (error) {
          const response = createErrorResponse(
            'Failed to retrieve store link',
            ErrorType.DATABASE_ERROR,
            500,
            requestId,
            error.message
          )
          logResponse(requestId, 500, Date.now() - startTime, path)
          return response
        }
        
        if (!link?.url) {
          const response = createErrorResponse(
            'Store link not found',
            ErrorType.NOT_FOUND_ERROR,
            404,
            requestId
          )
          logResponse(requestId, 404, Date.now() - startTime, path)
          return response
        }
        
        // Add affiliate ID
        const affiliateId = Deno.env.get(`AFFILIATE_${store.toUpperCase()}`)
        const redirectUrl = affiliateId ? `${link.url}?aff_id=${affiliateId}` : link.url
        
        // Redirect with security headers
        const response = new Response(null, {
          status: 302,
          headers: { 
            ...corsHeaders, 
            'Location': redirectUrl,
            ...securityManager.getSecurityHeaders()
          }
        })
        logResponse(requestId, 302, Date.now() - startTime, path)
        return response
      } catch (error) {
        const response = createErrorResponse(
          'Failed to process click tracking',
          ErrorType.INTERNAL_ERROR,
          500,
          requestId,
          error instanceof Error ? error.message : 'Unknown error'
        )
        logResponse(requestId, 500, Date.now() - startTime, path)
        return response
      }
    }
    
    // 404 for unknown routes
    const response = createErrorResponse(
      'Endpoint not found',
      ErrorType.NOT_FOUND_ERROR,
      404,
      requestId,
      `${req.method} ${path} is not a valid endpoint`
    )
    logResponse(requestId, 404, Date.now() - startTime, path)
    return response
    
  } catch (error) {
    // Global error handler - this catches any unhandled errors
    const response = createErrorResponse(
      'Internal server error',
      ErrorType.INTERNAL_ERROR,
      500,
      requestId,
      error instanceof Error ? error.message : 'Unknown error'
    )
    logResponse(requestId, 500, Date.now() - startTime, path)
    return response
  } finally {
    // Record function metrics for all requests
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
      const monitoring = new MonitoringClient(supabaseUrl, serviceRoleKey)
      
      const functionMetric: FunctionMetric = {
        function_name: 'api_router',
        endpoint: path,
        method: req.method,
        response_time_ms: Date.now() - startTime,
        request_id: requestId,
        client_ip: clientIp,
        user_agent: userAgent
      }
      
      // Record metric asynchronously
      monitoring.recordFunctionMetric(functionMetric).catch(console.error)
    } catch (metricsError) {
      console.error('Failed to record function metrics:', metricsError)
    }
  }
})