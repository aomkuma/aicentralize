import {
  isTranscriptionGatewayError,
  isTranscriptionUnavailable,
  playgroundErrorMessage,
  playgroundResponseMessage,
  playgroundUrl,
  postPlaygroundFormData,
  readPlaygroundJson
} from '../playgroundApi'
import type {
  MeetingStudioJobMessages,
  MeetingStudioJobProgressKey,
  MeetingStudioJobResult
} from './jobTypes'
import { parseTranscriptSummary, toChecklistItems, type OwnerOption } from './shared'
import { buildTranscriptAnalysisPrompt } from './meetingAnalysisPrompt'

type AudioJobInput = {
  audioFile: File
  preferredTranscript?: string
  ownerOptions: OwnerOption[]
  sessionAt: string
  messages: MeetingStudioJobMessages
  onProgress: (key: MeetingStudioJobProgressKey) => void
}

export async function analyzeMeetingTranscriptFromText(
  text: string,
  sourceName: string,
  ownerOptions: OwnerOption[],
  sessionAt: string,
  messages: MeetingStudioJobMessages,
  onProgress: (key: MeetingStudioJobProgressKey) => void
): Promise<MeetingStudioJobResult> {
  const cleanText = text.trim()
  if (!cleanText) {
    throw new Error(messages.transcriptionFailed)
  }

  onProgress('analyzingRecording')

  const analysisResponse = await fetch('/ai/playground/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      prompt: buildTranscriptAnalysisPrompt(cleanText)
    })
  })

  const analysisData = await analysisResponse.json()
  if (!analysisResponse.ok) {
    throw new Error(analysisData.detail || analysisData.message || messages.documentAnalysisFailed)
  }

  const parsedSummary = parseTranscriptSummary(analysisData.output || '')
  onProgress('mappingToTemplate')

  if (!parsedSummary) {
    return {
      transcript: cleanText,
      summary: cleanText.slice(0, 240),
      template: {},
      checklistItems: [],
      recordingInfo: `${messages.transcribed}: ${sourceName}`,
      statusMessage: messages.transcribed,
      guidedStep: 2,
      transcriptionOnly: false
    }
  }

  return {
    transcript: cleanText,
    summary: parsedSummary.summary || cleanText.slice(0, 240),
    template: {
      objective: parsedSummary.objective,
      consultantNotes: parsedSummary.consultantNotes,
      decisions: parsedSummary.decisions.join('\n'),
      risks: parsedSummary.risks.join('\n'),
      nextSteps: parsedSummary.nextSteps
    },
    checklistItems: toChecklistItems(parsedSummary.actionItems, ownerOptions, sessionAt),
    recordingInfo: `${messages.recordingAnalyzed}: ${sourceName}`,
    statusMessage: messages.recordingAnalyzed,
    guidedStep: 3,
    transcriptionOnly: false
  }
}

export async function runMeetingAudioJob(input: AudioJobInput): Promise<MeetingStudioJobResult> {
  const {
    audioFile,
    preferredTranscript = '',
    ownerOptions,
    sessionAt,
    messages,
    onProgress
  } = input

  onProgress('validatingInput')

  if (preferredTranscript.trim()) {
    const result = await analyzeMeetingTranscriptFromText(
      preferredTranscript,
      audioFile.name,
      ownerOptions,
      sessionAt,
      messages,
      onProgress
    )
    onProgress('completed')
    return result
  }

  onProgress('uploadingRecording')

  let uploadData: { fileName?: string }
  try {
    const uploadForm = new FormData()
    uploadForm.append('audio', audioFile)
    uploadData = await postPlaygroundFormData<{ fileName?: string }>('/record/upload', uploadForm)
  } catch (uploadError) {
    throw new Error(playgroundErrorMessage(uploadError, messages.uploadFailed))
  }

  const formData = new FormData()
  formData.append('audio', audioFile)
  formData.append('model', 'small')
  formData.append('language', 'th')

  onProgress('transcribingRecording')

  const response = await fetch(playgroundUrl('/transcribe'), {
    method: 'POST',
    body: formData
  })

  let data: { message?: string; detail?: string; transcript?: string; code?: string }
  try {
    data = await readPlaygroundJson(response)
  } catch (readError) {
    if (isTranscriptionGatewayError(response)) {
      throw new Error(messages.transcriptionGatewayTimeout)
    }
    if (isTranscriptionUnavailable(response)) {
      onProgress('completed')
      return {
        transcript: '',
        summary: '',
        template: {},
        checklistItems: [],
        recordingInfo: `${messages.uploadedOnly}: ${uploadData.fileName}`,
        statusMessage: messages.transcriptionUnavailable,
        guidedStep: 2,
        transcriptionOnly: true
      }
    }
    throw new Error(playgroundErrorMessage(readError, messages.transcriptionFailed))
  }

  if (!response.ok) {
    if (isTranscriptionGatewayError(response)) {
      throw new Error(messages.transcriptionGatewayTimeout)
    }
    if (isTranscriptionUnavailable(response, data)) {
      onProgress('completed')
      return {
        transcript: '',
        summary: '',
        template: {},
        checklistItems: [],
        recordingInfo: `${messages.uploadedOnly}: ${uploadData.fileName}`,
        statusMessage: messages.transcriptionUnavailable,
        guidedStep: 2,
        transcriptionOnly: true
      }
    }

    const detail = typeof data.detail === 'string' ? data.detail : ''
    throw new Error(detail || playgroundResponseMessage(data, messages.transcriptionFailed))
  }

  if (data.transcript?.trim()) {
    const result = await analyzeMeetingTranscriptFromText(
      data.transcript,
      uploadData.fileName || audioFile.name,
      ownerOptions,
      sessionAt,
      messages,
      onProgress
    )
    onProgress('completed')
    return result
  }

  onProgress('completed')
  throw new Error(messages.emptyTranscript)
}

export function isTranscriptionUnavailableError(message: string) {
  return (
    /Whisper runtime is not available/i.test(message) ||
    /configure a production ASR service/i.test(message) ||
    /Whisper transcription unavailable/i.test(message) ||
    /Cannot reach ASR service/i.test(message)
  )
}
