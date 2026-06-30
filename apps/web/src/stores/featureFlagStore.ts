import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BillingPlan, FeatureKey } from '../types/features'
import { FEATURE_ENTITLEMENTS } from '../types/features'

interface FeatureFlagState {
  plan: BillingPlan
  packageCode: string | null
  enabledFeatureIds: string[] | null
  setPlan: (plan: BillingPlan) => void
  setPackageEntitlements: (packageCode: string | null, features: string[] | null) => void
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
      packageCode: null,
      enabledFeatureIds: null,

      setPlan: (plan: BillingPlan) => set({ plan }),

      setPackageEntitlements: (packageCode: string | null, features: string[] | null) =>
        set({
          packageCode,
          enabledFeatureIds: features,
        }),

      isFeatureEnabled: (feature: FeatureKey) =>
        get().enabledFeatureIds
          ? get().enabledFeatureIds!.includes(feature)
          : featuresForPlan(get().plan).has(feature),

      canAccessFeature: (feature: FeatureKey) =>
        get().enabledFeatureIds
          ? get().enabledFeatureIds!.includes(feature)
          : featuresForPlan(get().plan).has(feature),

      getEnabledFeatures: () =>
        (get().enabledFeatureIds
          ? get().enabledFeatureIds
          : Array.from(featuresForPlan(get().plan))) as FeatureKey[],

      reset: () => set({ plan: 'FREE', packageCode: null, enabledFeatureIds: null }),
    }),
    {
      name: 'feature-flag-store',
      partialize: (state) => ({
        plan: state.plan,
        packageCode: state.packageCode,
        enabledFeatureIds: state.enabledFeatureIds,
      }),
    }
  )
)
