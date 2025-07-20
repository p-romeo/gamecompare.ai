-- Vault Functions for Secret Management
-- This migration creates functions to interact with Supabase Vault for secure secret storage

-- Function to store secrets in Supabase Vault
CREATE OR REPLACE FUNCTION vault_store_secret(
  secret_name text,
  secret_value text,
  description text DEFAULT NULL
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  vault_secret_id uuid;
BEGIN
  -- Insert or update secret in vault.secrets table
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (secret_name, secret_value, description)
  ON CONFLICT (name) DO UPDATE SET
    secret = EXCLUDED.secret,
    description = COALESCE(EXCLUDED.description, vault.secrets.description),
    updated_at = now();
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error storing secret %: %', secret_name, SQLERRM;
    RETURN false;
END;
$;

-- Function to retrieve secrets from Supabase Vault
CREATE OR REPLACE FUNCTION vault_get_secret(secret_name text)
RETURNS text
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  RETURN secret_value;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error retrieving secret %: %', secret_name, SQLERRM;
    RETURN NULL;
END;
$;

-- Function to list all secret names (without values)
CREATE OR REPLACE FUNCTION vault_list_secrets()
RETURNS TABLE (
  secret_name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
BEGIN
  RETURN QUERY
  SELECT 
    s.name,
    s.description,
    s.created_at,
    s.updated_at
  FROM vault.secrets s
  ORDER BY s.name;
END;
$;

-- Function to delete secrets from vault
CREATE OR REPLACE FUNCTION vault_delete_secret(secret_name text)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
  
  RETURN FOUND;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error deleting secret %: %', secret_name, SQLERRM;
    RETURN false;
END;
$;

-- Function to check if secret exists
CREATE OR REPLACE FUNCTION vault_secret_exists(secret_name text)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  secret_count integer;
BEGIN
  SELECT COUNT(*) INTO secret_count
  FROM vault.secrets
  WHERE name = secret_name;
  
  RETURN secret_count > 0;
END;
$;

-- Function to rotate secret with backup
CREATE OR REPLACE FUNCTION vault_rotate_secret_with_backup(
  secret_name text,
  new_secret_value text,
  backup_suffix text DEFAULT '_backup'
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  old_secret_value text;
  backup_name text;
BEGIN
  -- Get current secret value
  SELECT decrypted_secret INTO old_secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  IF old_secret_value IS NULL THEN
    RAISE EXCEPTION 'Secret % does not exist', secret_name;
  END IF;
  
  -- Create backup name
  backup_name := secret_name || backup_suffix;
  
  -- Store backup of old secret
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (backup_name, old_secret_value, 'Backup of ' || secret_name || ' created during rotation')
  ON CONFLICT (name) DO UPDATE SET
    secret = EXCLUDED.secret,
    description = EXCLUDED.description,
    updated_at = now();
  
  -- Update original secret with new value
  UPDATE vault.secrets
  SET secret = new_secret_value,
      updated_at = now()
  WHERE name = secret_name;
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error rotating secret %: %', secret_name, SQLERRM;
    RETURN false;
END;
$;

-- Function to clean up old secret backups
CREATE OR REPLACE FUNCTION vault_cleanup_old_backups(
  days_to_keep integer DEFAULT 30
)
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM vault.secrets
  WHERE name LIKE '%_backup'
    AND updated_at < (now() - (days_to_keep || ' days')::interval);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE LOG 'Cleaned up % old secret backups', deleted_count;
  RETURN deleted_count;
END;
$;

-- Function to generate secure random string
CREATE OR REPLACE FUNCTION generate_secure_random_string(
  length integer DEFAULT 32,
  include_special_chars boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
AS $
DECLARE
  chars text;
  result text := '';
  i integer;
BEGIN
  -- Define character set
  chars := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
  IF include_special_chars THEN
    chars := chars || '!@#$%^&*()_+-=[]{}|;:,.<>?';
  END IF;
  
  -- Generate random string
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  
  RETURN result;
END;
$;

-- Create a view for secret metadata (without actual secret values)
CREATE OR REPLACE VIEW secret_metadata AS
SELECT 
  s.name,
  s.description,
  s.created_at,
  s.updated_at,
  CASE 
    WHEN s.name LIKE '%_backup' THEN 'backup'
    ELSE 'active'
  END as secret_type,
  CASE
    WHEN s.updated_at < (now() - interval '90 days') THEN 'needs_rotation'
    WHEN s.updated_at < (now() - interval '60 days') THEN 'rotation_due_soon'
    ELSE 'current'
  END as rotation_status
FROM vault.secrets s
ORDER BY s.name;

-- Grant permissions
GRANT EXECUTE ON FUNCTION vault_store_secret(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_get_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_list_secrets() TO service_role;
GRANT EXECUTE ON FUNCTION vault_delete_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_secret_exists(text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_rotate_secret_with_backup(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION vault_cleanup_old_backups(integer) TO service_role;
GRANT EXECUTE ON FUNCTION generate_secure_random_string(integer, boolean) TO service_role;

GRANT SELECT ON secret_metadata TO service_role;

-- Create scheduled job to clean up old backups
SELECT cron.schedule(
  'cleanup-old-secret-backups',
  '0 2 * * 0', -- Every Sunday at 2 AM
  'SELECT vault_cleanup_old_backups(30);'
);

-- Insert some default configuration for secret management
INSERT INTO security_config (config_key, config_value, description) VALUES
  ('secret_rotation_policy', '{
    "default_rotation_days": 90,
    "critical_secrets_rotation_days": 30,
    "backup_retention_days": 30,
    "auto_rotation_enabled": true,
    "notification_days_before_expiry": 7
  }', 'Secret rotation policy configuration'),
  ('vault_security_settings', '{
    "require_backup_before_rotation": true,
    "log_all_secret_access": true,
    "encrypt_secret_logs": true,
    "audit_secret_operations": true
  }', 'Vault security settings')
ON CONFLICT (config_key) DO NOTHING;

-- Create function to check secrets needing rotation
CREATE OR REPLACE FUNCTION get_secrets_needing_rotation(
  rotation_days integer DEFAULT 90
)
RETURNS TABLE (
  secret_name text,
  last_updated timestamptz,
  days_since_update integer,
  priority text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
BEGIN
  RETURN QUERY
  SELECT 
    s.name,
    s.updated_at,
    EXTRACT(days FROM (now() - s.updated_at))::integer as days_since_update,
    CASE 
      WHEN EXTRACT(days FROM (now() - s.updated_at)) > rotation_days + 30 THEN 'critical'
      WHEN EXTRACT(days FROM (now() - s.updated_at)) > rotation_days THEN 'high'
      WHEN EXTRACT(days FROM (now() - s.updated_at)) > rotation_days - 7 THEN 'medium'
      ELSE 'low'
    END as priority
  FROM vault.secrets s
  WHERE s.name NOT LIKE '%_backup'
    AND EXTRACT(days FROM (now() - s.updated_at)) >= (rotation_days - 7)
  ORDER BY s.updated_at ASC;
END;
$;

GRANT EXECUTE ON FUNCTION get_secrets_needing_rotation(integer) TO service_role;

-- Create function to audit secret access
CREATE OR REPLACE FUNCTION audit_secret_access(
  secret_name text,
  access_type text, -- 'read', 'write', 'delete', 'rotate'
  client_info jsonb DEFAULT '{}'
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $
BEGIN
  INSERT INTO security_events (
    type,
    severity,
    client_ip,
    endpoint,
    details,
    blocked
  ) VALUES (
    'secret_access',
    CASE 
      WHEN access_type IN ('delete', 'rotate') THEN 'high'
      WHEN access_type = 'write' THEN 'medium'
      ELSE 'low'
    END,
    COALESCE(client_info->>'client_ip', 'system'),
    'vault_access',
    jsonb_build_object(
      'secret_name', secret_name,
      'access_type', access_type,
      'client_info', client_info,
      'timestamp', now()
    ),
    false
  );
END;
$;

GRANT EXECUTE ON FUNCTION audit_secret_access(text, text, jsonb) TO service_role;

-- Create trigger to automatically audit secret operations
CREATE OR REPLACE FUNCTION trigger_audit_secret_operations()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_secret_access(NEW.name, 'create');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM audit_secret_access(NEW.name, 'update');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_secret_access(OLD.name, 'delete');
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$;

-- Note: We cannot create triggers on vault.secrets as it's a system table
-- The audit functions will need to be called manually from the application code

COMMENT ON FUNCTION vault_store_secret IS 'Securely store a secret in Supabase Vault';
COMMENT ON FUNCTION vault_get_secret IS 'Retrieve a secret from Supabase Vault';
COMMENT ON FUNCTION vault_list_secrets IS 'List all secret names without exposing values';
COMMENT ON FUNCTION vault_delete_secret IS 'Delete a secret from Supabase Vault';
COMMENT ON FUNCTION vault_secret_exists IS 'Check if a secret exists in the vault';
COMMENT ON FUNCTION vault_rotate_secret_with_backup IS 'Rotate a secret while keeping a backup';
COMMENT ON FUNCTION vault_cleanup_old_backups IS 'Clean up old secret backups';
COMMENT ON FUNCTION generate_secure_random_string IS 'Generate a cryptographically secure random string';
COMMENT ON FUNCTION get_secrets_needing_rotation IS 'Get list of secrets that need rotation';
COMMENT ON FUNCTION audit_secret_access IS 'Audit secret access operations';