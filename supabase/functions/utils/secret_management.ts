/**
 * Secret Management and API Key Rotation Utilities
 * Provides secure handling of API keys, secrets, and automated rotation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface SecretConfig {
  name: string
  value: string
  description?: string
  expiresAt?: Date
  rotationIntervalDays?: number
  autoRotate?: boolean
}

interface APIKeyConfig {
  name: string
  description?: string
  permissions: string[]
  rateLimitOverride?: number
  expiresAt?: Date
  rotationIntervalDays?: number
}

interface RotationResult {
  success: boolean
  oldKeyHash?: string
  newKeyHash?: string
  error?: string
}

/**
 * Secret Management Service
 */
export class SecretManager {
  private supabase: any

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Store secret in Supabase Vault
   */
  async storeSecret(config: SecretConfig): Promise<boolean> {
    try {
      // Store in Supabase Vault using SQL function
      const { error } = await this.supabase.rpc('vault_store_secret', {
        secret_name: config.name,
        secret_value: config.value,
        description: config.description || null
      })

      if (error) {
        console.error('Failed to store secret in vault:', error)
        return false
      }

      // Track secret metadata in our security config table
      await this.supabase
        .from('security_config')
        .upsert({
          config_key: `secret_${config.name}`,
          config_value: {
            description: config.description,
            expires_at: config.expiresAt?.toISOString(),
            rotation_interval_days: config.rotationIntervalDays,
            auto_rotate: config.autoRotate || false,
            created_at: new Date().toISOString(),
            last_rotated: new Date().toISOString()
          },
          description: `Secret metadata for ${config.name}`
        })

      return true
    } catch (error) {
      console.error('Error storing secret:', error)
      return false
    }
  }

  /**
   * Retrieve secret from Supabase Vault
   */
  async getSecret(name: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.rpc('vault_get_secret', {
        secret_name: name
      })

      if (error) {
        console.error('Failed to retrieve secret from vault:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error retrieving secret:', error)
      return null
    }
  }

  /**
   * Rotate secret with new value
   */
  async rotateSecret(name: string, newValue: string): Promise<boolean> {
    try {
      // Store new secret value
      const stored = await this.storeSecret({
        name,
        value: newValue,
        description: `Rotated secret for ${name}`
      })

      if (!stored) {
        return false
      }

      // Update metadata
      await this.supabase
        .from('security_config')
        .update({
          config_value: {
            last_rotated: new Date().toISOString(),
            rotation_count: this.supabase.raw('(config_value->>\'rotation_count\')::int + 1')
          }
        })
        .eq('config_key', `secret_${name}`)

      // Log rotation event
      await this.logSecurityEvent({
        type: 'secret_rotated',
        severity: 'medium',
        details: {
          secret_name: name,
          rotated_at: new Date().toISOString()
        }
      })

      return true
    } catch (error) {
      console.error('Error rotating secret:', error)
      return false
    }
  }

  /**
   * Check which secrets need rotation
   */
  async getSecretsNeedingRotation(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('security_config')
        .select('config_key, config_value')
        .like('config_key', 'secret_%')

      if (error) {
        console.error('Error checking secrets for rotation:', error)
        return []
      }

      const needsRotation: string[] = []
      const now = new Date()

      for (const secret of data || []) {
        const config = secret.config_value
        if (config.auto_rotate && config.rotation_interval_days) {
          const lastRotated = new Date(config.last_rotated)
          const daysSinceRotation = Math.floor((now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24))
          
          if (daysSinceRotation >= config.rotation_interval_days) {
            needsRotation.push(secret.config_key.replace('secret_', ''))
          }
        }
      }

      return needsRotation
    } catch (error) {
      console.error('Error checking secrets for rotation:', error)
      return []
    }
  }

  /**
   * Generate secure random string for secrets
   */
  generateSecureSecret(length: number = 64): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    return Array.from(array, byte => chars[byte % chars.length]).join('')
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(event: {
    type: string
    severity: string
    details: Record<string, any>
  }): Promise<void> {
    try {
      await this.supabase
        .from('security_events')
        .insert({
          type: event.type,
          severity: event.severity,
          client_ip: 'system',
          endpoint: 'secret_management',
          details: event.details,
          blocked: false
        })
    } catch (error) {
      console.error('Failed to log security event:', error)
    }
  }
}

/**
 * API Key Management Service
 */
export class APIKeyManager {
  private supabase: any

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Generate new API key
   */
  async generateAPIKey(config: APIKeyConfig): Promise<{ key: string; hash: string } | null> {
    try {
      // Generate secure API key
      const key = this.generateAPIKeyString()
      const hash = await this.hashAPIKey(key)

      // Store in database
      const { error } = await this.supabase
        .from('api_keys')
        .insert({
          key_hash: hash,
          name: config.name,
          description: config.description,
          permissions: config.permissions,
          rate_limit_override: config.rateLimitOverride,
          expires_at: config.expiresAt?.toISOString(),
          created_by: 'system'
        })

      if (error) {
        console.error('Failed to store API key:', error)
        return null
      }

      // Log key creation
      await this.logSecurityEvent({
        type: 'api_key_created',
        severity: 'medium',
        details: {
          key_name: config.name,
          permissions: config.permissions,
          expires_at: config.expiresAt?.toISOString()
        }
      })

      return { key, hash }
    } catch (error) {
      console.error('Error generating API key:', error)
      return null
    }
  }

  /**
   * Rotate API key
   */
  async rotateAPIKey(keyHash: string): Promise<RotationResult> {
    try {
      // Get existing key info
      const { data: existingKey, error: fetchError } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('key_hash', keyHash)
        .single()

      if (fetchError || !existingKey) {
        return {
          success: false,
          error: 'API key not found'
        }
      }

      // Generate new key
      const newKey = this.generateAPIKeyString()
      const newHash = await this.hashAPIKey(newKey)

      // Update database with new key
      const { error: updateError } = await this.supabase
        .from('api_keys')
        .update({
          key_hash: newHash,
          updated_at: new Date().toISOString(),
          usage_count: 0 // Reset usage count
        })
        .eq('key_hash', keyHash)

      if (updateError) {
        return {
          success: false,
          error: 'Failed to update API key'
        }
      }

      // Log rotation
      await this.logSecurityEvent({
        type: 'api_key_rotated',
        severity: 'medium',
        details: {
          key_name: existingKey.name,
          old_hash: keyHash.substring(0, 8) + '...',
          new_hash: newHash.substring(0, 8) + '...'
        }
      })

      return {
        success: true,
        oldKeyHash: keyHash,
        newKeyHash: newHash
      }
    } catch (error) {
      console.error('Error rotating API key:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(keyHash: string, reason: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('api_keys')
        .update({
          revoked: true,
          revoked_at: new Date().toISOString(),
          revoked_reason: reason
        })
        .eq('key_hash', keyHash)

      if (error) {
        console.error('Failed to revoke API key:', error)
        return false
      }

      // Log revocation
      await this.logSecurityEvent({
        type: 'api_key_revoked',
        severity: 'high',
        details: {
          key_hash: keyHash.substring(0, 8) + '...',
          reason
        }
      })

      return true
    } catch (error) {
      console.error('Error revoking API key:', error)
      return false
    }
  }

  /**
   * Validate API key
   */
  async validateAPIKey(key: string): Promise<{
    valid: boolean
    keyInfo?: any
    error?: string
  }> {
    try {
      const hash = await this.hashAPIKey(key)
      
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('key_hash', hash)
        .eq('revoked', false)
        .single()

      if (error || !data) {
        return {
          valid: false,
          error: 'Invalid API key'
        }
      }

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return {
          valid: false,
          error: 'API key expired'
        }
      }

      // Update usage count and last used
      await this.supabase
        .from('api_keys')
        .update({
          usage_count: data.usage_count + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('key_hash', hash)

      return {
        valid: true,
        keyInfo: data
      }
    } catch (error) {
      console.error('Error validating API key:', error)
      return {
        valid: false,
        error: 'Validation error'
      }
    }
  }

  /**
   * Get API keys needing rotation
   */
  async getKeysNeedingRotation(): Promise<any[]> {
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('revoked', false)
        .or(`created_at.lt.${thirtyDaysAgo.toISOString()},last_used_at.lt.${thirtyDaysAgo.toISOString()}`)

      if (error) {
        console.error('Error getting keys needing rotation:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error getting keys needing rotation:', error)
      return []
    }
  }

  /**
   * Generate API key string
   */
  private generateAPIKeyString(): string {
    const prefix = 'gca_' // GameCompare.ai prefix
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return `${prefix}${randomPart}`
  }

  /**
   * Hash API key for storage
   */
  private async hashAPIKey(key: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(key)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(event: {
    type: string
    severity: string
    details: Record<string, any>
  }): Promise<void> {
    try {
      await this.supabase
        .from('security_events')
        .insert({
          type: event.type,
          severity: event.severity,
          client_ip: 'system',
          endpoint: 'api_key_management',
          details: event.details,
          blocked: false
        })
    } catch (error) {
      console.error('Failed to log security event:', error)
    }
  }
}

/**
 * Automated rotation scheduler
 */
export class RotationScheduler {
  private secretManager: SecretManager
  private apiKeyManager: APIKeyManager

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.secretManager = new SecretManager(supabaseUrl, serviceRoleKey)
    this.apiKeyManager = new APIKeyManager(supabaseUrl, serviceRoleKey)
  }

  /**
   * Run automated rotation check
   */
  async runRotationCheck(): Promise<{
    secretsRotated: string[]
    keysRotated: string[]
    errors: string[]
  }> {
    const result = {
      secretsRotated: [] as string[],
      keysRotated: [] as string[],
      errors: [] as string[]
    }

    try {
      // Check secrets needing rotation
      const secretsToRotate = await this.secretManager.getSecretsNeedingRotation()
      
      for (const secretName of secretsToRotate) {
        try {
          const newValue = this.secretManager.generateSecureSecret()
          const rotated = await this.secretManager.rotateSecret(secretName, newValue)
          
          if (rotated) {
            result.secretsRotated.push(secretName)
          } else {
            result.errors.push(`Failed to rotate secret: ${secretName}`)
          }
        } catch (error) {
          result.errors.push(`Error rotating secret ${secretName}: ${error.message}`)
        }
      }

      // Check API keys needing rotation
      const keysToRotate = await this.apiKeyManager.getKeysNeedingRotation()
      
      for (const keyInfo of keysToRotate) {
        try {
          const rotationResult = await this.apiKeyManager.rotateAPIKey(keyInfo.key_hash)
          
          if (rotationResult.success) {
            result.keysRotated.push(keyInfo.name)
          } else {
            result.errors.push(`Failed to rotate API key ${keyInfo.name}: ${rotationResult.error}`)
          }
        } catch (error) {
          result.errors.push(`Error rotating API key ${keyInfo.name}: ${error.message}`)
        }
      }

    } catch (error) {
      result.errors.push(`Rotation check error: ${error.message}`)
    }

    return result
  }
}

// Export singleton instances
export const secretManager = new SecretManager(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

export const apiKeyManager = new APIKeyManager(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

export const rotationScheduler = new RotationScheduler(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)