import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useApi } from '../hooks/useApi'
import Layout from '../components/Layout'
import type { TenantMembership } from '../types'

type DashboardProject = {
  id: string
  name: string
  code?: string
  description?: string | null
  tenant?: {
    name: string
  } | null
  _count?: {
    meetings: number
  }
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const setCurrentTenant = useTenantStore((state) => state.setCurrentTenant)

  const { get: getMemberships } = useApi()
  const {
    get: getProjects,
    isLoading: isProjectLoading,
    error: projectError,
  } = useApi()
  const {
    post: createProject,
    isLoading: isCreatingProject,
    error: createProjectError,
  } = useApi()

  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectCode, setProjectCode] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [createProjectNotice, setCreateProjectNotice] = useState<string | null>(null)

  if (user?.systemRole === 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  const fetchProjects = useCallback(async () => {
    const data = await getProjects<DashboardProject[]>('/projects')
    if (Array.isArray(data)) {
      setProjects(data)
    }
  }, [getProjects])

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

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleCreateProject = async () => {
    const code = projectCode.trim()
    const name = projectName.trim()
    const description = projectDescription.trim()
    const tenantId = currentTenant?.id ?? memberships[0]?.tenantId

    if (!tenantId) {
      setCreateProjectNotice(t('dashboard.selectOrganizationFirst'))
      return
    }

    if (code.length < 2 || name.length < 2) {
      setCreateProjectNotice(t('dashboard.projectValidation'))
      return
    }

    const duplicateCode = projects.some((project) => project.code?.toLowerCase() === code.toLowerCase())
    if (duplicateCode) {
      setCreateProjectNotice(t('dashboard.projectCodeDuplicate'))
      return
    }

    setCreateProjectNotice(null)
    const created = await createProject('/projects', {
      code,
      name,
      description: description || undefined,
      tenantId,
    })

    if (created) {
      setProjectCode('')
      setProjectName('')
      setProjectDescription('')
      setShowCreateProject(false)
      setCreateProjectNotice(t('dashboard.projectCreated'))
      await fetchProjects()
    }
  }

  return (
    <Layout currentTenantName={currentTenant?.name}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {t('dashboard.projectsOnHand')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
            {t('dashboard.projectsOnHandDesc')}
          </p>
        </div>

        <div className="mb-12">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {t('dashboard.projectsOnHand')}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowCreateProject((prev) => !prev)
                setCreateProjectNotice(null)
              }}
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              {t('dashboard.createProject')}
            </button>
          </div>

          {showCreateProject && (
            <div className="mb-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                {t('dashboard.createProjectTitle')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.projectCode')}</span>
                  <input
                    value={projectCode}
                    onChange={(e) => setProjectCode(e.target.value)}
                    placeholder={t('dashboard.projectCodePlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.projectName')}</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t('dashboard.projectNamePlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block mt-3">
                <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.projectDescription')}</span>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder={t('dashboard.projectDescriptionPlaceholder')}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </label>

              {createProjectNotice && (
                <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">{createProjectNotice}</p>
              )}
              {createProjectError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{createProjectError.message}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={isCreatingProject}
                  className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isCreatingProject ? t('dashboard.creatingProject') : t('dashboard.createProjectSubmit')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateProject(false)}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  {t('dashboard.cancel')}
                </button>
              </div>
            </div>
          )}

          {isProjectLoading ? (
            <div className="flex items-center justify-center p-6 sm:p-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
              <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">{t('common.loading')}</p>
            </div>
          ) : projectError ? (
            <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
              <p className="text-sm sm:text-base text-red-600 dark:text-red-400 mb-2 font-semibold">
                {t('dashboard.errorLoadingProjects')}
              </p>
              <p className="text-xs sm:text-sm text-red-500 dark:text-red-300">{projectError.message}</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex items-center justify-center p-6 sm:p-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
              <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
                {t('dashboard.noProjectsOnHand')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"
                >
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                    {project.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1 truncate">
                    {project.tenant?.name || t('dashboard.noTenant')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                    {t('dashboard.meetingsCount', { count: project._count?.meetings ?? 0 })}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/continuity/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                      {t('continuity.title')}
                    </Link>
                    <Link
                      to={`/reminders/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                    >
                      {t('reminders.title')}
                    </Link>
                    <Link
                      to={`/ai-trace/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                    >
                      {t('aiTrace.title')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
