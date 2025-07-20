/**
 * Automated incident response system for GameCompare.ai
 * Handles incident detection, escalation, and automated remediation
 */

interface IncidentConfig {
  name: string
  description: string
  triggers: IncidentTrigger[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  autoRemediation?: AutoRemediationAction[]
  escalation: EscalationRule[]
  notifications: NotificationRule[]
}

interface IncidentTrigger {
  type: 'alert' | 'metric_threshold' | 'error_rate' | 'custom'
  condition: any
  duration?: number // seconds
}

interface AutoRemediationAction {
  type: 'restart_service' | 'scale_up' | 'clear_cache' | 'failover' | 'custom'
  config: any
  maxAttempts: number
  cooldown: number // seconds
}

interface EscalationRule {
  level: number
  delay: number // seconds
  assignees: string[]
  actions: string[]
}

interface NotificationRule {
  channels: string[]
  template: string
  immediate: boolean
}

interface Incident {
  id: string
  title: string
  description: string
  severity: string
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  assignedTo?: string
  affectedServices: string[]
  rootCause?: string
  resolution?: string
  startedAt: string
  resolvedAt?: string
  closedAt?: string
  timeline: IncidentTimelineEntry[]
  metrics: IncidentMetrics
}

interface IncidentTimelineEntry {
  timestamp: string
  type: 'created' | 'escalated' | 'assigned' | 'updated' | 'resolved' | 'closed'
  description: string
  actor: string
  metadata?: any
}

interface IncidentMetrics {
  detectionTime: number // seconds from occurrence to detection
  responseTime: number // seconds from detection to first response
  resolutionTime?: number // seconds from detection to resolution
  mttr: number // mean time to recovery
  affectedUsers?: number
  businessImpact?: number
}

/**
 * Incident response automation system
 */
export class IncidentResponseSystem {
  private supabase: any
  private activeIncidents: Map<string, Incident> = new Map()
  private remediationAttempts: Map<string, number> = new Map()

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    const { createClient } = require('https://esm.sh/@supabase/supabase-js@2')
    this.supabase = createClient(supabaseUrl, serviceRoleKey)
  }

  /**
   * Default incident configurations
   */
  private getIncidentConfigs(): IncidentConfig[] {
    return [
      {
        name: 'api_outage',
        description: 'API service is experiencing high error rates or downtime',
        triggers: [
          {
            type: 'alert',
            condition: { alertName: 'high_error_rate' },
            duration: 300 // 5 minutes
          },
          {
            type: 'metric_threshold',
            condition: { metric: 'api_availability', operator: 'lt', threshold: 95 },
            duration: 180 // 3 minutes
          }
        ],
        severity: 'critical',
        autoRemediation: [
          {
            type: 'restart_service',
            config: { service: 'api_router' },
            maxAttempts: 2,
            cooldown: 300
          },
          {
            type: 'clear_cache',
            config: { cacheType: 'all' },
            maxAttempts: 1,
            cooldown: 600
          }
        ],
        escalation: [
          {
            level: 1,
            delay: 0,
            assignees: ['oncall-engineer'],
            actions: ['notify', 'auto_remediate']
          },
          {
            level: 2,
            delay: 900, // 15 minutes
            assignees: ['engineering-lead', 'ops-manager'],
            actions: ['notify', 'create_war_room']
          },
          {
            level: 3,
            delay: 1800, // 30 minutes
            assignees: ['cto', 'ceo'],
            actions: ['notify', 'external_communication']
          }
        ],
        notifications: [
          {
            channels: ['slack', 'pagerduty'],
            template: 'critical_incident',
            immediate: true
          }
        ]
      },
      {
        name: 'database_performance',
        description: 'Database is experiencing performance issues',
        triggers: [
          {
            type: 'alert',
            condition: { alertName: 'slow_response_time' },
            duration: 600 // 10 minutes
          },
          {
            type: 'metric_threshold',
            condition: { metric: 'db_connection_pool_usage', operator: 'gt', threshold: 90 },
            duration: 300
          }
        ],
        severity: 'high',
        autoRemediation: [
          {
            type: 'scale_up',
            config: { resource: 'database', factor: 1.5 },
            maxAttempts: 1,
            cooldown: 1800
          }
        ],
        escalation: [
          {
            level: 1,
            delay: 0,
            assignees: ['database-admin'],
            actions: ['notify', 'investigate']
          },
          {
            level: 2,
            delay: 1200, // 20 minutes
            assignees: ['engineering-lead'],
            actions: ['notify', 'escalate']
          }
        ],
        notifications: [
          {
            channels: ['slack'],
            template: 'performance_incident',
            immediate: false
          }
        ]
      },
      {
        name: 'security_incident',
        description: 'Security threat or breach detected',
        triggers: [
          {
            type: 'custom',
            condition: { type: 'security_alert' },
            duration: 0 // Immediate
          }
        ],
        severity: 'critical',
        autoRemediation: [
          {
            type: 'custom',
            config: { action: 'enable_security_lockdown' },
            maxAttempts: 1,
            cooldown: 0
          }
        ],
        escalation: [
          {
            level: 1,
            delay: 0,
            assignees: ['security-team', 'oncall-engineer'],
            actions: ['notify', 'security_lockdown']
          },
          {
            level: 2,
            delay: 300, // 5 minutes
            assignees: ['ciso', 'engineering-lead'],
            actions: ['notify', 'legal_notification']
          }
        ],
        notifications: [
          {
            channels: ['slack', 'email', 'sms'],
            template: 'security_incident',
            immediate: true
          }
        ]
      }
    ]
  }

  /**
   * Process incoming alerts and trigger incidents
   */
  async processAlert(alertName: string, alertData: any): Promise<void> {
    const configs = this.getIncidentConfigs()
    
    for (const config of configs) {
      const shouldTrigger = this.shouldTriggerIncident(config, alertName, alertData)
      
      if (shouldTrigger) {
        await this.createIncident(config, alertData)
      }
    }
  }

  /**
   * Check if alert should trigger an incident
   */
  private shouldTriggerIncident(
    config: IncidentConfig, 
    alertName: string, 
    alertData: any
  ): boolean {
    return config.triggers.some(trigger => {
      switch (trigger.type) {
        case 'alert':
          return trigger.condition.alertName === alertName
        
        case 'metric_threshold':
          return this.evaluateMetricThreshold(trigger.condition, alertData)
        
        case 'error_rate':
          return this.evaluateErrorRate(trigger.condition, alertData)
        
        case 'custom':
          return this.evaluateCustomTrigger(trigger.condition, alertData)
        
        default:
          return false
      }
    })
  }

  /**
   * Create a new incident
   */
  private async createIncident(config: IncidentConfig, triggerData: any): Promise<Incident> {
    const incidentId = crypto.randomUUID()
    const now = new Date().toISOString()
    
    const incident: Incident = {
      id: incidentId,
      title: `${config.name}: ${config.description}`,
      description: this.generateIncidentDescription(config, triggerData),
      severity: config.severity,
      status: 'open',
      affectedServices: this.identifyAffectedServices(config, triggerData),
      startedAt: now,
      timeline: [{
        timestamp: now,
        type: 'created',
        description: 'Incident automatically created from alert',
        actor: 'system',
        metadata: { trigger: triggerData }
      }],
      metrics: {
        detectionTime: 0, // Immediate for automated detection
        responseTime: 0, // Will be updated when first response occurs
        mttr: 0,
        affectedUsers: this.estimateAffectedUsers(config, triggerData),
        businessImpact: this.estimateBusinessImpact(config, triggerData)
      }
    }
    
    this.activeIncidents.set(incidentId, incident)
    
    // Store in database
    await this.storeIncident(incident)
    
    // Start incident response workflow
    await this.startIncidentResponse(incident, config)
    
    console.log(`Incident created: ${incident.title} (${incident.id})`)
    return incident
  }

  /**
   * Start incident response workflow
   */
  private async startIncidentResponse(incident: Incident, config: IncidentConfig): Promise<void> {
    // Send immediate notifications
    await this.sendIncidentNotifications(incident, config.notifications)
    
    // Start auto-remediation if configured
    if (config.autoRemediation && config.autoRemediation.length > 0) {
      await this.startAutoRemediation(incident, config.autoRemediation)
    }
    
    // Start escalation timer
    this.startEscalationTimer(incident, config.escalation)
    
    // Update incident timeline
    await this.addTimelineEntry(incident, {
      type: 'updated',
      description: 'Incident response workflow started',
      actor: 'system'
    })
  }

  /**
   * Start auto-remediation actions
   */
  private async startAutoRemediation(
    incident: Incident, 
    actions: AutoRemediationAction[]
  ): Promise<void> {
    for (const action of actions) {
      const attemptKey = `${incident.id}_${action.type}`
      const attempts = this.remediationAttempts.get(attemptKey) || 0
      
      if (attempts >= action.maxAttempts) {
        console.log(`Max remediation attempts reached for ${action.type}`)
        continue
      }
      
      try {
        await this.executeRemediationAction(incident, action)
        this.remediationAttempts.set(attemptKey, attempts + 1)
        
        await this.addTimelineEntry(incident, {
          type: 'updated',
          description: `Auto-remediation action executed: ${action.type}`,
          actor: 'system',
          metadata: { action: action.type, attempt: attempts + 1 }
        })
        
        // Wait for cooldown before next action
        if (action.cooldown > 0) {
          setTimeout(() => {
            // Could trigger re-evaluation here
          }, action.cooldown * 1000)
        }
        
      } catch (error) {
        console.error(`Auto-remediation failed for ${action.type}:`, error)
        
        await this.addTimelineEntry(incident, {
          type: 'updated',
          description: `Auto-remediation failed: ${action.type} - ${error.message}`,
          actor: 'system',
          metadata: { action: action.type, error: error.message }
        })
      }
    }
  }

  /**
   * Execute a specific remediation action
   */
  private async executeRemediationAction(
    incident: Incident, 
    action: AutoRemediationAction
  ): Promise<void> {
    switch (action.type) {
      case 'restart_service':
        await this.restartService(action.config.service)
        break
      
      case 'scale_up':
        await this.scaleUpResource(action.config.resource, action.config.factor)
        break
      
      case 'clear_cache':
        await this.clearCache(action.config.cacheType)
        break
      
      case 'failover':
        await this.performFailover(action.config.target)
        break
      
      case 'custom':
        await this.executeCustomAction(action.config)
        break
      
      default:
        throw new Error(`Unknown remediation action: ${action.type}`)
    }
  }

  /**
   * Restart a service (placeholder implementation)
   */
  private async restartService(serviceName: string): Promise<void> {
    console.log(`Restarting service: ${serviceName}`)
    // In a real implementation, this would call the appropriate service management API
    // For example, Kubernetes API, Docker API, or cloud provider APIs
  }

  /**
   * Scale up a resource (placeholder implementation)
   */
  private async scaleUpResource(resource: string, factor: number): Promise<void> {
    console.log(`Scaling up ${resource} by factor ${factor}`)
    // Implementation would depend on the infrastructure
  }

  /**
   * Clear cache (placeholder implementation)
   */
  private async clearCache(cacheType: string): Promise<void> {
    console.log(`Clearing cache: ${cacheType}`)
    // Would integrate with the cache manager
  }

  /**
   * Perform failover (placeholder implementation)
   */
  private async performFailover(target: string): Promise<void> {
    console.log(`Performing failover to: ${target}`)
    // Implementation would depend on the architecture
  }

  /**
   * Execute custom action (placeholder implementation)
   */
  private async executeCustomAction(config: any): Promise<void> {
    console.log(`Executing custom action:`, config)
    // Custom actions would be implemented based on specific needs
  }

  /**
   * Start escalation timer
   */
  private startEscalationTimer(incident: Incident, escalationRules: EscalationRule[]): void {
    escalationRules.forEach((rule, index) => {
      setTimeout(async () => {
        if (this.activeIncidents.has(incident.id) && 
            this.activeIncidents.get(incident.id)?.status === 'open') {
          await this.escalateIncident(incident, rule)
        }
      }, rule.delay * 1000)
    })
  }

  /**
   * Escalate incident to next level
   */
  private async escalateIncident(incident: Incident, rule: EscalationRule): Promise<void> {
    await this.addTimelineEntry(incident, {
      type: 'escalated',
      description: `Incident escalated to level ${rule.level}`,
      actor: 'system',
      metadata: { level: rule.level, assignees: rule.assignees }
    })
    
    // Assign to escalation team
    if (rule.assignees.length > 0) {
      incident.assignedTo = rule.assignees[0] // Assign to first person
    }
    
    // Execute escalation actions
    for (const action of rule.actions) {
      await this.executeEscalationAction(incident, action)
    }
    
    await this.updateIncident(incident)
  }

  /**
   * Execute escalation action
   */
  private async executeEscalationAction(incident: Incident, action: string): Promise<void> {
    switch (action) {
      case 'notify':
        // Additional notifications for escalation
        break
      
      case 'auto_remediate':
        // Trigger additional auto-remediation
        break
      
      case 'create_war_room':
        console.log(`Creating war room for incident ${incident.id}`)
        break
      
      case 'external_communication':
        console.log(`Initiating external communication for incident ${incident.id}`)
        break
      
      default:
        console.log(`Unknown escalation action: ${action}`)
    }
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(
    incidentId: string, 
    resolution: string, 
    rootCause?: string
  ): Promise<void> {
    const incident = this.activeIncidents.get(incidentId)
    if (!incident) return
    
    const now = new Date().toISOString()
    incident.status = 'resolved'
    incident.resolvedAt = now
    incident.resolution = resolution
    incident.rootCause = rootCause
    
    // Calculate resolution time
    const startTime = new Date(incident.startedAt).getTime()
    const resolveTime = new Date(now).getTime()
    incident.metrics.resolutionTime = (resolveTime - startTime) / 1000
    
    await this.addTimelineEntry(incident, {
      type: 'resolved',
      description: `Incident resolved: ${resolution}`,
      actor: 'system',
      metadata: { resolution, rootCause }
    })
    
    await this.updateIncident(incident)
    
    // Send resolution notifications
    await this.sendResolutionNotifications(incident)
    
    console.log(`Incident resolved: ${incident.title} (${incident.id})`)
  }

  /**
   * Helper methods for evaluation and data processing
   */
  private evaluateMetricThreshold(condition: any, data: any): boolean {
    // Implementation would evaluate metric against threshold
    return false
  }

  private evaluateErrorRate(condition: any, data: any): boolean {
    // Implementation would evaluate error rate
    return false
  }

  private evaluateCustomTrigger(condition: any, data: any): boolean {
    // Implementation would evaluate custom conditions
    return false
  }

  private generateIncidentDescription(config: IncidentConfig, data: any): string {
    return `${config.description}\n\nTrigger data: ${JSON.stringify(data, null, 2)}`
  }

  private identifyAffectedServices(config: IncidentConfig, data: any): string[] {
    // Logic to identify affected services based on incident type
    return ['api_router', 'database']
  }

  private estimateAffectedUsers(config: IncidentConfig, data: any): number {
    // Logic to estimate number of affected users
    return 0
  }

  private estimateBusinessImpact(config: IncidentConfig, data: any): number {
    // Logic to estimate business impact (e.g., revenue loss)
    return 0
  }

  private async sendIncidentNotifications(
    incident: Incident, 
    rules: NotificationRule[]
  ): Promise<void> {
    // Implementation would send notifications through configured channels
    console.log(`Sending incident notifications for ${incident.id}`)
  }

  private async sendResolutionNotifications(incident: Incident): Promise<void> {
    // Implementation would send resolution notifications
    console.log(`Sending resolution notifications for ${incident.id}`)
  }

  private async addTimelineEntry(
    incident: Incident, 
    entry: Omit<IncidentTimelineEntry, 'timestamp'>
  ): Promise<void> {
    const timelineEntry: IncidentTimelineEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    }
    
    incident.timeline.push(timelineEntry)
    await this.updateIncident(incident)
  }

  private async storeIncident(incident: Incident): Promise<void> {
    try {
      await this.supabase
        .from('incidents')
        .insert({
          id: incident.id,
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          status: incident.status,
          assigned_to: incident.assignedTo,
          affected_services: incident.affectedServices,
          root_cause: incident.rootCause,
          resolution: incident.resolution,
          started_at: incident.startedAt,
          resolved_at: incident.resolvedAt,
          closed_at: incident.closedAt
        })
    } catch (error) {
      console.error('Failed to store incident:', error)
    }
  }

  private async updateIncident(incident: Incident): Promise<void> {
    try {
      await this.supabase
        .from('incidents')
        .update({
          title: incident.title,
          description: incident.description,
          status: incident.status,
          assigned_to: incident.assignedTo,
          root_cause: incident.rootCause,
          resolution: incident.resolution,
          resolved_at: incident.resolvedAt,
          closed_at: incident.closedAt
        })
        .eq('id', incident.id)
    } catch (error) {
      console.error('Failed to update incident:', error)
    }
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): Incident[] {
    return Array.from(this.activeIncidents.values())
  }

  /**
   * Get incident by ID
   */
  getIncident(incidentId: string): Incident | undefined {
    return this.activeIncidents.get(incidentId)
  }
}

// Global incident response system
export const incidentResponse = new IncidentResponseSystem(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)