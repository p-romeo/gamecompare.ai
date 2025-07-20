-- Security System Tables
-- This migration creates tables for security events, audit logs, and access control

-- Security events table for tracking security incidents
CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN (
    'rate_limit_exceeded', 
    'ddos_detected', 
    'invalid_input', 
    'suspicious_activity', 
    'security_violation',
    'authentication_failure',
    'authorization_failure',
    'data_breach_attempt',
    'malicious_request'
  )),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  client_ip text NOT NULL,
  user_agent text,
  endpoint text NOT NULL,
  details jsonb DEFAULT '{}',
  blocked boolean DEFAULT false,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit logs table for comprehensive request logging
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text,
  client_ip text NOT NULL,
  user_agent text,
  method text NOT NULL,
  endpoint text NOT NULL,
  query_params jsonb DEFAULT '{}',
  request_headers jsonb DEFAULT '{}',
  request_body jsonb,
  response_status integer,
  response_time_ms integer,
  user_id text,
  session_id text,
  success boolean,
  error_message text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- IP whitelist/blacklist table
CREATE TABLE IF NOT EXISTS ip_access_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('whitelist', 'blacklist', 'greylist')),
  reason text,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- API key management table
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '[]',
  rate_limit_override integer,
  expires_at timestamptz,
  last_used_at timestamptz,
  usage_count integer DEFAULT 0,
  created_by text,
  revoked boolean DEFAULT false,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Security configuration table
CREATE TABLE IF NOT EXISTS security_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL,
  description text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Failed login attempts table
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_ip text NOT NULL,
  user_identifier text, -- email, username, etc.
  attempt_type text NOT NULL, -- 'password', 'api_key', 'token'
  failure_reason text NOT NULL,
  user_agent text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Security scan results table
CREATE TABLE IF NOT EXISTS security_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL, -- 'vulnerability', 'penetration', 'compliance'
  target text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  results jsonb DEFAULT '{}',
  severity_counts jsonb DEFAULT '{}', -- {"critical": 0, "high": 1, "medium": 3, "low": 5}
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_events_type_timestamp ON security_events (type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_client_ip_timestamp ON security_events (client_ip, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_timestamp ON security_events (severity, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_blocked ON security_events (blocked, timestamp DESC) WHERE blocked = true;

CREATE INDEX IF NOT EXISTS idx_audit_logs_client_ip_timestamp ON audit_logs (client_ip, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_endpoint_timestamp ON audit_logs (endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success_timestamp ON audit_logs (success, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_timestamp ON audit_logs (user_id, timestamp DESC) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ip_access_control_ip ON ip_access_control (ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_access_control_type ON ip_access_control (type);
CREATE INDEX IF NOT EXISTS idx_ip_access_control_expires ON ip_access_control (expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys (revoked, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys (expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_ip_timestamp ON failed_login_attempts (client_ip, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_user_timestamp ON failed_login_attempts (user_identifier, timestamp DESC) WHERE user_identifier IS NOT NULL;

-- Create GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_security_events_details_gin ON security_events USING gin(details);
CREATE INDEX IF NOT EXISTS idx_audit_logs_query_params_gin ON audit_logs USING gin(query_params);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_headers_gin ON audit_logs USING gin(request_headers);
CREATE INDEX IF NOT EXISTS idx_api_keys_permissions_gin ON api_keys USING gin(permissions);
CREATE INDEX IF NOT EXISTS idx_security_config_value_gin ON security_config USING gin(config_value);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_ip_access_control_updated_at BEFORE UPDATE ON ip_access_control
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_config_updated_at BEFORE UPDATE ON security_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for security monitoring
CREATE OR REPLACE VIEW security_dashboard AS
SELECT 
  date_trunc('hour', timestamp) as hour,
  type,
  severity,
  COUNT(*) as event_count,
  COUNT(*) FILTER (WHERE blocked = true) as blocked_count,
  COUNT(DISTINCT client_ip) as unique_ips
FROM security_events 
WHERE timestamp > (now() - interval '24 hours')
GROUP BY date_trunc('hour', timestamp), type, severity
ORDER BY hour DESC, event_count DESC;

CREATE OR REPLACE VIEW top_attackers AS
SELECT 
  client_ip,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE blocked = true) as blocked_events,
  COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
  COUNT(*) FILTER (WHERE severity = 'high') as high_events,
  MAX(timestamp) as last_event,
  array_agg(DISTINCT type) as event_types
FROM security_events 
WHERE timestamp > (now() - interval '24 hours')
GROUP BY client_ip
HAVING COUNT(*) > 5
ORDER BY total_events DESC, critical_events DESC
LIMIT 20;

CREATE OR REPLACE VIEW failed_login_summary AS
SELECT 
  client_ip,
  user_identifier,
  COUNT(*) as attempt_count,
  array_agg(DISTINCT failure_reason) as failure_reasons,
  MIN(timestamp) as first_attempt,
  MAX(timestamp) as last_attempt
FROM failed_login_attempts 
WHERE timestamp > (now() - interval '1 hour')
GROUP BY client_ip, user_identifier
HAVING COUNT(*) >= 3
ORDER BY attempt_count DESC, last_attempt DESC;

-- Create functions for security operations
CREATE OR REPLACE FUNCTION get_security_summary(hours_back integer DEFAULT 24)
RETURNS TABLE (
  total_events bigint,
  blocked_events bigint,
  critical_events bigint,
  high_events bigint,
  unique_attackers bigint,
  top_attack_types jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH event_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE blocked = true) as blocked,
      COUNT(*) FILTER (WHERE severity = 'critical') as critical,
      COUNT(*) FILTER (WHERE severity = 'high') as high,
      COUNT(DISTINCT client_ip) as unique_ips
    FROM security_events 
    WHERE timestamp > (now() - (hours_back || ' hours')::interval)
  ),
  attack_types AS (
    SELECT jsonb_object_agg(type, count) as types
    FROM (
      SELECT type, COUNT(*) as count
      FROM security_events 
      WHERE timestamp > (now() - (hours_back || ' hours')::interval)
      GROUP BY type
      ORDER BY count DESC
      LIMIT 10
    ) t
  )
  SELECT 
    es.total,
    es.blocked,
    es.critical,
    es.high,
    es.unique_ips,
    at.types
  FROM event_stats es
  CROSS JOIN attack_types at;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION block_ip_address(
  ip_address_param text,
  reason_param text DEFAULT 'Security violation',
  duration_hours integer DEFAULT 24
)
RETURNS boolean AS $$
BEGIN
  INSERT INTO ip_access_control (ip_address, type, reason, expires_at)
  VALUES (
    ip_address_param, 
    'blacklist', 
    reason_param, 
    now() + (duration_hours || ' hours')::interval
  )
  ON CONFLICT (ip_address) DO UPDATE SET
    type = 'blacklist',
    reason = reason_param,
    expires_at = now() + (duration_hours || ' hours')::interval,
    updated_at = now();
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unblock_ip_address(ip_address_param text)
RETURNS boolean AS $$
BEGIN
  DELETE FROM ip_access_control 
  WHERE ip_address = ip_address_param AND type = 'blacklist';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION is_ip_blocked(ip_address_param text)
RETURNS boolean AS $$
DECLARE
  blocked_record RECORD;
BEGIN
  SELECT * INTO blocked_record
  FROM ip_access_control 
  WHERE ip_address = ip_address_param 
    AND type = 'blacklist'
    AND (expires_at IS NULL OR expires_at > now());
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_blocks()
RETURNS void AS $$
BEGIN
  DELETE FROM ip_access_control 
  WHERE expires_at IS NOT NULL AND expires_at < now();
  
  DELETE FROM api_keys 
  WHERE expires_at IS NOT NULL AND expires_at < now() AND NOT revoked;
  
  RAISE NOTICE 'Cleanup completed: removed expired IP blocks and API keys';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION detect_brute_force_attacks()
RETURNS TABLE (
  client_ip text,
  attempt_count bigint,
  first_attempt timestamptz,
  last_attempt timestamptz,
  should_block boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fla.client_ip,
    COUNT(*) as attempt_count,
    MIN(fla.timestamp) as first_attempt,
    MAX(fla.timestamp) as last_attempt,
    COUNT(*) >= 10 as should_block
  FROM failed_login_attempts fla
  WHERE fla.timestamp > (now() - interval '15 minutes')
  GROUP BY fla.client_ip
  HAVING COUNT(*) >= 5
  ORDER BY attempt_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create automated security jobs
SELECT cron.schedule(
  'cleanup-expired-security-blocks',
  '0 */6 * * *', -- Every 6 hours
  'SELECT cleanup_expired_blocks();'
);

SELECT cron.schedule(
  'detect-brute-force-attacks',
  '*/5 * * * *', -- Every 5 minutes
  $$
  DO $$
  DECLARE
    attack_record RECORD;
  BEGIN
    FOR attack_record IN SELECT * FROM detect_brute_force_attacks() WHERE should_block = true
    LOOP
      PERFORM block_ip_address(attack_record.client_ip, 'Brute force attack detected', 2);
    END LOOP;
  END $$;
  $$
);

-- Insert default security configuration
INSERT INTO security_config (config_key, config_value, description) VALUES
  ('rate_limiting', '{"enabled": true, "window_ms": 60000, "max_requests": 60}', 'Rate limiting configuration'),
  ('ddos_protection', '{"enabled": true, "threshold": 100, "window_ms": 60000, "block_duration": 900000}', 'DDoS protection settings'),
  ('input_validation', '{"max_request_size": 1048576, "allowed_content_types": ["application/json", "text/plain"], "sanitize_html": true}', 'Input validation rules'),
  ('audit_logging', '{"enabled": true, "log_successful_requests": false, "log_failed_requests": true}', 'Audit logging configuration'),
  ('security_headers', '{"enabled": true, "strict_transport_security": true, "content_security_policy": true}', 'Security headers configuration')
ON CONFLICT (config_key) DO NOTHING;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON security_events TO authenticated;
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT SELECT ON ip_access_control TO authenticated;
GRANT SELECT ON api_keys TO authenticated;
GRANT SELECT ON security_config TO authenticated;
GRANT SELECT, INSERT ON failed_login_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON security_scans TO authenticated;

GRANT SELECT ON security_dashboard TO authenticated;
GRANT SELECT ON top_attackers TO authenticated;
GRANT SELECT ON failed_login_summary TO authenticated;

GRANT EXECUTE ON FUNCTION get_security_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION is_ip_blocked(text) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_brute_force_attacks() TO authenticated;

-- Grant admin functions to service role only
GRANT EXECUTE ON FUNCTION block_ip_address(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION unblock_ip_address(text) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_blocks() TO service_role;