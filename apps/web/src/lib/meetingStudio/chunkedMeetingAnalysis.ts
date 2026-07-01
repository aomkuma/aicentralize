import { buildMeetingAnalysisChunks } from '../textChunking'
import { buildChunkedMeetingAnalysisPrompt } from './meetingAnalysisPrompt'
import { mergeTranscriptSummaries, parseTranscriptSummary, type TranscriptSummary } from './shared'

export type MeetingChunkProgress = {
  currentChunk: number
  totalChunks: number
  successfulChunks: number
}

const CHUNK_TIMEOUT_MS = 90_000

async function generateMeetingAnalysis(prompt: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS)

  try {
    const response = await fetch('/ai/playground/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen2.5:7b',
        prompt,
      }),
      signal: controller.signal,
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || data.message || 'Meeting analysis failed')
    }

    return String(data.output ?? '')
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function analyzeMeetingSourceTextInChunks(
  text: string,
  sourceKind: 'document' | 'transcript',
  onProgress?: (progress: MeetingChunkProgress) => void,
): Promise<TranscriptSummary | null> {
  const chunks = buildMeetingAnalysisChunks(text)
  if (!chunks.length) {
    return null
  }

  onProgress?.({
    currentChunk: 0,
    totalChunks: chunks.length,
    successfulChunks: 0,
  })

  const parsedParts: TranscriptSummary[] = []
  let successCount = 0

  for (const [index, chunk] of chunks.entries()) {
    onProgress?.({
      currentChunk: index + 1,
      totalChunks: chunks.length,
      successfulChunks: successCount,
    })

    try {
      const output = await generateMeetingAnalysis(
        buildChunkedMeetingAnalysisPrompt(chunk, {
          sourceKind,
          chunkIndex: index + 1,
          chunkCount: chunks.length,
        }),
      )
      const parsed = parseTranscriptSummary(output)
      if (parsed) {
        parsedParts.push(parsed)
        successCount += 1
      }
    } catch (error) {
      console.warn(`[MeetingStudio] Chunk ${index + 1}/${chunks.length} analysis failed:`, error)
    }
  }

  if (!parsedParts.length) {
    return null
  }

  return mergeTranscriptSummaries(parsedParts)
}
