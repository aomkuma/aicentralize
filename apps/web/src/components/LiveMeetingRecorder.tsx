import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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

export type LiveMeetingRecordingResult = {
  audioBlob: Blob
  fileName: string
  transcript: string
}

type LiveMeetingRecorderProps = {
  onRecordingReady: (result: LiveMeetingRecordingResult) => void | Promise<void>
  disabled?: boolean
}

function calculateRms(samples: Float32Array<ArrayBufferLike> | null): number {
  if (!samples?.length) {
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
  if (!freq?.length) {
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

  return total ? weighted / total : 0
}

function formatWallClock(baseWallStart: number, offsetMs = 0): string {
  if (!baseWallStart) {
    return '--:--:--'
  }

  return new Date(baseWallStart + Math.max(0, offsetMs)).toTimeString().slice(0, 8)
}

function buildTurns(items: Segment[]): Segment[] {
  const turns: Segment[] = []
  const maxTurnGapMs = 2600

  for (const seg of items) {
    const startMs = typeof seg.startMs === 'number' ? seg.startMs : 0
    const endMs = typeof seg.endMs === 'number' ? seg.endMs : startMs
    const last = turns[turns.length - 1]
    const isContinuous = last && last.speaker === seg.speaker && startMs - (last.endMs ?? 0) <= maxTurnGapMs

    if (isContinuous && last) {
      last.endMs = Math.max(last.endMs ?? 0, endMs)
      last.text = `${last.text} ${seg.text}`.trim()
      continue
    }

    turns.push({ speaker: seg.speaker, text: seg.text, startMs, endMs })
  }

  return turns
}

export default function LiveMeetingRecorder({ onRecordingReady, disabled = false }: LiveMeetingRecorderProps) {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [recordingWallStart, setRecordingWallStart] = useState(0)

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

  const liveTranscript = useMemo(() => {
    return buildTurns(segments)
      .map((turn) => {
        const from = formatWallClock(recordingWallStart, turn.startMs)
        const to = formatWallClock(recordingWallStart, turn.endMs)
        return `${from} - ${to} | Speaker ${turn.speaker}: ${turn.text}`
      })
      .join('\n')
  }, [recordingWallStart, segments])

  useEffect(() => () => {
    cleanupRecognition()
    stopVoiceAnalysis()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const resetDiarizationState = () => {
    voiceFramesRef.current = []
    speakerProfilesRef.current = { A: undefined, B: undefined, C: undefined }
    autoSpeakerIndexRef.current = 0
    lastSegmentAtRef.current = 0
    lastAssignedSpeakerRef.current = null
    lastSpeakerSwitchAtRef.current = 0
  }

  const assignSpeaker = (label: SpeakerLabel, feature: VoiceFrame, nowMs: number): SpeakerLabel => {
    const current = speakerProfilesRef.current[label]
    speakerProfilesRef.current[label] = current
      ? {
          energy: current.energy * 0.82 + feature.energy * 0.18,
          centroid: current.centroid * 0.82 + feature.centroid * 0.18,
          count: current.count + 1,
          lastSeen: nowMs
        }
      : { energy: feature.energy, centroid: feature.centroid, count: 1, lastSeen: nowMs }

    lastAssignedSpeakerRef.current = label
    lastSegmentAtRef.current = nowMs
    return label
  }

  const nextAutoSpeaker = (nowMs: number): SpeakerLabel => {
    const labels: SpeakerLabel[] = ['A', 'B', 'C']
    if (nowMs - lastSpeakerSwitchAtRef.current > 8000) {
      autoSpeakerIndexRef.current = (autoSpeakerIndexRef.current + 1) % labels.length
      lastSpeakerSwitchAtRef.current = nowMs
    }
    return labels[autoSpeakerIndexRef.current]
  }

  const chooseSpeakerByVoice = (nowMs: number): SpeakerLabel => {
    const labels: SpeakerLabel[] = ['A', 'B', 'C']
    const recent = voiceFramesRef.current.slice(-6)
    const feature = recent.length
      ? {
          ts: nowMs,
          energy: recent.reduce((sum, item) => sum + item.energy, 0) / recent.length,
          centroid: recent.reduce((sum, item) => sum + item.centroid, 0) / recent.length
        }
      : { ts: nowMs, energy: 0, centroid: 0 }

    let bestSpeaker: SpeakerLabel | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const label of labels) {
      const profile = speakerProfilesRef.current[label]
      if (!profile) {
        return assignSpeaker(label, feature, nowMs)
      }

      const score = Math.abs(profile.energy - feature.energy) * 120 + Math.abs(profile.centroid - feature.centroid) / 95
      if (score < bestScore) {
        bestScore = score
        bestSpeaker = label
      }
    }

    if (lastAssignedSpeakerRef.current && nowMs - lastSegmentAtRef.current <= 3800) {
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

        voiceFramesRef.current.push({
          ts: Date.now(),
          energy,
          centroid: calculateSpectralCentroid(fd, ctx.sampleRate || 48000)
        })
        if (voiceFramesRef.current.length > 160) {
          voiceFramesRef.current = voiceFramesRef.current.slice(-160)
        }
      }, 120)
    } catch {
      // Continue recording even if speaker estimation is unavailable.
    }
  }

  const stopVoiceAnalysis = () => {
    if (analysisTimerRef.current) {
      window.clearInterval(analysisTimerRef.current)
      analysisTimerRef.current = null
    }
    try {
      micSourceRef.current?.disconnect()
    } catch {
      // no-op
    }
    try {
      analyserNodeRef.current?.disconnect()
    } catch {
      // no-op
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
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }

    const now = Date.now()
    const startMs = Math.max(0, now - recordingStartRef.current - 800)
    const endMs = Math.max(startMs, now - recordingStartRef.current)

    setSegments((current) => [
      ...current,
      {
        speaker: chooseSpeakerByVoice(now),
        text: trimmed,
        startMs,
        endMs
      }
    ])
  }

  const cleanupRecognition = () => {
    const recognition = recognitionRef.current
    if (!recognition) {
      return
    }

    try {
      recognition.stop()
    } catch {
      // no-op
    }
    recognitionRef.current = null
  }

  const startSpeechRecognition = () => {
    const SR = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition

    if (!SR) {
      setStatus(t('aiChat.recording.audioOnlyFallback'))
      return
    }

    const recognition = new SR()
    recognition.lang = 'th-TH'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const resultItem = event.results[i]
        if (resultItem?.isFinal) {
          addSegment(resultItem[0]?.transcript || '')
        }
      }
    }
    recognition.onerror = (event: { error: string }) => setStatus(t('aiChat.recording.speechWarning', { error: event.error }))
    recognition.onend = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
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

  const startRecording = async () => {
    if (isRecording || disabled) {
      return
    }

    setIsRecording(true)
    setStatus('')
    setSegments([])
    resetDiarizationState()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recordingStartRef.current = Date.now()
      setRecordingWallStart(Date.now())
      startVoiceAnalysis(stream)

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.start(300)
      setStatus(t('aiChat.recording.recordingActive'))
      startSpeechRecognition()
    } catch (error) {
      setIsRecording(false)
      setStatus(error instanceof Error ? error.message : t('aiChat.errors.cannotStartRecording'))
    }
  }

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current
    const stream = mediaStreamRef.current
    if (!isRecording || !recorder || !stream) {
      return
    }

    setIsRecording(false)
    setStatus(t('aiChat.recording.stopping'))
    cleanupRecognition()
    stopVoiceAnalysis()

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    stream.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null

    const fileName = `meeting-live-${Date.now()}.webm`
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    await onRecordingReady({ audioBlob, fileName, transcript: liveTranscript })
    setStatus(t('aiChat.recording.browserTranscriptReady', {
      defaultValue: 'Browser transcript is ready.'
    }))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('meetings.liveRecorder.title', { defaultValue: 'Live recording' })}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('meetings.liveRecorder.help', { defaultValue: 'Record from the microphone and send the transcript into the meeting flow.' })}</p>
        </div>
        {!isRecording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={disabled}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('aiChat.actions.startRecording')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopRecording()}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            {t('aiChat.actions.stopRecording')}
          </button>
        )}
      </div>
      {status && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{status}</p>}
      {liveTranscript && (
        <div className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {liveTranscript}
        </div>
      )}
    </div>
  )
}
