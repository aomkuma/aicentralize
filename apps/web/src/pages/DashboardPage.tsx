import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useApi } from '../hooks/useApi'
import Layout from '../components/Layout'
import AIChatPanel from '../components/AIChatPanel'
import type { TenantMembership } from '../types'

export default function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const setCurrentTenant = useTenantStore((state) => state.setCurrentTenant)
  const {
    get: getMemberships,
    isLoading: isMembershipLoading,
    error: membershipError,
  } = useApi()

  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const isSuperAdmin = user?.systemRole === 'SUPER_ADMIN'

  useEffect(() => {
    const fetchMemberships = async () => {
      const data = await getMemberships<TenantMembership[]>('/tenants/me')
      if (data) {
        setMemberships(data)
        if (data.length > 0 && !currentTenant && data[0].tenant) {
          setCurrentTenant(data[0].tenant, data[0])
        }
      }
    }

    fetchMemberships()
  }, [getMemberships, currentTenant, setCurrentTenant])

  const handleSelectTenant = (membership: TenantMembership) => {
    if (membership.tenant) {
      setCurrentTenant(membership.tenant, membership)
    }
  }

  return (
    <Layout currentTenantName={currentTenant?.name}>
      {/* Main content area */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isSuperAdmin && (
          <div className="mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">
              {t('dashboard.yourOrganizations')}
            </h2>

            {isMembershipLoading ? (
              <div className="flex items-center justify-center p-6 sm:p-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">{t('common.loading')}</p>
              </div>
            ) : membershipError ? (
              <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
                <p className="text-sm sm:text-base text-red-600 dark:text-red-400 mb-2 font-semibold">
                  {t('dashboard.errorLoading')}
                </p>
                <p className="text-xs sm:text-sm text-red-500 dark:text-red-300">{membershipError.message}</p>
                {membershipError.status && (
                  <p className="text-xs sm:text-sm text-red-500 dark:text-red-300 mt-1">
                    Status: {membershipError.status}
                  </p>
                )}
              </div>
            ) : memberships.length === 0 ? (
              <div className="flex items-center justify-center p-6 sm:p-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
                <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
                  {t('dashboard.noOrganizations')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {memberships.map((membership) => (
                  <div
                    key={membership.id}
                    onClick={() => handleSelectTenant(membership)}
                    className={`p-4 sm:p-6 rounded-lg border-2 cursor-pointer transition-all ${
                      currentTenant?.id === membership.tenantId
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                          {membership.tenant?.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
                          {membership.role}
                        </p>
                      </div>
                      <div className="text-2xl sm:text-3xl ml-3 flex-shrink-0">🏢</div>
                    </div>

                    {membership.jobTitle && (
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 mb-3 truncate">
                        {membership.jobTitle}
                      </p>
                    )}

                    <p className="text-xs text-gray-500 dark:text-slate-500">
                      {t('common.joined')}{' '}
                      {new Date(membership.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/*
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
            <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">📹</div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.recordMeetings')}
            </h3>
            <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {t('dashboard.recordMeetingsDesc')}
            </p>
          </div>

          <div className="p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
            <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🤖</div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.aiAnalysis')}
            </h3>
            <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {t('dashboard.aiAnalysisDesc')}
            </p>
          </div>

          <div className="p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
            <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🎯</div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t('dashboard.trackActions')}
            </h3>
            <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {t('dashboard.trackActionsDesc')}
            </p>
          </div>
        </div>
        */}

        <div>
          <AIChatPanel />
        </div>
      </div>
    </Layout>
  )
}
