import { create } from 'zustand'
import { isTranscriptionUnavailableError, runMeetingAudioJob } from '../lib/meetingStudio/audioJob'
import type {
  MeetingStudioJobMessages,
  MeetingStudioJobProgressKey,
  MeetingStudioJobResult,
  MeetingStudioJobStatus
} from '../lib/meetingStudio/jobTypes'
import { notifyMeetingJobComplete, requestMeetingJobNotificationPermission } from '../lib/meetingStudio/notifications'
import {
  clearPendingMeetingStudioJob,
  isMeetingStudioJobResultEmpty,
  persistPendingMeetingStudioJob,
  readPendingMeetingStudioJob
} from '../lib/meetingStudio/pendingJobStorage'
import type { OwnerOption } from '../lib/meetingStudio/shared'

type StartAudioJobInput = {
  file: File
  projectId: string
  preferredTranscript?: string
  ownerOptions: OwnerOption[]
  sessionAt: string
  messages: MeetingStudioJobMessages
  notificationTitle: string
  notificationBodySuccess: string
  notificationBodyFailed: string
}

type MeetingStudioJobStore = {
  status: MeetingStudioJobStatus
  progressKey: MeetingStudioJobProgressKey
  fileName: string
  projectId: string
  error: string | null
  result: MeetingStudioJobResult | null
  startedAt: number | null
  dismissed: boolean
  hydratePendingJob: () => void
  startAudioJob: (input: StartAudioJobInput) => void
  dismissBanner: () => void
  acknowledgeResult: () => MeetingStudioJobResult | null
  reset: () => void
}

function persistCompletedJob(projectId: string, fileName: string, result: MeetingStudioJobResult) {
  persistPendingMeetingStudioJob({
    projectId,
    fileName,
    result,
    completedAt: Date.now()
  })
}

export const useMeetingStudioJobStore = create<MeetingStudioJobStore>((set, get) => ({
  status: 'idle',
  progressKey: 'validatingInput',
  fileName: '',
  projectId: '',
  error: null,
  result: null,
  startedAt: null,
  dismissed: false,

  hydratePendingJob: () => {
    if (get().status !== 'idle') {
      return
    }

    const pending = readPendingMeetingStudioJob()
    if (!pending) {
      return
    }

    set({
      status: 'completed',
      progressKey: 'completed',
      fileName: pending.fileName,
      projectId: pending.projectId,
      result: pending.result,
      error: null,
      startedAt: pending.completedAt,
      dismissed: false
    })
  },

  startAudioJob: (input) => {
    if (get().status === 'running') {
      return
    }

    set({
      status: 'running',
      progressKey: 'validatingInput',
      fileName: input.file.name,
      projectId: input.projectId,
      error: null,
      result: null,
      startedAt: Date.now(),
      dismissed: false
    })
    clearPendingMeetingStudioJob()

    void requestMeetingJobNotificationPermission()

    void (async () => {
      try {
        const result = await runMeetingAudioJob({
          audioFile: input.file,
          preferredTranscript: input.preferredTranscript,
          ownerOptions: input.ownerOptions,
          sessionAt: input.sessionAt,
          messages: input.messages,
          onProgress: (progressKey) => set({ progressKey })
        })

        set({
          status: 'completed',
          progressKey: 'completed',
          result,
          error: null
        })

        persistCompletedJob(input.projectId, input.file.name, result)

        if (isMeetingStudioJobResultEmpty(result)) {
          notifyMeetingJobComplete(
            input.notificationTitle,
            input.messages.transcriptionUnavailable
          )
        } else {
          notifyMeetingJobComplete(
            input.notificationTitle,
            input.notificationBodySuccess.replace('{{fileName}}', input.file.name)
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : input.messages.transcriptionFailed
        const softComplete = isTranscriptionUnavailableError(message)

        if (softComplete) {
          const result = {
            transcript: '',
            summary: '',
            template: {},
            checklistItems: [],
            recordingInfo: input.file.name,
            statusMessage: input.messages.transcriptionUnavailable,
            guidedStep: 2 as const,
            transcriptionOnly: true
          }

          set({
            status: 'completed',
            progressKey: 'completed',
            result,
            error: null
          })
          persistCompletedJob(input.projectId, input.file.name, result)
          notifyMeetingJobComplete(
            input.notificationTitle,
            input.messages.transcriptionUnavailable
          )
          return
        }

        set({
          status: 'failed',
          progressKey: 'failed',
          error: message,
          result: null
        })

        notifyMeetingJobComplete(
          input.notificationTitle,
          input.notificationBodyFailed.replace('{{fileName}}', input.file.name)
        )
      }
    })()
  },

  dismissBanner: () => set({ dismissed: true }),

  acknowledgeResult: () => {
    const result = get().result
    if (!result) {
      return null
    }

    set({
      status: 'idle',
      progressKey: 'validatingInput',
      fileName: '',
      projectId: '',
      error: null,
      result: null,
      startedAt: null,
      dismissed: false
    })
    clearPendingMeetingStudioJob()

    return result
  },

  reset: () => {
    clearPendingMeetingStudioJob()
    set({
      status: 'idle',
      progressKey: 'validatingInput',
      fileName: '',
      projectId: '',
      error: null,
      result: null,
      startedAt: null,
      dismissed: false
    })
  }
}))
