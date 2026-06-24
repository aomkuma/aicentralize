import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import { useTenantStore } from '../stores/tenantStore'
import type { Project } from '../types'

type DocxTextExtractor = {
  extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  default?: {
    extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
}

type DocxMinuteSummary = {
  summary: string
  objective: string
  decisions: string[]
  risks: string[]
  actionItems: string[]
  nextSteps: string
}

type StudioProject = Project & {
  code?: string
  tenant?: { name: string } | null
}

type MinuteSectionKey = 'objective' | 'summary' | 'decisions' | 'risks' | 'actions' | 'nextSteps'

type MinuteTemplate = Record<MinuteSectionKey, string>

const defaultTemplate = (): MinuteTemplate => ({
  objective: '',
  summary: '',
  decisions: '',
  risks: '',
  actions: '',
  nextSteps: '',
})

export default function MeetingStudioPage() {
  const { t } = useTranslation()
  const { projectId: projectIdParam } = useParams<{ projectId?: string }>()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const { get, post, isLoading } = useApi()

  const [projects, setProjects] = useState<StudioProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(projectIdParam ?? '')
  const [meetingTitle, setMeetingTitle] = useState('Steering Update')
  const [sessionAt, setSessionAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [template, setTemplate] = useState<MinuteTemplate>(defaultTemplate)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [recordingInfo, setRecordingInfo] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [guidedStep, setGuidedStep] = useState(1)
  const [hoveredGuideStep, setHoveredGuideStep] = useState<number | null>(null)

  useEffect(() => {
    const fetchProjects = async () => {
      const data = await get<StudioProject[]>('/projects')
      if (Array.isArray(data)) {
        setProjects(data)
        if (!selectedProjectId && data[0]?.id) {
          setSelectedProjectId(data[0].id)
        }
      }
    }

    fetchProjects()
  }, [get, selectedProjectId])

  useEffect(() => {
    if (projectIdParam) {
      setSelectedProjectId(projectIdParam)
    }
  }, [projectIdParam])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

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

  const currentGuidedStep = guidedSteps[guidedStep - 1]
  const activeGuideStep = hoveredGuideStep ?? guidedStep
  const activeGuideStepData = guidedSteps[activeGuideStep - 1]
  const stepOneComplete = Boolean(selectedProjectId) && Boolean(meetingTitle.trim()) && Boolean(sessionAt.trim())
  const stepTwoComplete = Boolean(recordingFile) || Boolean(transcript.trim())
  const stepThreeComplete = Boolean(summary.trim()) || Boolean(template.objective.trim()) || Boolean(template.decisions.trim()) || Boolean(template.risks.trim()) || Boolean(template.actions.trim()) || Boolean(template.nextSteps.trim())

  useEffect(() => {
    if (stepOneComplete && guidedStep === 1) {
      setGuidedStep(2)
      return
    }

    if (stepOneComplete && stepTwoComplete && guidedStep === 2) {
      setGuidedStep(3)
    }
  }, [guidedStep, stepOneComplete, stepTwoComplete])

  const isDocxFile = (file: File | null) => {
    if (!file) {
      return false
    }

    return (
      file.name.toLowerCase().endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  }

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
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
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
    '  "decisions": ["string"],',
    '  "risks": ["string"],',
    '  "actionItems": ["string"],',
    '  "nextSteps": "string"',
    '}',
    'Respond in Thai for all text values.',
    '',
    'Document text excerpt (may be truncated if the source document is long):',
    text.slice(0, 2400)
  ].join('\n')

  const preview = useMemo(() => {
    const parts = [
      `Meeting Title: ${meetingTitle}`,
      `Project: ${selectedProject?.name ?? currentTenant?.name ?? '—'}`,
      '',
      '1. Objective',
      template.objective,
      '',
      '2. Executive Summary',
      summary || template.summary,
      '',
      '3. Key Decisions',
      template.decisions,
      '',
      '4. Risks / Issues',
      template.risks,
      '',
      '5. Action Items',
      template.actions,
      '',
      '6. Next Steps',
      template.nextSteps,
      '',
      transcript ? 'Transcript attached below.' : 'No transcript attached yet.'
    ]

    return parts.filter(Boolean).join('\n')
  }, [meetingTitle, selectedProject?.name, currentTenant?.name, template, summary, transcript])

  const handleTranscribe = async () => {
    if (!recordingFile) {
      setError(t('meetings.errors.selectRecording'))
      return
    }

    setError('')
    setStatus(t('meetings.status.transcribing'))
    setIsTranscribing(true)

    try {
      if (isDocxFile(recordingFile)) {
        const mammothModule = (await import('mammoth/mammoth.browser')) as DocxTextExtractor
        const extractRawText = mammothModule.extractRawText ?? mammothModule.default?.extractRawText

        if (!extractRawText) {
          throw new Error(t('meetings.errors.documentExtractionFailed'))
        }

        const extracted = await extractRawText({ arrayBuffer: await recordingFile.arrayBuffer() })
        const extractedText = extracted.value.trim()

        setTranscript(extractedText)
        if (!summary.trim()) {
          setSummary(extractedText.slice(0, 240))
        }

        setStatus(t('meetings.status.analyzingDocument'))

        try {
          const analysisResponse = await fetch('/ai/playground/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'qwen2.5:7b',
              prompt: buildDocxAnalysisPrompt(extractedText)
            })
          })

          const analysisData = await analysisResponse.json()
          if (!analysisResponse.ok) {
            throw new Error(analysisData.message || t('meetings.errors.documentAnalysisFailed'))
          }

          const parsedSummary = parseDocxSummary(analysisData.output || '')
          if (parsedSummary) {
            setSummary(parsedSummary.summary || extractedText.slice(0, 240))
            setTemplate((current) => ({
              ...current,
              objective: parsedSummary.objective || current.objective,
              decisions: parsedSummary.decisions.join('\n'),
              risks: parsedSummary.risks.join('\n'),
              actions: parsedSummary.actionItems.join('\n'),
              nextSteps: parsedSummary.nextSteps || current.nextSteps
            }))
            setRecordingInfo(`${t('meetings.status.documentAnalyzed')}: ${recordingFile.name}`)
            setStatus(t('meetings.status.documentAnalyzed'))
          } else {
            setRecordingInfo(`${t('meetings.status.documentProcessed')}: ${recordingFile.name}`)
            setStatus(t('meetings.status.documentProcessed'))
          }
        } catch {
          setRecordingInfo(`${t('meetings.status.documentProcessed')}: ${recordingFile.name}`)
          setStatus(t('meetings.status.documentProcessed'))
        }
        return
      }

      const uploadForm = new FormData()
      uploadForm.append('audio', recordingFile)

      const uploadResponse = await fetch('/ai/playground/record/upload', {
        method: 'POST',
        body: uploadForm,
      })

      const uploadData = await uploadResponse.json()
      if (!uploadResponse.ok) {
        throw new Error(uploadData.message || t('meetings.errors.uploadFailed'))
      }

      setRecordingInfo(
        `${t('meetings.status.uploadedOnly')}: ${uploadData.fileName}`
      )

      const formData = new FormData()
      formData.append('audio', recordingFile)
      formData.append('model', 'small')
      formData.append('language', 'th')

      const response = await fetch('/ai/playground/transcribe', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        if (response.status === 403 || /Whisper transcription is disabled/i.test(data.message || '')) {
          setStatus(t('meetings.status.uploadedOnly'))
          return
        }
        throw new Error(data.detail || data.message || t('meetings.errors.transcriptionFailed'))
      }

      if (data.transcript) {
        setTranscript(data.transcript)
        if (!summary.trim()) {
          setSummary(data.transcript.slice(0, 240))
        }
      }

      setStatus(t('meetings.status.transcribed'))
    } catch (transcribeError) {
      setError(transcribeError instanceof Error ? transcribeError.message : t('meetings.errors.transcriptionFailed'))
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

    if (!summary.trim()) {
      setError(t('meetings.errors.summaryRequired'))
      return
    }

    setError('')
    setStatus(t('meetings.status.saving'))
    setIsSaving(true)

    try {
      const minutes = [
        { section: t('meetings.template.objective'), content: template.objective || '-' },
        { section: t('meetings.template.summary'), content: summary },
        { section: t('meetings.template.decisions'), content: template.decisions || '-' },
        { section: t('meetings.template.risks'), content: template.risks || '-' },
        { section: t('meetings.template.actions'), content: template.actions || '-' },
        { section: t('meetings.template.nextSteps'), content: template.nextSteps || '-' },
      ]

      await post('/meetings', {
        projectId: selectedProjectId,
        title: meetingTitle.trim(),
        sessionAt: new Date(sessionAt).toISOString(),
        summary: summary.trim(),
        transcript: transcript.trim() || undefined,
        minutes,
        actionItems: [],
      })

      setStatus(t('meetings.status.saved'))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('meetings.errors.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const updateTemplate = (key: MinuteSectionKey, value: string) => {
    setTemplate((current) => ({ ...current, [key]: value }))
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300">
                {t('meetings.guide.label')}
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {t('meetings.guide.hoverHint')}
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                {guidedStep}/3
              </span>
              <button
                type="button"
                onClick={() => setGuidedStep((current) => Math.max(1, current - 1))}
                disabled={guidedStep === 1}
                className="rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                onClick={() => setGuidedStep((current) => Math.min(3, current + 1))}
                disabled={guidedStep === 3}
                className="rounded-full bg-sky-600 px-3 py-1 font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>

          {/*
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            {guidedSteps.map((step, index) => {
              const isActive = guidedStep === index + 1
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setGuidedStep(index + 1)}
                  onMouseEnter={() => setHoveredGuideStep(index + 1)}
                  onMouseLeave={() => setHoveredGuideStep(null)}
                  onFocus={() => setHoveredGuideStep(index + 1)}
                  onBlur={() => setHoveredGuideStep(null)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${isActive ? 'border-sky-400 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900' : 'border-sky-100 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isActive ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700 dark:bg-slate-800 dark:text-sky-300'}`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{step.title}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          */}

          <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-sky-900/50 dark:bg-slate-900 dark:text-slate-200">
            <p className="font-semibold text-slate-900 dark:text-white">{activeGuideStepData.title}</p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{activeGuideStepData.description}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {activeGuideStep === 1 ? t('meetings.guide.recommended') : t('meetings.guide.optional')}
            </p>
          </div>
        </section>

        {(error || status) && (
          <div className={`rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'}`}>
            {error || status}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5 transition ${guidedStep === 1 ? 'border-sky-300 ring-2 ring-sky-100 dark:border-sky-700 dark:ring-sky-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('meetings.tabs.upload')}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('meetings.uploadHelp')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.titleField')}</span>
                <input
                  value={meetingTitle}
                  onChange={(event) => {
                    setMeetingTitle(event.target.value)
                    if (selectedProjectId && event.target.value.trim() && sessionAt.trim()) {
                      setGuidedStep((current) => Math.max(current, 2))
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.sessionAt')}</span>
              <input
                type="datetime-local"
                value={sessionAt}
                onChange={(event) => setSessionAt(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.recordingFile')}</span>
              <input
                type="file"
                accept="audio/*,video/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null
                  setRecordingFile(nextFile)
                  if (nextFile) {
                    setGuidedStep((current) => Math.max(current, 3))
                  }
                }}
                className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 dark:text-slate-300"
              />
            </label>

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
                onChange={(event) => {
                  setTranscript(event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep((current) => Math.max(current, 3))
                  }
                }}
                rows={12}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder={t('meetings.transcriptPlaceholder')}
              />
            </label>
          </section>

          <section className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5 transition ${guidedStep === 2 ? 'border-sky-300 ring-2 ring-sky-100 dark:border-sky-700 dark:ring-sky-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('meetings.tabs.template')}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('meetings.templateHelp')}</p>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.objective')}</span>
              <textarea
                value={template.objective}
                onChange={(event) => {
                  updateTemplate('objective', event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep(3)
                  }
                }}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.summary')}</span>
              <textarea
                value={summary}
                onChange={(event) => {
                  setSummary(event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep(3)
                  }
                }}
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.decisions')}</span>
              <textarea
                value={template.decisions}
                onChange={(event) => {
                  updateTemplate('decisions', event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep(3)
                  }
                }}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.risks')}</span>
              <textarea
                value={template.risks}
                onChange={(event) => {
                  updateTemplate('risks', event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep(3)
                  }
                }}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.actions')}</span>
              <textarea
                value={template.actions}
                onChange={(event) => {
                  updateTemplate('actions', event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep(3)
                  }
                }}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('meetings.template.nextSteps')}</span>
              <textarea
                value={template.nextSteps}
                onChange={(event) => {
                  updateTemplate('nextSteps', event.target.value)
                  if (event.target.value.trim()) {
                    setGuidedStep(3)
                  }
                }}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => void handleSaveMeeting()}
                disabled={isSaving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? t('meetings.status.saving') : t('meetings.actions.saveMeeting')}
              </button>
              <button
                type="button"
                onClick={() => setTemplate(defaultTemplate())}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('meetings.actions.resetTemplate')}
              </button>
            </div>
          </section>
        </div>

        <section className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm transition ${guidedStep === 3 ? 'border-sky-300 ring-2 ring-sky-100 dark:border-sky-700 dark:ring-sky-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
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
      </div>
    </Layout>
  )
}