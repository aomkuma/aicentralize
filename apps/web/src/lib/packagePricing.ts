import type { SubscriptionPackage } from '../types'
import { FEATURES } from '../types/features'

export function formatPackageMoney(cents: number, currency: string): string {
  const amount = cents / 100

  if (currency === 'THB') {
    return `฿${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
  }

  return `${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ${currency}`
}

export function effectivePackagePriceCents(pkg: SubscriptionPackage): number {
  if (!pkg.discountType || pkg.discountValue <= 0) {
    return pkg.priceCents
  }

  if (pkg.discountType === 'FIXED') {
    return Math.max(0, pkg.priceCents - pkg.discountValue)
  }

  return Math.round((pkg.priceCents * (100 - pkg.discountValue)) / 100)
}

export function packageDiscountLabel(pkg: SubscriptionPackage): string | null {
  if (!pkg.discountType || pkg.discountValue <= 0) {
    return null
  }

  if (pkg.discountType === 'PERCENT') {
    return `${pkg.discountValue}%`
  }

  return formatPackageMoney(pkg.discountValue, pkg.currency)
}

export function packageFeatureLabels(pkg: SubscriptionPackage, limit = 4): string[] {
  const knownFeatures = new Map<string, string>(
    Object.values(FEATURES).map((feature) => [feature.id, feature.name]),
  )

  return pkg.features
    .map((featureId) => knownFeatures.get(featureId) ?? featureId.replace(/_/g, ' '))
    .slice(0, limit)
}
