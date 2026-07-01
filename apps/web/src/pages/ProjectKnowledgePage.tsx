import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import WorkflowProgressPanel from '../components/WorkflowProgressPanel'
import {
  buildChunkSubProgress,
  buildKnowledgeJobDetail,
  computeKnowledgeProgressPercent,
  estimateKnowledgeEtaMs,
  formatKnowledgeDuration,
  mapJobStageToProgressKey,
  type KnowledgeProgressKey,
} from '../lib/knowledgeProgress'
import { useApi } from '../hooks/useApi'
import {
  groupMemoryItemsBySource,
  groupMemoryItemsByType,
} from '../lib/personalKnowledge'
import type {
  ProjectKnowledgeAuthorityLevel,
  ProjectKnowledgeBaseline,
  ProjectKnowledgeImportJob,
  ProjectKnowledgeSource,
  ProjectKnowledgeSourceType,
  ProjectMemoryItem,
} from '../types'

const sourceTypes: ProjectKnowledgeSourceType[] = [
  'TOR',
  'PROPOSAL',
  'CONTRACT',
  'REQUIREMENT',
  'MINUTES',
  'ACTION_LOG',
  'RISK_LOG',
  'ISSUE_LOG',
  'TIMELINE',
  'TECHNICAL_NOTE',
  'OTHER',
]

const authorityLevels: ProjectKnowledgeAuthorityLevel[] = ['AUTHORITATIVE', 'SUPPORTING', 'HISTORICAL']

const HISTORY_PAGE_SIZE = 15

type KnowledgeProgressMode = 'import' | 'save' | 'extract' | 'approve' | null

const progressFlowByMode: Record<Exclude<KnowledgeProgressMode, null>, KnowledgeProgressKey[]> = {
  import: ['validatingInput', 'uploadingFile', 'readingFile', 'savingSource', 'aiExtracting', 'completed'],
  save: ['validatingInput', 'savingSource', 'completed'],
  extract: ['validatingInput', 'aiExtracting', 'completed'],
  approve: ['reviewingExtraction', 'savingToMemory', 'completed'],
}

function paginateItems<T>(items: T[], page: number) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * HISTORY_PAGE_SIZE

  return {
    slice: items.slice(start, start + HISTORY_PAGE_SIZE),
    page: safePage,
    totalPages,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + HISTORY_PAGE_SIZE, total),
  }
}

function toggleExpandedId(
  setter: Dispatch<SetStateAction<Set<string>>>,
  id: string,
) {
  setter((previous) => {
    const next = new Set(previous)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return next
  })
}

type HistoryPaginationProps = {
  page: number
  totalPages: number
  total: number
  onPrevious: () => void
  onNext: () => void
  previousLabel: string
  nextLabel: string
  rangeLabel: string
}

function HistoryPagination({
  page,
  totalPages,
  total,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  rangeLabel,
}: HistoryPaginationProps) {
  if (total <= HISTORY_PAGE_SIZE) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">{rangeLabel}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {previousLabel}
        </button>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

function buildSourceMeta(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' · ')
}

function formatFileErrorMessage(fileName: string, reason: string) {
  return `${fileName}: ${reason}`
}

function describeFileProcessingError(file: File, error: unknown, t: (key: string) => string) {
  const apiError = error as { message?: string; data?: { message?: string; code?: string } }
  const payload = typeof error === 'object' && error !== null
    ? error as { message?: string; code?: string; data?: { message?: string; code?: string } }
    : null
  const message = apiError.data?.message ?? payload?.message ?? (error instanceof Error ? error.message : '')
  const code = apiError.data?.code ?? payload?.code ?? ''
  const lowerName = file.name.toLowerCase()

  if (code === 'PDF_NO_TEXT' || message.includes('image-only') || message.includes('unsupported encoding')) {
    return t('projectKnowledge.fileReadErrors.pdfImageOnly')
  }

  if (code === 'FILE_TOO_SHORT' || message.includes('too short')) {
    return t('projectKnowledge.fileTooShort')
  }

  if (code === 'UNSUPPORTED_FILE_TYPE' || message.startsWith('Unsupported file type')) {
    return t('projectKnowledge.fileReadErrors.unsupportedType')
  }

  if (lowerName.endsWith('.pdf')) {
    return t('projectKnowledge.fileReadErrors.pdfGeneric')
  }

  if (lowerName.endsWith('.docx')) {
    return t('projectKnowledge.fileReadErrors.docxGeneric')
  }

  if (lowerName.endsWith('.xlsx')) {
    if (message.includes('Invalid XLSX structure')) {
      return t('projectKnowledge.fileReadErrors.xlsxInvalid')
    }
    return t('projectKnowledge.fileReadErrors.xlsxGeneric')
  }

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
    return t('projectKnowledge.fileReadErrors.csvGeneric')
  }

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return t('projectKnowledge.fileReadErrors.textGeneric')
  }

  if (message.startsWith('Unsupported file type:')) {
    return t('projectKnowledge.fileReadErrors.unsupportedType')
  }

  return message || t('projectKnowledge.importFailed')
}

function deriveTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toDateInputValue(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function ProjectKnowledgePage() {
  const { t, i18n } = useTranslation()
  const { projectId } = useParams<{ projectId?: string }>()
  const { get, post, postFormData, isLoading, error } = useApi()

  const [baseline, setBaseline] = useState<ProjectKnowledgeBaseline | null>(null)
  const [sources, setSources] = useState<ProjectKnowledgeSource[]>([])
  const [memoryItems, setMemoryItems] = useState<ProjectMemoryItem[]>([])
  const [sourceType, setSourceType] = useState<ProjectKnowledgeSourceType>('REQUIREMENT')
  const [authorityLevel, setAuthorityLevel] = useState<ProjectKnowledgeAuthorityLevel>('SUPPORTING')
  const [title, setTitle] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [contentText, setContentText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [sourcesPage, setSourcesPage] = useState(1)
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set())
  const [libraryTab, setLibraryTab] = useState<'sources' | 'memory'>('sources')
  const [selectedMemorySourceId, setSelectedMemorySourceId] = useState<string | null>(null)
  const [isAddSourceExpanded, setIsAddSourceExpanded] = useState(true)
  const [guidedStep, setGuidedStep] = useState(1)
  const [hoveredGuideStep, setHoveredGuideStep] = useState<number | null>(null)
  const [progressMode, setProgressMode] = useState<KnowledgeProgressMode>(null)
  const [progressKey, setProgressKey] = useState<KnowledgeProgressKey>('validatingInput')
  const [progressDetail, setProgressDetail] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null)
  const [progressElapsedSeconds, setProgressElapsedSeconds] = useState(0)
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<ProjectKnowledgeImportJob | null>(null)

  const fetchKnowledge = useCallback(async () => {
    if (!projectId) {
      return
    }

    const [baselineData, sourceData, memoryData] = await Promise.all([
      get<ProjectKnowledgeBaseline>(`/projects/${projectId}/knowledge/baseline`),
      get<ProjectKnowledgeSource[]>(`/projects/${projectId}/knowledge/sources`),
      get<ProjectMemoryItem[]>(`/projects/${projectId}/knowledge/memory`),
    ])

    if (baselineData) {
      setBaseline(baselineData)
    }
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

  const sortedMemoryItems = useMemo(() => {
    return [...memoryItems].sort((left, right) => {
      const leftTime = left.approvedAt ?? ''
      const rightTime = right.approvedAt ?? ''
      if (leftTime !== rightTime) {
        return rightTime.localeCompare(leftTime)
      }
      return left.title.localeCompare(right.title, i18n.language)
    })
  }, [memoryItems, i18n.language])

  const pendingSources = useMemo(
    () => sources.filter((source) => source.status === 'EXTRACTED'),
    [sources],
  )

  const librarySources = useMemo(
    () => sources.filter((source) => source.status !== 'EXTRACTED'),
    [sources],
  )

  const librarySourcesPagination = useMemo(
    () => paginateItems(librarySources, sourcesPage),
    [librarySources, sourcesPage],
  )

  const memorySourceGroups = useMemo(
    () => groupMemoryItemsBySource(sortedMemoryItems),
    [sortedMemoryItems],
  )

  const selectedMemorySource = useMemo(
    () => memorySourceGroups.find((group) => group.sourceId === selectedMemorySourceId) ?? null,
    [memorySourceGroups, selectedMemorySourceId],
  )

  const selectedMemoryTypeGroups = useMemo(
    () => (
      selectedMemorySource
        ? groupMemoryItemsByType(
            selectedMemorySource.items,
            (type) => t(`projectKnowledge.memoryTypes.${type}`),
          )
        : []
    ),
    [selectedMemorySource, t],
  )

  useEffect(() => {
    if (
      selectedMemorySourceId &&
      !memorySourceGroups.some((group) => group.sourceId === selectedMemorySourceId)
    ) {
      setSelectedMemorySourceId(null)
    }
  }, [memorySourceGroups, selectedMemorySourceId])

  useEffect(() => {
    if (pendingSources.length > 0) {
      setLibraryTab('sources')
    }
  }, [pendingSources.length])

  useEffect(() => {
    if (sourcesPage > librarySourcesPagination.totalPages) {
      setSourcesPage(librarySourcesPagination.totalPages)
    }
  }, [sourcesPage, librarySourcesPagination.totalPages])

  const guidedSteps = useMemo(
    () => [
      {
        title: t('projectKnowledge.guide.steps.step1.title'),
        description: t('projectKnowledge.guide.steps.step1.description'),
      },
      {
        title: t('projectKnowledge.guide.steps.step2.title'),
        description: t('projectKnowledge.guide.steps.step2.description'),
      },
      {
        title: t('projectKnowledge.guide.steps.step3.title'),
        description: t('projectKnowledge.guide.steps.step3.description'),
      },
    ],
    [t],
  )

  const stepOneComplete = sources.length > 0 || contentText.trim().length >= 20 || selectedFiles.length > 0
  const stepTwoComplete = sources.some(
    (source) =>
      (source.extractions?.length ?? 0) > 0 ||
      source.status === 'EXTRACTED' ||
      source.status === 'REVIEWED' ||
      source.status === 'APPROVED',
  )
  const stepThreeComplete =
    (baseline?.approvedMemoryCount ?? 0) > 0 ||
    memoryItems.some((item) => item.status === 'APPROVED')

  const baselineReady = baseline?.status === 'BASELINE_READY'

  useEffect(() => {
    if (baselineReady) {
      setIsAddSourceExpanded(false)
    }
  }, [baselineReady])

  useEffect(() => {
    if (selectedFiles.length > 0 || isImporting || contentText.trim().length >= 20) {
      setIsAddSourceExpanded(true)
    }
  }, [selectedFiles.length, isImporting, contentText])

  const activeGuideStep = hoveredGuideStep ?? guidedStep
  const activeGuideStepData = guidedSteps[activeGuideStep - 1] ?? guidedSteps[0]

  const progressSteps = useMemo(() => {
    if (!progressMode) {
      return []
    }

    return progressFlowByMode[progressMode].map((key) => ({
      key,
      label: t(`projectKnowledge.progress.steps.${key}`),
    }))
  }, [progressMode, t])

  useEffect(() => {
    if (!progressMode || progressKey === 'completed' || progressKey === 'failed') {
      return
    }

    const timer = window.setInterval(() => {
      if (progressStartedAt) {
        setProgressElapsedSeconds(Math.floor((Date.now() - progressStartedAt) / 1000))
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [progressKey, progressMode, progressStartedAt])

  const progressPanelExtras = useMemo(() => {
    const elapsedLabel = progressStartedAt
      ? t('projectKnowledge.progress.elapsed', {
          duration: formatKnowledgeDuration(progressElapsedSeconds, t),
        })
      : undefined

    const etaMs = estimateKnowledgeEtaMs(
      progressElapsedSeconds * 1000,
      activeJobSnapshot?.currentChunk,
      activeJobSnapshot?.totalChunks,
    )
    const etaLabel = etaMs !== null
      ? t('projectKnowledge.progress.eta', {
          duration: formatKnowledgeDuration(Math.ceil(etaMs / 1000), t),
        })
      : progressMode === 'import' || progressMode === 'extract'
        ? t('projectKnowledge.progress.etaUnknown')
        : undefined

    const stats = activeJobSnapshot?.totalChunks
      ? [
          {
            label: t('projectKnowledge.progress.stats.currentChunk'),
            value: `${activeJobSnapshot.currentChunk ?? 0} / ${activeJobSnapshot.totalChunks}`,
          },
          {
            label: t('projectKnowledge.progress.stats.remaining'),
            value: String(
              Math.max(
                0,
                activeJobSnapshot.totalChunks - (activeJobSnapshot.currentChunk ?? 0),
              ),
            ),
          },
          {
            label: t('projectKnowledge.progress.stats.successful'),
            value: String(activeJobSnapshot.successfulChunks ?? activeJobSnapshot.currentChunk ?? 0),
          },
        ]
      : undefined

    const chunkPercent = buildChunkSubProgress(activeJobSnapshot ?? undefined)
    const subProgress = chunkPercent !== null
      ? {
          label: t('projectKnowledge.progress.chunkBar'),
          percent: chunkPercent,
        }
      : undefined

    return { elapsedLabel, etaLabel, stats, subProgress }
  }, [
    activeJobSnapshot,
    progressElapsedSeconds,
    progressMode,
    progressStartedAt,
    t,
  ])

  const beginProgress = (mode: Exclude<KnowledgeProgressMode, null>) => {
    setProgressStartedAt(Date.now())
    setProgressElapsedSeconds(0)
    setActiveJobSnapshot(null)
    setProgressMode(mode)
  }

  const updateProgress = (
    mode: Exclude<KnowledgeProgressMode, null>,
    key: KnowledgeProgressKey,
    detail?: string,
    percent?: number,
    job?: ProjectKnowledgeImportJob | null,
  ) => {
    setProgressMode(mode)
    setProgressKey(key)
    if (job !== undefined) {
      setActiveJobSnapshot(job)
    }
    if (detail !== undefined) {
      setProgressDetail(detail)
    }
    if (percent !== undefined) {
      setProgressPercent(percent)
    } else if (key === 'completed') {
      setProgressPercent(100)
    } else if (key === 'failed') {
      setProgressPercent(0)
    } else {
      const flow = progressFlowByMode[mode]
      const index = flow.indexOf(key)
      setProgressPercent(index >= 0 ? Math.max(5, (index / flow.length) * 100) : 5)
    }
  }

  const waitForKnowledgeJob = async (
    mode: 'import' | 'extract',
    jobId: string,
    fallbackName: string,
  ) => {
    while (true) {
      const job = await get<ProjectKnowledgeImportJob>(`/projects/${projectId}/knowledge/import-jobs/${jobId}`)
      if (!job) {
        throw new Error(t('projectKnowledge.importFailed'))
      }

      if (job.status === 'failed') {
        throw new Error(job.error || t('projectKnowledge.importFailed'))
      }

      if (job.status === 'completed') {
        updateProgress(mode, 'completed', job.detail || fallbackName, 100, null)
        return job
      }

      const progressKey = mapJobStageToProgressKey(job.stage)
      const detail = buildKnowledgeJobDetail(job, fallbackName, t)
      const percent = computeKnowledgeProgressPercent(progressKey, job)

      updateProgress(mode, progressKey, detail, percent, job)
      await wait(1000)
    }
  }

  if (!projectId) {
    return <Navigate to="/projects" replace />
  }

  const handleCreateSource = async () => {
    const cleanTitle = title.trim()
    const cleanContent = contentText.trim()

    beginProgress('save')
    updateProgress('save', 'validatingInput')

    if (cleanTitle.length < 2 || cleanContent.length < 20) {
      setNotice(t('projectKnowledge.validation'))
      updateProgress('save', 'failed')
      return
    }

    setNotice('')
    updateProgress('save', 'savingSource', cleanTitle)

    const created = await post<ProjectKnowledgeSource>(`/projects/${projectId}/knowledge/sources`, {
      sourceType,
      title: cleanTitle,
      contentText: cleanContent,
      documentDate: documentDate ? new Date(documentDate).toISOString() : undefined,
      versionLabel: versionLabel.trim() || undefined,
      authorityLevel,
    })

    if (created) {
      setTitle('')
      setDocumentDate('')
      setVersionLabel('')
      setContentText('')
      setNotice(t('projectKnowledge.sourceCreated'))
      setGuidedStep(2)
      updateProgress('save', 'completed', cleanTitle)
      await fetchKnowledge()
      return
    }

    updateProgress('save', 'failed', cleanTitle)
  }

  const handleImportFiles = async () => {
    if (!selectedFiles.length) {
      setNotice(t('projectKnowledge.selectFilesFirst'))
      return
    }

    setIsImporting(true)
    setNotice('')
    beginProgress('import')
    updateProgress('import', 'validatingInput', t('projectKnowledge.progress.fileCount', { count: selectedFiles.length }), 5)

    try {
      let importedCount = 0
      const failedFiles: string[] = []

      for (const file of selectedFiles) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('sourceType', sourceType)
          formData.append('authorityLevel', authorityLevel)
          if (versionLabel.trim()) {
            formData.append('versionLabel', versionLabel.trim())
          }
          const importTitle = title.trim() || deriveTitleFromFileName(file.name)
          if (importTitle.length >= 2) {
            formData.append('title', importTitle.slice(0, 180))
          }
          if (documentDate) {
            formData.append('documentDate', new Date(documentDate).toISOString())
          } else if (file.lastModified) {
            formData.append('documentDate', new Date(file.lastModified).toISOString())
          }

          updateProgress('import', 'uploadingFile', file.name, 15)
          const job = await postFormData<ProjectKnowledgeImportJob>(
            `/projects/${projectId}/knowledge/sources/import-jobs`,
            formData,
            {
              onUploadComplete: () => updateProgress('import', 'readingFile', file.name, 22),
            },
          )

          await waitForKnowledgeJob('import', job.id, file.name)
          importedCount += 1
        } catch (fileError) {
          failedFiles.push(formatFileErrorMessage(file.name, describeFileProcessingError(file, fileError, t)))
        }
      }

      setSelectedFiles([])
      if (failedFiles.length) {
        const summary = importedCount > 0
          ? t('projectKnowledge.filesImportedWithFailures', { successCount: importedCount, failedCount: failedFiles.length })
          : t('projectKnowledge.filesAllFailed', { failedCount: failedFiles.length })
        setNotice([summary, ...failedFiles].join('\n'))
      } else {
        setNotice(t('projectKnowledge.filesImported', { count: importedCount }))
      }

      if (importedCount > 0) {
        setGuidedStep(2)
        updateProgress('import', 'completed', undefined, 100)
      } else {
        updateProgress('import', 'failed')
      }

      await fetchKnowledge()
    } catch (uploadError) {
      setNotice(uploadError instanceof Error ? uploadError.message : t('projectKnowledge.importFailed'))
      updateProgress('import', 'failed')
    } finally {
      setIsImporting(false)
    }
  }

  const handleExtract = async (sourceId: string) => {
    const source = sources.find((item) => item.id === sourceId)
    beginProgress('extract')
    updateProgress('extract', 'validatingInput', source?.title, 3)
    setNotice('')

    try {
      const job = await post<ProjectKnowledgeImportJob>(
        `/projects/${projectId}/knowledge/sources/${sourceId}/extract-jobs`,
        {},
      )

      if (!job) {
        throw new Error(t('projectKnowledge.extractFailed'))
      }

      await waitForKnowledgeJob('extract', job.id, source?.title ?? t('projectKnowledge.source'))
      setNotice(t('projectKnowledge.extracted'))
      setGuidedStep(2)
      await fetchKnowledge()
    } catch (extractError) {
      setNotice(extractError instanceof Error ? extractError.message : t('projectKnowledge.extractFailed'))
      updateProgress('extract', 'failed', source?.title, 0, null)
    }
  }

  const handleApprove = async (sourceId: string) => {
    const source = sources.find((item) => item.id === sourceId)
    updateProgress('approve', 'reviewingExtraction', source?.title)
    setNotice('')
    updateProgress('approve', 'savingToMemory', source?.title)

    const result = await post(`/projects/${projectId}/knowledge/sources/${sourceId}/approve`)
    if (result) {
      setNotice(t('projectKnowledge.approved'))
      setGuidedStep(3)
      updateProgress('approve', 'completed', source?.title)
      await fetchKnowledge()
      return
    }

    updateProgress('approve', 'failed', source?.title)
  }

  const handleFileSelection = (files: File[]) => {
    setSelectedFiles(files)

    const firstFile = files[0]
    if (!firstFile) {
      return
    }

    if (!title.trim()) {
      setTitle(deriveTitleFromFileName(firstFile.name).slice(0, 180))
    }

    if (!documentDate) {
      setDocumentDate(toDateInputValue(firstFile.lastModified))
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-300">
              {t('common.appName')}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {t('projectKnowledge.title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              {t('projectKnowledge.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/continuity/${projectId}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('projectKnowledge.openContinuity')}
            </Link>
            <Link
              to="/projects"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('navigation.projects')}
            </Link>
          </div>
        </div>

        {baseline && (
          <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('projectKnowledge.baselineStatus')}
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                {t(`projectKnowledge.status.${baseline.status}`)}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {baseline.projectName}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('projectKnowledge.approvedMemory')}</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{baseline.approvedMemoryCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('projectKnowledge.needsReview')}</p>
              <p className="mt-2 text-3xl font-bold text-amber-600">{baseline.needsReviewCount}</p>
            </div>
          </section>
        )}

        <section className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300">
              {t('projectKnowledge.guide.label')}
            </p>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
              {t('common.step', { current: guidedStep, total: 3 })}
            </span>
          </div>

          <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {guidedSteps.map((step, index) => {
              const stepNumber = index + 1
              const isActive = guidedStep === stepNumber
              const isComplete = [stepOneComplete, stepTwoComplete, stepThreeComplete][index]

              return (
                <li key={step.title}>
                  <button
                    type="button"
                    onClick={() => setGuidedStep(stepNumber)}
                    onMouseEnter={() => setHoveredGuideStep(stepNumber)}
                    onMouseLeave={() => setHoveredGuideStep(null)}
                    onFocus={() => setHoveredGuideStep(stepNumber)}
                    onBlur={() => setHoveredGuideStep(null)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      isActive
                        ? 'border-sky-400 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900'
                        : 'border-sky-100 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isComplete
                          ? 'bg-emerald-500 text-white'
                          : isActive
                            ? 'bg-sky-600 text-white'
                            : 'bg-sky-100 text-sky-700 dark:bg-slate-800 dark:text-sky-300'
                      }`}
                    >
                      {isComplete ? '✓' : stepNumber}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t('common.step', { current: stepNumber, total: 3 })}
                      </span>
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {step.title}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-sky-900/50 dark:bg-slate-900 dark:text-slate-200">
            <p className="font-semibold text-slate-900 dark:text-white">{activeGuideStepData.title}</p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{activeGuideStepData.description}</p>
          </div>
        </section>

        {progressMode && progressSteps.length > 0 && (
          <div className="mb-5">
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

        {(notice || error) && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'
          } whitespace-pre-line`}>
            {error?.message || notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            {baselineReady ? (
              <button
                type="button"
                onClick={() => setIsAddSourceExpanded((current) => !current)}
                className="flex w-full items-start justify-between gap-3 text-left"
                aria-expanded={isAddSourceExpanded}
              >
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t('projectKnowledge.addSource')}
                  </h2>
                  <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                    {t('projectKnowledge.addSourceCollapsedHint')}
                  </p>
                </div>
                <ChevronRight
                  className={`mt-1 h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${isAddSourceExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('projectKnowledge.addSource')}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {t('projectKnowledge.addSourceHelp')}
                </p>
              </>
            )}

            {(!baselineReady || isAddSourceExpanded) && (
              <>
            {baselineReady && (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                {t('projectKnowledge.addSourceHelp')}
              </p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.sourceType')}</span>
                <select
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value as ProjectKnowledgeSourceType)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  {sourceTypes.map((type) => (
                    <option key={type} value={type}>{t(`projectKnowledge.sourceTypes.${type}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.authority')}</span>
                <select
                  value={authorityLevel}
                  onChange={(event) => setAuthorityLevel(event.target.value as ProjectKnowledgeAuthorityLevel)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  {authorityLevels.map((level) => (
                    <option key={level} value={level}>{t(`projectKnowledge.authorityLevels.${level}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.fileUpload')}</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.tsv,.docx,.pdf,.xlsx"
                  onChange={(event) => handleFileSelection(Array.from(event.target.files ?? []))}
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 dark:text-slate-300"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('projectKnowledge.fileUploadHelp')}
                </p>
                {!!selectedFiles.length && (
                  <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {selectedFiles.map((file) => (
                      <div key={`${file.name}-${file.lastModified}`}>
                        {file.name} · {new Date(file.lastModified).toLocaleDateString(i18n.language)}
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.versionLabel')}</span>
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder="v1.0"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void handleImportFiles()}
                  disabled={isLoading || isImporting}
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImporting ? t('common.loading') : t('projectKnowledge.importFiles')}
                </button>
              </div>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.sourceTitle')}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder={t('projectKnowledge.sourceTitlePlaceholder')}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.documentDate')}</span>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <div className="hidden sm:block" />
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.contentText')}</span>
                <textarea
                  value={contentText}
                  onChange={(event) => setContentText(event.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder={t('projectKnowledge.contentPlaceholder')}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateSource()}
              disabled={isLoading || isImporting}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? t('common.loading') : t('projectKnowledge.saveSource')}
            </button>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('projectKnowledge.libraryTitle')}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLibraryTab('sources')
                    setSelectedMemorySourceId(null)
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    libraryTab === 'sources'
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('projectKnowledge.tabSources')}
                  {pendingSources.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                      {pendingSources.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryTab('memory')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    libraryTab === 'memory'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('projectKnowledge.tabMemory')}
                  {memoryItems.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                      {memoryItems.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {libraryTab === 'sources' ? (
              <div className="mt-4 space-y-4">
                {pendingSources.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      {t('projectKnowledge.pendingReviewQueue')}
                    </p>
                    {pendingSources.map((source) => {
                      const latestExtraction = source.extractions?.[0]
                      const extractedCount = latestExtraction?.extractionJson.items?.length ?? 0

                      return (
                        <article
                          key={source.id}
                          className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-slate-900 dark:text-white">{source.title}</h3>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                {buildSourceMeta([
                                  t(`projectKnowledge.sourceTypes.${source.sourceType}`),
                                  t(`projectKnowledge.authorityLevels.${source.authorityLevel}`),
                                  source.documentDate ? new Date(source.documentDate).toLocaleDateString(i18n.language) : null,
                                ])}
                              </p>
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                {t('projectKnowledge.extractedItems', { count: extractedCount })}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleApprove(source.id)}
                              disabled={isLoading || isImporting || !latestExtraction}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {t('projectKnowledge.approveBaseline')}
                            </button>
                          </div>
                          {latestExtraction?.extractionJson.overview && (
                            <p className="mt-3 rounded-lg bg-white/80 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                              {latestExtraction.extractionJson.overview}
                            </p>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}

                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {t('projectKnowledge.allSources')}
                  </p>
                  <div className="space-y-2">
                    {librarySourcesPagination.slice.map((source) => {
                      const latestExtraction = source.extractions?.[0]
                      const extractedCount = latestExtraction?.extractionJson.items?.length ?? 0
                      const isExpanded = expandedSourceIds.has(source.id)

                      return (
                        <div key={source.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => toggleExpandedId(setExpandedSourceIds, source.id)}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            aria-expanded={isExpanded}
                          >
                            <ChevronRight
                              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-white">
                              {source.title}
                            </span>
                            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {t(`projectKnowledge.sourceStatuses.${source.status}`)}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {buildSourceMeta([
                                  t(`projectKnowledge.sourceTypes.${source.sourceType}`),
                                  t(`projectKnowledge.authorityLevels.${source.authorityLevel}`),
                                  source.documentDate ? new Date(source.documentDate).toLocaleDateString(i18n.language) : null,
                                ])}
                              </p>
                              {latestExtraction && (
                                <div className="mt-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800/80">
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {t('projectKnowledge.draftPreview')}
                                  </p>
                                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                                    {t('projectKnowledge.extractedItems', { count: extractedCount })}
                                  </p>
                                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {t('projectKnowledge.overview')}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                    {latestExtraction.extractionJson.overview}
                                  </p>
                                </div>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleExtract(source.id)}
                                  disabled={isLoading || isImporting}
                                  className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-950/30"
                                >
                                  {t('projectKnowledge.extract')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleApprove(source.id)}
                                  disabled={isLoading || isImporting || !latestExtraction}
                                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {t('projectKnowledge.approveBaseline')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!sources.length && (
                      <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        {t('projectKnowledge.noSources')}
                      </p>
                    )}
                  </div>
                  <HistoryPagination
                    page={librarySourcesPagination.page}
                    totalPages={librarySourcesPagination.totalPages}
                    total={librarySourcesPagination.total}
                    onPrevious={() => setSourcesPage((current) => Math.max(1, current - 1))}
                    onNext={() => setSourcesPage((current) => Math.min(librarySourcesPagination.totalPages, current + 1))}
                    previousLabel={t('common.back')}
                    nextLabel={t('common.next')}
                    rangeLabel={t('projectKnowledge.paginationRange', {
                      from: librarySourcesPagination.from,
                      to: librarySourcesPagination.to,
                      total: librarySourcesPagination.total,
                    })}
                  />
                </div>
              </div>
            ) : memoryItems.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                {t('projectKnowledge.noMemory')}
              </p>
            ) : selectedMemorySource ? (
              <div className="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={() => setSelectedMemorySourceId(null)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('projectKnowledge.backToFiles')}
                </button>

                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-200">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedMemorySource.title || t('projectKnowledge.uncategorizedSource')}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {t('projectKnowledge.itemsInFile', { count: selectedMemorySource.items.length })}
                        {selectedMemorySource.documentDate && (
                          <>
                            {' · '}
                            {new Date(selectedMemorySource.documentDate).toLocaleDateString(i18n.language)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedMemoryTypeGroups.map((group) => (
                    <div
                      key={group.key}
                      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40"
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
                            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <p className="font-medium text-slate-900 dark:text-white">{item.title}</p>
                            <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                              {item.content}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('projectKnowledge.groupByFileHint')}
                </p>
                {memorySourceGroups.map((group) => (
                  <button
                    key={group.sourceId}
                    type="button"
                    onClick={() => setSelectedMemorySourceId(group.sourceId)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-emerald-800"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">
                          {group.title || t('projectKnowledge.uncategorizedSource')}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {t('projectKnowledge.itemsInFile', { count: group.items.length })}
                          {group.documentDate && (
                            <>
                              {' · '}
                              {new Date(group.documentDate).toLocaleDateString(i18n.language)}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  )
}
