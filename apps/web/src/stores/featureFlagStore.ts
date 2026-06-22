import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BillingPlan, FeatureKey } from '../types/features'
import { FEATURE_ENTITLEMENTS } from '../types/features'

interface FeatureFlagState {
  plan: BillingPlan
  enabledFeatures: Set<FeatureKey>
  
  // Actions
  setPlan: (plan: BillingPlan) => void
  isFeatureEnabled: (feature: FeatureKey) => boolean
  canAccessFeature: (feature: FeatureKey) => boolean
  getEnabledFeatures: () => FeatureKey[]
  reset: () => void
}

export const useFeatureFlagStore = create<FeatureFlagState>()(
  persist(
    (set, get) => ({
      plan: 'FREE',
      enabledFeatures: new Set(),

      setPlan: (plan: BillingPlan) => {
        set({
          plan,
          enabledFeatures: FEATURE_ENTITLEMENTS[plan] as Set<FeatureKey>,
        })
      },

      isFeatureEnabled: (feature: FeatureKey) => {
        return get().enabledFeatures.has(feature)
      },

      canAccessFeature: (feature: FeatureKey) => {
        return get().enabledFeatures.has(feature)
      },

      getEnabledFeatures: () => {
        return Array.from(get().enabledFeatures)
      },

      reset: () => {
        set({
          plan: 'FREE',
          enabledFeatures: FEATURE_ENTITLEMENTS.FREE as Set<FeatureKey>,
        })
      },
    }),
    {
      name: 'feature-flag-store',
      // Custom serialization for Set
      serialize: (state) => JSON.stringify({
        ...state,
        enabledFeatures: state.enabledFeatures ? Array.from(state.enabledFeatures) : [],
      }),
      deserialize: (str) => {
        const parsed = JSON.parse(str)
        return {
          ...parsed,
          enabledFeatures: new Set(parsed.enabledFeatures || []),
        }
      },
    }
  )
)
