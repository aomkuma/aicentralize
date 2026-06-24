import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BillingPlan, FeatureKey } from '../types/features'
import { FEATURE_ENTITLEMENTS } from '../types/features'

interface FeatureFlagState {
  plan: BillingPlan
  // enabledFeatures is always derived from plan at runtime — not stored
  setPlan: (plan: BillingPlan) => void
  isFeatureEnabled: (feature: FeatureKey) => boolean
  canAccessFeature: (feature: FeatureKey) => boolean
  getEnabledFeatures: () => FeatureKey[]
  reset: () => void
}

function featuresForPlan(plan: BillingPlan): Set<string> {
  return FEATURE_ENTITLEMENTS[plan] ?? new Set()
}

export const useFeatureFlagStore = create<FeatureFlagState>()(
  persist(
    (set, get) => ({
      plan: 'FREE',

      setPlan: (plan: BillingPlan) => set({ plan }),

      isFeatureEnabled: (feature: FeatureKey) =>
        featuresForPlan(get().plan).has(feature),

      canAccessFeature: (feature: FeatureKey) =>
        featuresForPlan(get().plan).has(feature),

      getEnabledFeatures: () =>
        Array.from(featuresForPlan(get().plan)) as FeatureKey[],

      reset: () => set({ plan: 'FREE' }),
    }),
    {
      name: 'feature-flag-store',
      // Persist only plan; features are derived at runtime
      partialize: (state) => ({ plan: state.plan }),
    }
  )
)
