-- Monitoring and Alerting System Migration
-- This migration adds comprehensive monitoring tables, metrics collection, and alerting infrastructure

-- Create system metrics table for tracking key performance indicators
CREATE TABLE system_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  metric_unit text,
  tags jsonb DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_metrics_name_check CHECK (metric_name ~ '^[a-z_][a-z0-9_]*$')
);

-- Create alert rules table for defining monitoring thresholds
CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  metric_name text NOT NULL,
  condition text NOT NULL CHECK (condition IN ('>', '<', '>=', '<=', '=', '!=')),
  threshold numeric NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create alerts table for tracking fired alerts
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES alert_rules(id) ON DELETE CASCADE,
  metric_value numeric NOT NULL,
  status text NOT NULL CHECK (status IN ('firing', 'resolved')),
  fired_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  message text,
  metadata jsonb DEFAULT '{}'
);

-- Create function performance metrics table
CREATE TABLE function_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  endpoint text,
  method text,
  status_code integer,
  response_time_ms numeric NOT NULL,
  error_message text,
  request_id text,
  client_ip text,
  user_agent text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Create business metrics table for tracking key business KPIs
CREATE TABLE business_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL CHECK (metric_type IN (
    'search_requests', 'comparison_requests', 'game_clicks', 
    'conversation_starts', 'ai_responses', 'error_rate'
  )),
  count_value integer DEFAULT 0,
  sum_value numeric DEFAULT 0,
  avg_value numeric DEFAULT 0,
  tags jsonb DEFAULT '{}',
  time_bucket timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX system_metrics_name_time_idx ON system_metrics(metric_name, recorded_at DESC);
CREATE INDEX system_metrics_recorded_at_idx ON system_metrics(recorded_at DESC);
CREATE INDEX system_metrics_tags_idx ON system_metrics USING gin(tags);

CREATE INDEX alert_rules_metric_name_idx ON alert_rules(metric_name);
CREATE INDEX alert_rules_enabled_idx ON alert_rules(enabled) WHERE enabled = true;

CREATE INDEX alerts_rule_id_idx ON alerts(rule_id);
CREATE INDEX alerts_status_idx ON alerts(status);
CREATE INDEX alerts_fired_at_idx ON alerts(fired_at DESC);

CREATE INDEX function_metrics_function_name_idx ON function_metrics(function_name);
CREATE INDEX function_metrics_endpoint_idx ON function_metrics(endpoint);
CREATE INDEX function_metrics_recorded_at_idx ON function_metrics(recorded_at DESC);
CREATE INDEX function_metrics_status_code_idx ON function_metrics(status_code);

CREATE INDEX business_metrics_type_time_idx ON business_metrics(metric_type, time_bucket DESC);
CREATE INDEX business_metrics_time_bucket_idx ON business_metrics(time_bucket DESC);

-- Create function to automatically update alert rule timestamps
CREATE OR REPLACE FUNCTION update_alert_rule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for alert rules
CREATE TRIGGER alert_rules_update_timestamp
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_alert_rule_updated_at();

-- Create function to check alert conditions and fire alerts
CREATE OR REPLACE FUNCTION check_alert_conditions()
RETURNS void AS $$
DECLARE
  rule_record RECORD;
  latest_metric RECORD;
  alert_should_fire boolean;
  existing_alert RECORD;
BEGIN
  -- Loop through all enabled alert rules
  FOR rule_record IN 
    SELECT * FROM alert_rules WHERE enabled = true
  LOOP
    -- Get the latest metric value for this rule
    SELECT metric_value, recorded_at
    INTO latest_metric
    FROM system_metrics 
    WHERE metric_name = rule_record.metric_name 
    ORDER BY recorded_at DESC 
    LIMIT 1;
    
    -- Skip if no metric data found
    IF latest_metric IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Check if alert condition is met
    alert_should_fire := CASE rule_record.condition
      WHEN '>' THEN latest_metric.metric_value > rule_record.threshold
      WHEN '<' THEN latest_metric.metric_value < rule_record.threshold
      WHEN '>=' THEN latest_metric.metric_value >= rule_record.threshold
      WHEN '<=' THEN latest_metric.metric_value <= rule_record.threshold
      WHEN '=' THEN latest_metric.metric_value = rule_record.threshold
      WHEN '!=' THEN latest_metric.metric_value != rule_record.threshold
      ELSE false
    END;
    
    -- Check for existing firing alert
    SELECT * INTO existing_alert
    FROM alerts 
    WHERE rule_id = rule_record.id AND status = 'firing'
    ORDER BY fired_at DESC 
    LIMIT 1;
    
    IF alert_should_fire THEN
      -- Fire new alert if none exists
      IF existing_alert IS NULL THEN
        INSERT INTO alerts (rule_id, metric_value, status, message)
        VALUES (
          rule_record.id,
          latest_metric.metric_value,
          'firing',
          format('%s: %s %s %s (current: %s)', 
            rule_record.name,
            rule_record.metric_name,
            rule_record.condition,
            rule_record.threshold,
            latest_metric.metric_value
          )
        );
      END IF;
    ELSE
      -- Resolve existing alert if condition no longer met
      IF existing_alert IS NOT NULL THEN
        UPDATE alerts 
        SET status = 'resolved', resolved_at = now()
        WHERE id = existing_alert.id;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for system health dashboard
CREATE MATERIALIZED VIEW system_health_dashboard AS
SELECT 
  -- Overall system status
  CASE 
    WHEN COUNT(*) FILTER (WHERE a.status = 'firing' AND ar.severity = 'critical') > 0 THEN 'critical'
    WHEN COUNT(*) FILTER (WHERE a.status = 'firing' AND ar.severity = 'warning') > 0 THEN 'warning'
    ELSE 'healthy'
  END as overall_status,
  
  -- Alert counts by severity
  COUNT(*) FILTER (WHERE a.status = 'firing' AND ar.severity = 'critical') as critical_alerts,
  COUNT(*) FILTER (WHERE a.status = 'firing' AND ar.severity = 'warning') as warning_alerts,
  COUNT(*) FILTER (WHERE a.status = 'firing' AND ar.severity = 'info') as info_alerts,
  
  -- Recent metrics (last 5 minutes)
  (SELECT AVG(response_time_ms) FROM function_metrics 
   WHERE recorded_at > now() - interval '5 minutes') as avg_response_time_5m,
  
  (SELECT COUNT(*) FROM function_metrics 
   WHERE recorded_at > now() - interval '5 minutes' AND status_code >= 500) as error_count_5m,
  
  (SELECT COUNT(*) FROM function_metrics 
   WHERE recorded_at > now() - interval '5 minutes') as total_requests_5m,
  
  -- Business metrics (last hour)
  (SELECT COALESCE(SUM(count_value), 0) FROM business_metrics 
   WHERE metric_type = 'search_requests' AND time_bucket > now() - interval '1 hour') as searches_1h,
  
  (SELECT COALESCE(SUM(count_value), 0) FROM business_metrics 
   WHERE metric_type = 'comparison_requests' AND time_bucket > now() - interval '1 hour') as comparisons_1h,
  
  (SELECT COALESCE(SUM(count_value), 0) FROM business_metrics 
   WHERE metric_type = 'game_clicks' AND time_bucket > now() - interval '1 hour') as clicks_1h,
  
  now() as last_updated
FROM alerts a
LEFT JOIN alert_rules ar ON a.rule_id = ar.id;

-- Create index on materialized view
CREATE UNIQUE INDEX system_health_dashboard_unique_idx ON system_health_dashboard (last_updated);

-- Insert default alert rules
INSERT INTO alert_rules (name, metric_name, condition, threshold, severity, description) VALUES
('High Error Rate', 'error_rate_percent', '>', 5.0, 'critical', 'Error rate exceeds 5%'),
('High Response Time', 'avg_response_time_ms', '>', 2000, 'warning', 'Average response time exceeds 2 seconds'),
('Database Connection Issues', 'database_response_time_ms', '>', 1000, 'warning', 'Database response time exceeds 1 second'),
('Vector Database Unavailable', 'vector_db_status', '=', 0, 'critical', 'Vector database is unavailable'),
('OpenAI API Issues', 'openai_response_time_ms', '>', 5000, 'warning', 'OpenAI API response time exceeds 5 seconds'),
('Low Search Volume', 'searches_per_hour', '<', 1, 'info', 'Search volume is unusually low'),
('High Memory Usage', 'memory_usage_percent', '>', 85, 'warning', 'Memory usage exceeds 85%'),
('Disk Space Low', 'disk_usage_percent', '>', 90, 'critical', 'Disk usage exceeds 90%');

-- Create function to aggregate business metrics hourly
CREATE OR REPLACE FUNCTION aggregate_business_metrics()
RETURNS void AS $$
BEGIN
  -- Aggregate search requests
  INSERT INTO business_metrics (metric_type, count_value, time_bucket)
  SELECT 
    'search_requests',
    COUNT(*),
    date_trunc('hour', recorded_at)
  FROM function_metrics 
  WHERE endpoint LIKE '%/similar%' 
    AND method = 'POST'
    AND status_code = 200
    AND recorded_at > now() - interval '2 hours'
  GROUP BY date_trunc('hour', recorded_at)
  ON CONFLICT DO NOTHING;
  
  -- Aggregate comparison requests
  INSERT INTO business_metrics (metric_type, count_value, time_bucket)
  SELECT 
    'comparison_requests',
    COUNT(*),
    date_trunc('hour', recorded_at)
  FROM function_metrics 
  WHERE endpoint LIKE '%/compare%' 
    AND method = 'POST'
    AND status_code = 200
    AND recorded_at > now() - interval '2 hours'
  GROUP BY date_trunc('hour', recorded_at)
  ON CONFLICT DO NOTHING;
  
  -- Aggregate game clicks
  INSERT INTO business_metrics (metric_type, count_value, time_bucket)
  SELECT 
    'game_clicks',
    COUNT(*),
    date_trunc('hour', clicked_at)
  FROM click_logs 
  WHERE clicked_at > now() - interval '2 hours'
  GROUP BY date_trunc('hour', clicked_at)
  ON CONFLICT DO NOTHING;
  
  -- Calculate error rate
  INSERT INTO business_metrics (metric_type, avg_value, time_bucket)
  SELECT 
    'error_rate',
    (COUNT(*) FILTER (WHERE status_code >= 400) * 100.0 / NULLIF(COUNT(*), 0)),
    date_trunc('hour', recorded_at)
  FROM function_metrics 
  WHERE recorded_at > now() - interval '2 hours'
  GROUP BY date_trunc('hour', recorded_at)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE system_metrics IS 'Stores system-level metrics for monitoring and alerting';
COMMENT ON TABLE alert_rules IS 'Defines alert conditions and thresholds for monitoring';
COMMENT ON TABLE alerts IS 'Tracks fired and resolved alerts';
COMMENT ON TABLE function_metrics IS 'Stores performance metrics for Edge Functions';
COMMENT ON TABLE business_metrics IS 'Aggregated business metrics for KPI tracking';
COMMENT ON MATERIALIZED VIEW system_health_dashboard IS 'Real-time system health overview for monitoring dashboard';