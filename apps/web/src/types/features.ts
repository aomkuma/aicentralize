// Feature flag and billing types for modularity and future extensibility

/**
 * Billing plan tiers
 */
export type BillingPlan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'

/**
 * Feature entitlements by plan
 */
export const FEATURE_ENTITLEMENTS: Record<BillingPlan, Set<string>> = {
  FREE: new Set([
    'AI_CHAT_BASIC',
    'CONTINUITY_SUMMARY',
  ]),
  STARTER: new Set([
    'AI_CHAT_BASIC',
    'AI_CHAT_ADVANCED',
    'CONTINUITY_SUMMARY',
    'CONTINUITY_FULL',
    'REMINDERS_BASIC',
  ]),
  PRO: new Set([
    'AI_CHAT_BASIC',
    'AI_CHAT_ADVANCED',
    'AI_TRACE_PANEL',
    'CONTINUITY_SUMMARY',
    'CONTINUITY_FULL',
    'REMINDERS_BASIC',
    'REMINDERS_ESCALATION',
    'OBSERVABILITY_BASIC',
  ]),
  ENTERPRISE: new Set([
    'AI_CHAT_BASIC',
    'AI_CHAT_ADVANCED',
    'AI_TRACE_PANEL',
    'CONTINUITY_SUMMARY',
    'CONTINUITY_FULL',
    'REMINDERS_BASIC',
    'REMINDERS_ESCALATION',
    'OBSERVABILITY_FULL',
    'CUSTOM_WORKFLOWS',
  ]),
}

/**
 * Feature flags with descriptions
 */
export const FEATURES = {
  // AI Chat
  AI_CHAT_BASIC: {
    id: 'AI_CHAT_BASIC',
    name: 'Basic AI Chat',
    description: 'Generate text prompts from meetings',
    category: 'ai',
    plan: 'FREE',
  },
  AI_CHAT_ADVANCED: {
    id: 'AI_CHAT_ADVANCED',
    name: 'Advanced AI Chat',
    description: 'Audio recording, speaker grouping, diarization',
    category: 'ai',
    plan: 'STARTER',
  },
  AI_TRACE_PANEL: {
    id: 'AI_TRACE_PANEL',
    name: 'AI Trace Panel',
    description: 'View citations, evidence, and retrieval debugging',
    category: 'ai',
    plan: 'PRO',
  },

  // Continuity Dashboard
  CONTINUITY_SUMMARY: {
    id: 'CONTINUITY_SUMMARY',
    name: 'Continuity Summary',
    description: 'Basic project continuity metrics',
    category: 'continuity',
    plan: 'FREE',
  },
  CONTINUITY_FULL: {
    id: 'CONTINUITY_FULL',
    name: 'Full Continuity Dashboard',
    description: 'Complete overdue tracking, audit, and memory snapshots',
    category: 'continuity',
    plan: 'STARTER',
  },

  // Reminders
  REMINDERS_BASIC: {
    id: 'REMINDERS_BASIC',
    name: 'Basic Reminders',
    description: 'Standard reminder notifications',
    category: 'reminders',
    plan: 'STARTER',
  },
  REMINDERS_ESCALATION: {
    id: 'REMINDERS_ESCALATION',
    name: 'Reminder Escalation',
    description: 'Escalation rules, digests, and digest inspection',
    category: 'reminders',
    plan: 'PRO',
  },

  // Observability
  OBSERVABILITY_BASIC: {
    id: 'OBSERVABILITY_BASIC',
    name: 'Basic Observability',
    description: 'View basic AI run logs',
    category: 'observability',
    plan: 'PRO',
  },
  OBSERVABILITY_FULL: {
    id: 'OBSERVABILITY_FULL',
    name: 'Full Observability',
    description: 'Advanced metrics, tracing, and diagnostics',
    category: 'observability',
    plan: 'ENTERPRISE',
  },

  // Custom
  CUSTOM_WORKFLOWS: {
    id: 'CUSTOM_WORKFLOWS',
    name: 'Custom Workflows',
    description: 'Create and manage custom automation workflows',
    category: 'workflows',
    plan: 'ENTERPRISE',
  },
} as const

export type FeatureKey = keyof typeof FEATURES

/**
 * Feature state interface
 */
export interface FeatureState {
  plan: BillingPlan
  enabledFeatures: Set<FeatureKey>
  isFeatureEnabled: (feature: FeatureKey) => boolean
  canAccessFeature: (feature: FeatureKey) => boolean
}
