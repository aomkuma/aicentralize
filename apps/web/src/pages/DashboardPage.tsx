import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Brain, ClipboardList, Pencil, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useApi } from '../hooks/useApi'
import Layout from '../components/Layout'
import AIChatPanel from '../components/AIChatPanel'
import MorningBriefingDialog from '../components/MorningBriefingDialog'
import {
  canCreateProjectForPackage,
  isIndividualPackage,
  canAccessAiChatHistory,
} from '../lib/packageAccess'
import { useFeatureFlagStore } from '../stores/featureFlagStore'
import type { TenantMembership } from '../types'

type DashboardProject = {
  id: string
  name: string
  code?: string
  description?: string | null
  tenant?: { name: string } | null
  _count?: { meetings: number }
}

const INDIVIDUAL_GUIDE_DISMISSED_PREFIX = 'dashboard.individualGuide.dismissed'

function individualGuideStorageKey(userId: string, tenantId: string) {
  return `${INDIVIDUAL_GUIDE_DISMISSED_PREFIX}:${userId}:${tenantId}`
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const packageCode = useFeatureFlagStore((state) => state.packageCode)
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
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
  const [individualGuideDismissed, setIndividualGuideDismissed] = useState(false)
  const isSuperAdmin = user?.systemRole === 'SUPER_ADMIN'
  const activeMembership = memberships.find((membership) => membership.tenantId === currentTenant?.id) ?? memberships[0]
  const activeTenantId = activeMembership?.tenantId
  const activeTenantName = activeMembership?.tenant?.name ?? currentTenant?.name
  const packageMaxProjects =
    activeMembership?.tenant?.currentPackage?.maxProjects
    ?? currentTenant?.currentPackage?.maxProjects
  const canCreateProject = canCreateProjectForPackage(projects.length, packageMaxProjects)
  const isIndividual = isIndividualPackage(packageCode)
  const canOpenAiChatHistory = canAccessAiChatHistory(packageCode, canAccessFeature)
  const primaryProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null
  const activeChatProjectId = selectedProjectId || projects[0]?.id || undefined

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

  useEffect(() => {
    if (!user?.id || !activeTenantId) {
      setIndividualGuideDismissed(false)
      return
    }

    setIndividualGuideDismissed(
      window.localStorage.getItem(individualGuideStorageKey(user.id, activeTenantId)) === '1',
    )
  }, [user?.id, activeTenantId])

  const dismissIndividualGuide = () => {
    if (!user?.id || !activeTenantId) {
      setIndividualGuideDismissed(true)
      return
    }

    window.localStorage.setItem(individualGuideStorageKey(user.id, activeTenantId), '1')
    setIndividualGuideDismissed(true)
  }

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
        {isIndividual && !isSuperAdmin && !individualGuideDismissed && (
          <section className="relative mb-8 overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 sm:p-7 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-orange-950/20">
            <button
              type="button"
              onClick={dismissIndividualGuide}
              aria-label={t('dashboard.individual.dismissGuide')}
              title={t('dashboard.individual.dismissGuide')}
              className="absolute right-4 top-4 rounded-lg border border-amber-200/80 bg-white/80 p-1.5 text-amber-800 transition hover:bg-white hover:text-amber-950 dark:border-amber-800/50 dark:bg-slate-900/70 dark:text-amber-200 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-wrap items-start gap-4 pr-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                <Brain className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  {t('dashboard.individual.eyebrow')}
                </p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {t('dashboard.individual.title')}
                </h1>
                <p className="mt-2 max-w-3xl text-sm sm:text-base text-gray-600 dark:text-slate-300">
                  {t('dashboard.individual.description')}
                </p>
              </div>
            </div>

            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              {([
                {
                  icon: BookOpen,
                  title: t('dashboard.individual.steps.import.title'),
                  description: t('dashboard.individual.steps.import.description'),
                  to: primaryProject ? `/projects/${primaryProject.id}/knowledge` : '/projects',
                },
                {
                  icon: Sparkles,
                  title: t('dashboard.individual.steps.ask.title'),
                  description: t('dashboard.individual.steps.ask.description'),
                  href: '#individual-ask-ai',
                },
                {
                  icon: ClipboardList,
                  title: t('dashboard.individual.steps.tasks.title'),
                  description: t('dashboard.individual.steps.tasks.description'),
                  to: '/my-tasks',
                },
              ] as const).map((step, index) => (
                <li key={step.title}>
                  {'href' in step ? (
                    <a
                      href={step.href}
                      className="flex h-full flex-col rounded-xl border border-amber-100 bg-white/80 p-4 transition hover:border-amber-300 hover:shadow-md dark:border-amber-900/30 dark:bg-slate-900/60 dark:hover:border-amber-700"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                        {t('common.step', { current: index + 1, total: 3 })}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <step.icon className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                        {step.title}
                      </span>
                      <span className="mt-1 text-xs text-gray-600 dark:text-slate-400">
                        {step.description}
                      </span>
                    </a>
                  ) : (
                    <Link
                      to={step.to}
                      className="flex h-full flex-col rounded-xl border border-amber-100 bg-white/80 p-4 transition hover:border-amber-300 hover:shadow-md dark:border-amber-900/30 dark:bg-slate-900/60 dark:hover:border-amber-700"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                        {t('common.step', { current: index + 1, total: 3 })}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <step.icon className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                        {step.title}
                      </span>
                      <span className="mt-1 text-xs text-gray-600 dark:text-slate-400">
                        {step.description}
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

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
                  {isIndividual ? t('dashboard.individual.workspaceTitle') : t('dashboard.projectsOnHand')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  {isIndividual ? t('dashboard.individual.workspaceDesc') : t('dashboard.projectsOnHandDesc')}
                </p>
              </div>
              {canCreateProject && (
                <Link
                  to="/projects"
                  className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  {t('dashboard.createProject')}
                </Link>
              )}
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
                  {isIndividual ? t('dashboard.individual.noWorkspace') : t('dashboard.noProjectsOnHand')}
                </p>
                {canCreateProject && (
                  <Link
                    to="/projects"
                    className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {t('dashboard.createProject')}
                  </Link>
                )}
              </div>
            ) : isIndividual ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`relative rounded-2xl border bg-white p-5 sm:p-6 shadow-sm transition-colors dark:bg-slate-800 ${
                      selectedProjectId === project.id
                        ? 'border-amber-400 ring-1 ring-amber-400/40 dark:border-amber-500'
                        : 'border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    <Link
                      to="/projects"
                      title={t('dashboard.editProject')}
                      aria-label={t('dashboard.editProject')}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute top-4 right-4 rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>

                    <p className="pr-10 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      {t('dashboard.individual.workspaceBadge')}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white truncate">
                      {project.name}
                    </h3>
                    {project.code && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5">
                        {project.code}
                      </p>
                    )}
                    {project.description && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-slate-400 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-5 flex flex-col gap-2">
                      <Link
                        to={`/projects/${project.id}/knowledge`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600"
                      >
                        <BookOpen className="h-4 w-4" />
                        {t('dashboard.individual.openKnowledge')}
                      </Link>
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          to={`/projects/${project.id}/notes`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm font-medium text-cyan-800 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200"
                        >
                          {t('generalNotes.shortLabel')}
                        </Link>
                        <Link
                          to="/my-tasks"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {t('navigation.myTasks')}
                        </Link>
                      </div>
                      {(canAccessFeature('REMINDERS_BASIC') || canOpenAiChatHistory) && (
                        <div className={`grid gap-2 ${canAccessFeature('REMINDERS_BASIC') && canOpenAiChatHistory ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {canAccessFeature('REMINDERS_BASIC') && (
                            <Link
                              to={`/reminders/${project.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                            >
                              {t('reminders.shortLabel')}
                            </Link>
                          )}
                          {canOpenAiChatHistory && (
                            <Link
                              to={`/ai-trace/${project.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200"
                            >
                              {t('aiTrace.shortLabel')}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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

        <div id="individual-ask-ai">
          {isProjectLoading ? (
            <div
              className="rounded-2xl border border-gray-200 bg-white/60 p-8 dark:border-slate-700 dark:bg-slate-900/40"
              aria-busy="true"
              aria-label={t('common.loading')}
            >
              <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
            </div>
          ) : (
            <AIChatPanel
              projectId={activeChatProjectId}
              persistKey="dashboard"
              projectName={primaryProject?.name}
              showModeTabs={false}
              layout="dashboard"
            />
          )}
        </div>
      </div>
    </Layout>
  )
}
