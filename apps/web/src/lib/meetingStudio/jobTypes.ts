import type { ChecklistItem } from './shared'

export type MeetingStudioJobProgressKey =
  | 'validatingInput'
  | 'uploadingRecording'
  | 'transcribingRecording'
  | 'analyzingRecording'
  | 'mappingToTemplate'
  | 'completed'
  | 'failed'

export type MeetingStudioJobStatus = 'idle' | 'running' | 'completed' | 'failed'

export type MeetingStudioJobResult = {
  transcript: string
  summary: string
  template: {
    objective?: string
    consultantNotes?: string
    decisions?: string
    risks?: string
    nextSteps?: string
  }
  checklistItems: ChecklistItem[]
  recordingInfo: string
  statusMessage: string
  guidedStep: 2 | 3
  transcriptionOnly: boolean
}

export type MeetingStudioJobMessages = {
  uploadFailed: string
  transcriptionFailed: string
  transcriptionUnavailable: string
  documentAnalysisFailed: string
  transcribed: string
  recordingAnalyzed: string
  uploadedOnly: string
}

export const AUDIO_PROGRESS_FLOW: MeetingStudioJobProgressKey[] = [
  'validatingInput',
  'uploadingRecording',
  'transcribingRecording',
  'analyzingRecording',
  'mappingToTemplate',
  'completed'
]

export function progressPercent(progressKey: MeetingStudioJobProgressKey) {
  const index = AUDIO_PROGRESS_FLOW.indexOf(progressKey)
  if (index < 0) {
    return progressKey === 'failed' ? 0 : 5
  }

  return Math.round(((index + 1) / AUDIO_PROGRESS_FLOW.length) * 100)
}
