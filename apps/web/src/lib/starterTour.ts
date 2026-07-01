const STARTER_TOUR_STORAGE_PREFIX = 'starter-tour'
const INDIVIDUAL_TOUR_STORAGE_PREFIX = 'individual-tour'

export function isStarterPackage(packageCode: string | null | undefined): boolean {
  return packageCode?.trim().toUpperCase() === 'STARTER'
}

export function starterTourStorageKey(
  kind: 'completed' | 'dismissed',
  userId: string | undefined,
  tenantId: string | undefined,
): string {
  return `${STARTER_TOUR_STORAGE_PREFIX}.${kind}:${userId || 'anonymous'}:${tenantId || 'no-tenant'}`
}

export function hasStarterTourFlag(
  kind: 'completed' | 'dismissed',
  userId: string | undefined,
  tenantId: string | undefined,
): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(starterTourStorageKey(kind, userId, tenantId)) === '1'
}

export function setStarterTourFlag(
  kind: 'completed' | 'dismissed',
  userId: string | undefined,
  tenantId: string | undefined,
): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(starterTourStorageKey(kind, userId, tenantId), '1')
}

function individualTourStorageKey(
  kind: 'completed' | 'dismissed',
  userId: string | undefined,
  tenantId: string | undefined,
): string {
  return `${INDIVIDUAL_TOUR_STORAGE_PREFIX}.${kind}:${userId || 'anonymous'}:${tenantId || 'no-tenant'}`
}

export function hasIndividualTourFlag(
  kind: 'completed' | 'dismissed',
  userId: string | undefined,
  tenantId: string | undefined,
): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(individualTourStorageKey(kind, userId, tenantId)) === '1'
}

export function setIndividualTourFlag(
  kind: 'completed' | 'dismissed',
  userId: string | undefined,
  tenantId: string | undefined,
): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(individualTourStorageKey(kind, userId, tenantId), '1')
}
