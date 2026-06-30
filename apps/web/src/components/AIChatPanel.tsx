import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  playgroundResponseMessage,
  playgroundUrl,
  postPlaygroundFormData,
  readPlaygroundJson
} from '../lib/playgroundApi'

type SpeakerLabel = 'A' | 'B' | 'C'

type Segment = {
  speaker: SpeakerLabel
  text: string
  startMs?: number
  endMs?: number
}

type VoiceFrame = {
  ts: number
  energy: number
  centroid: number
}

type SpeakerProfile = {
  energy: number
  centroid: number
  count: number
  lastSeen: number
}

type AppLink = {
  label?: string
  url: string
  type: 'meeting' | 'project' | 'action' | 'knowledge'
  sourceId?: string
  context?: string
}

type PersistedChatState = {
  prompt: string
  result: string
  answerLinks: AppLink[]
}

type SpeechRecognitionCtor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0?: { transcript?: string }
  }>
}

const DEFAULT_MODEL = 'qwen2.5:7b'
const CHAT_STATE_KEY_PREFIX = 'aicentralize-ai-chat-state'

function calculateRms(samples: Float32Array<ArrayBufferLike> | null): number {
  if (!samples || !samples.length) {
    return 0
  }

  let sum = 0
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] || 0
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

function calculateSpectralCentroid(freq: Uint8Array<ArrayBufferLike> | null, sampleRate: number): number {
  if (!freq || !freq.length) {
    return 0
  }

  let weighted = 0
  let total = 0
  const binHz = sampleRate / 2 / freq.length
  for (let i = 0; i < freq.length; i += 1) {
    const mag = freq[i] || 0
    total += mag
    weighted += mag * i * binHz
  }

  if (!total) {
    return 0
  }

  return weighted / total
}

function formatWallClock(baseWallStart: number, offsetMs = 0): string {
  if (!baseWallStart) {
    return '--:--:--'
  }

  const dt = new Date(baseWallStart + Math.max(0, offsetMs))
  return dt.toTimeString().slice(0, 8)
}

function buildTurns(items: Segment[]): Segment[] {
  const turns: Segment[] = []
  const maxTurnGapMs = 2600

  for (const seg of items) {
    const startMs = typeof seg.startMs === 'number' ? seg.startMs : 0
    const endMs = typeof seg.endMs === 'number' ? seg.endMs : startMs
    const last = turns[turns.length - 1]
    const isContinuous =
      last &&
      last.speaker === seg.speaker &&
      startMs - (last.endMs ?? 0) <= maxTurnGapMs

    if (isContinuous && last) {
      last.endMs = Math.max(last.endMs ?? 0, endMs)
      last.text = `${last.text} ${seg.text}`.trim()
      continue
    }

    turns.push({
      speaker: seg.speaker,
      text: seg.text,
      startMs,
      endMs
    })
  }

  return turns
}

function parseEditedTranscript(rawText: string): Array<{ speaker: SpeakerLabel; text: string }> {
  const raw = (rawText || '').trim()
  if (!raw) {
    return []
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const parsed: Array<{ speaker: SpeakerLabel; text: string }> = []
  const speakerLinePattern = /^(?:\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}\s*\|\s*)?Speaker\s*([ABC])(?:\s*\([^)]*\))?\s*:\s*(.+)$/i

  for (const line of lines) {
    const matched = line.match(speakerLinePattern)
    if (matched) {
      parsed.push({
        speaker: matched[1].toUpperCase() as SpeakerLabel,
        text: (matched[2] || '').trim()
      })
      continue
    }

    parsed.push({ speaker: 'A', text: line })
  }

  return parsed.filter((item) => item.text)
}

function normalizeAppLinks(raw: unknown): AppLink[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const value = item as Partial<AppLink>
      const type = value.type
      const url = typeof value.url === 'string' ? value.url : ''
      if (!url.startsWith('/') || (type !== 'meeting' && type !== 'project' && type !== 'action')) {
        return null
      }

      const normalized: AppLink = {
        label: typeof value.label === 'string' ? value.label : undefined,
        url,
        type,
        sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
        context: typeof value.context === 'string' ? value.context : undefined
      }

      return normalized
    })
    .filter((item): item is AppLink => Boolean(item))
    .slice(0, 6)
}

type AIChatPanelProps = {
  projectId?: string
}

export default function AIChatPanel({ projectId }: AIChatPanelProps) {
  const { t } = useTranslation()
  const chatStateKey = `${CHAT_STATE_KEY_PREFIX}:${projectId || 'dashboard'}`
  const [activeTab, setActiveTab] = useState<'prompt' | 'record'>('prompt')
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(t('aiChat.status.ready'))
  const [status, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState('')
  const [audioInfo, setAudioInfo] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [recordingWallStart, setRecordingWallStart] = useState(0)
  const [transcriptText, setTranscriptText] = useState('')
  const [isTranscriptDirty, setIsTranscriptDirty] = useState(false)
  const [liveTranscriptText, setLiveTranscriptText] = useState('')
  const [notesText, setNotesText] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [answerLinks, setAnswerLinks] = useState<AppLink[]>([])

  const statusTimerRef = useRef<number | null>(null)
  const typingTimerRef = useRef<number | null>(null)
  const copyNoticeTimerRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const analysisTimerRef = useRef<number | null>(null)
  const timeDomainDataRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const voiceFramesRef = useRef<VoiceFrame[]>([])
  const speakerProfilesRef = useRef<Record<SpeakerLabel, SpeakerProfile | undefined>>({ A: undefined, B: undefined, C: undefined })
  const autoSpeakerIndexRef = useRef(0)
  const lastSegmentAtRef = useRef(0)
  const lastAssignedSpeakerRef = useRef<SpeakerLabel | null>(null)
  const lastSpeakerSwitchAtRef = useRef(0)
  const lastAutoTranscriptRef = useRef('')

  const persistChatState = (nextPrompt: string, nextResult: string, nextLinks: AppLink[]) => {
    window.sessionStorage.setItem(
      chatStateKey,
      JSON.stringify({
        prompt: nextPrompt,
        result: nextResult,
        answerLinks: nextLinks
      } satisfies PersistedChatState)
    )
  }

  const clearPersistedChatState = () => {
    window.sessionStorage.removeItem(chatStateKey)
  }

  const renderedTranscript = useMemo(() => {
    if (!segments.length) {
      return ''
    }

    const turns = buildTurns(segments)
    return turns
      .map((t) => {
        const from = formatWallClock(recordingWallStart, t.startMs)
        const to = formatWallClock(recordingWallStart, t.endMs)
        const durationSec = Math.max(0, ((t.endMs ?? 0) - (t.startMs ?? 0)) / 1000)
        return `${from} - ${to} | Speaker ${t.speaker} (${durationSec.toFixed(1)}s): ${t.text}`
      })
      .join('\n')
  }, [segments, recordingWallStart])

  useEffect(() => {
    setLiveTranscriptText(renderedTranscript)

    if (!isTranscriptDirty && renderedTranscript) {
      setTranscriptText(renderedTranscript)
    }
  }, [renderedTranscript])

  useEffect(() => {
    const raw = window.sessionStorage.getItem(chatStateKey)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PersistedChatState>
      if (typeof parsed.prompt === 'string') {
        setPrompt(parsed.prompt)
      }
      if (typeof parsed.result === 'string' && parsed.result.trim()) {
        setResult(parsed.result)
      }
      setAnswerLinks(normalizeAppLinks(parsed.answerLinks))
    } catch {
      clearPersistedChatState()
    }
  }, [chatStateKey])

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearInterval(statusTimerRef.current)
      }
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
      }
      if (analysisTimerRef.current) {
        window.clearInterval(analysisTimerRef.current)
      }
      if (copyNoticeTimerRef.current) {
        window.clearTimeout(copyNoticeTimerRef.current)
      }

      const recognition = recognitionRef.current
      if (recognition) {
        try {
          recognition.stop()
        } catch {
          // no-op
        }
      }

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // no-op
        }
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      stopVoiceAnalysis()
    }
  }, [])

  const startStatusPulse = () => {
    const base = t('aiChat.status.generating')
    const frames = [base, `${base}.`, `${base}..`, `${base}...`]
    let idx = 0
    setStatus(frames[idx])

    if (statusTimerRef.current) {
      window.clearInterval(statusTimerRef.current)
    }
    statusTimerRef.current = window.setInterval(() => {
      idx = (idx + 1) % frames.length
      setStatus(frames[idx])
    }, 260)
  }

  const stopStatusPulse = (finalText = '') => {
    if (statusTimerRef.current) {
      window.clearInterval(statusTimerRef.current)
      statusTimerRef.current = null
    }
    setStatus(finalText)
  }

  const stopTyping = () => {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current)
      typingTimerRef.current = null
    }
  }

  const typewrite = (text: string, onDone: () => void) => {
    stopTyping()
    const chars = Array.from(text || '')
    if (!chars.length) {
      setResult('')
      onDone()
      return
    }

    const step = Math.max(1, Math.floor(chars.length / 220))
    let i = 0
    setResult('')
    typingTimerRef.current = window.setInterval(() => {
      i += step
      setResult(chars.slice(0, i).join(''))
      if (i >= chars.length) {
        stopTyping()
        onDone()
      }
    }, 12)
  }

  const getRecentVoiceFeature = (nowMs: number): { energy: number; centroid: number } | null => {
    const windowMs = 1400
    const recent = voiceFramesRef.current.filter((f) => nowMs - f.ts <= windowMs)
    if (!recent.length) {
      return null
    }

    const total = recent.reduce(
      (acc, frame) => {
        acc.energy += frame.energy
        acc.centroid += frame.centroid
        return acc
      },
      { energy: 0, centroid: 0 }
    )

    return {
      energy: total.energy / recent.length,
      centroid: total.centroid / recent.length
    }
  }

  const updateSpeakerProfile = (speaker: SpeakerLabel, feature: { energy: number; centroid: number }, nowMs: number) => {
    const prev = speakerProfilesRef.current[speaker]
    if (!prev) {
      speakerProfilesRef.current[speaker] = {
        energy: feature.energy,
        centroid: feature.centroid,
        count: 1,
        lastSeen: nowMs
      }
      return
    }

    const n = Math.min(prev.count + 1, 12)
    speakerProfilesRef.current[speaker] = {
      energy: (prev.energy * (n - 1) + feature.energy) / n,
      centroid: (prev.centroid * (n - 1) + feature.centroid) / n,
      count: n,
      lastSeen: nowMs
    }
  }

  const assignSpeaker = (speaker: SpeakerLabel, feature: { energy: number; centroid: number } | null, nowMs: number): SpeakerLabel => {
    if (feature) {
      updateSpeakerProfile(speaker, feature, nowMs)
    }

    if (lastAssignedSpeakerRef.current !== speaker) {
      lastSpeakerSwitchAtRef.current = nowMs
    }

    lastAssignedSpeakerRef.current = speaker
    lastSegmentAtRef.current = nowMs
    return speaker
  }

  const nextAutoSpeaker = (nowMs: number): SpeakerLabel => {
    const labels: SpeakerLabel[] = ['A', 'B', 'C']

    if (!lastSegmentAtRef.current) {
      lastSegmentAtRef.current = nowMs
      return labels[autoSpeakerIndexRef.current]
    }

    const gap = nowMs - lastSegmentAtRef.current
    if (gap > 4200) {
      autoSpeakerIndexRef.current = (autoSpeakerIndexRef.current + 1) % 3
    }

    lastSegmentAtRef.current = nowMs
    return labels[autoSpeakerIndexRef.current]
  }

  const chooseSpeakerByVoice = (nowMs: number): SpeakerLabel => {
    const sameSpeakerHoldMs = 7000
    const switchCooldownMs = 10000
    const strongSwitchDist = 0.4
    const strongSwitchMargin = 0.28

    const feature = getRecentVoiceFeature(nowMs)
    if (!feature) {
      if (lastAssignedSpeakerRef.current && nowMs - lastSegmentAtRef.current <= sameSpeakerHoldMs) {
        return assignSpeaker(lastAssignedSpeakerRef.current, null, nowMs)
      }
      return assignSpeaker(nextAutoSpeaker(nowMs), null, nowMs)
    }

    const labels: SpeakerLabel[] = ['A', 'B', 'C']
    let bestSpeaker: SpeakerLabel | null = null
    let bestDist = Number.POSITIVE_INFINITY
    const distances: Partial<Record<SpeakerLabel, number>> = {}
    const centroidScale = 2400
    const energyScale = 0.12

    for (const label of labels) {
      const profile = speakerProfilesRef.current[label]
      if (!profile) {
        continue
      }

      const dCentroid = Math.abs(feature.centroid - profile.centroid) / centroidScale
      const dEnergy = Math.abs(feature.energy - profile.energy) / energyScale
      const dist = dCentroid + dEnergy
      distances[label] = dist
      if (dist < bestDist) {
        bestDist = dist
        bestSpeaker = label
      }
    }

    const threshold = 0.78
    if (bestSpeaker && bestDist <= threshold) {
      if (lastAssignedSpeakerRef.current && bestSpeaker !== lastAssignedSpeakerRef.current) {
        const sinceSwitch = nowMs - lastSpeakerSwitchAtRef.current
        const currentDist = distances[lastAssignedSpeakerRef.current]
        const isStrongSwitch =
          bestDist <= strongSwitchDist &&
          (typeof currentDist !== 'number' || currentDist - bestDist >= strongSwitchMargin)

        if (sinceSwitch < switchCooldownMs && !isStrongSwitch) {
          return assignSpeaker(lastAssignedSpeakerRef.current, feature, nowMs)
        }
      }
      return assignSpeaker(bestSpeaker, feature, nowMs)
    }

    for (const label of labels) {
      if (!speakerProfilesRef.current[label]) {
        return assignSpeaker(label, feature, nowMs)
      }
    }

    if (lastAssignedSpeakerRef.current && nowMs - lastSegmentAtRef.current <= sameSpeakerHoldMs) {
      return assignSpeaker(lastAssignedSpeakerRef.current, feature, nowMs)
    }

    return assignSpeaker(bestSpeaker || nextAutoSpeaker(nowMs), feature, nowMs)
  }

  const startVoiceAnalysis = (stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) {
        return
      }

      const context = new Ctx()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)

      audioContextRef.current = context
      micSourceRef.current = source
      analyserNodeRef.current = analyser
      timeDomainDataRef.current = new Float32Array(analyser.fftSize)
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount)

      analysisTimerRef.current = window.setInterval(() => {
        const node = analyserNodeRef.current
        const td = timeDomainDataRef.current
        const fd = freqDataRef.current
        const ctx = audioContextRef.current
        if (!node || !td || !fd || !ctx) {
          return
        }

        node.getFloatTimeDomainData(td)
        node.getByteFrequencyData(fd)

        const energy = calculateRms(td)
        if (energy < 0.012) {
          return
        }

        const centroid = calculateSpectralCentroid(fd, ctx.sampleRate || 48000)
        voiceFramesRef.current.push({ ts: Date.now(), energy, centroid })
        if (voiceFramesRef.current.length > 160) {
          voiceFramesRef.current = voiceFramesRef.current.slice(-160)
        }
      }, 120)
    } catch {
      // Continue recording even if audio feature extraction is unavailable.
    }
  }

  const stopVoiceAnalysis = () => {
    if (analysisTimerRef.current) {
      window.clearInterval(analysisTimerRef.current)
      analysisTimerRef.current = null
    }

    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect()
      } catch {
        // no-op
      }
    }

    if (analyserNodeRef.current) {
      try {
        analyserNodeRef.current.disconnect()
      } catch {
        // no-op
      }
    }

    micSourceRef.current = null
    analyserNodeRef.current = null
    timeDomainDataRef.current = null
    freqDataRef.current = null

    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close()
      } catch {
        // no-op
      }
      audioContextRef.current = null
    }
  }

  const addSegment = (text: string) => {
    const trimmed = (text || '').trim()
    if (!trimmed) {
      return
    }

    const now = Date.now()
    const startMs = Math.max(0, now - recordingStartRef.current - 800)
    const endMs = Math.max(startMs, now - recordingStartRef.current)
    const speaker = chooseSpeakerByVoice(now)

    setSegments((prev) => [
      ...prev,
      {
        speaker,
        text: trimmed,
        startMs,
        endMs
      }
    ])
  }

  const cleanupRecognition = () => {
    const recognition = recognitionRef.current
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        // no-op
      }
      recognitionRef.current = null
    }
  }

  const startSpeechRecognition = () => {
    const SR = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition

    if (!SR) {
      setRecordingStatus(t('aiChat.recording.audioOnlyFallback'))
      return
    }

    const recognition = new SR()
    recognition.lang = 'th-TH'
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const resultItem = event.results[i]
        if (!resultItem?.isFinal) {
          continue
        }
        const text = resultItem[0]?.transcript || ''
        addSegment(text)
      }
    }

    recognition.onerror = (event: { error: string }) => {
      setRecordingStatus(t('aiChat.recording.speechWarning', { error: event.error }))
    }

    recognition.onend = () => {
      if (isRecording) {
        try {
          recognition.start()
        } catch {
          // no-op
        }
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch {
      // no-op
    }
  }

  const uploadAudio = async (blob: Blob) => {
    const fd = new FormData()
    fd.append('audio', blob, `meeting-${Date.now()}.webm`)
    return postPlaygroundFormData<{ fileName: string; size: number }>('/record/upload', fd)
  }

  const buildFallbackTranscript = () => {
    const turns = buildTurns(segments)
    if (!turns.length) {
      return ''
    }

    return turns
      .map((t) => {
        const from = formatWallClock(recordingWallStart, t.startMs)
        const to = formatWallClock(recordingWallStart, t.endMs)
        return `${from} - ${to} | Speaker ${t.speaker}: ${t.text}`
      })
      .join('\n')
  }

  const transcribeAudio = async (blob: Blob) => {
    const fd = new FormData()
    fd.append('audio', blob, `meeting-${Date.now()}.webm`)
    fd.append('model', 'tiny')
    fd.append('language', 'th')

    const controller = new AbortController()
    const timeoutMs = 45000
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(playgroundUrl('/transcribe'), {
        method: 'POST',
        body: fd,
        signal: controller.signal
      })

      const data = await readPlaygroundJson<{
        message?: string
        detail?: string
        transcript?: string
        language?: string
        languageProbability?: number
        segmentCount?: number
        fileName?: string
        fileUrl?: string
      }>(response)

      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : ''
        throw new Error(detail || playgroundResponseMessage(data, t('aiChat.errors.transcriptionFailed')))
      }

      return data
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  const analyzeSegments = async (items: Segment[]) => {
    const response = await fetch('/ai/playground/diarize-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        segments: buildTurns(items),
        language: 'Thai'
      })
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || data.message || t('aiChat.errors.analyzeFailed'))
    }

    return data as { transcript?: string; summary?: string }
  }

  const resetDiarizationState = () => {
    voiceFramesRef.current = []
    speakerProfilesRef.current = { A: undefined, B: undefined, C: undefined }
    autoSpeakerIndexRef.current = 0
    lastSegmentAtRef.current = 0
    lastAssignedSpeakerRef.current = null
    lastSpeakerSwitchAtRef.current = 0
    lastAutoTranscriptRef.current = ''
  }

  const startRecording = async () => {
    if (isRecording) {
      return
    }

    setIsRecording(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      setSegments([])
      setRecordingWallStart(Date.now())
      recordingStartRef.current = Date.now()
      setIsTranscriptDirty(false)
      lastAutoTranscriptRef.current = ''
      resetDiarizationState()
      startVoiceAnalysis(stream)

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.start(300)
      setRecordingStatus(t('aiChat.recording.recordingActive'))
      startSpeechRecognition()
    } catch (error) {
      setIsRecording(false)
      setRecordingStatus(error instanceof Error ? error.message : t('aiChat.errors.cannotStartRecording'))
    }
  }

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current
    const stream = mediaStreamRef.current
    if (!isRecording || !recorder || !stream) {
      return
    }

    setIsRecording(false)
    setRecordingStatus(t('aiChat.recording.stopping'))
    cleanupRecognition()
    stopVoiceAnalysis()

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    stream.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    const browserTranscript = buildFallbackTranscript()

    if (browserTranscript) {
      setLiveTranscriptText(browserTranscript)
      if (!isTranscriptDirty) {
        setTranscriptText(browserTranscript)
      }

      try {
        const uploaded = await uploadAudio(audioBlob)
        setAudioInfo(t('aiChat.recording.savedFile', { fileName: uploaded.fileName, countSuffix: '' }))
      } catch (error) {
        setAudioInfo(error instanceof Error ? error.message : t('aiChat.errors.uploadFailed'))
      }

      setRecordingStatus(t('aiChat.recording.browserTranscriptReady', {
        defaultValue: 'Browser transcript is ready. Edit it if needed, then click Analyze Transcript.'
      }))
      return
    }

    try {
      setRecordingStatus(t('aiChat.recording.transcribingWhisper'))
      const transcribed = await transcribeAudio(audioBlob)

      if (transcribed.transcript) {
        setLiveTranscriptText(transcribed.transcript)
        if (!isTranscriptDirty) {
          setTranscriptText(transcribed.transcript)
        }
      }

      setAudioInfo(
        transcribed.fileName
          ? t('aiChat.recording.savedFile', {
              fileName: transcribed.fileName,
              countSuffix: transcribed.segmentCount ? t('aiChat.recording.segmentCount', { count: transcribed.segmentCount }) : ''
            })
          : t('aiChat.recording.transcribedWithWhisper', {
              countSuffix: transcribed.segmentCount ? t('aiChat.recording.segmentCount', { count: transcribed.segmentCount }) : ''
            })
      )
      setRecordingStatus(t('aiChat.recording.transcriptionComplete'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : ''
      const whisperDisabled = /Whisper transcription is disabled by system settings/i.test(errorMessage)
      const fallbackTranscript = buildFallbackTranscript()
      if (fallbackTranscript) {
        setLiveTranscriptText(fallbackTranscript)
        if (!isTranscriptDirty) {
          setTranscriptText(fallbackTranscript)
        }
        if (whisperDisabled) {
          setAudioInfo(t('aiChat.recording.whisperDisabledInfo'))
          setRecordingStatus(t('aiChat.recording.whisperDisabledReady'))
        } else {
          setAudioInfo(t('aiChat.recording.whisperTimeoutInfo'))
          setRecordingStatus(t('aiChat.recording.whisperTimeoutReady'))
        }
        return
      }

      setRecordingStatus(errorMessage || t('aiChat.errors.processRecordingFailed'))
    }
  }

  const analyzeRecordingTranscript = async () => {
    try {
      const edited = parseEditedTranscript(transcriptText)
      if (!edited.length) {
        throw new Error(t('aiChat.errors.addTranscriptBeforeAnalyze'))
      }

      setRecordingStatus(t('aiChat.recording.analyzingWithQwen'))
      const analyzed = await analyzeSegments(
        edited.map((item) => ({
          speaker: item.speaker,
          text: item.text
        }))
      )

      setPrompt(analyzed.transcript || '')
      if (notesText.trim()) {
        setPrompt(`${analyzed.transcript || ''}\n\n${t('aiChat.labels.notes')}:\n${notesText.trim()}`.trim())
      }
      setActiveTab('prompt')
      typewrite(analyzed.summary || '', () => setStatus(t('aiChat.status.done')))
      setRecordingStatus(t('aiChat.recording.transcriptAnalyzed'))
    } catch (error) {
      setRecordingStatus(error instanceof Error ? error.message : t('aiChat.errors.analyzeFailed'))
    }
  }

  const generate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) {
      setStatus(t('aiChat.errors.enterPromptFirst'))
      return
    }

    stopTyping()
    setIsBusy(true)
    startStatusPulse()
    setResult('')
    setAnswerLinks([])
    clearPersistedChatState()

    try {
      const accessToken = localStorage.getItem('accessToken')
      const response = await fetch('/ai/playground/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          prompt: cleanPrompt,
          model: DEFAULT_MODEL,
          ...(projectId ? { projectId } : {})
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.message || t('aiChat.errors.requestFailed'))
      }

      const output = data.output || t('aiChat.status.noOutput')
      const links = normalizeAppLinks(data.appLinks)
      setAnswerLinks(links)
      typewrite(output, () => {
        persistChatState(cleanPrompt, output, links)
        stopStatusPulse(t('aiChat.status.done'))
      })
    } catch (error) {
      setResult('')
      setAnswerLinks([])
      stopStatusPulse(error instanceof Error ? error.message : t('aiChat.errors.generateFailed'))
    } finally {
      setIsBusy(false)
    }
  }

  const copyText = async (value: string) => {
    const text = (value || '').trim()
    if (!text) {
      return false
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const temp = document.createElement('textarea')
    temp.value = text
    temp.setAttribute('readonly', '')
    temp.style.position = 'absolute'
    temp.style.left = '-9999px'
    document.body.appendChild(temp)
    temp.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(temp)
    return copied
  }

  const copyResultAnswer = async () => {
    try {
      const copied = await copyText(result)
      setCopyNotice(copied ? t('aiChat.status.copied') : t('aiChat.errors.copyFailed'))
    } catch {
      setCopyNotice(t('aiChat.errors.copyFailed'))
    }

    if (copyNoticeTimerRef.current) {
      window.clearTimeout(copyNoticeTimerRef.current)
    }
    copyNoticeTimerRef.current = window.setTimeout(() => {
      setCopyNotice('')
      copyNoticeTimerRef.current = null
    }, 2200)
  }

  const clearAll = () => {
    stopTyping()
    stopStatusPulse('')
    setPrompt('')
    setResult(t('aiChat.status.ready'))
    setSegments([])
    setRecordingWallStart(0)
    setRecordingStatus('')
    setAudioInfo('')
    setIsBusy(false)
    setIsTranscriptDirty(false)
    setLiveTranscriptText('')
    setNotesText('')
    setCopyNotice('')
    setAnswerLinks([])
    clearPersistedChatState()
    resetDiarizationState()
    setTranscriptText('')
  }

  const canCopyResult = !!result.trim() && result !== t('aiChat.status.ready')
  const appLinkLabel = (link: AppLink) => {
    if (link.type === 'meeting') {
      return t('aiChat.links.openMeeting')
    }
    if (link.type === 'action') {
      return t('aiChat.links.openActions')
    }
    return t('aiChat.links.openProject')
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('aiChat.title')}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400">{t('aiChat.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'prompt'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t('aiChat.tabs.textPrompt')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('record')}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'record'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t('aiChat.tabs.recordTranscript')}
          </button>
        </div>
      </div>

      {activeTab === 'prompt' ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <textarea
              id="dashboard-ai-prompt"
              aria-label={t('aiChat.labels.prompt')}
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('aiChat.placeholders.askAnything')}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  void generate()
                }
              }}
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void generate()}
                disabled={isBusy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy ? t('aiChat.status.generating') : t('aiChat.actions.generate')}
              </button>
              <button
                onClick={clearAll}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t('aiChat.actions.clear')}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300">{t('aiChat.labels.result')}</label>
              <button
                type="button"
                onClick={() => void copyResultAnswer()}
                disabled={!canCopyResult}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t('aiChat.actions.copyAnswer')}
              </button>
            </div>
            <div className={`max-h-[62vh] min-h-[360px] overflow-auto break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm leading-relaxed text-gray-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 ${isBusy ? 'animate-pulse' : ''}`}>
              <div className="whitespace-pre-wrap">{result}</div>
              {answerLinks.length > 0 && (
                <div className="mt-3 border-t border-gray-200 pt-3 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                    {t('aiChat.links.title')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {answerLinks.map((link) => (
                      <Link
                        key={`${link.type}-${link.url}`}
                        to={link.url}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-950 dark:text-blue-200 dark:hover:bg-blue-950/40"
                        title={link.context}
                      >
                        {appLinkLabel(link)}
                        {link.context ? ` · ${link.context}` : ''}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 min-h-[1.2em] text-xs text-gray-500 dark:text-slate-400">{copyNotice}</div>
            <div className="mt-2 min-h-[1.2em] text-sm text-gray-500 dark:text-slate-400">{status}</div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-slate-300">{t('aiChat.recording.recordMeeting')}</label>
          <p className="text-xs text-gray-500 dark:text-slate-400">{t('aiChat.recording.recordHelp')}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {!isRecording ? (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                {t('aiChat.actions.startRecording')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stopRecording()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                {t('aiChat.actions.stopRecording')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void analyzeRecordingTranscript()}
              className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-600 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-blue-900/20"
            >
              {t('aiChat.actions.analyzeTranscript')}
            </button>
          </div>

          <div className="mt-3 min-h-[1.2em] text-xs text-gray-500 dark:text-slate-400">{recordingStatus}</div>
          <div className="mt-2 min-h-[1.2em] text-xs text-gray-500 dark:text-slate-400">{audioInfo}</div>
          <div className="mt-3">
            <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-slate-300">
              {t('aiChat.labels.transcript')}
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">
              {t('aiChat.recording.transcriptHelp')}
            </p>
            <textarea
            value={transcriptText}
            onChange={(event) => {
              setTranscriptText(event.target.value)
              setIsTranscriptDirty(true)
            }}
            className="min-h-[220px] w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            placeholder={'Speaker A: ...\nSpeaker B: ...'}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsTranscriptDirty(false)
                  setTranscriptText(liveTranscriptText || renderedTranscript || transcriptText)
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t('aiChat.actions.useLatestLiveTranscript')}
              </button>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {isTranscriptDirty ? t('aiChat.status.editedManually') : t('aiChat.status.autoSynced')}
              </span>
            </div>
          </div>

          <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
              {t('aiChat.labels.advancedOptions')}
            </summary>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <div className="mb-2 font-semibold">{t('aiChat.labels.liveTranscriptPreview')}</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {liveTranscriptText || t('aiChat.status.waitingTranscript')}
              </pre>
            </div>

            <div className="mt-3">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-slate-300">
                {t('aiChat.labels.notesOptional')}
              </label>
              <textarea
                value={notesText}
                onChange={(event) => setNotesText(event.target.value)}
                className="min-h-[120px] w-full resize-y rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder={'e.g. หัวหน้า\n- follow up tomorrow\n- check budget'}
              />
            </div>
          </details>
        </div>
      )}
    </section>
  )
}
