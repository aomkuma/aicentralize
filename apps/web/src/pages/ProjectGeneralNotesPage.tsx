import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import type { ProjectGeneralNote } from '../types'

type ProjectOption = {
  id: string
  name: string
  code?: string
  tenant?: {
    name: string
  } | null
}

function buildProjectLabel(project: ProjectOption) {
  return [project.code, project.name].filter(Boolean).join(' - ') || project.name
}

export default function ProjectGeneralNotesPage() {
  const { t, i18n } = useTranslation()
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
  const { get, post, isLoading, error } = useApi()

  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(routeProjectId ?? '')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [notes, setNotes] = useState<ProjectGeneralNote[]>([])
  const [notice, setNotice] = useState('')

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const fetchProjects = useCallback(async () => {
    const data = await get<ProjectOption[]>('/projects')
    if (Array.isArray(data)) {
      setProjects(data)
      if (!selectedProjectId && data[0]?.id) {
        setSelectedProjectId(routeProjectId ?? data[0].id)
      }
    }
  }, [get, routeProjectId, selectedProjectId])

  const fetchNotes = useCallback(async () => {
    if (!selectedProjectId) {
      setNotes([])
      return
    }

    const data = await get<ProjectGeneralNote[]>(`/projects/${selectedProjectId}/notes`)
    if (Array.isArray(data)) {
      setNotes(data)
    }
  }, [get, selectedProjectId])

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (routeProjectId) {
      setSelectedProjectId(routeProjectId)
    }
  }, [routeProjectId])

  useEffect(() => {
    void fetchNotes()
  }, [fetchNotes])

  if (routeProjectId && selectedProjectId && routeProjectId !== selectedProjectId) {
    return <Navigate to={`/projects/${selectedProjectId}/notes`} replace />
  }

  const currentStep = !selectedProjectId ? 1 : !content.trim() ? 2 : 3

  const handleSave = async () => {
    const cleanTitle = title.trim()
    const cleanContent = content.trim()

    if (!selectedProjectId) {
      setNotice(t('generalNotes.validationProject'))
      return
    }

    if (cleanContent.length < 10) {
      setNotice(t('generalNotes.validationContent'))
      return
    }

    const noteTitle = cleanTitle || cleanContent.split('\n')[0].trim().slice(0, 180) || t('generalNotes.defaultTitle')

    const created = await post<ProjectGeneralNote>(`/projects/${selectedProjectId}/notes`, {
      title: noteTitle.slice(0, 180),
      content: cleanContent,
      visibility,
    })

    if (created) {
      setTitle('')
      setContent('')
      setVisibility('PUBLIC')
      setNotice(t('generalNotes.saved'))
      await fetchNotes()
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-300">
              AICentralize
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {t('generalNotes.title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              {t('generalNotes.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedProjectId && (
              <Link
                to={`/projects/${selectedProjectId}/knowledge`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('projectKnowledge.shortLabel')}
              </Link>
            )}
            <Link
              to="/projects"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('navigation.projects')}
            </Link>
          </div>
        </div>

        {(notice || error) && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'
          }`}>
            {error?.message || notice}
          </div>
        )}

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`rounded-lg border p-4 ${
                  currentStep === step
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
                    : currentStep > step
                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('generalNotes.stepLabel', { step })}
                </p>
                <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                  {t(`generalNotes.steps.${step}.title`)}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {t(`generalNotes.steps.${step}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('generalNotes.composeTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('generalNotes.composeHelp')}</p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('generalNotes.project')}</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">{t('generalNotes.selectProject')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {buildProjectLabel(project)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('generalNotes.noteTitle')}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder={t('generalNotes.noteTitlePlaceholder')}
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('generalNotes.visibility', { defaultValue: 'Visibility' })}
                </span>
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'PRIVATE')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  <option value="PUBLIC">{t('generalNotes.visibilityPublic', { defaultValue: 'Public' })}</option>
                  <option value="PRIVATE">{t('generalNotes.visibilityPrivate', { defaultValue: 'Private' })}</option>
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {visibility === 'PUBLIC'
                    ? t('generalNotes.visibilityPublicHelp', { defaultValue: 'Visible to project members and available as Ask-AI evidence.' })
                    : t('generalNotes.visibilityPrivateHelp', { defaultValue: 'Visible only to you and excluded from shared Ask-AI evidence.' })}
                </p>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('generalNotes.noteContent')}</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder={t('generalNotes.noteContentPlaceholder')}
                />
              </label>

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-white">{t('generalNotes.whyTitle')}</p>
                <p className="mt-1">{t('generalNotes.whyBody')}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isLoading}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? t('common.loading') : t('generalNotes.save')}
            </button>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('generalNotes.projectContext')}</h2>
              {selectedProject ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800/70">
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedProject.name}</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {[selectedProject.code, selectedProject.tenant?.name].filter(Boolean).join(' | ')}
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {t('generalNotes.noProjectSelected')}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('generalNotes.savedNotes')}</h2>
              <div className="mt-3 space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white">{note.title}</p>
                          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            note.visibility === 'PRIVATE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                          }`}>
                            {note.visibility === 'PRIVATE'
                              ? t('generalNotes.visibilityPrivate', { defaultValue: 'Private' })
                              : t('generalNotes.visibilityPublic', { defaultValue: 'Public' })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t('generalNotes.noteMeta', {
                            author: note.author.name,
                            date: new Date(note.createdAt).toLocaleString(i18n.language),
                          })}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{note.content}</p>
                  </div>
                ))}

                {!notes.length && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t('generalNotes.empty')}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}
