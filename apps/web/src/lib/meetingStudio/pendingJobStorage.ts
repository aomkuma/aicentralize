import type { MeetingStudioJobResult } from './jobTypes'

const PENDING_JOB_KEY = 'meeting-studio-pending-job'

export type PersistedMeetingStudioJob = {
  projectId: string
  fileName: string
  result: MeetingStudioJobResult
  completedAt: number
}

export function persistPendingMeetingStudioJob(job: PersistedMeetingStudioJob) {
  try {
    sessionStorage.setItem(PENDING_JOB_KEY, JSON.stringify(job))
  } catch {
    // sessionStorage may be unavailable in private mode
  }
}

export function readPendingMeetingStudioJob(): PersistedMeetingStudioJob | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOB_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as PersistedMeetingStudioJob
    if (!parsed?.projectId || !parsed?.result) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function clearPendingMeetingStudioJob() {
  try {
    sessionStorage.removeItem(PENDING_JOB_KEY)
  } catch {
    // no-op
  }
}

export function isMeetingStudioJobResultEmpty(result: MeetingStudioJobResult) {
  return !result.transcript.trim() && !result.summary.trim() && result.checklistItems.length === 0
}
