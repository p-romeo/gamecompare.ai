-- Monitoring and Alerting System Tables
-- This migration creates tables for comprehensive monitoring, alerting, and business metrics

-- Alerts table for storing alert configurations and history
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL CHECK (status IN ('active', 'resolved', 'suppressed')),
  value numeric NOT NULL,
  threshold numeric NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Business metrics table for tracking KPIs and business data
CREATE TABLE IF NOT EXISTS business_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  value numeric NOT NULL,
  dimensions jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- System health metrics table
CREATE TABLE IF NOT EXISTS system_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  metric_unit text,
  instance_id text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Error tracking table for detailed error analysis
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  function_name text,
  endpoint text,
  request_id text,
  user_id text,
  session_id text,
  context jsonb DEFAULT '{}',
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved boolean DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performance baselines table for anomaly detection
CREATE TABLE IF NOT EXISTS performance_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  baseline_value numeric NOT NULL,
  upper_bound numeric NOT NULL,
  lower_bound numeric NOT NULL,
  confidence_interval numeric DEFAULT 0.95,
  sample_size integer NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Incident tracking table
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  assigned_to text,
  affected_services text[],
  root_cause text,
  resolution text,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SLA tracking table
CREATE TABLE IF NOT EXISTS sla_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  metric_type text NOT NULL, -- 'availability', 'response_time', 'error_rate'
  target_value numeric NOT NULL,
  actual_value numeric NOT NULL,
  measurement_period text NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  sla_met boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_alerts_status_triggered ON alerts (status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_name_triggered ON alerts (name, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_metrics_name_recorded ON business_metrics (name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_metrics_recorded ON business_metrics (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_metrics_name_recorded ON system_health_metrics (metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_occurred ON error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_function_endpoint ON error_logs (function_name, endpoint);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_resolved ON error_logs (severity, resolved);
CREATE INDEX IF NOT EXISTS idx_incidents_status_started ON incidents (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_metrics_service_period ON sla_metrics (service_name, period_start DESC);

-- Create GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_business_metrics_dimensions_gin ON business_metrics USING gin(dimensions);
CREATE INDEX IF NOT EXISTS idx_business_metrics_metadata_gin ON business_metrics USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_error_logs_context_gin ON error_logs USING gin(context);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common monitoring queries
CREATE OR REPLACE VIEW active_alerts AS
SELECT 
  id,
  name,
  severity,
  value,
  threshold,
  triggered_at,
  extract(epoch from (now() - triggered_at)) / 60 as minutes_active
FROM alerts 
WHERE status = 'active'
ORDER BY 
  CASE severity 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    WHEN 'low' THEN 4 
  END,
  triggered_at DESC;

CREATE OR REPLACE VIEW recent_errors AS
SELECT 
  error_type,
  error_message,
  function_name,
  endpoint,
  severity,
  COUNT(*) as occurrence_count,
  MAX(occurred_at) as last_occurred,
  MIN(occurred_at) as first_occurred
FROM error_logs 
WHERE occurred_at > (now() - interval '24 hours')
  AND NOT resolved
GROUP BY error_type, error_message, function_name, endpoint, severity
ORDER BY occurrence_count DESC, last_occurred DESC;

CREATE OR REPLACE VIEW system_health_summary AS
SELECT 
  metric_name,
  AVG(metric_value) as avg_value,
  MIN(metric_value) as min_value,
  MAX(metric_value) as max_value,
  COUNT(*) as sample_count,
  MAX(recorded_at) as last_recorded
FROM system_health_metrics 
WHERE recorded_at > (now() - interval '1 hour')
GROUP BY metric_name
ORDER BY metric_name;

-- Create functions for monitoring operations
CREATE OR REPLACE FUNCTION get_alert_summary(hours_back integer DEFAULT 24)
RETURNS TABLE (
  severity text,
  active_count bigint,
  resolved_count bigint,
  total_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.severity,
    COUNT(*) FILTER (WHERE a.status = 'active') as active_count,
    COUNT(*) FILTER (WHERE a.status = 'resolved') as resolved_count,
    COUNT(*) as total_count
  FROM alerts a
  WHERE a.triggered_at > (now() - (hours_back || ' hours')::interval)
  GROUP BY a.severity
  ORDER BY 
    CASE a.severity 
      WHEN 'critical' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'medium' THEN 3 
      WHEN 'low' THEN 4 
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_business_metrics_summary(
  metric_name_param text,
  hours_back integer DEFAULT 24
)
RETURNS TABLE (
  total_value numeric,
  avg_value numeric,
  min_value numeric,
  max_value numeric,
  sample_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    SUM(bm.value) as total_value,
    AVG(bm.value) as avg_value,
    MIN(bm.value) as min_value,
    MAX(bm.value) as max_value,
    COUNT(*) as sample_count
  FROM business_metrics bm
  WHERE bm.name = metric_name_param
    AND bm.recorded_at > (now() - (hours_back || ' hours')::interval);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_sla_compliance(
  service_name_param text,
  metric_type_param text,
  period_start_param timestamptz,
  period_end_param timestamptz
)
RETURNS TABLE (
  target_value numeric,
  actual_value numeric,
  compliance_percentage numeric,
  sla_met boolean
) AS $$
DECLARE
  target_val numeric;
  actual_val numeric;
  compliance numeric;
  met boolean;
BEGIN
  -- This is a simplified SLA calculation
  -- In practice, this would be more complex based on specific SLA requirements
  
  SELECT AVG(sm.target_value), AVG(sm.actual_value)
  INTO target_val, actual_val
  FROM sla_metrics sm
  WHERE sm.service_name = service_name_param
    AND sm.metric_type = metric_type_param
    AND sm.period_start >= period_start_param
    AND sm.period_end <= period_end_param;
  
  IF target_val IS NULL OR actual_val IS NULL THEN
    target_val := 0;
    actual_val := 0;
    compliance := 0;
    met := false;
  ELSE
    compliance := (actual_val / target_val) * 100;
    met := actual_val >= target_val;
  END IF;
  
  RETURN QUERY SELECT target_val, actual_val, compliance, met;
END;
$$ LANGUAGE plpgsql;

-- Create automated cleanup jobs
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  -- Clean up business metrics older than 90 days
  DELETE FROM business_metrics 
  WHERE recorded_at < (now() - interval '90 days');
  
  -- Clean up system health metrics older than 30 days
  DELETE FROM system_health_metrics 
  WHERE recorded_at < (now() - interval '30 days');
  
  -- Clean up resolved error logs older than 30 days
  DELETE FROM error_logs 
  WHERE resolved = true 
    AND occurred_at < (now() - interval '30 days');
  
  -- Clean up resolved alerts older than 60 days
  DELETE FROM alerts 
  WHERE status = 'resolved' 
    AND resolved_at < (now() - interval '60 days');
    
  RAISE NOTICE 'Cleanup completed at %', now();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job to run daily at 2 AM
SELECT cron.schedule(
  'cleanup-old-metrics',
  '0 2 * * *', -- Daily at 2 AM
  'SELECT cleanup_old_metrics();'
);

-- Create function to detect anomalies
CREATE OR REPLACE FUNCTION detect_anomalies(
  metric_name_param text,
  threshold_multiplier numeric DEFAULT 2.0
)
RETURNS TABLE (
  metric_value numeric,
  baseline_value numeric,
  deviation_percentage numeric,
  is_anomaly boolean,
  recorded_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_metrics AS (
    SELECT 
      shm.metric_value,
      shm.recorded_at
    FROM system_health_metrics shm
    WHERE shm.metric_name = metric_name_param
      AND shm.recorded_at > (now() - interval '1 hour')
    ORDER BY shm.recorded_at DESC
  ),
  baseline AS (
    SELECT 
      pb.baseline_value,
      pb.upper_bound,
      pb.lower_bound
    FROM performance_baselines pb
    WHERE pb.metric_name = metric_name_param
      AND pb.valid_until > now()
    ORDER BY pb.calculated_at DESC
    LIMIT 1
  )
  SELECT 
    rm.metric_value,
    b.baseline_value,
    CASE 
      WHEN b.baseline_value > 0 THEN 
        ABS((rm.metric_value - b.baseline_value) / b.baseline_value) * 100
      ELSE 0
    END as deviation_percentage,
    (rm.metric_value > b.upper_bound OR rm.metric_value < b.lower_bound) as is_anomaly,
    rm.recorded_at
  FROM recent_metrics rm
  CROSS JOIN baseline b
  ORDER BY rm.recorded_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON alerts TO authenticated;
GRANT SELECT, INSERT ON business_metrics TO authenticated;
GRANT SELECT, INSERT ON system_health_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON error_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON incidents TO authenticated;
GRANT SELECT, INSERT ON sla_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON performance_baselines TO authenticated;

GRANT SELECT ON active_alerts TO authenticated;
GRANT SELECT ON recent_errors TO authenticated;
GRANT SELECT ON system_health_summary TO authenticated;

GRANT EXECUTE ON FUNCTION get_alert_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_business_metrics_summary(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_sla_compliance(text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_anomalies(text, numeric) TO authenticated;

-- Insert initial performance baselines (these would be calculated from historical data)
INSERT INTO performance_baselines (metric_name, baseline_value, upper_bound, lower_bound, sample_size, valid_until)
VALUES 
  ('api_response_time_avg', 1000, 2000, 100, 1000, now() + interval '30 days'),
  ('memory_usage_percent', 50, 80, 20, 1000, now() + interval '30 days'),
  ('error_rate_percent', 1, 5, 0, 1000, now() + interval '30 days'),
  ('search_success_rate', 95, 100, 85, 1000, now() + interval '30 days')
ON CONFLICT DO NOTHING;

-- Create sample SLA targets
INSERT INTO sla_metrics (service_name, metric_type, target_value, actual_value, measurement_period, period_start, period_end, sla_met)
VALUES 
  ('api_router', 'availability', 99.9, 99.95, 'daily', date_trunc('day', now() - interval '1 day'), date_trunc('day', now()), true),
  ('api_router', 'response_time', 2000, 1500, 'daily', date_trunc('day', now() - interval '1 day'), date_trunc('day', now()), true),
  ('api_router', 'error_rate', 1, 0.5, 'daily', date_trunc('day', now() - interval '1 day'), date_trunc('day', now()), true)
ON CONFLICT DO NOTHING;