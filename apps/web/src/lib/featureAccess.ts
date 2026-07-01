import type { FeatureKey } from '../types/features'

/** Nav item id → required package feature (null = always visible for tenant users). */
export const NAV_FEATURE_REQUIREMENTS: Partial<Record<string, FeatureKey>> = {
  dashboard: 'AI_CHAT_BASIC',
  meetings: 'AI_CHAT_ADVANCED',
  'meeting-history': 'AI_CHAT_ADVANCED',
  'ai-trace': 'AI_TRACE_PANEL',
  reminders: 'REMINDERS_BASIC',
}

/** Route path prefix → required feature for FeatureRoute guards. */
export const ROUTE_FEATURE_REQUIREMENTS: Array<{ prefix: string; feature: FeatureKey }> = [
  { prefix: '/dashboard', feature: 'AI_CHAT_BASIC' },
  { prefix: '/meetings', feature: 'AI_CHAT_ADVANCED' },
  { prefix: '/ai-trace', feature: 'AI_TRACE_PANEL' },
  { prefix: '/reminders', feature: 'REMINDERS_BASIC' },
  { prefix: '/continuity', feature: 'CONTINUITY_SUMMARY' },
]

export function canAccessObservabilityBasic(canAccessFeature: (feature: FeatureKey) => boolean): boolean {
  return canAccessFeature('OBSERVABILITY_BASIC') || canAccessFeature('OBSERVABILITY_FULL')
}

export function canAccessObservabilityFull(canAccessFeature: (feature: FeatureKey) => boolean): boolean {
  return canAccessFeature('OBSERVABILITY_FULL')
}

export function isNavItemAccessible(
  navId: string,
  canAccessFeature: (feature: FeatureKey) => boolean,
): boolean {
  const required = NAV_FEATURE_REQUIREMENTS[navId]
  if (!required) {
    return true
  }
  return canAccessFeature(required)
}
