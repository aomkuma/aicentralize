import type { TFunction } from 'i18next'

export type MeetingDocProgressKey =
  | 'validatingInput'
  | 'extractingDocumentText'
  | 'analyzingDocumentWithAI'
  | 'mappingToTemplate'
  | 'completed'
  | 'failed'

export function computeMeetingDocProgressPercent(
  key: MeetingDocProgressKey,
  chunk?: { currentChunk: number; totalChunks: number },
) {
  switch (key) {
    case 'validatingInput':
      return 5
    case 'extractingDocumentText':
      return 18
    case 'analyzingDocumentWithAI':
      if (chunk?.totalChunks && chunk.totalChunks > 0) {
        return 25 + (chunk.currentChunk / chunk.totalChunks) * 62
      }
      return 30
    case 'mappingToTemplate':
      return 92
    case 'completed':
      return 100
    case 'failed':
      return 0
    default:
      return 5
  }
}

export function estimateMeetingChunkEtaMs(
  elapsedMs: number,
  currentChunk?: number,
  totalChunks?: number,
) {
  if (!totalChunks || totalChunks <= 0 || !currentChunk || currentChunk <= 0 || elapsedMs < 4000) {
    return null
  }

  const msPerChunk = elapsedMs / currentChunk
  return Math.round(msPerChunk * Math.max(0, totalChunks - currentChunk))
}

export function buildMeetingChunkDetail(
  fileName: string,
  chunk: { currentChunk: number; totalChunks: number },
  t: TFunction,
) {
  const remaining = Math.max(0, chunk.totalChunks - chunk.currentChunk)
  return t('meetings.progress.chunkDetail', {
    name: fileName,
    current: chunk.currentChunk,
    total: chunk.totalChunks,
    remaining,
  })
}
