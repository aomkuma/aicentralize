import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useApi } from '../hooks/useApi'
import Sidebar from './Sidebar'
import Breadcrumb from './Breadcrumb'
import MeetingStudioJobBanner from './MeetingStudioJobBanner'
import { PRIMARY_NAVIGATION } from '../config/navigation'
import type { TenantMembership } from '../types'

interface LayoutProps {
  children: ReactNode
  currentTenantName?: string
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'layout.sidebar.desktop-collapsed'

function getInitialDesktopCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
}

export default function Layout({ children, currentTenantName }: LayoutProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const storedTenant = useTenantStore((state) => state.currentTenant)
  const setCurrentTenant = useTenantStore((state) => state.setCurrentTenant)
  const setMemberships = useTenantStore((state) => state.setMemberships)
  const clearCurrentTenant = useTenantStore((state) => state.clearCurrentTenant)
  const { get: getMemberships } = useApi()
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(getInitialDesktopCollapsed)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const isPlatformUser = user?.systemRole === 'SUPER_ADMIN' || user?.systemRole === 'MODERATOR'
  const visibleTenantName = isPlatformUser ? undefined : (currentTenantName || storedTenant?.name)
  const userContextLabel = isPlatformUser
    ? t('common.platformConsole')
    : (visibleTenantName || t('dashboard.currentOrganization'))

  const getNavLabel = (item: (typeof PRIMARY_NAVIGATION)[number]) => item.labelKey ? t(item.labelKey) : item.id
  const isItemActive = (item: (typeof PRIMARY_NAVIGATION)[number]) => {
    if (item.external) {
      return location.pathname.startsWith(item.to)
    }

    return location.pathname === item.to
  }

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      isDesktopCollapsed ? '1' : '0',
    )
  }, [isDesktopCollapsed])

  useEffect(() => {
    if (!user || isPlatformUser || visibleTenantName) {
      return
    }

    let cancelled = false

    const loadDefaultTenant = async () => {
      const memberships = await getMemberships<TenantMembership[]>('/tenants/me')
      if (cancelled) {
        return
      }

      if (Array.isArray(memberships) && memberships.length > 0) {
        setMemberships(memberships)
        const defaultMembership = memberships.find((membership) => membership.tenant) ?? memberships[0]
        if (defaultMembership.tenant) {
          setCurrentTenant(defaultMembership.tenant, defaultMembership)
        }
        return
      }

      clearCurrentTenant()
    }

    loadDefaultTenant()

    return () => {
      cancelled = true
    }
  }, [
    user,
    isPlatformUser,
    visibleTenantName,
    getMemberships,
    setMemberships,
    setCurrentTenant,
    clearCurrentTenant,
  ])

  const currentPageTitle = useMemo(() => {
    if (location.pathname.startsWith('/continuity')) {
      return t('continuity.title')
    }

    const match = PRIMARY_NAVIGATION.find((item) => isItemActive(item))
    return match ? getNavLabel(match) : t('common.appName')
  }, [location.pathname, t])

  return (
    <>
      <MeetingStudioJobBanner />
      <div className="flex min-h-screen bg-white dark:bg-slate-950">
      {/* Sidebar */}
      <Sidebar
        currentTenantName={visibleTenantName}
        isDesktopCollapsed={isDesktopCollapsed}
        onToggleDesktopCollapse={() => setIsDesktopCollapsed((prev) => !prev)}
        isMobileOpen={isMobileOpen}
        onToggleMobile={() => setIsMobileOpen((prev) => !prev)}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main content with proper responsive margins */}
      <main className={`flex-1 w-full transition-[margin] duration-300 ease-out ${isDesktopCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:dark:bg-slate-950/80">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.12em] font-semibold text-gray-500 dark:text-slate-400">AICentralize</p>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{currentPageTitle}</h2>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[180px] sm:max-w-[240px]">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-[180px] sm:max-w-[240px]">{userContextLabel}</p>
              </div>
            </div>

            <div className="mt-3">
              <Breadcrumb />
            </div>
          </div>
        </header>

        <div className="pt-4 min-h-[calc(100vh-5rem)] bg-white dark:bg-slate-950">
          {children}
        </div>
      </main>
    </div>
    </>
  )
}
