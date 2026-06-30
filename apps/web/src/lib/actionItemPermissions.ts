import type { TenantMembership, User } from '../types'

export function resolveTenantMembership(
  currentMembership: TenantMembership | null | undefined,
  memberships: TenantMembership[],
  currentTenantId: string | null | undefined,
): TenantMembership | null {
  if (currentTenantId) {
    const fromMemberships =
      memberships.find((membership) => membership.tenantId === currentTenantId) ??
      memberships.find((membership) => membership.tenant?.id === currentTenantId)

    if (fromMemberships) {
      return fromMemberships
    }
  }

  if (currentMembership) {
    return currentMembership
  }

  return null
}

/** Platform ADMIN/PM or tenant TENANT_ADMIN/MANAGER may assign action items to others. */
export function canAssignActionItemsToOthers(
  user: User | null | undefined,
  membership: TenantMembership | null | undefined,
): boolean {
  if (user?.role === 'ADMIN' || user?.role === 'PM') {
    return true
  }

  return membership?.role === 'TENANT_ADMIN' || membership?.role === 'MANAGER'
}
