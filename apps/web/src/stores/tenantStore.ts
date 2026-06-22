import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Tenant, TenantMembership } from '../types'

interface TenantState {
  currentTenant: Tenant | null
  currentMembership: TenantMembership | null
  tenants: Tenant[]
  memberships: TenantMembership[]
  setCurrentTenant: (tenant: Tenant, membership: TenantMembership) => void
  setTenants: (tenants: Tenant[]) => void
  setMemberships: (memberships: TenantMembership[]) => void
  clearCurrentTenant: () => void
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      currentTenant: null,
      currentMembership: null,
      tenants: [],
      memberships: [],

      setCurrentTenant: (tenant: Tenant, membership: TenantMembership) => {
        set({
          currentTenant: tenant,
          currentMembership: membership,
        })
      },

      setTenants: (tenants: Tenant[]) => {
        set({ tenants })
      },

      setMemberships: (memberships: TenantMembership[]) => {
        set({ memberships })
      },

      clearCurrentTenant: () => {
        set({
          currentTenant: null,
          currentMembership: null,
        })
      },
    }),
    {
      name: 'tenant-store',
    }
  )
)
