/**
 * Business metrics tracking system for GameCompare.ai
 * Tracks conversion rates, user engagement, revenue metrics, and business KPIs
 */

interface BusinessMetric {
  name: string
  value: number
  timestamp: string
  dimensions: Record<string, string>
  metadata?: Record<string, any>
}

interface ConversionFunnel {
  step: string
  users: number
  conversions: number
  rate: number
  dropoff: number
}

interface UserEngagementMetrics {
  daily_active_users: number
  session_duration_avg: number
  searches_per_session: number
  bounce_rate: number
  retention_rate: number
}

interface RevenueMetrics {
  affiliate_clicks: number
  estimated_revenue: number
  conversion_rate: number
  revenue_per_user: number
  top_converting_games: Array<{
    game_id: string
    title: string
    clicks: number
    revenue: number
  }>
}

/**
 * Business metrics collector and analyzer
 */
export class BusinessMetricsCollector {
  private supabase: any
  private metricsBuffer: BusinessMetric[] = []
  private flushInterval: number = 60000 // 1 minute

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    const { createClient } = require('https://esm.sh/@supabase/supabase-js@2')
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
    
    // Start periodic flush
    setInterval(() => this.flushMetrics(), this.flushInterval)
  }

  /**
   * Record a business metric
   */
  recordMetric(
    name: string, 
    value: number, 
    dimensions: Record<string, string> = {},
    metadata: Record<string, any> = {}
  ): void {
    const metric: BusinessMetric = {
      name,
      value,
      timestamp: new Date().toISOString(),
      dimensions,
      metadata
    }
    
    this.metricsBuffer.push(metric)
    
    // Flush immediately for critical metrics
    if (this.isCriticalMetric(name)) {
      this.flushMetrics()
    }
  }

  /**
   * Check if metric is critical and should be flushed immediately
   */
  private isCriticalMetric(name: string): boolean {
    const criticalMetrics = [
      'payment_completed',
      'user_signup',
      'critical_error',
      'security_incident'
    ]
    return criticalMetrics.includes(name)
  }

  /**
   * Flush metrics buffer to database
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return
    
    const metrics = [...this.metricsBuffer]
    this.metricsBuffer = []
    
    try {
      await this.supabase
        .from('business_metrics')
        .insert(metrics.map(m => ({
          name: m.name,
          value: m.value,
          recorded_at: m.timestamp,
          dimensions: m.dimensions,
          metadata: m.metadata
        })))
      
      console.log(`Flushed ${metrics.length} business metrics`)
    } catch (error) {
      console.error('Failed to flush business metrics:', error)
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metrics)
    }
  }

  /**
   * Track user search behavior
   */
  async trackSearch(
    query: string,
    filters: any,
    resultsCount: number,
    responseTime: number,
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    this.recordMetric('search_performed', 1, {
      has_filters: filters ? 'true' : 'false',
      results_found: resultsCount > 0 ? 'true' : 'false',
      user_type: userId ? 'registered' : 'anonymous'
    }, {
      query_length: query.length,
      results_count: resultsCount,
      response_time_ms: responseTime,
      filters,
      session_id: sessionId
    })
    
    // Track search success rate
    this.recordMetric('search_success', resultsCount > 0 ? 1 : 0)
    
    // Track response time buckets
    const timeBucket = this.getResponseTimeBucket(responseTime)
    this.recordMetric('search_response_time', responseTime, {
      time_bucket: timeBucket
    })
  }

  /**
   * Track game comparison requests
   */
  async trackComparison(
    leftGameId: string,
    rightGameId: string,
    responseTime: number,
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    this.recordMetric('comparison_performed', 1, {
      user_type: userId ? 'registered' : 'anonymous'
    }, {
      left_game_id: leftGameId,
      right_game_id: rightGameId,
      response_time_ms: responseTime,
      session_id: sessionId
    })
  }

  /**
   * Track affiliate link clicks
   */
  async trackAffiliateClick(
    gameId: string,
    store: string,
    userId?: string,
    sessionId?: string,
    searchQuery?: string
  ): Promise<void> {
    this.recordMetric('affiliate_click', 1, {
      store,
      user_type: userId ? 'registered' : 'anonymous',
      has_search_context: searchQuery ? 'true' : 'false'
    }, {
      game_id: gameId,
      session_id: sessionId,
      search_query: searchQuery,
      estimated_revenue: this.estimateRevenue(store)
    })
  }

  /**
   * Track user session metrics
   */
  async trackSession(
    sessionId: string,
    duration: number,
    pageViews: number,
    searches: number,
    comparisons: number,
    clicks: number,
    userId?: string
  ): Promise<void> {
    this.recordMetric('session_completed', 1, {
      user_type: userId ? 'registered' : 'anonymous',
      engagement_level: this.getEngagementLevel(searches, comparisons, clicks)
    }, {
      session_id: sessionId,
      duration_seconds: duration,
      page_views: pageViews,
      searches,
      comparisons,
      clicks,
      bounce: pageViews === 1 && duration < 30 ? 1 : 0
    })
  }

  /**
   * Get response time bucket for analytics
   */
  private getResponseTimeBucket(responseTime: number): string {
    if (responseTime < 500) return 'fast'
    if (responseTime < 1000) return 'medium'
    if (responseTime < 2000) return 'slow'
    return 'very_slow'
  }

  /**
   * Estimate revenue from affiliate click
   */
  private estimateRevenue(store: string): number {
    // Estimated revenue per click based on store
    const revenueEstimates: Record<string, number> = {
      steam: 0.50,
      epic: 0.75,
      gog: 0.40,
      playstation: 0.60,
      xbox: 0.60
    }
    return revenueEstimates[store] || 0.30
  }

  /**
   * Determine user engagement level
   */
  private getEngagementLevel(searches: number, comparisons: number, clicks: number): string {
    const totalActions = searches + comparisons + clicks
    
    if (totalActions === 0) return 'none'
    if (totalActions === 1) return 'low'
    if (totalActions <= 3) return 'medium'
    if (totalActions <= 6) return 'high'
    return 'very_high'
  }

  /**
   * Calculate conversion funnel metrics
   */
  async getConversionFunnel(startDate: Date, endDate: Date): Promise<ConversionFunnel[]> {
    const dateFilter = {
      gte: startDate.toISOString(),
      lte: endDate.toISOString()
    }

    // Get funnel data
    const [sessions, searches, comparisons, clicks] = await Promise.all([
      this.getMetricCount('session_completed', dateFilter),
      this.getMetricCount('search_performed', dateFilter),
      this.getMetricCount('comparison_performed', dateFilter),
      this.getMetricCount('affiliate_click', dateFilter)
    ])

    const funnel: ConversionFunnel[] = [
      {
        step: 'Sessions',
        users: sessions,
        conversions: searches,
        rate: sessions > 0 ? (searches / sessions) * 100 : 0,
        dropoff: sessions - searches
      },
      {
        step: 'Searches',
        users: searches,
        conversions: comparisons,
        rate: searches > 0 ? (comparisons / searches) * 100 : 0,
        dropoff: searches - comparisons
      },
      {
        step: 'Comparisons',
        users: comparisons,
        conversions: clicks,
        rate: comparisons > 0 ? (clicks / comparisons) * 100 : 0,
        dropoff: comparisons - clicks
      },
      {
        step: 'Clicks',
        users: clicks,
        conversions: clicks, // All clicks are conversions
        rate: 100,
        dropoff: 0
      }
    ]

    return funnel
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(startDate: Date, endDate: Date): Promise<UserEngagementMetrics> {
    const dateFilter = {
      gte: startDate.toISOString(),
      lte: endDate.toISOString()
    }

    // Get session data
    const { data: sessions } = await this.supabase
      .from('business_metrics')
      .select('*')
      .eq('name', 'session_completed')
      .gte('recorded_at', dateFilter.gte)
      .lte('recorded_at', dateFilter.lte)

    if (!sessions || sessions.length === 0) {
      return {
        daily_active_users: 0,
        session_duration_avg: 0,
        searches_per_session: 0,
        bounce_rate: 0,
        retention_rate: 0
      }
    }

    // Calculate metrics
    const totalSessions = sessions.length
    const totalDuration = sessions.reduce((sum: number, s: any) => 
      sum + (s.metadata?.duration_seconds || 0), 0)
    const totalSearches = sessions.reduce((sum: number, s: any) => 
      sum + (s.metadata?.searches || 0), 0)
    const bounces = sessions.filter((s: any) => s.metadata?.bounce === 1).length

    // Get unique users (approximate)
    const uniqueUsers = new Set(sessions.map((s: any) => s.metadata?.session_id)).size

    return {
      daily_active_users: Math.floor(uniqueUsers / this.getDaysDifference(startDate, endDate)),
      session_duration_avg: totalSessions > 0 ? totalDuration / totalSessions : 0,
      searches_per_session: totalSessions > 0 ? totalSearches / totalSessions : 0,
      bounce_rate: totalSessions > 0 ? (bounces / totalSessions) * 100 : 0,
      retention_rate: 0 // Would need user tracking for this
    }
  }

  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(startDate: Date, endDate: Date): Promise<RevenueMetrics> {
    const dateFilter = {
      gte: startDate.toISOString(),
      lte: endDate.toISOString()
    }

    // Get affiliate click data
    const { data: clicks } = await this.supabase
      .from('business_metrics')
      .select('*')
      .eq('name', 'affiliate_click')
      .gte('recorded_at', dateFilter.gte)
      .lte('recorded_at', dateFilter.lte)

    if (!clicks || clicks.length === 0) {
      return {
        affiliate_clicks: 0,
        estimated_revenue: 0,
        conversion_rate: 0,
        revenue_per_user: 0,
        top_converting_games: []
      }
    }

    // Calculate revenue metrics
    const totalClicks = clicks.length
    const totalRevenue = clicks.reduce((sum: number, c: any) => 
      sum + (c.metadata?.estimated_revenue || 0), 0)

    // Get searches for conversion rate
    const totalSearches = await this.getMetricCount('search_performed', dateFilter)
    const conversionRate = totalSearches > 0 ? (totalClicks / totalSearches) * 100 : 0

    // Get unique users for revenue per user
    const uniqueUsers = new Set(clicks.map((c: any) => c.metadata?.session_id)).size
    const revenuePerUser = uniqueUsers > 0 ? totalRevenue / uniqueUsers : 0

    // Get top converting games
    const gameRevenue = new Map<string, { title: string, clicks: number, revenue: number }>()
    
    for (const click of clicks) {
      const gameId = click.metadata?.game_id
      if (gameId) {
        const existing = gameRevenue.get(gameId) || { title: '', clicks: 0, revenue: 0 }
        existing.clicks += 1
        existing.revenue += click.metadata?.estimated_revenue || 0
        gameRevenue.set(gameId, existing)
      }
    }

    // Get game titles and sort by revenue
    const topGames = Array.from(gameRevenue.entries())
      .map(([gameId, data]) => ({ game_id: gameId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    return {
      affiliate_clicks: totalClicks,
      estimated_revenue: totalRevenue,
      conversion_rate: conversionRate,
      revenue_per_user: revenuePerUser,
      top_converting_games: topGames
    }
  }

  /**
   * Get metric count for date range
   */
  private async getMetricCount(metricName: string, dateFilter: any): Promise<number> {
    const { data } = await this.supabase
      .from('business_metrics')
      .select('*', { count: 'exact' })
      .eq('name', metricName)
      .gte('recorded_at', dateFilter.gte)
      .lte('recorded_at', dateFilter.lte)
    
    return data?.length || 0
  }

  /**
   * Get days difference between dates
   */
  private getDaysDifference(startDate: Date, endDate: Date): number {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  /**
   * Generate business metrics report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<{
    funnel: ConversionFunnel[]
    engagement: UserEngagementMetrics
    revenue: RevenueMetrics
    summary: {
      total_sessions: number
      total_searches: number
      total_revenue: number
      avg_session_duration: number
    }
  }> {
    const [funnel, engagement, revenue] = await Promise.all([
      this.getConversionFunnel(startDate, endDate),
      this.getUserEngagementMetrics(startDate, endDate),
      this.getRevenueMetrics(startDate, endDate)
    ])

    const summary = {
      total_sessions: funnel[0]?.users || 0,
      total_searches: funnel[1]?.users || 0,
      total_revenue: revenue.estimated_revenue,
      avg_session_duration: engagement.session_duration_avg
    }

    return {
      funnel,
      engagement,
      revenue,
      summary
    }
  }
}

// Global business metrics collector
export const businessMetrics = new BusinessMetricsCollector(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)