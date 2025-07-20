-- Enhanced Security Features Migration
-- Additional security functions for production-grade security measures

-- Create IP blocking table for persistent IP blocks
CREATE TABLE IF NOT EXISTS blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  blocked_by text DEFAULT 'system',
  expires_at timestamptz,
  is_permanent boolean DEFAULT false,
  block_count integer DEFAULT 1,
  last_activity timestamptz DEFAULT now()
);

-- Create index for efficient IP lookups
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip_address ON blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires_at ON blocked_ips(expires_at);

-- Function to block IP address
CREATE OR REPLACE FUNCTION block_ip_address(
  ip_address_param text,
  reason_param text,
  duration_hours integer DEFAULT 24,
  is_permanent_param boolean DEFAULT false
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  expires_time timestamptz;
BEGIN
  -- Calculate expiration time
  IF is_permanent_param THEN
    expires_time := NULL;
  ELSE
    expires_time := now() + (duration_hours || ' hours')::interval;
  END IF;
  
  -- Insert or update blocked IP
  INSERT INTO blocked_ips (
    ip_address, 
    reason, 
    expires_at, 
    is_permanent,
    block_count,
    last_activity
  )
  VALUES (
    ip_address_param, 
    reason_param, 
    expires_time, 
    is_permanent_param,
    1,
    now()
  )
  ON CONFLICT (ip_address) DO UPDATE SET
    reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at,
    is_permanent = EXCLUDED.is_permanent,
    block_count = blocked_ips.block_count + 1,
    last_activity = now(),
    blocked_at = now();
  
  -- Log security event
  INSERT INTO security_events (
    type,
    severity,
    client_ip,
    endpoint,
    details,
    blocked
  ) VALUES (
    'ip_blocked',
    'high',
    ip_address_param,
    'security_management',
    jsonb_build_object(
      'reason', reason_param,
      'duration_hours', duration_hours,
      'is_permanent', is_permanent_param,
      'blocked_at', now()
    ),
    true
  );
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error blocking IP %: %', ip_address_param, SQLERRM;
    RETURN false;
END;
$;

-- Function to unblock IP address
CREATE OR REPLACE FUNCTION unblock_ip_address(ip_address_param text)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
BEGIN
  DELETE FROM blocked_ips WHERE ip_address = ip_address_param;
  
  -- Log security event
  INSERT INTO security_events (
    type,
    severity,
    client_ip,
    endpoint,
    details,
    blocked
  ) VALUES (
    'ip_unblocked',
    'medium',
    ip_address_param,
    'security_management',
    jsonb_build_object(
      'unblocked_at', now()
    ),
    false
  );
  
  RETURN FOUND;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error unblocking IP %: %', ip_address_param, SQLERRM;
    RETURN false;
END;
$;

-- Function to check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(ip_address_param text)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  blocked_record record;
BEGIN
  SELECT * INTO blocked_record
  FROM blocked_ips
  WHERE ip_address = ip_address_param;
  
  -- If no record found, IP is not blocked
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If permanent block
  IF blocked_record.is_permanent THEN
    RETURN true;
  END IF;
  
  -- If temporary block has expired
  IF blocked_record.expires_at IS NOT NULL AND blocked_record.expires_at < now() THEN
    -- Remove expired block
    DELETE FROM blocked_ips WHERE ip_address = ip_address_param;
    RETURN false;
  END IF;
  
  -- IP is currently blocked
  RETURN true;
END;
$;

-- Function to clean up expired blocks
CREATE OR REPLACE FUNCTION cleanup_expired_blocks()
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM blocked_ips
  WHERE expires_at IS NOT NULL 
    AND expires_at < now()
    AND NOT is_permanent;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE LOG 'Cleaned up % expired IP blocks', deleted_count;
  RETURN deleted_count;
END;
$;

-- Function to detect brute force attacks
CREATE OR REPLACE FUNCTION detect_brute_force_attacks(
  time_window_minutes integer DEFAULT 5,
  failure_threshold integer DEFAULT 10
)
RETURNS TABLE (
  client_ip text,
  attempt_count bigint,
  first_attempt timestamptz,
  last_attempt timestamptz,
  should_block boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  window_start timestamptz;
BEGIN
  window_start := now() - (time_window_minutes || ' minutes')::interval;
  
  RETURN QUERY
  SELECT 
    al.client_ip,
    COUNT(*) as attempt_count,
    MIN(al.timestamp) as first_attempt,
    MAX(al.timestamp) as last_attempt,
    COUNT(*) >= failure_threshold as should_block
  FROM audit_logs al
  WHERE al.timestamp >= window_start
    AND al.success = false
    AND al.response_status IN (401, 403, 429) -- Authentication/authorization failures
  GROUP BY al.client_ip
  HAVING COUNT(*) >= (failure_threshold / 2) -- Start tracking at half threshold
  ORDER BY attempt_count DESC;
END;
$;

-- Function to get security dashboard metrics
CREATE OR REPLACE FUNCTION get_security_dashboard_metrics(
  hours_back integer DEFAULT 24
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  result jsonb;
  time_threshold timestamptz;
BEGIN
  time_threshold := now() - (hours_back || ' hours')::interval;
  
  WITH security_stats AS (
    SELECT 
      COUNT(*) as total_events,
      COUNT(*) FILTER (WHERE blocked = true) as blocked_events,
      COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
      COUNT(*) FILTER (WHERE severity = 'high') as high_events,
      COUNT(*) FILTER (WHERE type = 'rate_limit_exceeded') as rate_limit_events,
      COUNT(*) FILTER (WHERE type = 'ddos_detected') as ddos_events,
      COUNT(*) FILTER (WHERE type = 'invalid_input') as malicious_input_events,
      COUNT(*) FILTER (WHERE type = 'suspicious_activity') as suspicious_events
    FROM security_events
    WHERE timestamp >= time_threshold
  ),
  audit_stats AS (
    SELECT 
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE success = false) as failed_requests,
      AVG(response_time_ms) as avg_response_time,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time
    FROM audit_logs
    WHERE timestamp >= time_threshold
  ),
  top_attackers AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'ip', client_ip,
        'event_count', event_count
      ) ORDER BY event_count DESC
    ) as attackers
    FROM (
      SELECT client_ip, COUNT(*) as event_count
      FROM security_events
      WHERE timestamp >= time_threshold AND blocked = true
      GROUP BY client_ip
      ORDER BY event_count DESC
      LIMIT 10
    ) t
  ),
  blocked_ips_count AS (
    SELECT COUNT(*) as active_blocks
    FROM blocked_ips
    WHERE (expires_at IS NULL OR expires_at > now()) AND NOT is_permanent = false
  )
  SELECT jsonb_build_object(
    'timeRange', jsonb_build_object(
      'hours', hours_back,
      'start', time_threshold,
      'end', now()
    ),
    'securityEvents', jsonb_build_object(
      'total', ss.total_events,
      'blocked', ss.blocked_events,
      'critical', ss.critical_events,
      'high', ss.high_events,
      'rateLimitViolations', ss.rate_limit_events,
      'ddosAttempts', ss.ddos_events,
      'maliciousInput', ss.malicious_input_events,
      'suspiciousActivity', ss.suspicious_events
    ),
    'requestMetrics', jsonb_build_object(
      'total', aus.total_requests,
      'failed', aus.failed_requests,
      'successRate', CASE 
        WHEN aus.total_requests > 0 
        THEN ROUND((aus.total_requests - aus.failed_requests)::numeric / aus.total_requests * 100, 2)
        ELSE 0 
      END,
      'avgResponseTime', ROUND(aus.avg_response_time::numeric, 2),
      'p95ResponseTime', ROUND(aus.p95_response_time::numeric, 2)
    ),
    'topAttackers', COALESCE(ta.attackers, '[]'::jsonb),
    'activeBlocks', bic.active_blocks
  ) INTO result
  FROM security_stats ss, audit_stats aus, top_attackers ta, blocked_ips_count bic;
  
  RETURN result;
END;
$;

-- Function to generate security alerts
CREATE OR REPLACE FUNCTION generate_security_alerts(
  hours_back integer DEFAULT 1
)
RETURNS TABLE (
  alert_type text,
  severity text,
  message text,
  count bigint,
  details jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  time_threshold timestamptz;
BEGIN
  time_threshold := now() - (hours_back || ' hours')::interval;
  
  -- High rate of blocked requests
  RETURN QUERY
  SELECT 
    'high_blocked_requests'::text,
    'medium'::text,
    'High number of blocked requests detected'::text,
    COUNT(*),
    jsonb_build_object(
      'threshold', 100,
      'timeWindow', hours_back || ' hours'
    )
  FROM security_events
  WHERE timestamp >= time_threshold 
    AND blocked = true
  HAVING COUNT(*) > 100;
  
  -- Critical security events
  RETURN QUERY
  SELECT 
    'critical_security_events'::text,
    'high'::text,
    'Critical security events detected'::text,
    COUNT(*),
    jsonb_build_object(
      'events', jsonb_agg(
        jsonb_build_object(
          'type', type,
          'client_ip', client_ip,
          'timestamp', timestamp
        )
      )
    )
  FROM security_events
  WHERE timestamp >= time_threshold 
    AND severity = 'critical'
  HAVING COUNT(*) > 0;
  
  -- Persistent attackers
  RETURN QUERY
  SELECT 
    'persistent_attacker'::text,
    'high'::text,
    'Persistent attacker detected: ' || client_ip,
    COUNT(*),
    jsonb_build_object(
      'client_ip', client_ip,
      'event_types', jsonb_agg(DISTINCT type),
      'first_seen', MIN(timestamp),
      'last_seen', MAX(timestamp)
    )
  FROM security_events
  WHERE timestamp >= time_threshold
  GROUP BY client_ip
  HAVING COUNT(*) > 50;
  
  -- High failure rate
  RETURN QUERY
  SELECT 
    'high_failure_rate'::text,
    'medium'::text,
    'High request failure rate detected'::text,
    COUNT(*) FILTER (WHERE success = false),
    jsonb_build_object(
      'total_requests', COUNT(*),
      'failed_requests', COUNT(*) FILTER (WHERE success = false),
      'failure_rate', ROUND(
        COUNT(*) FILTER (WHERE success = false)::numeric / COUNT(*) * 100, 2
      )
    )
  FROM audit_logs
  WHERE timestamp >= time_threshold
  HAVING COUNT(*) > 0 
    AND COUNT(*) FILTER (WHERE success = false)::numeric / COUNT(*) > 0.1;
END;
$;

-- Function to update security configuration
CREATE OR REPLACE FUNCTION update_security_config(
  config_key_param text,
  config_value_param jsonb,
  description_param text DEFAULT NULL
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
BEGIN
  INSERT INTO security_config (config_key, config_value, description)
  VALUES (config_key_param, config_value_param, description_param)
  ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = COALESCE(EXCLUDED.description, security_config.description),
    updated_at = now();
  
  -- Log configuration change
  INSERT INTO security_events (
    type,
    severity,
    client_ip,
    endpoint,
    details,
    blocked
  ) VALUES (
    'config_updated',
    'medium',
    'system',
    'security_config',
    jsonb_build_object(
      'config_key', config_key_param,
      'updated_at', now()
    ),
    false
  );
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error updating security config %: %', config_key_param, SQLERRM;
    RETURN false;
END;
$;

-- Grant permissions to service role
GRANT EXECUTE ON FUNCTION block_ip_address(text, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION unblock_ip_address(text) TO service_role;
GRANT EXECUTE ON FUNCTION is_ip_blocked(text) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_blocks() TO service_role;
GRANT EXECUTE ON FUNCTION detect_brute_force_attacks(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_security_dashboard_metrics(integer) TO service_role;
GRANT EXECUTE ON FUNCTION generate_security_alerts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION update_security_config(text, jsonb, text) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON blocked_ips TO service_role;

-- Create scheduled jobs for security maintenance
SELECT cron.schedule(
  'cleanup-expired-ip-blocks',
  '0 */6 * * *', -- Every 6 hours
  'SELECT cleanup_expired_blocks();'
);

SELECT cron.schedule(
  'detect-brute-force-attacks',
  '*/5 * * * *', -- Every 5 minutes
  'SELECT detect_brute_force_attacks();'
);

-- Insert default security configurations
INSERT INTO security_config (config_key, config_value, description) VALUES
  ('rate_limiting_config', '{
    "enabled": true,
    "window_ms": 60000,
    "max_requests": 60,
    "burst_limit": 100,
    "skip_successful_requests": false,
    "skip_failed_requests": false
  }', 'Rate limiting configuration'),
  ('ddos_protection_config', '{
    "enabled": true,
    "threshold": 100,
    "window_ms": 60000,
    "block_duration_ms": 900000,
    "progressive_blocking": true
  }', 'DDoS protection configuration'),
  ('input_validation_config', '{
    "max_request_size": 1048576,
    "allowed_content_types": ["application/json", "text/plain"],
    "sanitize_html": true,
    "validate_json": true,
    "block_malicious_patterns": true
  }', 'Input validation configuration'),
  ('security_headers_config', '{
    "x_content_type_options": "nosniff",
    "x_frame_options": "DENY",
    "x_xss_protection": "1; mode=block",
    "strict_transport_security": "max-age=31536000; includeSubDomains",
    "referrer_policy": "strict-origin-when-cross-origin",
    "content_security_policy": "default-src ''self''; script-src ''self'' ''unsafe-inline''; style-src ''self'' ''unsafe-inline''; img-src ''self'' data: https:; connect-src ''self'' https:; font-src ''self'' data:; object-src ''none''; media-src ''self''; frame-src ''none'';"
  }', 'Security headers configuration'),
  ('audit_logging_config', '{
    "enabled": true,
    "log_successful_requests": false,
    "log_failed_requests": true,
    "log_security_events": true,
    "retention_days": 90,
    "sensitive_fields": ["password", "token", "key", "secret", "auth", "authorization"]
  }', 'Audit logging configuration')
ON CONFLICT (config_key) DO NOTHING;

-- Create view for security monitoring dashboard
CREATE OR REPLACE VIEW security_dashboard AS
SELECT 
  'security_events_last_24h' as metric_name,
  COUNT(*) as metric_value,
  'count' as metric_type,
  now() as calculated_at
FROM security_events 
WHERE timestamp >= now() - interval '24 hours'

UNION ALL

SELECT 
  'blocked_requests_last_24h' as metric_name,
  COUNT(*) as metric_value,
  'count' as metric_type,
  now() as calculated_at
FROM security_events 
WHERE timestamp >= now() - interval '24 hours' AND blocked = true

UNION ALL

SELECT 
  'critical_events_last_24h' as metric_name,
  COUNT(*) as metric_value,
  'count' as metric_type,
  now() as calculated_at
FROM security_events 
WHERE timestamp >= now() - interval '24 hours' AND severity = 'critical'

UNION ALL

SELECT 
  'active_ip_blocks' as metric_name,
  COUNT(*) as metric_value,
  'count' as metric_type,
  now() as calculated_at
FROM blocked_ips 
WHERE (expires_at IS NULL OR expires_at > now())

UNION ALL

SELECT 
  'failed_requests_last_24h' as metric_name,
  COUNT(*) as metric_value,
  'count' as metric_type,
  now() as calculated_at
FROM audit_logs 
WHERE timestamp >= now() - interval '24 hours' AND success = false;

GRANT SELECT ON security_dashboard TO service_role;

COMMENT ON TABLE blocked_ips IS 'Persistent storage for blocked IP addresses';
COMMENT ON FUNCTION block_ip_address IS 'Block an IP address with optional expiration';
COMMENT ON FUNCTION unblock_ip_address IS 'Remove IP address from blocked list';
COMMENT ON FUNCTION is_ip_blocked IS 'Check if an IP address is currently blocked';
COMMENT ON FUNCTION cleanup_expired_blocks IS 'Remove expired IP blocks from database';
COMMENT ON FUNCTION detect_brute_force_attacks IS 'Detect potential brute force attacks';
COMMENT ON FUNCTION get_security_dashboard_metrics IS 'Get comprehensive security metrics for dashboard';
COMMENT ON FUNCTION generate_security_alerts IS 'Generate security alerts based on recent activity';
COMMENT ON FUNCTION update_security_config IS 'Update security configuration settings';
COMMENT ON VIEW security_dashboard IS 'Real-time security metrics for monitoring dashboard';