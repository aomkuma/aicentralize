import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  MessageSquare,
  Sparkles,
  Users,
} from 'lucide-react'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { setStarterTourFlag } from '../lib/starterTour'

type StarterTourProject = {
  id: string
  name: string
  code?: string
  _count?: {
    meetings?: number
  }
}

type TourStep = {
  id: string
  title: string
  description: string
  actionLabel: string
  to: string
  icon: typeof FolderKanban
  done: boolean
}

export default function StarterTourPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const { get, isLoading } = useApi()
  const [projects, setProjects] = useState<StarterTourProject[]>([])

  useEffect(() => {
    let mounted = true

    const fetchProjects = async () => {
      const url = currentTenant?.id ? `/projects?tenantId=${encodeURIComponent(currentTenant.id)}` : '/projects'
      const data = await get<StarterTourProject[]>(url)
      if (mounted && Array.isArray(data)) {
        setProjects(data)
      }
    }

    void fetchProjects()

    return () => {
      mounted = false
    }
  }, [currentTenant?.id, get])

  const primaryProject = projects[0]
  const projectPath = primaryProject ? `/projects/${primaryProject.id}` : ''
  const hasProject = projects.length > 0
  const hasMeetingSignal = projects.some((project) => (project._count?.meetings ?? 0) > 0)

  const steps = useMemo<TourStep[]>(() => ([
    {
      id: 'project',
      title: t('starterTour.steps.project.title'),
      description: t('starterTour.steps.project.description'),
      actionLabel: hasProject ? t('starterTour.steps.project.openAction') : t('starterTour.steps.project.action'),
      to: '/projects',
      icon: FolderKanban,
      done: hasProject,
    },
    {
      id: 'knowledge',
      title: t('starterTour.steps.knowledge.title'),
      description: t('starterTour.steps.knowledge.description'),
      actionLabel: t('starterTour.steps.knowledge.action'),
      to: projectPath ? `${projectPath}/knowledge` : '/projects',
      icon: BookOpen,
      done: false,
    },
    {
      id: 'meeting',
      title: t('starterTour.steps.meeting.title'),
      description: t('starterTour.steps.meeting.description'),
      actionLabel: t('starterTour.steps.meeting.action'),
      to: primaryProject ? `/meetings/${primaryProject.id}` : '/meetings',
      icon: MessageSquare,
      done: hasMeetingSignal,
    },
    {
      id: 'tasks',
      title: t('starterTour.steps.tasks.title'),
      description: t('starterTour.steps.tasks.description'),
      actionLabel: t('starterTour.steps.tasks.action'),
      to: '/my-tasks',
      icon: ClipboardList,
      done: false,
    },
    {
      id: 'askAi',
      title: t('starterTour.steps.askAi.title'),
      description: t('starterTour.steps.askAi.description'),
      actionLabel: t('starterTour.steps.askAi.action'),
      to: '/dashboard#individual-ask-ai',
      icon: Sparkles,
      done: false,
    },
  ]), [hasMeetingSignal, hasProject, primaryProject, projectPath, t])

  const completedCount = steps.filter((step) => step.done).length
  const completionPercent = Math.round((completedCount / steps.length) * 100)

  const finishTour = () => {
    setStarterTourFlag('completed', user?.id, currentTenant?.id)
    navigate('/dashboard')
  }

  return (
    <Layout currentTenantName={currentTenant?.name}>
      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                {t('starterTour.eyebrow')}
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-bold text-slate-950 dark:text-white sm:text-4xl">
                {t('starterTour.title')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                {t('starterTour.description')}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to={hasProject && primaryProject ? `/projects/${primaryProject.id}/knowledge` : '/projects'}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {hasProject ? t('starterTour.primaryActionContinue') : t('starterTour.primaryActionStart')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={finishTour}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t('starterTour.finishAction')}
                </button>
              </div>
            </div>

            <aside className="border-t border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/60 sm:p-8 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('starterTour.progressTitle')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('starterTour.progressDescription', { completed: completedCount, total: steps.length })}
                  </p>
                </div>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                  {completionPercent}%
                </span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {currentTenant?.name || t('starterTour.workspaceFallback')}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {primaryProject
                        ? t('starterTour.activeProject', { project: primaryProject.name })
                        : t('starterTour.noProjectYet')}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <div className="mt-6 grid gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const disabled = !hasProject && step.id !== 'project'

            return (
              <section
                key={step.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {t('common.step', { current: index + 1, total: steps.length })}
                        </span>
                        {step.done && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('starterTour.done')}
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-lg font-bold text-slate-950 dark:text-white">
                        {step.title}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {step.description}
                      </p>
                      {disabled && (
                        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                          {t('starterTour.projectRequiredHint')}
                        </p>
                      )}
                    </div>
                  </div>

                  <Link
                    to={disabled ? '/projects' : step.to}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                      disabled
                        ? 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {disabled ? t('starterTour.createProjectFirst') : step.actionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </section>
            )
          })}
        </div>

        {isLoading && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            {t('common.loading')}
          </p>
        )}
      </div>
    </Layout>
  )
}
