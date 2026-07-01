import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeatureKey } from '../types/features'
import { useFeatureFlagStore } from '../stores/featureFlagStore'

interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  fallback?: ReactNode
  className?: string
}

export default function FeatureGate({ feature, children, fallback, className }: FeatureGateProps) {
  const { t } = useTranslation()
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)

  if (!canAccessFeature(feature)) {
    if (fallback !== undefined) {
      return <>{fallback}</>
    }

    return (
      <div className={className ?? 'text-center py-12'}>
        <p className="text-gray-500 dark:text-slate-400">{t('features.notAvailable')}</p>
      </div>
    )
  }

  return <>{children}</>
}
