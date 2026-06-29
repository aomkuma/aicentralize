import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTenantStore } from '../../../stores/tenantStore'
import { useFeatureFlagStore } from '../../../stores/featureFlagStore'
import { useContinuity } from '../../../hooks/useContinuity'
import { useApi } from '../../../hooks/useApi'
import ContinuitySummaryCard from './ContinuitySummaryCard'
import OverdueByOwner from './OverdueByOwner'
import OverdueItemsList from './OverdueItemsList'

interface ContinuityDashboardProps {
  projectId?: string
}

type SavedMeeting = {
  id: string
  title: string
  summary: string
  sessionAt: string
  updatedAt: string
  minutes?: Array<{
    id?: string
    section: string
    content: string
  }>
  actionItems?: Array<{ id: string }>
}

type ActionItemRow = {
  id: string
  title: string
  description?: string | null
  ownerUserId: string
  ownerDisplayName?: string | null
  dueDate: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: string
  createdAt?: string
  overdue: boolean
  meeting?: {
    id: string
    title: string
    meetingDate: string
  }
}

type ActionItemLogRow = {
  id: string
  fromStatus?: string | null
  toStatus: string
  note?: string | null
  changedAt: string
  changedBy?: {
    id: string
    name: string
    email: string
  } | null
}

type ActionItemDetail = ActionItemRow & {
  statusHistory?: ActionItemLogRow[]
}

type ActionItemStatus = 'TODO' | 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
type ActionPriority = ActionItemRow['priority']
type ActionOverdueFilter = 'all' | 'overdue' | 'notOverdue'
type ActionFilterDateType = 'createdAt' | 'dueDate'
type ActionSortMode = 'focus' | 'dueDateAsc' | 'priorityDesc' | 'createdAtDesc'

type OwnerOption = {
  id: string
  name: string
  email: string
}

type WorkloadRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type WorkloadSuggestionConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

type WorkloadSuggestion = {
  actionItemId: string
  fromOwnerUserId: string
  toOwnerUserId: string
  reason: string
  confidence: WorkloadSuggestionConfidence
}

type WorkloadSuggestionResult = {
  summary: string
  riskLevel: WorkloadRiskLevel
  overloadedOwners: Array<{
    ownerUserId: string
    reason: string
  }>
  suggestions: WorkloadSuggestion[]
}

type WorkloadSuggestionCache = {
  date: string
  signature: string
  dismissed: boolean
  result: WorkloadSuggestionResult
}

const workloadSuggestionCacheKey = (projectId: string) => `aic-workload-suggestions:${projectId}`

const todayCacheDate = () => new Date().toISOString().slice(0, 10)

const isClosedActionStatus = (status: string) => ['DONE', 'CANCELLED'].includes(status)
const actionItemStatuses: ActionItemStatus[] = ['TODO', 'OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']
const actionPriorities: ActionPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const priorityWeight: Record<ActionPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

const normalizeAiEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.toUpperCase()
  return allowed.includes(normalized as T) ? normalized as T : fallback
}

const buildActionItemsSignature = (items: ActionItemRow[]) =>
  items
    .map((item) => [
      item.id,
      item.ownerUserId,
      item.dueDate,
      item.priority,
      item.status,
      item.title,
    ].join('|'))
    .sort()
    .join('::')

const extractJsonCandidate = (raw: string): string | null => {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const firstBrace = stripped.indexOf('{')
  const lastBrace = stripped.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null
  }

  return stripped.slice(firstBrace, lastBrace + 1)
}

const parseWorkloadSuggestion = (
  raw: string,
  actionItems: ActionItemRow[],
  owners: OwnerOption[]
): WorkloadSuggestionResult | null => {
  const candidate = extractJsonCandidate(raw)
  if (!candidate) {
    return null
  }

  try {
    const parsed = JSON.parse(candidate) as {
      summary?: unknown
      riskLevel?: unknown
      overloadedOwners?: unknown
      suggestions?: unknown
    }
    const actionIds = new Set(actionItems.map((item) => item.id))
    const ownerIds = new Set(owners.map((owner) => owner.id))

    const overloadedOwners = Array.isArray(parsed.overloadedOwners)
      ? parsed.overloadedOwners
        .map((item) => {
          const value = item as { ownerUserId?: unknown; reason?: unknown }
          return {
            ownerUserId: typeof value.ownerUserId === 'string' ? value.ownerUserId : '',
            reason: typeof value.reason === 'string' ? value.reason.trim() : '',
          }
        })
        .filter((item) => ownerIds.has(item.ownerUserId) && item.reason)
      : []

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
        .map((item) => {
          const value = item as {
            actionItemId?: unknown
            fromOwnerUserId?: unknown
            toOwnerUserId?: unknown
            reason?: unknown
            confidence?: unknown
          }
          return {
            actionItemId: typeof value.actionItemId === 'string' ? value.actionItemId : '',
            fromOwnerUserId: typeof value.fromOwnerUserId === 'string' ? value.fromOwnerUserId : '',
            toOwnerUserId: typeof value.toOwnerUserId === 'string' ? value.toOwnerUserId : '',
            reason: typeof value.reason === 'string' ? value.reason.trim() : '',
            confidence: normalizeAiEnum(value.confidence, ['LOW', 'MEDIUM', 'HIGH'] as const, 'MEDIUM'),
          }
        })
        .filter((item) => (
          actionIds.has(item.actionItemId) &&
          ownerIds.has(item.fromOwnerUserId) &&
          ownerIds.has(item.toOwnerUserId) &&
          item.fromOwnerUserId !== item.toOwnerUserId &&
          item.reason
        ))
      : []

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      riskLevel: normalizeAiEnum(parsed.riskLevel, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const, 'MEDIUM'),
      overloadedOwners,
      suggestions,
    }
  } catch {
    return null
  }
}

const buildWorkloadSuggestionPrompt = (
  projectId: string,
  actionItems: ActionItemRow[],
  owners: OwnerOption[]
) => [
  'You are an operations assistant for a project manager.',
  'Analyze workload distribution for the currently open project only.',
  'Return ONLY valid JSON. No markdown, no code fences, no extra explanation.',
  'Suggest reassignments only when they reduce delivery risk and the target person appears to have more available capacity.',
  'Do not suggest moving work to someone who already has equal or heavier near-term/high-priority load.',
  'Consider due dates, overdue status, priority, status, concentration of work by owner, and near-term deadlines.',
  'If there is not enough evidence or no useful reassignment, return an empty suggestions array.',
  'Use this schema exactly:',
  '{',
  '  "summary": "string",',
  '  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",',
  '  "overloadedOwners": [{"ownerUserId":"string","reason":"string"}],',
  '  "suggestions": [{"actionItemId":"string","fromOwnerUserId":"string","toOwnerUserId":"string","reason":"string","confidence":"LOW|MEDIUM|HIGH"}]',
  '}',
  '',
  JSON.stringify({
    project: { id: projectId },
    owners: owners.map((owner) => ({
      id: owner.id,
      name: owner.name,
      email: owner.email,
    })),
    actionItems: actionItems
      .filter((item) => !isClosedActionStatus(item.status))
      .slice(0, 100)
      .map((item) => ({
        id: item.id,
        title: item.title,
        ownerUserId: item.ownerUserId,
        ownerDisplayName: item.ownerDisplayName,
        dueDate: item.dueDate,
        priority: item.priority,
        status: item.status,
        overdue: item.overdue,
        meetingTitle: item.meeting?.title,
      })),
  }, null, 2)
].join('\n')

export default function ContinuityDashboard({ projectId }: ContinuityDashboardProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
  const { get: getMeetings } = useApi()
  const { get: getActionData, post: postActionData, patch: patchActionData, isLoading: isActionMutationLoading } = useApi()
  const {
    summary,
    overdueByOwner,
    overdueByProject,
    missingOwnerItems,
    isLoading,
    error,
    fetchSummary,
    fetchOverdueByOwner,
    fetchOverdueByProject,
    fetchMissingOwnerItems,
  } = useContinuity()

  const [selectedTab, setSelectedTab] = useState<'summary' | 'byOwner' | 'byProject' | 'actions' | 'missing'>(
    'summary'
  )
  const [savedMeetings, setSavedMeetings] = useState<SavedMeeting[]>([])
  const [actionItems, setActionItems] = useState<ActionItemRow[]>([])
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([])
  const [isActionFilterOpen, setIsActionFilterOpen] = useState(false)
  const [actionFilters, setActionFilters] = useState<{
    ownerUserId: string
    priority: '' | ActionPriority
    overdue: ActionOverdueFilter
    status: '' | ActionItemStatus
    meetingQuery: string
    dateType: ActionFilterDateType
    dateFrom: string
    dateTo: string
    sort: ActionSortMode
  }>({
    ownerUserId: '',
    priority: '',
    overdue: 'all',
    status: '',
    meetingQuery: '',
    dateType: 'dueDate',
    dateFrom: '',
    dateTo: '',
    sort: 'focus',
  })
  const [reassignOwnerByItemId, setReassignOwnerByItemId] = useState<Record<string, string>>({})
  const [reassignNoteByItemId, setReassignNoteByItemId] = useState<Record<string, string>>({})
  const [statusByItemId, setStatusByItemId] = useState<Record<string, ActionItemStatus>>({})
  const [statusNoteByItemId, setStatusNoteByItemId] = useState<Record<string, string>>({})
  const [priorityByItemId, setPriorityByItemId] = useState<Record<string, ActionPriority>>({})
  const [openLogsByItemId, setOpenLogsByItemId] = useState<Record<string, boolean>>({})
  const [logsByItemId, setLogsByItemId] = useState<Record<string, ActionItemLogRow[]>>({})
  const [loadingLogsByItemId, setLoadingLogsByItemId] = useState<Record<string, boolean>>({})
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [workloadSuggestion, setWorkloadSuggestion] = useState<WorkloadSuggestionResult | null>(null)
  const [isWorkloadSuggestionOpen, setIsWorkloadSuggestionOpen] = useState(false)
  const [isAnalyzingWorkload, setIsAnalyzingWorkload] = useState(false)
  const analyzedWorkloadSignatureRef = useRef<string | null>(null)
  const highlightedActionItemId = searchParams.get('actionItemId') ?? ''

  // Check feature access
  const canAccessFull = canAccessFeature('CONTINUITY_FULL')
  const canAccessSummary = canAccessFeature('CONTINUITY_SUMMARY')

  // Determine which features to show
  const availableTabs = useMemo(() => {
    const tabs: typeof selectedTab[] = []
    if (canAccessSummary) tabs.push('summary')
    if (canAccessFull) {
      tabs.push('byOwner')
      tabs.push('byProject')
      if (projectId) tabs.push('actions')
      tabs.push('missing')
    }
    return tabs
  }, [canAccessSummary, canAccessFull, projectId])

  // Fetch data on component mount or when projectId changes
  useEffect(() => {
    if (!canAccessSummary) return

    const tenantId = currentTenant?.id
    fetchSummary(projectId, tenantId)
    if (canAccessFull) {
      fetchOverdueByOwner(projectId, tenantId)
      fetchOverdueByProject(tenantId)
      fetchMissingOwnerItems(projectId, tenantId)
    }
  }, [projectId, currentTenant?.id, canAccessSummary, canAccessFull])

  useEffect(() => {
    if (!projectId) {
      setSavedMeetings([])
      setActionItems([])
      return
    }

    let mounted = true
    const scopedProjectId = projectId

    async function fetchSavedMeetings() {
      const data = await getMeetings<SavedMeeting[]>(`/meetings?projectId=${encodeURIComponent(scopedProjectId)}`)
      if (mounted && Array.isArray(data)) {
        setSavedMeetings(data.slice(0, 5))
      }
    }

    fetchSavedMeetings()

    return () => {
      mounted = false
    }
  }, [getMeetings, projectId])

  useEffect(() => {
    const tenantId = currentTenant?.id
    if (!tenantId) {
      setOwnerOptions([])
      return
    }

    let mounted = true

    async function fetchOwnerOptions() {
      const members = await getActionData<Array<{ user?: { id: string; name: string; email: string } }>>(
        `/tenants/${tenantId}/members`
      )
      if (!mounted) {
        return
      }

      if (!Array.isArray(members)) {
        setOwnerOptions([])
        return
      }

      setOwnerOptions(
        members
          .map((item) => item.user)
          .filter((user): user is OwnerOption => Boolean(user?.id && user?.name && user?.email))
          .map((user) => ({ id: user.id, name: user.name, email: user.email }))
      )
    }

    fetchOwnerOptions()

    return () => {
      mounted = false
    }
  }, [currentTenant?.id, getActionData])

  const fetchActionItems = async () => {
    if (!projectId) {
      setActionItems([])
      return
    }

    const data = await getActionData<{ items?: ActionItemRow[] }>(
      `/action-items?projectId=${encodeURIComponent(projectId)}&pageSize=100`
    )
    setActionItems(Array.isArray(data?.items) ? data.items : [])
  }

  useEffect(() => {
    fetchActionItems()
  }, [projectId, getActionData])

  const actionableActionItems = useMemo(
    () => actionItems.filter((item) => !isClosedActionStatus(item.status)),
    [actionItems]
  )

  const actionItemsSignature = useMemo(
    () => buildActionItemsSignature(actionableActionItems),
    [actionableActionItems]
  )

  const visibleActionItems = useMemo(() => {
    const fromTime = actionFilters.dateFrom ? new Date(`${actionFilters.dateFrom}T00:00:00`).getTime() : null
    const toTime = actionFilters.dateTo ? new Date(`${actionFilters.dateTo}T23:59:59`).getTime() : null
    const meetingQuery = actionFilters.meetingQuery.trim().toLowerCase()

    return actionItems
      .filter((item) => {
        if (actionFilters.ownerUserId && item.ownerUserId !== actionFilters.ownerUserId) {
          return false
        }
        if (actionFilters.priority && item.priority !== actionFilters.priority) {
          return false
        }
        if (actionFilters.status && item.status !== actionFilters.status) {
          return false
        }
        if (actionFilters.overdue === 'overdue' && !item.overdue) {
          return false
        }
        if (actionFilters.overdue === 'notOverdue' && item.overdue) {
          return false
        }
        if (meetingQuery && !item.meeting?.title?.toLowerCase().includes(meetingQuery)) {
          return false
        }

        const rawDate = actionFilters.dateType === 'createdAt' ? item.createdAt : item.dueDate
        const timestamp = rawDate ? new Date(rawDate).getTime() : Number.NaN
        if (fromTime !== null && (Number.isNaN(timestamp) || timestamp < fromTime)) {
          return false
        }
        if (toTime !== null && (Number.isNaN(timestamp) || timestamp > toTime)) {
          return false
        }

        return true
      })
      .sort((a, b) => {
        if (actionFilters.sort === 'createdAtDesc') {
          return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        }
        if (actionFilters.sort === 'priorityDesc') {
          return priorityWeight[b.priority] - priorityWeight[a.priority] || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        }
        if (actionFilters.sort === 'dueDateAsc') {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        }

        const aClosed = isClosedActionStatus(a.status) ? 1 : 0
        const bClosed = isClosedActionStatus(b.status) ? 1 : 0
        return aClosed - bClosed ||
          priorityWeight[b.priority] - priorityWeight[a.priority] ||
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      })
  }, [actionFilters, actionItems])

  useEffect(() => {
    if (!projectId || !canAccessFull || !actionItemsSignature) {
      setWorkloadSuggestion(null)
      setIsWorkloadSuggestionOpen(false)
      return
    }

    if (actionableActionItems.length < 3 || ownerOptions.length < 2) {
      setWorkloadSuggestion(null)
      setIsWorkloadSuggestionOpen(false)
      return
    }

    const scopedProjectId = projectId
    const cacheKey = workloadSuggestionCacheKey(scopedProjectId)
    const today = todayCacheDate()
    const cachedRaw = window.localStorage.getItem(cacheKey)
    let cached: Partial<WorkloadSuggestionCache> | null = null
    try {
      cached = cachedRaw ? JSON.parse(cachedRaw) as Partial<WorkloadSuggestionCache> : null
    } catch {
      cached = null
    }
    const signatureRunKey = `${scopedProjectId}:${today}:${actionItemsSignature}`

    if (cached?.date === today && cached.signature === actionItemsSignature && cached.result) {
      setWorkloadSuggestion(cached.result)
      setIsWorkloadSuggestionOpen(cached.dismissed !== true)
      return
    }

    if (analyzedWorkloadSignatureRef.current === signatureRunKey) {
      return
    }

    analyzedWorkloadSignatureRef.current = signatureRunKey
    let cancelled = false

    async function analyzeWorkload() {
      setIsAnalyzingWorkload(true)

      try {
        const analysisResponse = await fetch('/ai/playground/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'qwen2.5:7b',
            prompt: buildWorkloadSuggestionPrompt(scopedProjectId, actionableActionItems, ownerOptions),
          }),
        })

        const analysisData = await analysisResponse.json()
        if (!analysisResponse.ok || cancelled) {
          return
        }

        const parsed = parseWorkloadSuggestion(analysisData.output || '', actionableActionItems, ownerOptions)
        if (!parsed || cancelled) {
          return
        }

        const nextCache: WorkloadSuggestionCache = {
          date: today,
          signature: actionItemsSignature,
          dismissed: false,
          result: parsed,
        }

        window.localStorage.setItem(cacheKey, JSON.stringify(nextCache))
        setWorkloadSuggestion(parsed)
        setIsWorkloadSuggestionOpen(parsed.suggestions.length > 0 || parsed.overloadedOwners.length > 0)
      } catch {
        // Suggestion-only: keep the main continuity workflow quiet if AI analysis fails.
      } finally {
        if (!cancelled) {
          setIsAnalyzingWorkload(false)
        }
      }
    }

    analyzeWorkload()

    return () => {
      cancelled = true
    }
  }, [actionItemsSignature, actionableActionItems, canAccessFull, ownerOptions, projectId])

  // Reset to available tab if current is not accessible
  useEffect(() => {
    if (!availableTabs.includes(selectedTab)) {
      setSelectedTab(availableTabs[0] || 'summary')
    }
  }, [availableTabs, selectedTab])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (
      (tab === 'summary' || tab === 'byOwner' || tab === 'byProject' || tab === 'actions' || tab === 'missing') &&
      availableTabs.includes(tab)
    ) {
      setSelectedTab(tab)
    }
  }, [availableTabs, searchParams])

  if (!canAccessFeature('CONTINUITY_SUMMARY')) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-slate-400">
          {t('features.notAvailable')}
        </p>
      </div>
    )
  }

  const handleReassignActionItem = async (item: ActionItemRow) => {
    const ownerUserId = reassignOwnerByItemId[item.id]
    if (!ownerUserId || ownerUserId === item.ownerUserId) {
      setActionError(t('continuity.reassignSelectOwner', { defaultValue: 'Select a different owner first.' }))
      setActionMessage('')
      return
    }

    setActionError('')
    setActionMessage('')

    const response = await postActionData(`/action-items/${item.id}/reassign`, {
      ownerUserId,
      note: reassignNoteByItemId[item.id]?.trim() || undefined,
    })

    if (!response) {
      setActionError(t('continuity.reassignFailed', { defaultValue: 'Unable to reassign action item.' }))
      return
    }

    setActionMessage(t('continuity.reassignSuccess', { defaultValue: 'Action item reassigned.' }))
    setReassignOwnerByItemId((current) => ({ ...current, [item.id]: '' }))
    setReassignNoteByItemId((current) => ({ ...current, [item.id]: '' }))
    fetchActionItems()
    fetchSummary(projectId)
    fetchOverdueByOwner(projectId)
    fetchMissingOwnerItems(projectId)
  }

  const handleChangeActionItemStatus = async (item: ActionItemRow) => {
    const status = statusByItemId[item.id]
    if (!status || status === item.status) {
      setActionError(t('continuity.statusSelectNew', { defaultValue: 'Select a different status first.' }))
      setActionMessage('')
      return
    }

    setActionError('')
    setActionMessage('')

    const response = await postActionData(`/action-items/${item.id}/status`, {
      status,
      note: statusNoteByItemId[item.id]?.trim() || undefined,
    })

    if (!response) {
      setActionError(t('continuity.statusUpdateFailed', { defaultValue: 'Unable to update action item status.' }))
      return
    }

    setActionMessage(t('continuity.statusUpdateSuccess', { defaultValue: 'Action item status updated.' }))
    setStatusByItemId((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    setStatusNoteByItemId((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    fetchActionItems()
    fetchSummary(projectId)
    fetchOverdueByOwner(projectId)
    fetchMissingOwnerItems(projectId)
  }

  const handleChangeActionItemPriority = async (item: ActionItemRow) => {
    const priority = priorityByItemId[item.id]
    if (!priority || priority === item.priority) {
      setActionError(t('continuity.prioritySelectNew', { defaultValue: 'Select a different priority first.' }))
      setActionMessage('')
      return
    }

    setActionError('')
    setActionMessage('')

    const response = await patchActionData(`/action-items/${item.id}`, {
      priority,
    })

    if (!response) {
      setActionError(t('continuity.priorityUpdateFailed', { defaultValue: 'Unable to update action item priority.' }))
      return
    }

    setActionMessage(t('continuity.priorityUpdateSuccess', { defaultValue: 'Action item priority updated.' }))
    setPriorityByItemId((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    setLogsByItemId((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    fetchActionItems()
    fetchSummary(projectId)
  }

  const handleToggleActionLogs = async (item: ActionItemRow) => {
    const nextOpen = !openLogsByItemId[item.id]
    setOpenLogsByItemId((current) => ({ ...current, [item.id]: nextOpen }))

    if (!nextOpen || logsByItemId[item.id]) {
      return
    }

    setLoadingLogsByItemId((current) => ({ ...current, [item.id]: true }))
    const detail = await getActionData<ActionItemDetail>(`/action-items/${item.id}`)
    setLoadingLogsByItemId((current) => ({ ...current, [item.id]: false }))

    if (detail?.statusHistory) {
      setLogsByItemId((current) => ({ ...current, [item.id]: detail.statusHistory ?? [] }))
    }
  }

  const dismissWorkloadSuggestion = () => {
    setIsWorkloadSuggestionOpen(false)
    if (!projectId || !workloadSuggestion) {
      return
    }

    const cache: WorkloadSuggestionCache = {
      date: todayCacheDate(),
      signature: actionItemsSignature,
      dismissed: true,
      result: workloadSuggestion,
    }
    window.localStorage.setItem(workloadSuggestionCacheKey(projectId), JSON.stringify(cache))
  }

  const findOwner = (ownerUserId: string) => ownerOptions.find((owner) => owner.id === ownerUserId)

  const findActionItem = (actionItemId: string) => actionItems.find((item) => item.id === actionItemId)

  const workloadRiskLabel = (level: WorkloadRiskLevel) =>
    t(`continuity.workloadRisk.${level}`)

  const workloadConfidenceLabel = (confidence: WorkloadSuggestionConfidence) =>
    t(`continuity.suggestionConfidence.${confidence}`)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('continuity.title')}
        </h2>
        <p className="text-gray-600 dark:text-slate-400">
          {t('continuity.description')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-700">
        {availableTabs.includes('summary') && (
          <button
            onClick={() => setSelectedTab('summary')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'summary'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.summary')}
          </button>
        )}
        {availableTabs.includes('byOwner') && (
          <button
            onClick={() => setSelectedTab('byOwner')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'byOwner'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.byOwner')}
          </button>
        )}
        {availableTabs.includes('byProject') && (
          <button
            onClick={() => setSelectedTab('byProject')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'byProject'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.byProject')}
          </button>
        )}
        {availableTabs.includes('actions') && (
          <button
            onClick={() => setSelectedTab('actions')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'actions'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.actions', { defaultValue: 'Action Items' })}
          </button>
        )}
        {availableTabs.includes('missing') && (
          <button
            onClick={() => setSelectedTab('missing')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === 'missing'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {t('continuity.tabs.missing')}
          </button>
        )}
      </div>

      {/* Content */}
      <div>
        {selectedTab === 'summary' && summary && (
          <ContinuitySummaryCard summary={summary} />
        )}

        {selectedTab === 'summary' && !summary && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {isLoading
                ? t('common.loading')
                : error?.message || t('continuity.noSummary', { defaultValue: 'No continuity summary is available for this project yet.' })}
            </p>
          </div>
        )}

        {selectedTab === 'summary' && projectId && (
          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('continuity.savedMeetings', { defaultValue: 'Saved meetings' })}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {t('continuity.savedMeetingsDesc', { defaultValue: 'Recently saved meeting minutes for this project.' })}
                </p>
              </div>
              <Link
                to="/meetings/history"
                className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                {t('meetingHistory.navLabel', { defaultValue: 'Minute History' })}
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {savedMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-slate-700"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {meeting.title}
                      </h4>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        {new Date(meeting.sessionAt).toLocaleString()}
                      </p>
                    </div>
                    <Link
                      to={`/meetings/history/${meeting.id}`}
                      className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {t('continuity.openMinutes', { defaultValue: 'Open minutes' })}
                    </Link>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-slate-300">
                    {meeting.summary}
                  </p>
                  {meeting.minutes?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {meeting.minutes.slice(0, 4).map((minute, index) => (
                        <span
                          key={minute.id || `${meeting.id}-${index}`}
                          className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        >
                          {minute.section}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}

              {!savedMeetings.length && (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  {t('continuity.noSavedMeetings', { defaultValue: 'No saved meetings found for this project yet.' })}
                </div>
              )}
            </div>
          </section>
        )}

        {selectedTab === 'byOwner' && (
          <OverdueByOwner data={overdueByOwner} isLoading={isLoading} />
        )}

        {selectedTab === 'byProject' && (
          <div className="space-y-3">
            {overdueByProject.map((proj) => (
              <div
                key={proj.projectId}
                className="p-4 bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600"
              >
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  {proj.projectName}
                </h4>
                <OverdueItemsList
                  items={proj.items || []}
                  maxHeight="max-h-48"
                />
              </div>
            ))}
            {overdueByProject.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-slate-400">
                  {t('continuity.noProjectOverdue')}
                </p>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'actions' && (
          <div className="space-y-3">
            {(actionError || actionMessage) && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${
                actionError
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'
              }`}>
                {actionError || actionMessage}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('continuity.actionFiltersTitle', { defaultValue: 'Action list' })}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('continuity.actionFiltersCount', {
                      defaultValue: '{{shown}} of {{total}} tasks. Default sorting puts high-priority and near-due work first.',
                      shown: visibleActionItems.length,
                      total: actionItems.length,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActionFilterOpen((current) => !current)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  {isActionFilterOpen
                    ? t('continuity.hideFilters', { defaultValue: 'Hide filters' })
                    : t('continuity.showFilters', { defaultValue: 'Show filters' })}
                </button>
              </div>

              {isActionFilterOpen && (
                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.owner')}</span>
                    <select
                      value={actionFilters.ownerUserId}
                      onChange={(event) => setActionFilters((current) => ({ ...current, ownerUserId: event.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                      {ownerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.priority', { defaultValue: 'Priority' })}</span>
                    <select
                      value={actionFilters.priority}
                      onChange={(event) => setActionFilters((current) => ({ ...current, priority: event.target.value as '' | ActionPriority }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                      {actionPriorities.map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.statusControl', { defaultValue: 'Status' })}</span>
                    <select
                      value={actionFilters.status}
                      onChange={(event) => setActionFilters((current) => ({ ...current, status: event.target.value as '' | ActionItemStatus }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                      {actionItemStatuses.map((status) => (
                        <option key={status} value={status}>{t(`continuity.actionStatuses.${status}`, { defaultValue: status })}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.overdue')}</span>
                    <select
                      value={actionFilters.overdue}
                      onChange={(event) => setActionFilters((current) => ({ ...current, overdue: event.target.value as ActionOverdueFilter }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="all">{t('common.all', { defaultValue: 'All' })}</option>
                      <option value="overdue">{t('continuity.overdueOnly', { defaultValue: 'Overdue only' })}</option>
                      <option value="notOverdue">{t('continuity.notOverdueOnly', { defaultValue: 'Not overdue' })}</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.meetingNameFilter', { defaultValue: 'Meeting name' })}</span>
                    <input
                      value={actionFilters.meetingQuery}
                      onChange={(event) => setActionFilters((current) => ({ ...current, meetingQuery: event.target.value }))}
                      placeholder={t('continuity.meetingNamePlaceholder', { defaultValue: 'Search meeting name' })}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.dateType', { defaultValue: 'Date type' })}</span>
                    <select
                      value={actionFilters.dateType}
                      onChange={(event) => setActionFilters((current) => ({ ...current, dateType: event.target.value as ActionFilterDateType }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="dueDate">{t('continuity.dueDate')}</option>
                      <option value="createdAt">{t('continuity.createdDate', { defaultValue: 'Created date' })}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.dateFrom', { defaultValue: 'From' })}</span>
                    <input
                      type="date"
                      value={actionFilters.dateFrom}
                      onChange={(event) => setActionFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.dateTo', { defaultValue: 'To' })}</span>
                    <input
                      type="date"
                      value={actionFilters.dateTo}
                      onChange={(event) => setActionFilters((current) => ({ ...current, dateTo: event.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.sortBy', { defaultValue: 'Sort by' })}</span>
                    <select
                      value={actionFilters.sort}
                      onChange={(event) => setActionFilters((current) => ({ ...current, sort: event.target.value as ActionSortMode }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="focus">{t('continuity.sortFocus', { defaultValue: 'Priority and due date' })}</option>
                      <option value="dueDateAsc">{t('continuity.sortDueDate', { defaultValue: 'Due date soonest' })}</option>
                      <option value="priorityDesc">{t('continuity.sortPriority', { defaultValue: 'Priority highest' })}</option>
                      <option value="createdAtDesc">{t('continuity.sortCreated', { defaultValue: 'Newest task' })}</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setActionFilters({
                        ownerUserId: '',
                        priority: '',
                        overdue: 'all',
                        status: '',
                        meetingQuery: '',
                        dateType: 'dueDate',
                        dateFrom: '',
                        dateTo: '',
                        sort: 'focus',
                      })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      {t('common.clear', { defaultValue: 'Clear' })}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {visibleActionItems.map((item) => {
              const selectedOwnerId = reassignOwnerByItemId[item.id] ?? ''
              const selectedStatus = statusByItemId[item.id] ?? item.status
              const selectedPriority = priorityByItemId[item.id] ?? item.priority
              const isLogsOpen = Boolean(openLogsByItemId[item.id])
              const logs = logsByItemId[item.id] ?? []
              const isLoadingLogs = Boolean(loadingLogsByItemId[item.id])
              const isHighlighted = highlightedActionItemId === item.id
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border bg-white p-4 dark:bg-slate-800 ${
                    isHighlighted
                      ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900/60'
                      : 'border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {item.title}
                        </h4>
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                          {item.status}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          item.priority === 'CRITICAL'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                            : item.priority === 'HIGH'
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100'
                        }`}>
                          {item.priority}
                        </span>
                        {item.overdue && (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-100">
                            {t('continuity.overdue')}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-gray-600 dark:text-slate-400 sm:grid-cols-2">
                        <p>
                          <span className="font-medium">{t('continuity.owner')}:</span>{' '}
                          {item.ownerDisplayName || '-'}
                        </p>
                        <p>
                          <span className="font-medium">{t('continuity.dueDate')}:</span>{' '}
                          {new Date(item.dueDate).toLocaleString()}
                        </p>
                        {item.meeting?.title && (
                          <p className="sm:col-span-2">
                            <span className="font-medium">{t('meetings.titleField', { defaultValue: 'Meeting' })}:</span>{' '}
                            {item.meeting.title}
                          </p>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="w-full shrink-0 space-y-3 lg:w-80">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t('continuity.statusControl', { defaultValue: 'Status' })}
                        </p>
                        <select
                          value={selectedStatus}
                          onChange={(event) => {
                            const value = event.target.value as ActionItemStatus
                            setStatusByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        >
                          {actionItemStatuses.map((status) => (
                            <option key={status} value={status}>
                              {t(`continuity.actionStatuses.${status}`, { defaultValue: status })}
                            </option>
                          ))}
                        </select>
                        <input
                          value={statusNoteByItemId[item.id] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value
                            setStatusNoteByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          placeholder={t('continuity.statusNotePlaceholder', { defaultValue: 'Status note (optional)' })}
                          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => void handleChangeActionItemStatus(item)}
                          disabled={isActionMutationLoading || selectedStatus === item.status}
                          className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('continuity.updateStatus', { defaultValue: 'Update status' })}
                        </button>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t('continuity.reassignTitle', { defaultValue: 'Reassign' })}
                        </p>
                        <select
                          value={selectedOwnerId}
                          onChange={(event) => {
                            const value = event.target.value
                            setReassignOwnerByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        >
                          <option value="">{t('continuity.reassignSelectOwner', { defaultValue: 'Select new owner' })}</option>
                          {ownerOptions.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                              {owner.name} - {owner.email}
                            </option>
                          ))}
                        </select>
                        <input
                          value={reassignNoteByItemId[item.id] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value
                            setReassignNoteByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          placeholder={t('continuity.reassignNotePlaceholder', { defaultValue: 'Note (optional)' })}
                          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => void handleReassignActionItem(item)}
                          disabled={isActionMutationLoading || !selectedOwnerId || selectedOwnerId === item.ownerUserId}
                          className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('continuity.reassignAction', { defaultValue: 'Reassign' })}
                        </button>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t('continuity.priorityControl', { defaultValue: 'Priority' })}
                        </p>
                        <select
                          value={selectedPriority}
                          onChange={(event) => {
                            const value = event.target.value as ActionPriority
                            setPriorityByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        >
                          {actionPriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {t(`continuity.actionPriorities.${priority}`, { defaultValue: priority })}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleChangeActionItemPriority(item)}
                          disabled={isActionMutationLoading || selectedPriority === item.priority}
                          className="mt-2 w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('continuity.updatePriority', { defaultValue: 'Update priority' })}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => void handleToggleActionLogs(item)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      {isLogsOpen
                        ? t('continuity.hideActionLogs', { defaultValue: 'Hide action logs' })
                        : t('continuity.showActionLogs', { defaultValue: 'Show action logs' })}
                    </button>

                    {isLogsOpen && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                        {isLoadingLogs ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('common.loading', { defaultValue: 'Loading' })}...
                          </p>
                        ) : logs.length ? (
                          <ol className="space-y-2">
                            {logs.map((log) => (
                              <li key={log.id} className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {log.fromStatus ? `${log.fromStatus} -> ${log.toStatus}` : log.toStatus}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {new Date(log.changedAt).toLocaleString()}
                                  </span>
                                </div>
                                {log.changedBy && (
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {t('continuity.changedBy', { defaultValue: 'Changed by' })}: {log.changedBy.name} ({log.changedBy.email})
                                  </p>
                                )}
                                {log.note && (
                                  <p className="mt-1 text-slate-600 dark:text-slate-300">{log.note}</p>
                                )}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('continuity.noActionLogs', { defaultValue: 'No action logs yet.' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {!visibleActionItems.length && (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                {actionItems.length
                  ? t('continuity.noFilteredActionItems', { defaultValue: 'No action items match these filters.' })
                  : t('continuity.noActionItems', { defaultValue: 'No action items found for this project.' })}
              </div>
            )}
          </div>
        )}

        {selectedTab === 'missing' && (
          <div className="space-y-3">
            {missingOwnerItems.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {item.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                      {t('continuity.type')}: {item.type}
                    </p>
                    {(item.projectName || item.meetingTitle) && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {item.projectName}
                        {item.meetingTitle ? ` · ${item.meetingTitle}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-2">
                      {item.missingReason === 'owner'
                        ? t('continuity.missingOwnerHelp', { defaultValue: 'Next step: review this action and assign or confirm the owner label.' })
                        : t('continuity.missingDueDateHelp', { defaultValue: 'Next step: review this action and set a due date.' })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.meetingId && (
                      <Link
                        to={`/meetings/history/${item.meetingId}`}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        {t('continuity.openMinutes', { defaultValue: 'Open minutes' })}
                      </Link>
                    )}
                    {item.projectId && (
                      <Link
                        to={`/continuity/${item.projectId}`}
                        className="rounded-md border border-yellow-300 px-3 py-1.5 text-xs font-semibold text-yellow-800 hover:bg-yellow-100 dark:border-yellow-700 dark:text-yellow-100 dark:hover:bg-yellow-900/30"
                      >
                        {t('continuity.openProject', { defaultValue: 'Open project' })}
                      </Link>
                    )}
                    <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 rounded whitespace-nowrap">
                      {item.missingReason === 'owner'
                        ? t('continuity.missingOwner', { defaultValue: 'Owner missing' })
                        : t('continuity.missingDueDate', { defaultValue: 'Due date missing' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {missingOwnerItems.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-slate-400">
                  {t('continuity.noMissingInfo')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {isWorkloadSuggestionOpen && workloadSuggestion && (
        <aside className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-md rounded-xl border border-blue-200 bg-white p-4 shadow-2xl dark:border-blue-900 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
                {t('continuity.workloadSuggestions')}
              </p>
              <h3 className="mt-1 text-base font-bold text-gray-900 dark:text-white">
                {t('continuity.workloadSuggestionTitle')}
              </h3>
            </div>
            <button
              type="button"
              onClick={dismissWorkloadSuggestion}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('continuity.dismissSuggestion')}
            </button>
          </div>

          <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{t('continuity.riskLevelLabel')}:</span>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                workloadSuggestion.riskLevel === 'CRITICAL'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                  : workloadSuggestion.riskLevel === 'HIGH'
                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
              }`}>
                {workloadRiskLabel(workloadSuggestion.riskLevel)}
              </span>
            </div>
            {workloadSuggestion.summary && (
              <p className="mt-1 leading-5">{workloadSuggestion.summary}</p>
            )}
          </div>

          {workloadSuggestion.overloadedOwners.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                {t('continuity.overloadedOwners')}
              </p>
              {workloadSuggestion.overloadedOwners.slice(0, 3).map((owner) => (
                <div key={owner.ownerUserId} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {findOwner(owner.ownerUserId)?.name || owner.ownerUserId}
                  </p>
                  <p className="mt-1 text-gray-600 dark:text-slate-400">{owner.reason}</p>
                </div>
              ))}
            </div>
          )}

          {workloadSuggestion.suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                {t('continuity.rebalanceSuggestions')}
              </p>
              {workloadSuggestion.suggestions.slice(0, 3).map((suggestion) => {
                const item = findActionItem(suggestion.actionItemId)
                const fromOwner = findOwner(suggestion.fromOwnerUserId)
                const toOwner = findOwner(suggestion.toOwnerUserId)

                return (
                  <div key={`${suggestion.actionItemId}-${suggestion.toOwnerUserId}`} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {item?.title || suggestion.actionItemId}
                    </p>
                    <p className="mt-1 text-gray-600 dark:text-slate-400">
                      {fromOwner?.name || suggestion.fromOwnerUserId} &rarr; {toOwner?.name || suggestion.toOwnerUserId}
                    </p>
                    <p className="mt-1 text-gray-600 dark:text-slate-400">{suggestion.reason}</p>
                    <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {t('continuity.confidence')}: {workloadConfidenceLabel(suggestion.confidence)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={dismissWorkloadSuggestion}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('continuity.dismissSuggestion')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedTab('actions')
                dismissWorkloadSuggestion()
              }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('continuity.reviewActionItems')}
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}
