import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { FeatureKey } from '../types/features'
import { useFeatureFlagStore } from '../stores/featureFlagStore'

interface FeatureRouteProps {
  feature: FeatureKey
  children: ReactNode
  redirectTo?: string
}

export default function FeatureRoute({ feature, children, redirectTo = '/projects' }: FeatureRouteProps) {
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)

  if (!canAccessFeature(feature)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
