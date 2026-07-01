import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, Upload } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import WorkflowProgressPanel from '../components/WorkflowProgressPanel'
import { useKnowledgeImportFlow } from '../hooks/useKnowledgeImportFlow'
import { useApi } from '../hooks/useApi'
import {
  deriveTitleFromFileName,
  groupDraftItemsByCategory,
  groupMemoryItemsByCategory,
  resolvePersonalKnowledgePersona,
} from '../lib/personalKnowledge'
import { useTenantStore } from '../stores/tenantStore'
import type { ProjectKnowledgeSource, ProjectMemoryItem } from '../types'

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.tsv,.txt,.md'

export default function PersonalKnowledgePage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId?: string }>()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const { get, isLoading } = useApi()

  const [sources, setSources] = useState<ProjectKnowledgeSource[]>([])
  const [memoryItems, setMemoryItems] = useState<ProjectMemoryItem[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [notice, setNotice] = useState('')
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null)

  const persona = resolvePersonalKnowledgePersona(currentTenant)
  const personaKey = persona === 'student' ? 'student' : 'general'

  const {
    isImporting,
    progressMode,
    progressKey,
    progressDetail,
    progressPercent,
    progressPanelExtras,
    progressSteps,
    importFiles,
    approveSource,
  } = useKnowledgeImportFlow(projectId)

  const fetchKnowledge = useCallback(async () => {
    if (!projectId) {
      return
    }

    const [sourceData, memoryData] = await Promise.all([
      get<ProjectKnowledgeSource[]>(`/projects/${projectId}/knowledge/sources`),
      get<ProjectMemoryItem[]>(`/projects/${projectId}/knowledge/memory`),
    ])

    if (Array.isArray(sourceData)) {
      setSources(sourceData)
    }
    if (Array.isArray(memoryData)) {
      setMemoryItems(memoryData)
    }
  }, [get, projectId])

  useEffect(() => {
    void fetchKnowledge()
  }, [fetchKnowledge])

  const pendingSources = useMemo(
    () => sources.filter((source) => source.status === 'EXTRACTED'),
    [sources],
  )

  const memoryGroups = useMemo(
    () => groupMemoryItemsByCategory(memoryItems, t, persona),
    [memoryItems, persona, t],
  )

  const handleFileSelection = (files: FileList | null) => {
    if (!files?.length) {
      return
    }

    const nextFiles = Array.from(files)
    setSelectedFiles(nextFiles)
    if (!title.trim() && nextFiles[0]) {
      setTitle(deriveTitleFromFileName(nextFiles[0].name).slice(0, 180))
    }
  }

  const handleImport = async () => {
    if (!selectedFiles.length) {
      setNotice(t('personalKnowledge.selectFilesFirst'))
      return
    }

    setNotice('')
    const result = await importFiles(selectedFiles, { title })
    setNotice(result.notice)
    if (result.importedCount > 0) {
      setSelectedFiles([])
      setTitle('')
      await fetchKnowledge()
    }
  }

  const handleApprove = async (sourceId: string, sourceTitle: string) => {
    setNotice('')
    const ok = await approveSource(sourceId, sourceTitle)
    setNotice(ok ? t('personalKnowledge.savedToMemory') : t('personalKnowledge.approveFailed'))
    if (ok) {
      await fetchKnowledge()
    }
  }

  if (!projectId) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('personalKnowledge.backToDashboard')}
          </Link>
        </div>

        <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 sm:p-6 dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-orange-950/20">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                {t('personalKnowledge.title')}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 sm:text-base">
                {t(`personalKnowledge.description.${personaKey}`)}
              </p>
            </div>
          </div>

          <ol className="mt-5 grid gap-2 sm:grid-cols-3">
            {(['upload', 'review', 'memory'] as const).map((step, index) => (
              <li
                key={step}
                className="rounded-xl border border-amber-100 bg-white/80 px-3 py-3 text-sm dark:border-amber-900/30 dark:bg-slate-900/60"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                  {t('common.step', { current: index + 1, total: 3 })}
                </p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {t(`personalKnowledge.steps.${step}.title`)}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  {t(`personalKnowledge.steps.${step}.description.${personaKey}`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {progressMode && (
          <div className="mb-6">
            <WorkflowProgressPanel
              title={t('projectKnowledge.progress.title')}
              subtitle={t('projectKnowledge.progress.subtitle')}
              detail={progressDetail || undefined}
              percent={progressPercent}
              progressLabel={t('projectKnowledge.progress.overall')}
              elapsedLabel={progressPanelExtras.elapsedLabel}
              etaLabel={progressPanelExtras.etaLabel}
              subProgress={progressPanelExtras.subProgress}
              stats={progressPanelExtras.stats}
              steps={progressSteps}
              activeKey={progressKey}
              failedHint={progressKey === 'failed' ? t('projectKnowledge.progress.failedHint') : undefined}
            />
          </div>
        )}

        {(notice) && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm whitespace-pre-line ${
            notice.includes('\n') || notice.toLowerCase().includes('fail') || notice.includes('ล้มเหลว')
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
          }`}>
            {notice}
          </div>
        )}

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('personalKnowledge.uploadTitle')}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t(`personalKnowledge.uploadHelp.${personaKey}`)}
          </p>

          <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('personalKnowledge.documentTitle')}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('personalKnowledge.documentTitlePlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
          </label>

          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-amber-400 hover:bg-amber-50/50 dark:border-slate-600 dark:bg-slate-950/40 dark:hover:border-amber-600">
            <Upload className="mb-2 h-8 w-8 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t('personalKnowledge.dropFiles')}
            </span>
            <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('personalKnowledge.supportedFormats')}
            </span>
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={(event) => handleFileSelection(event.target.files)}
            />
          </label>

          {selectedFiles.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>• {file.name}</li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={isImporting || isLoading || !selectedFiles.length}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {isImporting ? t('personalKnowledge.uploading') : t('personalKnowledge.uploadAndSummarize')}
          </button>
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('personalKnowledge.reviewTitle')}
            </h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              {pendingSources.length}
            </span>
          </div>

          {pendingSources.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
              {t('personalKnowledge.noPendingReview')}
            </p>
          ) : (
            <div className="space-y-4">
              {pendingSources.map((source) => {
                const draftItems = source.extractions?.[0]?.extractionJson?.items ?? []
                const overview = source.extractions?.[0]?.extractionJson?.overview
                const groupedDraft = groupDraftItemsByCategory(draftItems, t, persona)
                const isExpanded = expandedSourceId === source.id

                return (
                  <article
                    key={source.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{source.title}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t('personalKnowledge.extractedItems', { count: draftItems.length })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleApprove(source.id, source.title)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        {t('personalKnowledge.saveToMemory')}
                      </button>
                    </div>

                    {overview && (
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {overview}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedSourceId(isExpanded ? null : source.id)}
                      className="mt-3 text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300"
                    >
                      {isExpanded ? t('personalKnowledge.hideCategories') : t('personalKnowledge.showCategories')}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        {groupedDraft.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('personalKnowledge.emptyDraft')}
                          </p>
                        ) : groupedDraft.map((group) => (
                          <div
                            key={group.key}
                            className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                          >
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</h4>
                            <ul className="mt-2 space-y-2">
                              {group.items.map((item) => (
                                <li key={`${group.key}-${item.title}`} className="text-sm">
                                  <p className="font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
                                  <p className="mt-0.5 text-slate-600 dark:text-slate-400 line-clamp-3">{item.content}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('personalKnowledge.memoryTitle')}
            </h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {t('personalKnowledge.memoryCount', { count: memoryItems.length })}
            </span>
          </div>

          {memoryItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
              {t('personalKnowledge.noMemory')}
            </p>
          ) : (
            <div className="space-y-4">
              {memoryGroups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {group.label}
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({group.items.length})
                    </span>
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40"
                      >
                        <p className="font-medium text-slate-900 dark:text-white">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                          {item.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}
