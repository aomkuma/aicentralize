/** Must match API MAX_PLAYGROUND_PROMPT_CHARS (apps/api/src/constants/aiLimits.ts). */
export const PLAYGROUND_PROMPT_MAX_CHARS = 120_000

const MEETING_ANALYSIS_INSTRUCTIONS = [
  'You are a senior meeting minute analyst.',
  'Analyze the following source text and return ONLY valid JSON.',
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
  'Preserve project-specific names, dates, owners, and action wording when present.',
  'For consultantNotes, write 2-4 concise bullet-style recommendations about weaknesses of this minute, missing context, items to clarify, risks to watch, or details to add. Use a constructive consultant tone, not blame.',
  'Set importanceScore from 1-100 based on business impact, urgency, blockers, customer/executive impact, and risk.',
  'Use HIGH or CRITICAL for very important work even when the due date is later, so teams can focus earlier.'
].join('\n')

function excerptBudget(sourceLabel: string, maxTotal = PLAYGROUND_PROMPT_MAX_CHARS) {
  const overhead = MEETING_ANALYSIS_INSTRUCTIONS.length + 2 + sourceLabel.length + 1
  return Math.max(800, maxTotal - overhead)
}

export function buildTranscriptAnalysisPrompt(text: string) {
  const sourceLabel = 'Transcript excerpt:'
  const budget = excerptBudget(sourceLabel)
  return [
    MEETING_ANALYSIS_INSTRUCTIONS,
    '',
    sourceLabel,
    text.slice(0, budget)
  ].join('\n')
}

export function buildDocumentAnalysisPrompt(text: string) {
  const sourceLabel = 'Document text excerpt (may be truncated if the source document is long):'
  const budget = excerptBudget(sourceLabel)
  return [
    MEETING_ANALYSIS_INSTRUCTIONS.replace(
      'Analyze the following source text',
      'Analyze the following document text'
    ),
    '',
    sourceLabel,
    text.slice(0, budget)
  ].join('\n')
}
