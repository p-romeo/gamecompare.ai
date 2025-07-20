#!/usr/bin/env node

/**
 * Security Validation Script
 * Validates all production security measures are properly implemented
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface SecurityCheck {
  name: string
  description: string
  status: 'pass' | 'fail' | 'warning'
  details?: string
}

class SecurityValidator {
  private checks: SecurityCheck[] = []

  async validateAll(): Promise<void> {
    console.log('🔒 GameCompare.ai Security Validation')
    console.log('=====================================\n')

    await this.checkSecurityFiles()
    await this.checkDatabaseMigrations()
    await this.checkEnvironmentVariables()
    await this.checkSecurityHeaders()
    await this.checkInputValidation()
    await this.checkRateLimiting()
    await this.checkAPIKeySecurity()
    await this.checkSecretManagement()
    await this.checkAuditLogging()
    await this.checkComplianceFeatures()
    await this.runSecurityTests()

    this.printResults()
  }

  private async checkSecurityFiles(): Promise<void> {
    const requiredFiles = [
      'supabase/functions/utils/security.ts',
      'supabase/functions/utils/secret_management.ts',
      'supabase/functions/utils/audit_logging.ts',
      'supabase/functions/utils/security_config.ts',
      'supabase/functions/utils/security_dashboard.ts',
      'supabase/functions/security_management.ts',
      'supabase/functions/security_scheduler.ts'
    ]

    for (const file of requiredFiles) {
      if (existsSync(file)) {
        this.addCheck({
          name: `Security File: ${file}`,
          description: 'Required security file exists',
          status: 'pass'
        })
      } else {
        this.addCheck({
          name: `Security File: ${file}`,
          description: 'Required security file missing',
          status: 'fail'
        })
      }
    }
  }

  private async checkDatabaseMigrations(): Promise<void> {
    const migrationFiles = [
      'supabase/migrations/20250120_enhanced_security.sql',
      'supabase/migrations/20250120_vault_functions.sql'
    ]

    for (const file of migrationFiles) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8')
        
        // Check for required security functions
        const requiredFunctions = [
          'block_ip_address',
          'unblock_ip_address',
          'detect_brute_force_attacks',
          'get_security_dashboard_metrics'
        ]

        const missingFunctions = requiredFunctions.filter(func => 
          !content.includes(func)
        )

        if (missingFunctions.length === 0) {
          this.addCheck({
            name: `Migration: ${file}`,
            description: 'All required security functions present',
            status: 'pass'
          })
        } else {
          this.addCheck({
            name: `Migration: ${file}`,
            description: `Missing functions: ${missingFunctions.join(', ')}`,
            status: 'fail'
          })
        }
      } else {
        this.addCheck({
          name: `Migration: ${file}`,
          description: 'Required migration file missing',
          status: 'fail'
        })
      }
    }
  }

  private async checkEnvironmentVariables(): Promise<void> {
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'PINECONE_API_KEY'
    ]

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        this.addCheck({
          name: `Environment Variable: ${envVar}`,
          description: 'Required environment variable is set',
          status: 'pass'
        })
      } else {
        this.addCheck({
          name: `Environment Variable: ${envVar}`,
          description: 'Required environment variable missing',
          status: 'fail'
        })
      }
    }
  }

  private async checkSecurityHeaders(): Promise<void> {
    try {
      const securityFile = readFileSync('supabase/functions/utils/security.ts', 'utf-8')
      
      const requiredHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'Referrer-Policy'
      ]

      const missingHeaders = requiredHeaders.filter(header => 
        !securityFile.includes(header)
      )

      if (missingHeaders.length === 0) {
        this.addCheck({
          name: 'Security Headers',
          description: 'All required security headers implemented',
          status: 'pass'
        })
      } else {
        this.addCheck({
          name: 'Security Headers',
          description: `Missing headers: ${missingHeaders.join(', ')}`,
          status: 'fail'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'Security Headers',
        description: 'Could not validate security headers',
        status: 'fail'
      })
    }
  }

  private async checkInputValidation(): Promise<void> {
    try {
      const securityFile = readFileSync('supabase/functions/utils/security.ts', 'utf-8')
      
      const validationFeatures = [
        'SQL injection',
        'XSS',
        'content-type',
        'request size',
        'malicious patterns'
      ]

      const implementedFeatures = validationFeatures.filter(feature => {
        const searchTerms: Record<string, string[]> = {
          'SQL injection': ['SQL', 'injection', 'SELECT', 'INSERT'],
          'XSS': ['XSS', 'script', 'javascript:', 'onerror'],
          'content-type': ['content-type', 'allowedContentTypes'],
          'request size': ['maxRequestSize', 'content-length'],
          'malicious patterns': ['maliciousPatterns', 'pattern.test']
        }

        return searchTerms[feature]?.some((term: string) => 
          securityFile.toLowerCase().includes(term.toLowerCase())
        ) || false
      })

      if (implementedFeatures.length === validationFeatures.length) {
        this.addCheck({
          name: 'Input Validation',
          description: 'All input validation features implemented',
          status: 'pass'
        })
      } else {
        const missing = validationFeatures.filter(f => !implementedFeatures.includes(f))
        this.addCheck({
          name: 'Input Validation',
          description: `Missing features: ${missing.join(', ')}`,
          status: 'warning'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'Input Validation',
        description: 'Could not validate input validation features',
        status: 'fail'
      })
    }
  }

  private async checkRateLimiting(): Promise<void> {
    try {
      const securityFile = readFileSync('supabase/functions/utils/security.ts', 'utf-8')
      
      const rateLimitingFeatures = [
        'rate limiting',
        'DDoS protection',
        'IP blocking',
        'progressive blocking'
      ]

      const implementedFeatures = rateLimitingFeatures.filter(feature => {
        const searchTerms: Record<string, string[]> = {
          'rate limiting': ['rateLimiting', 'maxRequests', 'windowMs'],
          'DDoS protection': ['ddosProtection', 'threshold', 'blockDuration'],
          'IP blocking': ['blockIP', 'blockedIPs', 'blocked_ips'],
          'progressive blocking': ['progressive', 'repeat offender', 'escalat']
        }

        return searchTerms[feature]?.some((term: string) => 
          securityFile.toLowerCase().includes(term.toLowerCase())
        ) || false
      })

      if (implementedFeatures.length >= 3) {
        this.addCheck({
          name: 'Rate Limiting & DDoS Protection',
          description: `${implementedFeatures.length}/4 features implemented`,
          status: 'pass'
        })
      } else {
        this.addCheck({
          name: 'Rate Limiting & DDoS Protection',
          description: `Only ${implementedFeatures.length}/4 features implemented`,
          status: 'warning'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'Rate Limiting & DDoS Protection',
        description: 'Could not validate rate limiting features',
        status: 'fail'
      })
    }
  }

  private async checkAPIKeySecurity(): Promise<void> {
    try {
      const secretMgmtFile = readFileSync('supabase/functions/utils/secret_management.ts', 'utf-8')
      
      const apiKeyFeatures = [
        'key generation',
        'key validation',
        'key rotation',
        'key revocation',
        'SHA-256 hashing'
      ]

      const implementedFeatures = apiKeyFeatures.filter(feature => {
        const searchTerms: Record<string, string[]> = {
          'key generation': ['generateAPIKey', 'generateAPIKeyString'],
          'key validation': ['validateAPIKey', 'valid'],
          'key rotation': ['rotateAPIKey', 'rotation'],
          'key revocation': ['revokeAPIKey', 'revoked'],
          'SHA-256 hashing': ['SHA-256', 'hashAPIKey', 'crypto.subtle.digest']
        }

        return searchTerms[feature]?.some((term: string) => 
          secretMgmtFile.includes(term)
        ) || false
      })

      if (implementedFeatures.length === apiKeyFeatures.length) {
        this.addCheck({
          name: 'API Key Security',
          description: 'All API key security features implemented',
          status: 'pass'
        })
      } else {
        const missing = apiKeyFeatures.filter(f => !implementedFeatures.includes(f))
        this.addCheck({
          name: 'API Key Security',
          description: `Missing features: ${missing.join(', ')}`,
          status: 'warning'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'API Key Security',
        description: 'Could not validate API key security features',
        status: 'fail'
      })
    }
  }

  private async checkSecretManagement(): Promise<void> {
    try {
      const secretMgmtFile = readFileSync('supabase/functions/utils/secret_management.ts', 'utf-8')
      
      const secretFeatures = [
        'secret storage',
        'secret rotation',
        'secure generation',
        'Supabase Vault integration'
      ]

      const implementedFeatures = secretFeatures.filter(feature => {
        const searchTerms: Record<string, string[]> = {
          'secret storage': ['storeSecret', 'vault_store_secret'],
          'secret rotation': ['rotateSecret', 'rotation'],
          'secure generation': ['generateSecureSecret', 'crypto.getRandomValues'],
          'Supabase Vault integration': ['vault_store_secret', 'vault_get_secret']
        }

        return searchTerms[feature]?.some((term: string) => 
          secretMgmtFile.includes(term)
        ) || false
      })

      if (implementedFeatures.length === secretFeatures.length) {
        this.addCheck({
          name: 'Secret Management',
          description: 'All secret management features implemented',
          status: 'pass'
        })
      } else {
        const missing = secretFeatures.filter(f => !implementedFeatures.includes(f))
        this.addCheck({
          name: 'Secret Management',
          description: `Missing features: ${missing.join(', ')}`,
          status: 'warning'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'Secret Management',
        description: 'Could not validate secret management features',
        status: 'fail'
      })
    }
  }

  private async checkAuditLogging(): Promise<void> {
    try {
      const auditFile = readFileSync('supabase/functions/utils/audit_logging.ts', 'utf-8')
      
      const auditFeatures = [
        'comprehensive logging',
        'sensitive data redaction',
        'compliance reporting',
        'security metrics'
      ]

      const implementedFeatures = auditFeatures.filter(feature => {
        const searchTerms: Record<string, string[]> = {
          'comprehensive logging': ['logAuditEntry', 'audit_logs'],
          'sensitive data redaction': ['sanitize', 'REDACTED', 'sensitiveFields'],
          'compliance reporting': ['ComplianceReport', 'GDPR', 'generateComplianceReport'],
          'security metrics': ['SecurityMetrics', 'getSecurityMetrics']
        }

        return searchTerms[feature]?.some((term: string) => 
          auditFile.includes(term)
        ) || false
      })

      if (implementedFeatures.length === auditFeatures.length) {
        this.addCheck({
          name: 'Audit Logging',
          description: 'All audit logging features implemented',
          status: 'pass'
        })
      } else {
        const missing = auditFeatures.filter(f => !implementedFeatures.includes(f))
        this.addCheck({
          name: 'Audit Logging',
          description: `Missing features: ${missing.join(', ')}`,
          status: 'warning'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'Audit Logging',
        description: 'Could not validate audit logging features',
        status: 'fail'
      })
    }
  }

  private async checkComplianceFeatures(): Promise<void> {
    try {
      const auditFile = readFileSync('supabase/functions/utils/audit_logging.ts', 'utf-8')
      
      const complianceStandards = ['GDPR', 'SOC2', 'PCI_DSS']
      const implementedStandards = complianceStandards.filter(standard => 
        auditFile.includes(standard)
      )

      if (implementedStandards.length >= 2) {
        this.addCheck({
          name: 'Compliance Standards',
          description: `${implementedStandards.length}/3 standards supported: ${implementedStandards.join(', ')}`,
          status: 'pass'
        })
      } else {
        this.addCheck({
          name: 'Compliance Standards',
          description: `Only ${implementedStandards.length}/3 standards supported`,
          status: 'warning'
        })
      }
    } catch (error) {
      this.addCheck({
        name: 'Compliance Standards',
        description: 'Could not validate compliance features',
        status: 'fail'
      })
    }
  }

  private async runSecurityTests(): Promise<void> {
    try {
      // Run security tests
      execSync('npx jest --testPathPatterns=security --silent', { stdio: 'pipe' })
      
      this.addCheck({
        name: 'Security Test Suite',
        description: 'All security tests passing',
        status: 'pass'
      })
    } catch (error) {
      this.addCheck({
        name: 'Security Test Suite',
        description: 'Some security tests failing',
        status: 'fail',
        details: String(error)
      })
    }
  }

  private addCheck(check: SecurityCheck): void {
    this.checks.push(check)
  }

  private printResults(): void {
    const passed = this.checks.filter(c => c.status === 'pass').length
    const warnings = this.checks.filter(c => c.status === 'warning').length
    const failed = this.checks.filter(c => c.status === 'fail').length
    const total = this.checks.length

    console.log('\n📊 Security Validation Results')
    console.log('==============================\n')

    // Print individual checks
    this.checks.forEach(check => {
      const icon = {
        'pass': '✅',
        'warning': '⚠️',
        'fail': '❌'
      }[check.status]

      console.log(`${icon} ${check.name}`)
      console.log(`   ${check.description}`)
      if (check.details) {
        console.log(`   Details: ${check.details}`)
      }
      console.log()
    })

    // Print summary
    console.log('📈 Summary')
    console.log('==========')
    console.log(`Total Checks: ${total}`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`⚠️  Warnings: ${warnings}`)
    console.log(`❌ Failed: ${failed}`)
    console.log()

    const successRate = Math.round((passed / total) * 100)
    console.log(`🎯 Success Rate: ${successRate}%`)

    if (successRate >= 90) {
      console.log('🎉 Excellent! Your security implementation is production-ready.')
    } else if (successRate >= 80) {
      console.log('👍 Good security implementation. Address warnings for optimal security.')
    } else if (successRate >= 70) {
      console.log('⚠️  Adequate security. Please address failed checks before production.')
    } else {
      console.log('🚨 Security implementation needs significant improvement before production.')
    }

    // Exit with appropriate code
    if (failed > 0) {
      process.exit(1)
    } else if (warnings > 0) {
      process.exit(0) // Warnings are acceptable
    } else {
      process.exit(0)
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SecurityValidator()
  validator.validateAll().catch(error => {
    console.error('Security validation failed:', error)
    process.exit(1)
  })
}

module.exports = { SecurityValidator }