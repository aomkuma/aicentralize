import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildKnowledgeJobDetail,
  computeKnowledgeProgressPercent,
  estimateKnowledgeEtaMs,
  formatKnowledgeDuration,
  mapJobStageToProgressKey,
  type KnowledgeProgressKey,
} from '../lib/knowledgeProgress'
import { deriveTitleFromFileName } from '../lib/personalKnowledge'
import { useApi } from './useApi'
import type { ProjectKnowledgeImportJob } from '../types'

export type KnowledgeFlowMode = 'import' | 'approve' | null

const progressFlowByMode: Record<Exclude<KnowledgeFlowMode, null>, KnowledgeProgressKey[]> = {
  import: ['validatingInput', 'uploadingFile', 'readingFile', 'savingSource', 'aiExtracting', 'completed'],
  approve: ['reviewingExtraction', 'savingToMemory', 'completed'],
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function describeFileProcessingError(file: File, error: unknown, t: (key: string) => string) {
  const apiError = error as { message?: string; data?: { message?: string; code?: string } }
  const message = apiError.data?.message ?? (error instanceof Error ? error.message : '')
  const code = apiError.data?.code ?? ''

  if (code === 'PDF_NO_TEXT' || message.includes('image-only')) {
    return t('projectKnowledge.fileReadErrors.pdfImageOnly')
  }
  if (code === 'UNSUPPORTED_FILE_TYPE') {
    return t('projectKnowledge.fileReadErrors.unsupportedType')
  }
  return message || t('projectKnowledge.importFailed')
}

export function useKnowledgeImportFlow(projectId?: string) {
  const { t } = useTranslation()
  const { get, post, postFormData } = useApi()

  const [progressMode, setProgressMode] = useState<KnowledgeFlowMode>(null)
  const [progressKey, setProgressKey] = useState<KnowledgeProgressKey>('validatingInput')
  const [progressDetail, setProgressDetail] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null)
  const [progressElapsedSeconds, setProgressElapsedSeconds] = useState(0)
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<ProjectKnowledgeImportJob | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const beginProgress = useCallback((mode: Exclude<KnowledgeFlowMode, null>) => {
    setProgressStartedAt(Date.now())
    setProgressElapsedSeconds(0)
    setActiveJobSnapshot(null)
    setProgressMode(mode)
    setProgressPercent(5)
  }, [])

  const updateProgress = useCallback((
    mode: Exclude<KnowledgeFlowMode, null>,
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
  }, [])

  const waitForKnowledgeJob = useCallback(async (
    mode: 'import',
    jobId: string,
    fallbackName: string,
  ) => {
    if (!projectId) {
      throw new Error(t('projectKnowledge.importFailed'))
    }

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
  }, [get, projectId, t, updateProgress])

  const importFiles = useCallback(async (
    files: File[],
    options?: { title?: string; documentDate?: string },
  ) => {
    if (!projectId || !files.length) {
      return { importedCount: 0, failedFiles: [] as string[], notice: t('projectKnowledge.selectFilesFirst') }
    }

    setIsImporting(true)
    beginProgress('import')
    updateProgress('import', 'validatingInput', t('projectKnowledge.progress.fileCount', { count: files.length }), 5)

    let importedCount = 0
    const failedFiles: string[] = []

    try {
      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('sourceType', 'TECHNICAL_NOTE')
          formData.append('authorityLevel', 'AUTHORITATIVE')
          const importTitle = options?.title?.trim() || deriveTitleFromFileName(file.name)
          if (importTitle.length >= 2) {
            formData.append('title', importTitle.slice(0, 180))
          }
          const documentDate = options?.documentDate
            ?? (file.lastModified ? new Date(file.lastModified).toISOString() : undefined)
          if (documentDate) {
            formData.append('documentDate', documentDate)
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
          failedFiles.push(`${file.name}: ${describeFileProcessingError(file, fileError, t)}`)
        }
      }

      if (importedCount > 0) {
        updateProgress('import', 'completed', undefined, 100)
      } else {
        updateProgress('import', 'failed')
      }

      const notice = failedFiles.length
        ? (importedCount > 0
          ? t('projectKnowledge.filesImportedWithFailures', { successCount: importedCount, failedCount: failedFiles.length })
          : t('projectKnowledge.filesAllFailed', { failedCount: failedFiles.length }))
        : t('projectKnowledge.filesImported', { count: importedCount })

      return { importedCount, failedFiles, notice: failedFiles.length ? [notice, ...failedFiles].join('\n') : notice }
    } catch (error) {
      updateProgress('import', 'failed')
      return {
        importedCount,
        failedFiles,
        notice: error instanceof Error ? error.message : t('projectKnowledge.importFailed'),
      }
    } finally {
      setIsImporting(false)
    }
  }, [beginProgress, postFormData, projectId, t, updateProgress, waitForKnowledgeJob])

  const approveSource = useCallback(async (sourceId: string, sourceTitle?: string) => {
    if (!projectId) {
      return false
    }

    beginProgress('approve')
    updateProgress('approve', 'reviewingExtraction', sourceTitle)
    updateProgress('approve', 'savingToMemory', sourceTitle)

    const result = await post(`/projects/${projectId}/knowledge/sources/${sourceId}/approve`)
    if (result) {
      updateProgress('approve', 'completed', sourceTitle)
      return true
    }

    updateProgress('approve', 'failed', sourceTitle)
    return false
  }, [beginProgress, post, projectId, updateProgress])

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
      : (progressKey === 'aiExtracting' || progressKey === 'readingFile')
        ? t('projectKnowledge.progress.etaUnknown')
        : undefined

    const stats = activeJobSnapshot?.totalChunks
      ? [
          {
            label: t('projectKnowledge.progress.stats.currentChunk'),
            value: `${activeJobSnapshot.currentChunk} / ${activeJobSnapshot.totalChunks}`,
          },
          {
            label: t('projectKnowledge.progress.stats.remaining'),
            value: String(Math.max(0, (activeJobSnapshot.totalChunks ?? 0) - (activeJobSnapshot.currentChunk ?? 0))),
          },
          {
            label: t('projectKnowledge.progress.stats.successful'),
            value: String(activeJobSnapshot.successfulChunks ?? 0),
          },
        ]
      : undefined

    const subProgress = activeJobSnapshot?.totalChunks
      ? {
          label: t('projectKnowledge.progress.chunkBar'),
          percent: Math.min(
            100,
            Math.round(((activeJobSnapshot.currentChunk ?? 0) / activeJobSnapshot.totalChunks) * 100),
          ),
        }
      : undefined

    return { elapsedLabel, etaLabel, stats, subProgress }
  }, [activeJobSnapshot, progressElapsedSeconds, progressKey, progressStartedAt, t])

  const progressSteps = useMemo(() => {
    if (!progressMode) {
      return []
    }

    return progressFlowByMode[progressMode].map((key) => ({
      key,
      label: t(`projectKnowledge.progress.steps.${key}`),
    }))
  }, [progressMode, t])

  return {
    isImporting,
    progressMode,
    progressKey,
    progressDetail,
    progressPercent,
    progressPanelExtras,
    progressSteps,
    importFiles,
    approveSource,
  }
}
