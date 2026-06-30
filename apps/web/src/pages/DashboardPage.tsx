import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useApi } from '../hooks/useApi'
import Layout from '../components/Layout'
import AIChatPanel from '../components/AIChatPanel'
import MorningBriefingDialog from '../components/MorningBriefingDialog'
import type { TenantMembership } from '../types'

type DashboardProject = {
  id: string
  name: string
  code?: string
  description?: string | null
  tenant?: { name: string } | null
  _count?: { meetings: number }
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const setCurrentTenant = useTenantStore((state) => state.setCurrentTenant)
  const clearCurrentTenant = useTenantStore((state) => state.clearCurrentTenant)
  const {
    get: getMemberships,
    isLoading: isMembershipLoading,
    error: membershipError,
  } = useApi()
  const {
    get: getProjects,
    isLoading: isProjectLoading,
    error: projectError,
  } = useApi()

  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const isSuperAdmin = user?.systemRole === 'SUPER_ADMIN'
  const activeMembership = memberships.find((membership) => membership.tenantId === currentTenant?.id) ?? memberships[0]
  const activeTenantId = activeMembership?.tenantId
  const activeTenantName = activeMembership?.tenant?.name ?? currentTenant?.name

  useEffect(() => {
    const fetchMemberships = async () => {
      const data = await getMemberships<TenantMembership[]>('/tenants/me')
      if (data) {
        setMemberships(data)
        const matchingMembership = data.find((membership) => membership.tenantId === currentTenant?.id)
        const nextMembership = matchingMembership ?? data[0]

        if (nextMembership?.tenant && (
          nextMembership.tenantId !== currentTenant?.id ||
          nextMembership.tenant.name !== currentTenant?.name
        )) {
          setCurrentTenant(nextMembership.tenant, nextMembership)
        }

        if (data.length === 0) {
          clearCurrentTenant()
        }
      }
    }

    fetchMemberships()
  }, [getMemberships, currentTenant?.id, setCurrentTenant, clearCurrentTenant])

  const fetchProjects = useCallback(async () => {
    const url = activeTenantId ? `/projects?tenantId=${encodeURIComponent(activeTenantId)}` : '/projects'
    const data = await getProjects<DashboardProject[]>(url)
    if (Array.isArray(data)) setProjects(data)
  }, [activeTenantId, getProjects])

  useEffect(() => {
    if (!isSuperAdmin) fetchProjects()
  }, [isSuperAdmin, fetchProjects])

  useEffect(() => {
    if (!projects.length) {
      if (selectedProjectId) setSelectedProjectId('')
      return
    }

    const stillExists = projects.some((project) => project.id === selectedProjectId)
    if (!stillExists) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projects, selectedProjectId])

  const handleSelectTenant = (membership: TenantMembership) => {
    if (membership.tenant) {
      setCurrentTenant(membership.tenant, membership)
    }
  }

  return (
    <Layout currentTenantName={activeTenantName}>
      <MorningBriefingDialog tenantId={activeTenantId} />
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

        {/* PM: Projects On Hand */}
        {!isSuperAdmin && (
          <div className="mb-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {t('dashboard.projectsOnHand')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  {t('dashboard.projectsOnHandDesc')}
                </p>
              </div>
              <Link
                to="/projects"
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                {t('dashboard.createProject')}
              </Link>
            </div>

            {isProjectLoading ? (
              <div className="flex items-center justify-center p-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                <p className="text-sm text-gray-600 dark:text-slate-400">{t('common.loading')}</p>
              </div>
            ) : projectError ? (
              <div className="p-6 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
                <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
                  {t('dashboard.errorLoadingProjects')}
                </p>
                <p className="text-xs text-red-500 dark:text-red-300 mt-1">{projectError.message}</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                  {t('dashboard.noProjectsOnHand')}
                </p>
                <Link
                  to="/projects"
                  className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  {t('dashboard.createProject')}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`p-4 sm:p-5 rounded-lg border bg-white dark:bg-slate-800 shadow-sm cursor-pointer transition-colors ${
                      selectedProjectId === project.id
                        ? 'border-blue-500 dark:border-blue-500 ring-1 ring-blue-500/40'
                        : 'border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                    }`}
                  >
                    <div className="mb-3">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {project.name}
                      </h3>
                      {project.code && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5">
                          {project.code}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {t('dashboard.meetingsCount', { count: project._count?.meetings ?? 0 })}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        to={`/continuity/${project.id}`}
                        className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      >
                        {t('continuity.shortLabel')}
                      </Link>
                      <Link
                        to={`/reminders/${project.id}`}
                        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                      >
                        {t('reminders.shortLabel')}
                      </Link>
                      <Link
                        to={`/ai-trace/${project.id}`}
                        className="text-xs px-2 py-1 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                      >
                        {t('aiTrace.shortLabel')}
                      </Link>
                    </div>
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
          <AIChatPanel projectId={selectedProjectId || undefined} showModeTabs={false} />
        </div>
      </div>
    </Layout>
  )
}
