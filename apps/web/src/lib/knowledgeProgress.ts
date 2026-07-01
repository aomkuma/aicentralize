import type { ProjectKnowledgeImportJob } from '../types'
import type { TFunction } from 'i18next'

export type KnowledgeProgressKey =
  | 'validatingInput'
  | 'uploadingFile'
  | 'readingFile'
  | 'savingSource'
  | 'aiExtracting'
  | 'reviewingExtraction'
  | 'savingToMemory'
  | 'completed'
  | 'failed'

export function formatKnowledgeDuration(totalSeconds: number, t: TFunction) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) {
    return t('projectKnowledge.progress.durationSeconds', { count: seconds })
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (remainder === 0) {
    return t('projectKnowledge.progress.durationMinutes', { count: minutes })
  }

  return t('projectKnowledge.progress.durationMinutesSeconds', { minutes, seconds: remainder })
}

export function mapJobStageToProgressKey(
  stage: ProjectKnowledgeImportJob['stage'],
): KnowledgeProgressKey {
  switch (stage) {
    case 'readingFile':
      return 'readingFile'
    case 'savingSource':
      return 'savingSource'
    case 'extracting':
      return 'aiExtracting'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    default:
      return 'readingFile'
  }
}

export function computeKnowledgeProgressPercent(
  key: KnowledgeProgressKey,
  job?: Pick<ProjectKnowledgeImportJob, 'currentChunk' | 'totalChunks'>,
) {
  switch (key) {
    case 'validatingInput':
      return 3
    case 'uploadingFile':
      return 12
    case 'readingFile':
      return 24
    case 'savingSource':
      return 34
    case 'aiExtracting':
      if (job?.totalChunks && job.totalChunks > 0) {
        const current = Math.max(0, job.currentChunk ?? 0)
        return 38 + (current / job.totalChunks) * 57
      }
      return 42
    case 'reviewingExtraction':
      return 55
    case 'savingToMemory':
      return 80
    case 'completed':
      return 100
    case 'failed':
      return 0
    default:
      return 5
  }
}

export function estimateKnowledgeEtaMs(
  elapsedMs: number,
  currentChunk?: number,
  totalChunks?: number,
) {
  if (!totalChunks || totalChunks <= 0 || !currentChunk || currentChunk <= 0 || elapsedMs < 3000) {
    return null
  }

  const msPerChunk = elapsedMs / currentChunk
  const remainingChunks = Math.max(0, totalChunks - currentChunk)
  return Math.round(msPerChunk * remainingChunks)
}

export function buildChunkSubProgress(
  job?: Pick<ProjectKnowledgeImportJob, 'currentChunk' | 'totalChunks'>,
) {
  if (!job?.totalChunks || job.totalChunks <= 0) {
    return null
  }

  const current = Math.max(0, job.currentChunk ?? 0)
  return Math.min(100, Math.round((current / job.totalChunks) * 100))
}

export function buildKnowledgeJobDetail(
  job: ProjectKnowledgeImportJob,
  fallbackName: string,
  t: TFunction,
) {
  const name = job.detail || job.fileName || fallbackName

  if (job.stage === 'extracting' && job.totalChunks) {
    const current = job.currentChunk ?? 0
    const remaining = Math.max(0, job.totalChunks - current)
    return t('projectKnowledge.progress.chunkDetail', {
      name,
      current,
      total: job.totalChunks,
      remaining,
    })
  }

  if (job.stage === 'readingFile') {
    return t('projectKnowledge.progress.readingDetail', { name })
  }

  if (job.stage === 'savingSource') {
    return t('projectKnowledge.progress.savingDetail', { name })
  }

  return name
}
