# GameCompare.ai Monitoring and Alerting System

This document describes the comprehensive monitoring and alerting system implemented for GameCompare.ai.

## Overview

The monitoring system provides:
- **Health Checks**: System component health monitoring
- **Metrics Collection**: Performance and business metrics tracking
- **Alerting**: Automated alert generation based on thresholds
- **Dashboard**: Real-time system health overview
- **Business Intelligence**: KPI tracking and analytics

## Components

### 1. Database Schema
- `system_metrics`: System-level performance metrics
- `alert_rules`: Alert condition definitions
- `alerts`: Fired and resolved alerts tracking
- `function_metrics`: Edge Function performance data
- `business_metrics`: Aggregated business KPIs
- `system_health_dashboard`: Real-time health overview (materialized view)

### 2. Edge Functions
- `health_check.ts`: Comprehensive health monitoring endpoints
- `monitoring_dashboard.ts`: Metrics dashboard and API endpoints
- `monitoring_scheduler.ts`: Periodic monitoring tasks
- `utils/monitoring.ts`: Monitoring utilities and client library

### 3. Monitoring Endpoints

#### Health Check Endpoints
- `GET /health` - Basic health status
- `GET /health/detailed` - Comprehensive system health
- `GET /ready` - Readiness probe (for orchestration)
- `GET /live` - Liveness probe (for orchestration)

#### Dashboard Endpoints
- `GET /dashboard` - Complete monitoring dashboard
- `GET /health-status` - System health summary
- `GET /alerts` - Active alerts list
- `GET /metrics` - System metrics data
- `GET /performance` - Function performance metrics
- `GET /business` - Business metrics and KPIs

#### Scheduler Endpoints
- `POST /aggregate-metrics` - Aggregate business metrics
- `POST /check-alerts` - Check alert conditions
- `POST /refresh-dashboard` - Refresh dashboard data
- `POST /cleanup-metrics` - Clean old metrics data
- `POST /run-all` - Execute all monitoring tasks

## Alert Rules

The system includes predefined alert rules for:

### Critical Alerts
- **High Error Rate**: Error rate > 5%
- **Vector Database Unavailable**: Pinecone connectivity issues
- **Disk Space Low**: Disk usage > 90%

### Warning Alerts
- **High Response Time**: Average response time > 2 seconds
- **Database Slow**: Database response time > 1 second
- **OpenAI API Slow**: OpenAI response time > 5 seconds
- **High Memory Usage**: Memory usage > 85%

### Info Alerts
- **Low Search Volume**: Searches per hour < 1

## Business Metrics

The system tracks key business metrics:
- **Search Requests**: Game search API calls
- **Comparison Requests**: Game comparison API calls
- **Game Clicks**: Affiliate link clicks
- **Conversation Starts**: New chat sessions
- **AI Responses**: Generated AI responses
- **Error Rate**: Overall system error percentage

## Setup Instructions

### 1. Deploy Database Schema
```bash
# Apply the monitoring migration
supabase db push
```

### 2. Deploy Edge Functions
```bash
# Deploy all monitoring functions
supabase functions deploy health_check
supabase functions deploy monitoring_dashboard
supabase functions deploy monitoring_scheduler
```

### 3. Configure Periodic Tasks
Set up periodic execution of monitoring tasks:

```bash
# Example using cron (adjust URLs for your deployment)
# Check alerts every 5 minutes
*/5 * * * * curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/monitoring_scheduler/check-alerts"

# Aggregate metrics every hour
0 * * * * curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/monitoring_scheduler/aggregate-metrics"

# Refresh dashboard every 5 minutes
*/5 * * * * curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/monitoring_scheduler/refresh-dashboard"

# Cleanup old metrics daily
0 2 * * * curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/monitoring_scheduler/cleanup-metrics"
```

### 4. Validate System
```bash
# Run the validation script
deno run --allow-net --allow-env supabase/functions/validate_monitoring_system.js
```

## External Monitoring Integration

### Uptime Monitoring
Configure external uptime monitoring services to check:
- `GET /functions/v1/health_check/health` - Basic health
- `GET /functions/v1/health_check/ready` - Readiness check

Recommended services:
- UptimeRobot
- Pingdom
- StatusCake

### Log Monitoring
- Edge Function logs are available in Supabase Dashboard
- Structured JSON logging is implemented for easy parsing
- Log retention: 7 days (free tier), longer for paid tiers

### Dashboard Integration
Access the monitoring dashboard at:
```
GET /functions/v1/monitoring_dashboard/dashboard
```

## Alert Integration

### Webhook Integration
Extend the alert system to send notifications:
1. Add webhook URLs to alert rules
2. Implement notification functions
3. Integrate with Slack, Discord, email, etc.

### Example Alert Webhook
```typescript
// Add to alert checking function
if (alertShouldFire) {
  // Send webhook notification
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alert: rule_record.name,
      severity: rule_record.severity,
      message: alertMessage,
      timestamp: new Date().toISOString()
    })
  })
}
```

## Performance Considerations

- Metrics are recorded asynchronously to avoid blocking requests
- Old metrics are automatically cleaned up based on retention policy
- Materialized views are used for dashboard performance
- Alert checking is rate-limited to prevent spam

## Troubleshooting

### Common Issues

1. **Missing Metrics Data**
   - Check if monitoring functions are deployed
   - Verify SERVICE_ROLE_KEY is configured
   - Run validation script to test connectivity

2. **Alerts Not Firing**
   - Check alert rules are enabled
   - Verify metric data is being recorded
   - Run manual alert check: `POST /check-alerts`

3. **Dashboard Not Loading**
   - Refresh materialized view: `POST /refresh-dashboard`
   - Check database connectivity
   - Verify function permissions

### Debug Commands
```bash
# Check system health
curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/health_check/health/detailed"

# View active alerts
curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/monitoring_dashboard/alerts"

# Check recent metrics
curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/monitoring_dashboard/metrics?hours=1"
```

## Configuration

See `supabase/monitoring_config.json` for detailed configuration options including:
- Alert thresholds
- Monitoring intervals
- Business metric definitions
- Endpoint documentation

## Security

- All monitoring endpoints require SERVICE_ROLE_KEY authentication
- Metrics data is stored securely in Supabase
- No sensitive data is logged in metrics
- Rate limiting is applied to prevent abuse