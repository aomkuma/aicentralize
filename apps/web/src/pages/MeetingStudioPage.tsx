import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import LiveMeetingRecorder, { type LiveMeetingRecordingResult } from '../components/LiveMeetingRecorder'
import { useApi } from '../hooks/useApi'
import {
  describeDocumentFileError,
  extractFileText,
  formatFileLastModified,
  isAudioVideoFile,
  isDocumentFile,
  MEETING_STUDIO_FILE_ACCEPT
} from '../lib/documentText'
import type { MeetingStudioJobResult } from '../lib/meetingStudio/jobTypes'
import { useTenantStore } from '../stores/tenantStore'
import { useMeetingStudioJobStore } from '../stores/meetingStudioJobStore'
import { isMeetingStudioJobResultEmpty } from '../lib/meetingStudio/pendingJobStorage'
import type { Project } from '../types'

type UploadedFileMeta = {
  fileName: string
  lastModified: string
  lastModifiedAt: number
}

type DocxMinuteSummary = {
  summary: string
  objective: string
  consultantNotes: string
  decisions: string[]
  risks: string[]
  actionItems: Array<{
    task: string
    detail?: string
    ownerName?: string
    dueDate?: string
  }>
  nextSteps: string
}

type DocxMeetingMeta = {
  title?: string
  sessionAt?: string
}

type ActionItemPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type AiActionItem = {
  task: string
  detail?: string
  ownerName?: string
  dueDate?: string
  importanceScore?: number
  priority?: ActionItemPriority
}

type StudioProject = Project & {
  code?: string
  tenant?: { id: string; name: string } | null
}

type MinuteSectionKey = 'objective' | 'summary' | 'consultantNotes' | 'decisions' | 'risks' | 'actions' | 'nextSteps'
type ProgressMode = 'docx' | 'audio' | 'save' | null
type ProgressKey =
  | 'validatingInput'
  | 'extractingDocumentText'
  | 'analyzingDocumentWithAI'
  | 'mappingToTemplate'
  | 'uploadingRecording'
  | 'transcribingRecording'
  | 'analyzingRecording'
  | 'savingMeeting'
  | 'completed'
  | 'failed'

type MinuteTemplate = Record<MinuteSectionKey, string>
type ChecklistItem = {
  id: string
  text: string
  ownerUserId: string
  dueDate: string
  detail: string
  importanceScore: number
  priority: ActionItemPriority
}

type OwnerOption = {
  id: string
  name: string
  email: string
}

const defaultTemplate = (): MinuteTemplate => ({
  objective: '',
  summary: '',
  consultantNotes: '',
  decisions: '',
  risks: '',
  actions: '',
  nextSteps: '',
})

const clip = (value: string, max = 220) => value.trim().slice(0, max)

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim()

const uniqueNonEmpty = (values: string[], limit = 5) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of values) {
    const item = normalizeSpaces(raw)
    if (!item) {
      continue
    }
    if (seen.has(item)) {
      continue
    }
    seen.add(item)
    result.push(item)
    if (result.length >= limit) {
      break
    }
  }

  return result
}

const extractSentenceMatches = (text: string, pattern: RegExp, limit = 5) => {
  const matches = [...text.matchAll(pattern)].map((m) => clip(m[0]))
  return uniqueNonEmpty(matches, limit)
}

const checklistId = () => `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeOwnerToken = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const clampImportanceScore = (value: unknown, fallback = 50) => {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : fallback

  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(100, Math.max(1, Math.round(numeric)))
}

const priorityFromImportanceScore = (score: number): ActionItemPriority => {
  if (score >= 90) {
    return 'CRITICAL'
  }

  if (score >= 70) {
    return 'HIGH'
  }

  if (score >= 35) {
    return 'MEDIUM'
  }

  return 'LOW'
}

const importanceScoreFromPriority = (priority?: ActionItemPriority) => {
  switch (priority) {
    case 'CRITICAL':
      return 95
    case 'HIGH':
      return 75
    case 'LOW':
      return 20
    case 'MEDIUM':
    default:
      return 50
  }
}

const defaultChecklistDueDate = (sessionAt?: string) => {
  const base = sessionAt ? new Date(sessionAt) : new Date()
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base
  safeBase.setDate(safeBase.getDate() + 7)
  return toDateTimeLocalString(safeBase)
}

const resolveOwnerUserId = (ownerName: string | undefined, owners: OwnerOption[]) => {
  if (!ownerName) {
    return ''
  }

  const token = normalizeOwnerToken(ownerName)
  if (!token) {
    return ''
  }

  const exactName = owners.find((owner) => normalizeOwnerToken(owner.name) === token)
  if (exactName) {
    return exactName.id
  }

  const exactEmail = owners.find((owner) => owner.email.toLowerCase() === ownerName.toLowerCase())
  if (exactEmail) {
    return exactEmail.id
  }

  const fuzzy = owners.find((owner) => {
    const ownerToken = normalizeOwnerToken(owner.name)
    return ownerToken.includes(token) || token.includes(ownerToken)
  })

  return fuzzy?.id ?? ''
}

const toChecklistItems = (
  items: AiActionItem[],
  owners: OwnerOption[],
  sessionAt?: string
): ChecklistItem[] =>
  uniqueNonEmpty(items.map((item) => item.task), 12).map((text, index) => {
    const source = items[index]
    const dueDateRaw = source?.dueDate ? new Date(source.dueDate) : null
    const importanceScore = clampImportanceScore(
      source?.importanceScore,
      importanceScoreFromPriority(source?.priority)
    )

    return {
      id: checklistId(),
      text,
      ownerUserId: resolveOwnerUserId(source?.ownerName, owners),
      dueDate: dueDateRaw && !Number.isNaN(dueDateRaw.getTime())
        ? toDateTimeLocalString(dueDateRaw)
        : defaultChecklistDueDate(sessionAt),
      detail: source?.detail?.trim() ?? '',
      importanceScore,
      priority: priorityFromImportanceScore(importanceScore)
    }
  })

const parseChecklistFromText = (raw: string, sessionAt?: string): ChecklistItem[] => {
  const lines = raw
    .split('\n')
    .map((line) => line.replace(/^[-*\d.\s\[\]xX]+/, '').trim())
    .filter(Boolean)

  return lines.map((text) => ({
    id: checklistId(),
    text,
    ownerUserId: '',
    dueDate: defaultChecklistDueDate(sessionAt),
    detail: '',
    importanceScore: 50,
    priority: 'MEDIUM'
  }))
}

const checklistToTemplateText = (items: ChecklistItem[]) =>
  items
    .filter((item) => item.text.trim())
    .map((item) => item.text.trim())
    .join('\n')

const normalizeAiActionItems = (raw: unknown): AiActionItem[] => {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { task: item.trim() }
      }

      if (!item || typeof item !== 'object') {
        return { task: '' }
      }

      const value = item as {
        task?: unknown
        title?: unknown
        detail?: unknown
        description?: unknown
        ownerName?: unknown
        owner?: unknown
        dueDate?: unknown
        importanceScore?: unknown
        priority?: unknown
      }

      const task = typeof value.task === 'string'
        ? value.task
        : typeof value.title === 'string'
          ? value.title
          : ''
      const normalizedPriority = typeof value.priority === 'string' ? value.priority.toUpperCase() : ''
      const priority = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalizedPriority)
        ? normalizedPriority as ActionItemPriority
        : undefined
      const importanceScore = clampImportanceScore(value.importanceScore, importanceScoreFromPriority(priority))

      return {
        task: task.trim(),
        detail: typeof value.detail === 'string'
          ? value.detail.trim()
          : typeof value.description === 'string'
            ? value.description.trim()
            : undefined,
        ownerName: typeof value.ownerName === 'string'
          ? value.ownerName.trim()
          : typeof value.owner === 'string'
            ? value.owner.trim()
            : undefined,
        dueDate: typeof value.dueDate === 'string' ? value.dueDate : undefined,
        importanceScore,
        priority: priorityFromImportanceScore(importanceScore)
      }
    })
    .filter((item) => Boolean(item.task))
}

const toDateTimeLocalString = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

const deriveMeetingMetaFromDocx = (raw: string, fileName: string): DocxMeetingMeta => {
  const text = raw.replace(/\r/g, '\n')
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)

  let title = ''

  const titleFromLabel = text.match(/(?:ชื่อการประชุม|หัวข้อการประชุม)\s*[:：]?\s*([^\n]{4,140})/i)?.[1]?.trim()
  if (titleFromLabel) {
    title = titleFromLabel
  }

  if (!title) {
    const idx = lines.findIndex((line) => /หัวข้อในการประชุม/i.test(line))
    if (idx > -1) {
      const nextLine = lines.slice(idx + 1).find((line) => line.length > 4 && !/^[-•\d.\s]+$/.test(line))
      if (nextLine) {
        title = clip(nextLine, 90)
      }
    }
  }

  if (!title) {
    const fileTitle = fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    title = clip(fileTitle, 90)
  }

  const dateRaw = text.match(/วันที่ประชุม\s*[:：]?\s*([0-3]?\d[\/-][0-1]?\d[\/-](?:\d{4}|\d{2}))/i)?.[1]
    ?? text.match(/\b([0-3]?\d[\/-][0-1]?\d[\/-](?:\d{4}|\d{2}))\b/)?.[1]

  if (!dateRaw) {
    return { title }
  }

  const [dRaw, mRaw, yRaw] = dateRaw.split(/[\/-]/)
  const day = Number(dRaw)
  const month = Number(mRaw)
  let year = Number(yRaw)
  if (year < 100) {
    year += 2000
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return { title }
  }

  const timeRaw = text.match(/(?:เวลา(?:ประชุม)?|time)\s*[:：]?\s*([0-2]?\d[:.][0-5]\d)\s*(AM|PM)?/i)
  let hours = 9
  let minutes = 0

  if (timeRaw?.[1]) {
    const [hRaw, minRaw] = timeRaw[1].replace('.', ':').split(':')
    hours = Number(hRaw)
    minutes = Number(minRaw)
    if (timeRaw[2]) {
      const meridiem = timeRaw[2].toUpperCase()
      if (meridiem === 'PM' && hours < 12) {
        hours += 12
      }
      if (meridiem === 'AM' && hours === 12) {
        hours = 0
      }
    }
  }

  const date = new Date(year, Math.max(0, month - 1), day, hours, minutes)
  if (Number.isNaN(date.getTime())) {
    return { title }
  }

  return {
    title,
    sessionAt: toDateTimeLocalString(date)
  }
}

const deriveDocxSummaryHeuristic = (raw: string): DocxMinuteSummary => {
  const text = raw.replace(/\r/g, '\n')
  const compact = normalizeSpaces(raw)

  const objectiveBlock = text.match(/วัตถุประสงค์ของการประชุม([\s\S]{0,800}?)(รายชื่อผู้เข้าร่วมประชุม|รายละเอียดการประชุม|$)/i)?.[1] ?? ''
  const objective = clip(normalizeSpaces(objectiveBlock), 260)

  const decisions = extractSentenceMatches(
    text,
    /(ที่ประชุม[^\n]{0,140}(?:เห็นชอบ|รับทราบ|อนุมัติ|ตกลง|มีมติ)[^\n]{0,140})/gi,
    4
  )

  const risks = uniqueNonEmpty([
    ...extractSentenceMatches(text, /(ความเสี่ยง[^\n]{0,160})/gi, 4),
    ...extractSentenceMatches(text, /(ปัญหา[^\n]{0,160})/gi, 3)
  ], 4)

  const actionItems = extractSentenceMatches(
    text,
    /(มอบหมาย[^\n]{0,160}|ติดตาม[^\n]{0,160}|ดำเนินการ[^\n]{0,160}|ต้อง[^\n]{0,140})/gi,
    5
  ).map((task) => ({ task }))

  const nextSteps = extractSentenceMatches(
    text,
    /(ระยะถัดไป[^\n]{0,160}|ขั้นตอนถัดไป[^\n]{0,160}|ถัดไป[^\n]{0,160}|next steps?[^\n]{0,160})/gi,
    3
  ).join('\n')

  return {
    summary: clip(compact, 320),
    objective,
    consultantNotes: uniqueNonEmpty([
      objective ? `ควรตรวจสอบว่าวัตถุประสงค์นี้มีตัวชี้วัดความสำเร็จและเจ้าของงานที่ชัดเจนหรือไม่` : '',
      decisions.length === 0 ? 'ยังไม่พบมติหรือการตัดสินใจที่ชัดเจน ควรเติมผลลัพธ์ที่ที่ประชุมตกลงร่วมกัน' : '',
      actionItems.length === 0 ? 'ยังไม่พบ action items ที่ชัดเจน ควรระบุเจ้าของงานและวันครบกำหนดก่อนบันทึก' : '',
      risks.length === 0 ? 'ยังไม่พบความเสี่ยงหรือประเด็นที่ต้องเฝ้าระวัง ควรทบทวนว่ามีข้อจำกัดหรือ dependency สำคัญหรือไม่' : ''
    ], 4).join('\n'),
    decisions,
    risks,
    actionItems,
    nextSteps
  }
}

const progressFlowByMode: Record<Exclude<ProgressMode, null>, ProgressKey[]> = {
  docx: ['validatingInput', 'extractingDocumentText', 'analyzingDocumentWithAI', 'mappingToTemplate', 'completed'],
  audio: ['validatingInput', 'uploadingRecording', 'transcribingRecording', 'analyzingRecording', 'mappingToTemplate', 'completed'],
  save: ['savingMeeting', 'completed']
}

export default function MeetingStudioPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { projectId: projectIdParam } = useParams<{ projectId?: string }>()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const { get, post, isLoading } = useApi()

  const [projects, setProjects] = useState<StudioProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(projectIdParam ?? '')
  const [meetingTitle, setMeetingTitle] = useState('')
  const [sessionAt, setSessionAt] = useState('')
  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [template, setTemplate] = useState<MinuteTemplate>(defaultTemplate)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [recordingInfo, setRecordingInfo] = useState('')
  const [uploadedFileMeta, setUploadedFileMeta] = useState<UploadedFileMeta | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [progressMode, setProgressMode] = useState<ProgressMode>(null)
  const [progressKey, setProgressKey] = useState<ProgressKey>('validatingInput')
  const [guidedStep, setGuidedStep] = useState(1)
  const [hoveredGuideStep, setHoveredGuideStep] = useState<number | null>(null)

  const jobStatus = useMeetingStudioJobStore((state) => state.status)
  const jobProgressKey = useMeetingStudioJobStore((state) => state.progressKey)
  const jobProjectId = useMeetingStudioJobStore((state) => state.projectId)
  const jobError = useMeetingStudioJobStore((state) => state.error)
  const startAudioJob = useMeetingStudioJobStore((state) => state.startAudioJob)
  const hydratePendingJob = useMeetingStudioJobStore((state) => state.hydratePendingJob)

  useEffect(() => {
    hydratePendingJob()
  }, [hydratePendingJob])

  useEffect(() => {
    const fetchProjects = async () => {
      const url = currentTenant?.id ? `/projects?tenantId=${encodeURIComponent(currentTenant.id)}` : '/projects'
      const data = await get<StudioProject[]>(url)
      if (Array.isArray(data)) {
        setProjects(data)
        if (!selectedProjectId && data[0]?.id) {
          setSelectedProjectId(data[0].id)
        } else if (selectedProjectId && !data.some((project) => project.id === selectedProjectId)) {
          setSelectedProjectId(data[0]?.id ?? '')
        }
      }
    }

    fetchProjects()
  }, [currentTenant?.id, get, selectedProjectId])

  useEffect(() => {
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam)
    }
  }, [projectIdParam])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  useEffect(() => {
    const tenantId = selectedProject?.tenant?.id
    if (!tenantId) {
      setOwnerOptions([])
      return
    }

    const fetchOwnerOptions = async () => {
      const members = await get<Array<{ user?: { id: string; name: string; email: string } }>>(`/tenants/${tenantId}/members`)
      if (!Array.isArray(members)) {
        setOwnerOptions([])
        return
      }

      const owners = members
        .map((item) => item.user)
        .filter((user): user is { id: string; name: string; email: string } => Boolean(user?.id && user?.name && user?.email))
        .map((user) => ({ id: user.id, name: user.name, email: user.email }))

      setOwnerOptions(owners)
    }

    fetchOwnerOptions()
  }, [get, selectedProject?.tenant?.id])

  const guidedSteps = [
    {
      title: t('meetings.guide.steps.step1.title'),
      description: t('meetings.guide.steps.step1.description')
    },
    {
      title: t('meetings.guide.steps.step2.title'),
      description: t('meetings.guide.steps.step2.description')
    },
    {
      title: t('meetings.guide.steps.step3.title'),
      description: t('meetings.guide.steps.step3.description')
    }
  ]

  const activeGuideStep = hoveredGuideStep ?? guidedStep
  const activeGuideStepData = guidedSteps[activeGuideStep - 1]
  const stepOneComplete = Boolean(selectedProjectId)
  const stepTwoComplete = Boolean(recordingFile) || Boolean(transcript.trim())
  const stepThreeComplete = Boolean(summary.trim()) || Boolean(template.objective.trim()) || Boolean(template.consultantNotes.trim()) || Boolean(template.decisions.trim()) || Boolean(template.risks.trim()) || Boolean(template.actions.trim()) || Boolean(template.nextSteps.trim())

  const updateProgress = (mode: Exclude<ProgressMode, null>, key: ProgressKey) => {
    setProgressMode(mode)
    setProgressKey(key)
  }

  const captureUploadedFileMeta = (file: File | null) => {
    if (!file) {
      setUploadedFileMeta(null)
      return
    }

    setUploadedFileMeta({
      fileName: file.name,
      lastModifiedAt: file.lastModified,
      lastModified: formatFileLastModified(file.lastModified, i18n.language)
    })
  }

  const applyJobResult = (result: MeetingStudioJobResult, projectId?: string) => {
    if (projectId) {
      setSelectedProjectId(projectId)
    }
    if (result.transcript) {
      setTranscript(result.transcript)
    }
    if (result.summary) {
      setSummary(result.summary)
    }
    setTemplate((current) => ({
      ...current,
      objective: result.template.objective ?? current.objective,
      consultantNotes: result.template.consultantNotes ?? current.consultantNotes,
      decisions: result.template.decisions ?? current.decisions,
      risks: result.template.risks ?? current.risks,
      nextSteps: result.template.nextSteps ?? current.nextSteps
    }))
    if (result.checklistItems.length > 0) {
      setChecklistItems(result.checklistItems)
    }
    setRecordingInfo(result.recordingInfo)
    setStatus(result.statusMessage)
    setGuidedStep(result.guidedStep)
    if (isMeetingStudioJobResultEmpty(result)) {
      setError(result.statusMessage || t('meetings.errors.emptyTranscript'))
      updateProgress('audio', 'failed')
    } else {
      setError('')
      updateProgress('audio', 'completed')
    }
  }

  const startBackgroundAudioJob = (file: File, preferredTranscript = '') => {
    if (!selectedProjectId) {
      setError(t('meetings.errors.selectProject'))
      return
    }

    startAudioJob({
      file,
      projectId: selectedProjectId,
      preferredTranscript,
      ownerOptions,
      sessionAt,
      messages: {
        uploadFailed: t('meetings.errors.uploadFailed'),
        transcriptionFailed: t('meetings.errors.transcriptionFailed'),
        transcriptionUnavailable: t('meetings.errors.transcriptionUnavailable'),
        transcriptionGatewayTimeout: t('meetings.errors.transcriptionGatewayTimeout'),
        emptyTranscript: t('meetings.errors.emptyTranscript'),
        documentAnalysisFailed: t('meetings.errors.documentAnalysisFailed'),
        transcribed: t('meetings.status.transcribed'),
        recordingAnalyzed: t('meetings.status.recordingAnalyzed'),
        uploadedOnly: t('meetings.status.uploadedOnly')
      },
      notificationTitle: t('meetings.backgroundJob.notificationTitle'),
      notificationBodySuccess: t('meetings.backgroundJob.notificationSuccess'),
      notificationBodyFailed: t('meetings.backgroundJob.notificationFailed')
    })
  }

  useEffect(() => {
    if (jobStatus === 'running') {
      setIsTranscribing(true)
      setProgressMode('audio')
      setProgressKey(jobProgressKey as ProgressKey)
    }
  }, [jobStatus, jobProgressKey])

  useEffect(() => {
    if (jobStatus === 'failed') {
      setError(jobError || t('meetings.errors.transcriptionFailed'))
      setIsTranscribing(false)
      updateProgress('audio', 'failed')
      return
    }

    if (jobStatus !== 'completed') {
      return
    }

    const store = useMeetingStudioJobStore.getState()
    if (!store.result) {
      return
    }

    applyJobResult(store.result, jobProjectId || undefined)
    store.acknowledgeResult()
    setIsTranscribing(false)
  }, [jobStatus, jobProjectId, jobError, t])

  useEffect(() => {
    const nextActions = checklistToTemplateText(checklistItems)
    setTemplate((current) => {
      if (current.actions === nextActions) {
        return current
      }

      return {
        ...current,
        actions: nextActions
      }
    })
  }, [checklistItems])

  const extractJsonCandidate = (raw: string): string | null => {
    const trimmed = raw.trim()
    const stripped = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()

    const firstBrace = stripped.indexOf('{')
    const lastBrace = stripped.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null
    }

    return stripped.slice(firstBrace, lastBrace + 1)
  }

  const parseDocxSummary = (raw: string): DocxMinuteSummary | null => {
    const candidate = extractJsonCandidate(raw)
    if (!candidate) {
      return null
    }

    try {
      const parsed = JSON.parse(candidate) as Partial<DocxMinuteSummary>
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        objective: typeof parsed.objective === 'string' ? parsed.objective.trim() : '',
        consultantNotes: typeof parsed.consultantNotes === 'string' ? parsed.consultantNotes.trim() : '',
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
        actionItems: normalizeAiActionItems(parsed.actionItems),
        nextSteps: typeof parsed.nextSteps === 'string' ? parsed.nextSteps.trim() : ''
      }
    } catch {
      return null
    }
  }

  const buildDocxAnalysisPrompt = (text: string) => [
    'You are a senior meeting minute analyst.',
    'Analyze the following document text and return ONLY valid JSON.',
    'No markdown, no code fences, no extra explanation.',
    'Use this schema exactly:',
    '{',
    '  "summary": "string",',
    '  "objective": "string",',
    '  "consultantNotes": "string",',
    '  "decisions": ["string"],',
    '  "risks": ["string"],',
    '  "actionItems": [{"task":"string","detail":"string","ownerName":"string","dueDate":"ISO-8601 datetime","importanceScore":50,"priority":"LOW|MEDIUM|HIGH|CRITICAL"}],',
    '  "nextSteps": "string"',
    '}',
    'Respond in Thai for all text values.',
    'For consultantNotes, write 2-4 concise bullet-style recommendations about weaknesses of this minute, missing context, items to clarify, risks to watch, or details to add. Use a constructive consultant tone, not blame.',
    'Set importanceScore from 1-100 based on business impact, urgency, blockers, customer/executive impact, and risk.',
    'Use HIGH or CRITICAL for very important work even when the due date is later, so teams can focus earlier.',
    '',
    'Document text excerpt (may be truncated if the source document is long):',
    text.slice(0, 2400)
  ].join('\n')

  const handleLiveRecordingReady = (result: LiveMeetingRecordingResult) => {
    const liveFile = new File([result.audioBlob], result.fileName, { type: result.audioBlob.type || 'audio/webm' })
    setRecordingFile(liveFile)
    captureUploadedFileMeta(liveFile)
    setError('')
    startBackgroundAudioJob(liveFile, result.transcript)
    setStatus(t('meetings.backgroundJob.started'))
    setIsTranscribing(true)
    updateProgress('audio', 'validatingInput')
  }

  const preview = useMemo(() => {
    const checklistPreview = checklistItems
      .filter((item) => item.text.trim())
      .map((item) => {
        const owner = ownerOptions.find((option) => option.id === item.ownerUserId)
        const meta = [
          `${t('meetings.checklist.importanceScore')}: ${item.importanceScore}/100`,
          `${t('meetings.checklist.priority')}: ${t(`meetings.checklist.priorityLabels.${item.priority}`)}`,
          owner ? `${t('meetings.checklist.owner')}: ${owner.name}` : '',
          item.dueDate ? `${t('meetings.checklist.dueDate')}: ${new Date(item.dueDate).toLocaleString()}` : ''
        ].filter(Boolean).join(', ')

        return `- ${item.text.trim()} (${meta})`
      })
      .join('\n')
    const parts = [
      `${t('meetings.previewLabels.meetingTitle')}: ${meetingTitle}`,
      `${t('meetings.previewLabels.project')}: ${selectedProject?.name ?? currentTenant?.name ?? '—'}`,
      '',
      `1. ${t('meetings.template.objective')}`,
      template.objective,
      '',
      `2. ${t('meetings.template.summary')}`,
      summary || template.summary,
      '',
      `3. ${t('meetings.template.consultantNotes')}`,
      template.consultantNotes || '-',
      '',
      `4. ${t('meetings.template.decisions')}`,
      template.decisions,
      '',
      `5. ${t('meetings.template.risks')}`,
      template.risks,
      '',
      `6. ${t('meetings.template.actions')}`,
      checklistPreview || template.actions,
      '',
      `7. ${t('meetings.template.nextSteps')}`,
      template.nextSteps,
      '',
      transcript ? t('meetings.previewLabels.transcriptAttached') : t('meetings.previewLabels.noTranscript')
    ]

    return parts.filter(Boolean).join('\n')
  }, [checklistItems, currentTenant?.name, meetingTitle, ownerOptions, selectedProject?.name, summary, template, transcript, t])

  const handleTranscribe = async () => {
    if (!recordingFile) {
      setError(t('meetings.errors.selectRecording'))
      return
    }

    if (!isDocumentFile(recordingFile)) {
      if (!isAudioVideoFile(recordingFile)) {
        setError(t('meetings.errors.unsupportedFileType'))
        return
      }

      setError('')
      startBackgroundAudioJob(recordingFile)
      setStatus(t('meetings.backgroundJob.started'))
      setIsTranscribing(true)
      updateProgress('audio', 'validatingInput')
      return
    }

    setError('')
    setStatus(t('meetings.status.processingDocument'))
    setIsTranscribing(true)
    updateProgress('docx', 'validatingInput')

    try {
      updateProgress('docx', 'extractingDocumentText')
      const extractedText = await extractFileText(recordingFile)
        const heuristicSummary = deriveDocxSummaryHeuristic(extractedText)
        const inferredMeta = deriveMeetingMetaFromDocx(extractedText, recordingFile.name)

        setTranscript(extractedText)
        if (inferredMeta.title) {
          setMeetingTitle(inferredMeta.title)
        }
        if (inferredMeta.sessionAt) {
          setSessionAt(inferredMeta.sessionAt)
        }
        if (!summary.trim()) {
          setSummary(heuristicSummary.summary || extractedText.slice(0, 240))
        }

        setStatus(t('meetings.status.analyzingDocument'))
        updateProgress('docx', 'analyzingDocumentWithAI')

        let slowAnalysisTimer: ReturnType<typeof setTimeout> | null = null
        let analysisTimeout: ReturnType<typeof setTimeout> | null = null

        try {
          slowAnalysisTimer = setTimeout(() => {
            setStatus(t('meetings.status.analysisTakingLong'))
          }, 18000)

          const analysisController = new AbortController()
          analysisTimeout = setTimeout(() => {
            analysisController.abort()
          }, 30000)

          const analysisResponse = await fetch('/ai/playground/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'qwen2.5:7b',
              prompt: buildDocxAnalysisPrompt(extractedText)
            }),
            signal: analysisController.signal
          })

          if (analysisTimeout) {
            clearTimeout(analysisTimeout)
          }

          const analysisData = await analysisResponse.json()
          if (!analysisResponse.ok) {
            throw new Error(analysisData.message || t('meetings.errors.documentAnalysisFailed'))
          }

          const parsedSummary = parseDocxSummary(analysisData.output || '')
          if (parsedSummary) {
            updateProgress('docx', 'mappingToTemplate')
            setSummary(parsedSummary.summary || extractedText.slice(0, 240))
            setTemplate((current) => ({
              ...current,
              objective: parsedSummary.objective || current.objective,
              consultantNotes: parsedSummary.consultantNotes || current.consultantNotes,
              decisions: parsedSummary.decisions.join('\n'),
              risks: parsedSummary.risks.join('\n'),
              nextSteps: parsedSummary.nextSteps || current.nextSteps
            }))
            setChecklistItems(toChecklistItems(parsedSummary.actionItems, ownerOptions, inferredMeta.sessionAt ?? sessionAt))
            setRecordingInfo(`${t('meetings.status.documentAnalyzed')}: ${recordingFile.name}`)
            setStatus(t('meetings.status.documentAnalyzed'))
          } else {
            updateProgress('docx', 'mappingToTemplate')
            setSummary(heuristicSummary.summary || extractedText.slice(0, 240))
            setTemplate((current) => ({
              ...current,
              objective: heuristicSummary.objective || current.objective,
              consultantNotes: heuristicSummary.consultantNotes || current.consultantNotes,
              decisions: heuristicSummary.decisions.join('\n') || current.decisions,
              risks: heuristicSummary.risks.join('\n') || current.risks,
              nextSteps: heuristicSummary.nextSteps || current.nextSteps
            }))
            setChecklistItems(toChecklistItems(heuristicSummary.actionItems, ownerOptions, inferredMeta.sessionAt ?? sessionAt))
            setRecordingInfo(`${t('meetings.status.documentProcessed')}: ${recordingFile.name}`)
            setStatus(t('meetings.status.documentProcessed'))
          }
        } catch (analysisError) {
          if (analysisError instanceof DOMException && analysisError.name === 'AbortError') {
            setStatus(t('meetings.status.analysisTimedOutFallback'))
          }
          updateProgress('docx', 'mappingToTemplate')
          setSummary(heuristicSummary.summary || extractedText.slice(0, 240))
          setTemplate((current) => ({
            ...current,
            objective: heuristicSummary.objective || current.objective,
            consultantNotes: heuristicSummary.consultantNotes || current.consultantNotes,
            decisions: heuristicSummary.decisions.join('\n') || current.decisions,
            risks: heuristicSummary.risks.join('\n') || current.risks,
            nextSteps: heuristicSummary.nextSteps || current.nextSteps
          }))
          setChecklistItems(toChecklistItems(heuristicSummary.actionItems, ownerOptions, inferredMeta.sessionAt ?? sessionAt))
          setRecordingInfo(`${t('meetings.status.documentProcessed')}: ${recordingFile.name}`)
          setStatus(t('meetings.status.documentProcessed'))
        } finally {
          if (slowAnalysisTimer) {
            clearTimeout(slowAnalysisTimer)
          }
          if (analysisTimeout) {
            clearTimeout(analysisTimeout)
          }
        }
        updateProgress('docx', 'completed')
    } catch (transcribeError) {
      const message = transcribeError instanceof Error
        ? describeDocumentFileError(recordingFile, transcribeError, t)
        : t('meetings.errors.documentExtractionFailed')
      setError(message)
      updateProgress('docx', 'failed')
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleSaveMeeting = async () => {
    if (!selectedProjectId) {
      setError(t('meetings.errors.selectProject'))
      return
    }

    if (!meetingTitle.trim()) {
      setError(t('meetings.errors.titleRequired'))
      return
    }

    if (!sessionAt.trim()) {
      setError(t('meetings.errors.sessionAtRequired'))
      return
    }

    if (!summary.trim()) {
      setError(t('meetings.errors.summaryRequired'))
      return
    }

    const actionItemsPayload = checklistItems
      .map((item) => ({
        task: item.text.trim(),
        detail: item.detail.trim() || undefined,
        assigneeId: item.ownerUserId,
        dueDate: item.dueDate,
        priority: item.priority
      }))
      .filter((item) => item.task)

    if (actionItemsPayload.some((item) => !item.assigneeId)) {
      setError(t('meetings.errors.ownerRequiredForChecklist'))
      return
    }

    if (actionItemsPayload.some((item) => Number.isNaN(new Date(item.dueDate).getTime()))) {
      setError(t('meetings.errors.dueDateRequiredForChecklist'))
      return
    }

    setError('')
    setStatus(t('meetings.status.saving'))
    setIsSaving(true)
    updateProgress('save', 'savingMeeting')

    try {
      const minutes = [
        { section: t('meetings.template.objective'), content: template.objective || '-' },
        { section: t('meetings.template.summary'), content: summary },
        { section: t('meetings.template.consultantNotes'), content: template.consultantNotes || '-' },
        { section: t('meetings.template.decisions'), content: template.decisions || '-' },
        { section: t('meetings.template.risks'), content: template.risks || '-' },
        { section: t('meetings.template.actions'), content: template.actions || '-' },
        { section: t('meetings.template.nextSteps'), content: template.nextSteps || '-' },
        ...(uploadedFileMeta
          ? [{
              section: t('meetings.sourceFile.section'),
              content: t('meetings.sourceFile.content', {
                fileName: uploadedFileMeta.fileName,
                lastModified: uploadedFileMeta.lastModified
              })
            }]
          : [])
      ]

      await post('/meetings', {
        projectId: selectedProjectId,
        title: meetingTitle.trim(),
        sessionAt: new Date(sessionAt).toISOString(),
        summary: summary.trim(),
        transcript: transcript.trim() || undefined,
        minutes,
        actionItems: actionItemsPayload.map((item) => ({
          task: item.task,
          detail: item.detail,
          assigneeId: item.assigneeId,
          dueDate: new Date(item.dueDate).toISOString(),
          priority: item.priority
        })),
      })

      setStatus(t('meetings.status.savedRedirecting'))
      updateProgress('save', 'completed')
      window.setTimeout(() => {
        navigate(`/continuity/${selectedProjectId}`)
      }, 900)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('meetings.errors.saveFailed'))
      updateProgress('save', 'failed')
    } finally {
      setIsSaving(false)
    }
  }

  const updateTemplate = (key: MinuteSectionKey, value: string) => {
    setTemplate((current) => ({ ...current, [key]: value }))
  }

  const addChecklistItem = () => {
    setChecklistItems((current) => ([
      ...current,
      {
        id: checklistId(),
        text: '',
        ownerUserId: '',
        dueDate: defaultChecklistDueDate(sessionAt),
        detail: '',
        importanceScore: 50,
        priority: 'MEDIUM'
      }
    ]))
  }

  const updateChecklistText = (id: string, text: string) => {
    setChecklistItems((current) => current.map((item) => (item.id === id ? { ...item, text } : item)))
  }

  const updateChecklistImportanceScore = (id: string, nextScore: number) => {
    const importanceScore = clampImportanceScore(nextScore)
    setChecklistItems((current) => current.map((item) => (
      item.id === id
        ? { ...item, importanceScore, priority: priorityFromImportanceScore(importanceScore) }
        : item
    )))
  }

  const removeChecklistItem = (id: string) => {
    setChecklistItems((current) => current.filter((item) => item.id !== id))
  }

  const remapActionsToChecklist = () => {
    setChecklistItems(parseChecklistFromText(template.actions, sessionAt))
  }

  return (
    <Layout currentTenantName={currentTenant?.name}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white p-6 sm:p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">AICentralize</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold">{t('meetings.title')}</h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base text-slate-300">
            {t('meetings.description')}
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link to="/dashboard" className="rounded-full border border-white/20 px-4 py-2 text-white/90 hover:bg-white/10">
              {t('common.back')}
            </Link>
            <Link to="/projects" className="rounded-full border border-white/20 px-4 py-2 text-white/90 hover:bg-white/10">
              {t('navigation.projects')}
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300">
              {t('meetings.guide.label')}
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
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${isActive ? 'border-sky-400 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900' : 'border-sky-100 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900'}`}
                  >
                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700 dark:bg-slate-800 dark:text-sky-300'}`}>
                      {isComplete ? '✓' : stepNumber}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t('common.step', { current: stepNumber, total: 3 })}
                      </span>
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{step.title}</span>
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

        {(error || status) && (
          <div className={`rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'}`}>
            {error || status}
          </div>
        )}

        {progressMode && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('meetings.progress.title')}</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('meetings.progress.subtitle')}</span>
            </div>

            <div className="mt-3 space-y-2">
              {progressFlowByMode[progressMode].map((key, index) => {
                const activeIndex = progressFlowByMode[progressMode].indexOf(progressKey)
                const isActive = progressKey === key
                const isCompleted = activeIndex > -1 && index < activeIndex
                const isFinalCompleted = key === 'completed' && isActive

                return (
                  <div
                    key={`${progressMode}-${key}`}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${isFinalCompleted || isCompleted ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200' : isActive ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300'}`}
                  >
                    <span className="mt-0.5 font-bold">{isFinalCompleted || isCompleted ? '✓' : isActive ? '•' : String(index + 1)}</span>
                    <span>{t(`meetings.progress.steps.${key}`)}</span>
                  </div>
                )
              })}

              {progressKey === 'failed' && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
                  {t('meetings.progress.failedHint')}
                </div>
              )}
            </div>
          </section>
        )}

        {guidedStep === 1 && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('meetings.tabs.upload')}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('meetings.uploadHelp')}</p>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.project')}</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">{t('meetings.selectProject')}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code ? `${project.code} · ` : ''}{project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.recordingFile')}</span>
              <input
                type="file"
                accept={MEETING_STUDIO_FILE_ACCEPT}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null
                  setRecordingFile(nextFile)
                  captureUploadedFileMeta(nextFile)
                }}
                className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 dark:text-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('meetings.supportedFileTypes')}</p>
            </label>

            <LiveMeetingRecorder
              disabled={isTranscribing}
              onRecordingReady={handleLiveRecordingReady}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleTranscribe()}
                disabled={isTranscribing || !recordingFile}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTranscribing ? t('meetings.status.transcribing') : t('meetings.actions.transcribe')}
              </button>
              <button
                type="button"
                onClick={() => setTranscript('')}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('meetings.actions.clearTranscript')}
              </button>
            </div>

            {recordingInfo && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
                {recordingInfo}
              </p>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.transcript')}</span>
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                rows={12}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder={t('meetings.transcriptPlaceholder')}
              />
            </label>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                {t('meetings.detectedMetaLabel')}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t('meetings.detectedMetaHint')}</p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.uploadedFileName')}</span>
                  <input
                    readOnly
                    value={uploadedFileMeta?.fileName ?? ''}
                    placeholder={t('meetings.uploadedFileNamePlaceholder')}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.uploadedFileLastModified')}</span>
                  <input
                    readOnly
                    value={uploadedFileMeta?.lastModified ?? ''}
                    placeholder={t('meetings.uploadedFileLastModifiedPlaceholder')}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.titleField')}</span>
                  <input
                    value={meetingTitle}
                    onChange={(event) => setMeetingTitle(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    placeholder={t('meetings.titleAutoPlaceholder')}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.sessionAt')}</span>
                  <input
                    type="datetime-local"
                    value={sessionAt}
                    onChange={(event) => setSessionAt(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </label>
              </div>
            </div>
          </section>
        )}

        {guidedStep === 2 && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('meetings.tabs.template')}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('meetings.templateHelp')}</p>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.objective')}</span>
              <textarea
                value={template.objective}
                onChange={(event) => updateTemplate('objective', event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.summary')}</span>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.consultantNotes')}</span>
              <textarea
                value={template.consultantNotes}
                onChange={(event) => updateTemplate('consultantNotes', event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder={t('meetings.template.consultantNotesPlaceholder')}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.decisions')}</span>
              <textarea
                value={template.decisions}
                onChange={(event) => updateTemplate('decisions', event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.risks')}</span>
              <textarea
                value={template.risks}
                onChange={(event) => updateTemplate('risks', event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.actions')}</span>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addChecklistItem}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    {t('meetings.checklist.add')}
                  </button>
                  <button
                    type="button"
                    onClick={remapActionsToChecklist}
                    className="rounded-lg border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-950/30"
                  >
                    {t('meetings.checklist.remap')}
                  </button>
                </div>

                {checklistItems.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('meetings.checklist.empty')}</p>
                )}

                {checklistItems.map((item, index) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {t('meetings.checklist.itemLabel', { index: index + 1 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(item.id)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950/30"
                      >
                        {t('meetings.checklist.remove')}
                      </button>
                    </div>

                    <div className="mt-2 space-y-2">
                      <input
                        value={item.text}
                        onChange={(event) => updateChecklistText(item.id, event.target.value)}
                        placeholder={t('meetings.checklist.placeholder')}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />

                      <input
                        value={item.detail}
                        onChange={(event) => {
                          const value = event.target.value
                          setChecklistItems((current) => current.map((row) => (row.id === item.id ? { ...row, detail: value } : row)))
                        }}
                        placeholder={t('meetings.checklist.detailPlaceholder')}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={item.ownerUserId}
                          onChange={(event) => {
                            const value = event.target.value
                            setChecklistItems((current) => current.map((row) => (row.id === item.id ? { ...row, ownerUserId: value } : row)))
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">{t('meetings.checklist.selectOwner')}</option>
                          {ownerOptions.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                              {owner.name} · {owner.email}
                            </option>
                          ))}
                        </select>

                        <input
                          type="datetime-local"
                          value={item.dueDate}
                          onChange={(event) => {
                            const value = event.target.value
                            setChecklistItems((current) => current.map((row) => (row.id === item.id ? { ...row, dueDate: value } : row)))
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />

                        <label className="rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <span>{t('meetings.checklist.importanceScore')}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                              {item.importanceScore}/100
                            </span>
                          </span>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={item.importanceScore}
                            onChange={(event) => updateChecklistImportanceScore(item.id, Number(event.target.value))}
                            className="mt-2 w-full accent-blue-600"
                          />
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {t('meetings.checklist.priority')}: {t(`meetings.checklist.priorityLabels.${item.priority}`)}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.nextSteps')}</span>
              <textarea
                value={template.nextSteps}
                onChange={(event) => updateTemplate('nextSteps', event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTemplate(defaultTemplate())
                  setChecklistItems([])
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('meetings.actions.resetTemplate')}
              </button>
            </div>
          </section>
        )}

        {guidedStep === 3 && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('meetings.preview')}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('meetings.previewHelp')}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {selectedProject?.tenant?.name || currentTenant?.name || t('meetings.noProjectSelected')}
              </span>
            </div>
            <pre className="mt-4 max-h-[32rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
              {preview}
            </pre>
          </section>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setGuidedStep((current) => Math.max(1, current - 1))}
            disabled={guidedStep === 1}
            className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('common.back')}
          </button>

          {guidedStep < 3 ? (
            <button
              type="button"
              onClick={() => setGuidedStep((current) => Math.min(3, current + 1))}
              className="rounded-xl bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {t('common.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSaveMeeting()}
              disabled={isSaving}
              className="rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? t('meetings.status.saving') : t('meetings.actions.saveMeeting')}
            </button>
          )}
        </div>
      </div>
    </Layout>
  )
}
