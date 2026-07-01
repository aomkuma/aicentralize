export type ActionItemPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AiActionItem = {
  task: string
  detail?: string
  ownerName?: string
  dueDate?: string
  importanceScore?: number
  priority?: ActionItemPriority
}

export type ChecklistItem = {
  id: string
  text: string
  ownerUserId: string
  dueDate: string
  detail: string
  importanceScore: number
  priority: ActionItemPriority
}

export type OwnerOption = {
  id: string
  name: string
  email: string
  nickname?: string
}

export type TranscriptSummary = {
  summary: string
  objective: string
  consultantNotes: string
  decisions: string[]
  risks: string[]
  actionItems: AiActionItem[]
  nextSteps: string
}

const clip = (value: string, max = 220) => value.trim().slice(0, max)

const uniqueNonEmpty = (values: string[], limit = 5) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of values) {
    const item = raw.replace(/\s+/g, ' ').trim()
    if (!item || seen.has(item)) {
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

const checklistId = () => `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeOwnerToken = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const clampImportanceScore = (value: unknown, fallback = 50) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.max(1, Math.min(100, Math.round(numeric)))
}

const priorityFromImportanceScore = (score: number): ActionItemPriority => {
  if (score >= 85) {
    return 'CRITICAL'
  }
  if (score >= 70) {
    return 'HIGH'
  }
  if (score >= 45) {
    return 'MEDIUM'
  }
  return 'LOW'
}

const importanceScoreFromPriority = (priority?: ActionItemPriority) => {
  switch (priority) {
    case 'CRITICAL':
      return 90
    case 'HIGH':
      return 75
    case 'LOW':
      return 30
    default:
      return 50
  }
}

const defaultChecklistDueDate = (sessionAt?: string) => {
  const base = sessionAt ? new Date(sessionAt) : new Date()
  if (Number.isNaN(base.getTime())) {
    return toDateTimeLocalString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  }
  return toDateTimeLocalString(new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000))
}

const toDateTimeLocalString = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

const resolveOwnerUserId = (ownerName: string | undefined, owners: OwnerOption[]) => {
  if (!ownerName?.trim()) {
    return ''
  }

  const token = normalizeOwnerToken(ownerName.replace(/^@/, ''))
  const exactNickname = owners.find((owner) => owner.nickname && normalizeOwnerToken(owner.nickname) === token)
  if (exactNickname) {
    return exactNickname.id
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
      const importanceScore = clampImportanceScore(
        value.importanceScore,
        importanceScoreFromPriority(priority)
      )

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

export const toChecklistItems = (
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

const actionItemKey = (item: AiActionItem) =>
  item.task.trim().toLowerCase().replace(/\s+/g, ' ')

export function mergeTranscriptSummaries(parts: TranscriptSummary[]): TranscriptSummary {
  const decisions: string[] = []
  const risks: string[] = []
  const actionItems: AiActionItem[] = []
  const seenDecisions = new Set<string>()
  const seenRisks = new Set<string>()
  const seenActions = new Set<string>()

  for (const part of parts) {
    for (const decision of part.decisions) {
      const key = decision.toLowerCase()
      if (!seenDecisions.has(key)) {
        seenDecisions.add(key)
        decisions.push(decision)
      }
    }

    for (const risk of part.risks) {
      const key = risk.toLowerCase()
      if (!seenRisks.has(key)) {
        seenRisks.add(key)
        risks.push(risk)
      }
    }

    for (const item of part.actionItems) {
      const key = actionItemKey(item)
      if (!key || seenActions.has(key)) {
        continue
      }
      seenActions.add(key)
      actionItems.push(item)
    }
  }

  const summary = parts.map((part) => part.summary).find(Boolean) ?? ''
  const objective = parts.map((part) => part.objective).find(Boolean) ?? ''
  const consultantNotes = uniqueNonEmpty(parts.map((part) => part.consultantNotes), 4).join('\n')
  const nextSteps = parts.map((part) => part.nextSteps).filter(Boolean).join('\n')

  return {
    summary,
    objective,
    consultantNotes,
    decisions: decisions.slice(0, 30),
    risks: risks.slice(0, 30),
    actionItems: actionItems.slice(0, 40),
    nextSteps
  }
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

export const parseTranscriptSummary = (raw: string): TranscriptSummary | null => {
  const candidate = extractJsonCandidate(raw)
  if (!candidate) {
    return null
  }

  try {
    const parsed = JSON.parse(candidate) as Partial<TranscriptSummary>
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      objective: typeof parsed.objective === 'string' ? parsed.objective.trim() : '',
      consultantNotes: typeof parsed.consultantNotes === 'string' ? parsed.consultantNotes.trim() : '',
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
        : [],
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
        : [],
      actionItems: normalizeAiActionItems(parsed.actionItems),
      nextSteps: typeof parsed.nextSteps === 'string' ? parsed.nextSteps.trim() : ''
    }
  } catch {
    return null
  }
}
