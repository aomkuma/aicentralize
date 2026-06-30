import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../../../hooks/useApi'
import { useAuthStore } from '../../../stores/authStore'
import { useTenantStore } from '../../../stores/tenantStore'
import { canAssignActionItemsToOthers, resolveTenantMembership } from '../../../lib/actionItemPermissions'
import {
  actionItemStatuses,
  actionPriorities,
  isClosedActionStatus,
  priorityWeight,
  type ActionFilterDateType,
  type ActionItemDetail,
  type ActionItemLogRow,
  type ActionItemRow,
  type ActionItemStatus,
  type ActionOverdueFilter,
  type ActionPriority,
  type ActionSortMode,
  type OwnerOption,
  type ProjectOption,
} from './actionItemTypes'

export type ActionItemsPanelProps = {
  mode: 'project' | 'mine'
  projectId?: string
  highlightedActionItemId?: string
  showCreateForm?: boolean
  showProjectColumn?: boolean
  showOwnerFilter?: boolean
  allowReassign?: boolean
  onItemsChanged?: () => void
}

type ActionFiltersState = {
  ownerUserId: string
  priority: '' | ActionPriority
  overdue: ActionOverdueFilter
  status: '' | ActionItemStatus
  meetingQuery: string
  dateType: ActionFilterDateType
  dateFrom: string
  dateTo: string
  sort: ActionSortMode
  projectId: string
}

const createInitialFilters = (): ActionFiltersState => ({
  ownerUserId: '',
  priority: '',
  overdue: 'all',
  status: '',
  meetingQuery: '',
  dateType: 'dueDate',
  dateFrom: '',
  dateTo: '',
  sort: 'focus',
  projectId: '',
})

export default function ActionItemsPanel({
  mode,
  projectId,
  highlightedActionItemId = '',
  showCreateForm = false,
  showProjectColumn = false,
  showOwnerFilter = true,
  allowReassign = true,
  onItemsChanged,
}: ActionItemsPanelProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const currentMembership = useTenantStore((state) => state.currentMembership)
  const memberships = useTenantStore((state) => state.memberships)
  const { get: getActionData, post: postActionData, patch: patchActionData, isLoading: isActionMutationLoading } = useApi()

  const [actionItems, setActionItems] = useState<ActionItemRow[]>([])
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [isActionFilterOpen, setIsActionFilterOpen] = useState(false)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [isMeetingFilterOpen, setIsMeetingFilterOpen] = useState(false)
  const [actionFilters, setActionFilters] = useState<ActionFiltersState>(createInitialFilters)
  const [reassignOwnerByItemId, setReassignOwnerByItemId] = useState<Record<string, string>>({})
  const [reassignNoteByItemId, setReassignNoteByItemId] = useState<Record<string, string>>({})
  const [statusByItemId, setStatusByItemId] = useState<Record<string, ActionItemStatus>>({})
  const [statusNoteByItemId, setStatusNoteByItemId] = useState<Record<string, string>>({})
  const [priorityByItemId, setPriorityByItemId] = useState<Record<string, ActionPriority>>({})
  const [openActionControlsByItemId, setOpenActionControlsByItemId] = useState<Record<string, boolean>>({})
  const [openLogsByItemId, setOpenLogsByItemId] = useState<Record<string, boolean>>({})
  const [logsByItemId, setLogsByItemId] = useState<Record<string, ActionItemLogRow[]>>({})
  const [loadingLogsByItemId, setLoadingLogsByItemId] = useState<Record<string, boolean>>({})
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [createProjectId, setCreateProjectId] = useState(mode === 'project' ? (projectId ?? '') : '')
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createDueDate, setCreateDueDate] = useState('')
  const [createPriority, setCreatePriority] = useState<ActionPriority>('MEDIUM')
  const [createOwnerUserId, setCreateOwnerUserId] = useState(user?.id ?? '')

  const actionSaveInFlightRef = useRef<Set<string>>(new Set())
  const meetingFilterRef = useRef<HTMLDivElement | null>(null)

  const resolvedMembership = resolveTenantMembership(currentMembership, memberships, currentTenant?.id)
  const canAssignOthers = canAssignActionItemsToOthers(user, resolvedMembership)

  const fetchActionItems = useCallback(async () => {
    if (mode === 'project' && !projectId) {
      setActionItems([])
      return
    }

    const url =
      mode === 'project'
        ? `/action-items?projectId=${encodeURIComponent(projectId!)}&pageSize=100`
        : '/action-items?mine=true&pageSize=100'

    const data = await getActionData<{ items?: ActionItemRow[] }>(url)
    setActionItems(Array.isArray(data?.items) ? data.items : [])
  }, [getActionData, mode, projectId])

  useEffect(() => {
    void fetchActionItems()
  }, [fetchActionItems])

  useEffect(() => {
    const tenantId = currentTenant?.id
    if (!tenantId) {
      setOwnerOptions([])
      return
    }

    let mounted = true

    async function fetchOwnerOptions() {
      const members = await getActionData<
        Array<{ isActive?: boolean; user?: { id: string; name: string; email: string } }>
      >(`/tenants/${tenantId}/members`)
      if (!mounted) {
        return
      }

      if (Array.isArray(members) && members.length > 0) {
        const fromMembers = members
          .filter((item) => item.isActive !== false)
          .map((item) => item.user)
          .filter((member): member is OwnerOption => Boolean(member?.id && member?.name && member?.email))
          .map((member) => ({ id: member.id, name: member.name, email: member.email }))

        if (fromMembers.length > 0) {
          setOwnerOptions(fromMembers)
          return
        }
      }

      const users = await getActionData<Array<{ id: string; name: string; email: string }>>(
        `/tenants/${tenantId}/users`,
      )
      if (!mounted) {
        return
      }

      if (!Array.isArray(users)) {
        setOwnerOptions([])
        return
      }

      setOwnerOptions(
        users
          .filter((member) => Boolean(member.id && member.name && member.email))
          .map((member) => ({ id: member.id, name: member.name, email: member.email })),
      )
    }

    void fetchOwnerOptions()

    return () => {
      mounted = false
    }
  }, [currentTenant?.id, getActionData])

  useEffect(() => {
    if (!showCreateForm) {
      setProjects([])
      return
    }

    let mounted = true
    const tenantId = currentTenant?.id
    const url = tenantId ? `/projects?tenantId=${encodeURIComponent(tenantId)}` : '/projects'

    async function fetchProjects() {
      const data = await getActionData<Array<{ id: string; name: string; code?: string }>>(url)
      if (!mounted) {
        return
      }

      if (!Array.isArray(data)) {
        setProjects([])
        return
      }

      setProjects(
        data
          .filter((project) => Boolean(project.id && project.name))
          .map((project) => ({
            id: project.id,
            name: project.name,
            code: project.code ?? '',
          }))
      )
    }

    void fetchProjects()

    return () => {
      mounted = false
    }
  }, [currentTenant?.id, getActionData, showCreateForm])

  useEffect(() => {
    if (mode === 'project' && projectId) {
      setCreateProjectId(projectId)
    }
  }, [mode, projectId])

  useEffect(() => {
    if (user?.id) {
      setCreateOwnerUserId(user.id)
    }
  }, [user?.id])

  useEffect(() => {
    if (!actionMessage) {
      return
    }

    const timer = window.setTimeout(() => {
      setActionMessage('')
    }, 3200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [actionMessage])

  useEffect(() => {
    if (!isMeetingFilterOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!meetingFilterRef.current?.contains(event.target as Node)) {
        setIsMeetingFilterOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isMeetingFilterOpen])

  const projectFilterOptions = useMemo(() => {
    const byId = new Map<string, ProjectOption>()

    for (const item of actionItems) {
      if (item.project?.id && item.project.name && !byId.has(item.project.id)) {
        byId.set(item.project.id, {
          id: item.project.id,
          name: item.project.name,
          code: item.project.code ?? '',
        })
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [actionItems])

  const meetingFilterOptions = useMemo(() => {
    const byId = new Map<string, { id: string; title: string }>()

    for (const item of actionItems) {
      if (item.meeting?.id && item.meeting.title && !byId.has(item.meeting.id)) {
        byId.set(item.meeting.id, {
          id: item.meeting.id,
          title: item.meeting.title,
        })
      }
    }

    const query = actionFilters.meetingQuery.trim().toLowerCase()
    return Array.from(byId.values())
      .filter((meeting) => !query || meeting.title.toLowerCase().includes(query))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 12)
  }, [actionFilters.meetingQuery, actionItems])

  const visibleActionItems = useMemo(() => {
    const fromTime = actionFilters.dateFrom ? new Date(`${actionFilters.dateFrom}T00:00:00`).getTime() : null
    const toTime = actionFilters.dateTo ? new Date(`${actionFilters.dateTo}T23:59:59`).getTime() : null
    const meetingQuery = actionFilters.meetingQuery.trim().toLowerCase()

    return actionItems
      .filter((item) => {
        if (mode === 'mine' && actionFilters.projectId && item.project?.id !== actionFilters.projectId) {
          return false
        }
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
          return (
            priorityWeight[b.priority] - priorityWeight[a.priority] ||
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          )
        }
        if (actionFilters.sort === 'dueDateAsc') {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        }

        const aClosed = isClosedActionStatus(a.status) ? 1 : 0
        const bClosed = isClosedActionStatus(b.status) ? 1 : 0
        return (
          aClosed - bClosed ||
          priorityWeight[b.priority] - priorityWeight[a.priority] ||
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        )
      })
  }, [actionFilters, actionItems, mode])

  const notifyItemsChanged = useCallback(() => {
    void fetchActionItems()
    onItemsChanged?.()
  }, [fetchActionItems, onItemsChanged])

  const handleCreateActionItem = async (event: FormEvent) => {
    event.preventDefault()
    if (!createProjectId || !createTitle.trim() || !createDueDate) {
      return
    }

    setIsCreating(true)
    setActionError('')
    setActionMessage('')

    try {
      const payload: {
        projectId: string
        title: string
        description?: string
        dueDate: string
        priority?: ActionPriority
        ownerUserId?: string
      } = {
        projectId: createProjectId,
        title: createTitle.trim(),
        dueDate: new Date(createDueDate).toISOString(),
        priority: createPriority,
      }

      const description = createDescription.trim()
      if (description) {
        payload.description = description
      }

      const ownerUserId = canAssignOthers ? createOwnerUserId : user?.id
      if (ownerUserId) {
        payload.ownerUserId = ownerUserId
      }

      const response = await postActionData('/action-items', payload)
      if (!response) {
        setActionError(t('myTasks.createFailed', { defaultValue: 'Unable to create action item.' }))
        return
      }

      setActionMessage(t('myTasks.createSuccess', { defaultValue: 'Action item created.' }))
      setIsCreateFormOpen(false)
      setCreateTitle('')
      setCreateDescription('')
      setCreateDueDate('')
      setCreatePriority('MEDIUM')
      if (mode !== 'project') {
        setCreateProjectId('')
      }
      if (user?.id) {
        setCreateOwnerUserId(user.id)
      }
      notifyItemsChanged()
    } finally {
      setIsCreating(false)
    }
  }

  const handleReassignActionItem = async (item: ActionItemRow) => {
    const ownerUserId = reassignOwnerByItemId[item.id]
    if (!ownerUserId || ownerUserId === item.ownerUserId) {
      return
    }

    const saveKey = `reassign:${item.id}`
    if (actionSaveInFlightRef.current.has(saveKey)) {
      return
    }
    actionSaveInFlightRef.current.add(saveKey)
    setActionError('')
    setActionMessage('')

    try {
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
      notifyItemsChanged()
    } finally {
      actionSaveInFlightRef.current.delete(saveKey)
    }
  }

  const handleChangeActionItemStatus = async (item: ActionItemRow) => {
    const status = statusByItemId[item.id]
    if (!status || status === item.status) {
      return
    }

    const saveKey = `status:${item.id}`
    if (actionSaveInFlightRef.current.has(saveKey)) {
      return
    }
    actionSaveInFlightRef.current.add(saveKey)
    setActionError('')
    setActionMessage('')

    try {
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
      setLogsByItemId((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      notifyItemsChanged()
    } finally {
      actionSaveInFlightRef.current.delete(saveKey)
    }
  }

  const handleChangeActionItemPriority = async (item: ActionItemRow) => {
    const priority = priorityByItemId[item.id]
    if (!priority || priority === item.priority) {
      return
    }

    const saveKey = `priority:${item.id}`
    if (actionSaveInFlightRef.current.has(saveKey)) {
      return
    }
    actionSaveInFlightRef.current.add(saveKey)
    setActionError('')
    setActionMessage('')

    try {
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
      notifyItemsChanged()
    } finally {
      actionSaveInFlightRef.current.delete(saveKey)
    }
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

  const editControlsGridClass = allowReassign ? 'md:grid-cols-3' : 'md:grid-cols-2'

  return (
    <div className="space-y-3">
      {actionMessage && (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          {actionMessage}
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200">
          {actionError}
        </div>
      )}

      {showCreateForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('myTasks.createFormTitle')}
            </p>
            <button
              type="button"
              onClick={() => setIsCreateFormOpen((current) => !current)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {isCreateFormOpen
                ? t('myTasks.hideCreateForm', { defaultValue: 'Hide form' })
                : t('myTasks.showCreateForm', { defaultValue: 'Add action item' })}
            </button>
          </div>

          {isCreateFormOpen && (
        <form
          onSubmit={(event) => void handleCreateActionItem(event)}
          className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.project')}
              </span>
              <select
                value={createProjectId}
                onChange={(event) => setCreateProjectId(event.target.value)}
                disabled={mode === 'project' && Boolean(projectId)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white disabled:opacity-60"
              >
                <option value="">{t('continuity.project')}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code ? `${project.code} — ${project.name}` : project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('myTasks.taskTitle', { defaultValue: 'Action to perform' })}
              </span>
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                required
                maxLength={240}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('projectKnowledge.descriptionLabel', { defaultValue: 'Description' })}
              </span>
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                rows={2}
                maxLength={4000}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.dueDate')}
              </span>
              <input
                type="datetime-local"
                value={createDueDate}
                onChange={(event) => setCreateDueDate(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.priority', { defaultValue: 'Priority' })}
              </span>
              <select
                value={createPriority}
                onChange={(event) => setCreatePriority(event.target.value as ActionPriority)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                {actionPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`continuity.actionPriorities.${priority}`, { defaultValue: priority })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.owner')}
              </span>
              <select
                value={createOwnerUserId}
                onChange={(event) => setCreateOwnerUserId(event.target.value)}
                disabled={!canAssignOthers}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                {canAssignOthers ? (
                  ownerOptions.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name} — {owner.email}
                    </option>
                  ))
                ) : (
                  <option value={user?.id ?? ''}>{user?.name ?? t('continuity.owner')}</option>
                )}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={isCreating || isActionMutationLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {t('common.submit')}
            </button>
          </div>
        </form>
          )}
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
            {mode === 'mine' && showProjectColumn && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('continuity.project')}
                </span>
                <select
                  value={actionFilters.projectId}
                  onChange={(event) =>
                    setActionFilters((current) => ({ ...current, projectId: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                  {projectFilterOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code ? `${project.code} — ${project.name}` : project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showOwnerFilter && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.owner')}</span>
                <select
                  value={actionFilters.ownerUserId}
                  onChange={(event) =>
                    setActionFilters((current) => ({ ...current, ownerUserId: event.target.value }))
                  }
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
            )}
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.priority', { defaultValue: 'Priority' })}
              </span>
              <select
                value={actionFilters.priority}
                onChange={(event) =>
                  setActionFilters((current) => ({
                    ...current,
                    priority: event.target.value as '' | ActionPriority,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                {actionPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`continuity.actionPriorities.${priority}`, { defaultValue: priority })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.statusControl', { defaultValue: 'Status' })}
              </span>
              <select
                value={actionFilters.status}
                onChange={(event) =>
                  setActionFilters((current) => ({
                    ...current,
                    status: event.target.value as '' | ActionItemStatus,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="">{t('common.all', { defaultValue: 'All' })}</option>
                {actionItemStatuses.map((status) => (
                  <option key={status} value={status}>
                    {t(`continuity.actionStatuses.${status}`, { defaultValue: status })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('continuity.overdue')}</span>
              <select
                value={actionFilters.overdue}
                onChange={(event) =>
                  setActionFilters((current) => ({
                    ...current,
                    overdue: event.target.value as ActionOverdueFilter,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">{t('common.all', { defaultValue: 'All' })}</option>
                <option value="overdue">{t('continuity.overdueOnly', { defaultValue: 'Overdue only' })}</option>
                <option value="notOverdue">{t('continuity.notOverdueOnly', { defaultValue: 'Not overdue' })}</option>
              </select>
            </label>
            <div ref={meetingFilterRef} className="relative sm:col-span-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('continuity.meetingNameFilter', { defaultValue: 'Meeting name' })}
                </span>
                <div className="mt-1 flex rounded-md border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
                  <input
                    value={actionFilters.meetingQuery}
                    onChange={(event) => {
                      setActionFilters((current) => ({ ...current, meetingQuery: event.target.value }))
                      setIsMeetingFilterOpen(true)
                    }}
                    onFocus={() => setIsMeetingFilterOpen(true)}
                    placeholder={t('continuity.meetingNamePlaceholder', { defaultValue: 'Search meeting name' })}
                    className="min-w-0 flex-1 rounded-l-md bg-transparent px-2 py-2 text-sm text-slate-900 outline-none dark:text-white"
                  />
                  {actionFilters.meetingQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionFilters((current) => ({ ...current, meetingQuery: '' }))
                        setIsMeetingFilterOpen(false)
                      }}
                      className="px-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      {t('common.clear', { defaultValue: 'Clear' })}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsMeetingFilterOpen((current) => !current)}
                    className="border-l border-slate-200 px-2 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white"
                    aria-label={t('continuity.meetingNameOpenOptions', { defaultValue: 'Open meeting options' })}
                  >
                    ▾
                  </button>
                </div>
              </label>

              {isMeetingFilterOpen && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {meetingFilterOptions.length ? (
                    meetingFilterOptions.map((meeting) => (
                      <button
                        key={meeting.id}
                        type="button"
                        onClick={() => {
                          setActionFilters((current) => ({ ...current, meetingQuery: meeting.title }))
                          setIsMeetingFilterOpen(false)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {meeting.title}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                      {t('continuity.noMeetingOptions', { defaultValue: 'No matching meetings' })}
                    </p>
                  )}
                </div>
              )}
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.dateType', { defaultValue: 'Date type' })}
              </span>
              <select
                value={actionFilters.dateType}
                onChange={(event) =>
                  setActionFilters((current) => ({
                    ...current,
                    dateType: event.target.value as ActionFilterDateType,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="dueDate">{t('continuity.dueDate')}</option>
                <option value="createdAt">{t('continuity.createdDate', { defaultValue: 'Created date' })}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.dateFrom', { defaultValue: 'From' })}
              </span>
              <input
                type="date"
                value={actionFilters.dateFrom}
                onChange={(event) =>
                  setActionFilters((current) => ({ ...current, dateFrom: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.dateTo', { defaultValue: 'To' })}
              </span>
              <input
                type="date"
                value={actionFilters.dateTo}
                onChange={(event) =>
                  setActionFilters((current) => ({ ...current, dateTo: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('continuity.sortBy', { defaultValue: 'Sort by' })}
              </span>
              <select
                value={actionFilters.sort}
                onChange={(event) =>
                  setActionFilters((current) => ({
                    ...current,
                    sort: event.target.value as ActionSortMode,
                  }))
                }
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
                onClick={() => {
                  setActionFilters(createInitialFilters())
                  setIsMeetingFilterOpen(false)
                }}
                onMouseDown={() => setIsMeetingFilterOpen(false)}
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
        const isActionControlsOpen = Boolean(openActionControlsByItemId[item.id])
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
            <div className="space-y-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                    {t(`continuity.actionStatuses.${item.status}`, { defaultValue: item.status })}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      item.priority === 'CRITICAL'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                        : item.priority === 'HIGH'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100'
                    }`}
                  >
                    {t(`continuity.actionPriorities.${item.priority}`, { defaultValue: item.priority })}
                  </span>
                  {item.overdue && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-100">
                      {t('continuity.overdue')}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-gray-600 dark:text-slate-400 sm:grid-cols-2">
                  <p>
                    <span className="font-medium">{t('continuity.owner')}:</span> {item.ownerDisplayName || '-'}
                  </p>
                  <p>
                    <span className="font-medium">{t('continuity.dueDate')}:</span>{' '}
                    {new Date(item.dueDate).toLocaleString()}
                  </p>
                  {item.meeting?.title ? (
                    <p className="sm:col-span-2">
                      <span className="font-medium">{t('meetings.titleField', { defaultValue: 'Meeting' })}:</span>{' '}
                      {item.meeting.title}
                    </p>
                  ) : item.project ? (
                    <p className="sm:col-span-2">
                      <span className="font-medium">{t('continuity.project')}:</span> {item.project.name}
                    </p>
                  ) : null}
                </div>
                {item.description && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">{item.description}</p>
                )}
              </div>

              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={isActionControlsOpen}
                    onClick={() => {
                      setOpenActionControlsByItemId((current) => ({
                        ...current,
                        [item.id]: !current[item.id],
                      }))
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <span>{isActionControlsOpen ? '-' : '+'}</span>
                    {t('continuity.editActionItem', { defaultValue: 'แก้ไขงาน' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActionLogs(item)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    {isLogsOpen
                      ? t('continuity.hideActionLogs', { defaultValue: 'Hide action logs' })
                      : t('continuity.showActionLogs', { defaultValue: 'Show action logs' })}
                  </button>
                </div>

                {isActionControlsOpen && (
                  <div className={`mt-3 grid grid-cols-1 gap-2 ${editControlsGridClass}`}>
                    <div
                      className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          void handleChangeActionItemStatus(item)
                        }
                      }}
                      onMouseLeave={() => void handleChangeActionItemStatus(item)}
                    >
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t('continuity.statusControl', { defaultValue: 'Status' })}
                        </span>
                        <select
                          value={selectedStatus}
                          disabled={isActionMutationLoading}
                          onChange={(event) => {
                            const value = event.target.value as ActionItemStatus
                            setStatusByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        >
                          {actionItemStatuses.map((status) => (
                            <option key={status} value={status}>
                              {t(`continuity.actionStatuses.${status}`, { defaultValue: status })}
                            </option>
                          ))}
                        </select>
                      </label>
                      <input
                        value={statusNoteByItemId[item.id] ?? ''}
                        disabled={isActionMutationLoading}
                        onChange={(event) => {
                          const value = event.target.value
                          setStatusNoteByItemId((current) => ({ ...current, [item.id]: value }))
                        }}
                        placeholder={t('continuity.statusNotePlaceholder', { defaultValue: 'Status note (optional)' })}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      />
                    </div>

                    {allowReassign && (
                      <div
                        className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50"
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget)) {
                            void handleReassignActionItem(item)
                          }
                        }}
                        onMouseLeave={() => void handleReassignActionItem(item)}
                      >
                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t('continuity.reassignTitle', { defaultValue: 'Reassign' })}
                          </span>
                          <select
                            value={selectedOwnerId}
                            disabled={isActionMutationLoading}
                            onChange={(event) => {
                              const value = event.target.value
                              setReassignOwnerByItemId((current) => ({ ...current, [item.id]: value }))
                            }}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                          >
                            <option value="">
                              {t('continuity.reassignSelectOwner', { defaultValue: 'Select new owner' })}
                            </option>
                            {ownerOptions.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.name} - {owner.email}
                              </option>
                            ))}
                          </select>
                        </label>
                        <input
                          value={reassignNoteByItemId[item.id] ?? ''}
                          disabled={isActionMutationLoading}
                          onChange={(event) => {
                            const value = event.target.value
                            setReassignNoteByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          placeholder={t('continuity.reassignNotePlaceholder', { defaultValue: 'Note (optional)' })}
                          className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    )}

                    <div
                      className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          void handleChangeActionItemPriority(item)
                        }
                      }}
                      onMouseLeave={() => void handleChangeActionItemPriority(item)}
                    >
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t('continuity.priorityControl', { defaultValue: 'Priority' })}
                        </span>
                        <select
                          value={selectedPriority}
                          disabled={isActionMutationLoading}
                          onChange={(event) => {
                            const value = event.target.value as ActionPriority
                            setPriorityByItemId((current) => ({ ...current, [item.id]: value }))
                          }}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        >
                          {actionPriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {t(`continuity.actionPriorities.${priority}`, { defaultValue: priority })}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {t('continuity.autoSaveHint', { defaultValue: 'Auto-saves when you leave this field.' })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3">
              {isLogsOpen && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                  {isLoadingLogs ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('common.loading', { defaultValue: 'Loading' })}...
                    </p>
                  ) : logs.length ? (
                    <ol className="space-y-2">
                      {logs.map((log) => (
                        <li
                          key={log.id}
                          className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {log.fromStatus
                                ? `${t(`continuity.actionStatuses.${log.fromStatus}`, { defaultValue: log.fromStatus })} -> ${t(`continuity.actionStatuses.${log.toStatus}`, { defaultValue: log.toStatus })}`
                                : t(`continuity.actionStatuses.${log.toStatus}`, { defaultValue: log.toStatus })}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(log.changedAt).toLocaleString()}
                            </span>
                          </div>
                          {log.changedBy && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {t('continuity.changedBy', { defaultValue: 'Changed by' })}: {log.changedBy.name} (
                              {log.changedBy.email})
                            </p>
                          )}
                          {log.note && <p className="mt-1 text-slate-600 dark:text-slate-300">{log.note}</p>}
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
            : mode === 'mine'
              ? t('continuity.noActionItems', {
                  defaultValue: 'No action items assigned to you.',
                })
              : t('continuity.noActionItems', { defaultValue: 'No action items found for this project.' })}
        </div>
      )}
    </div>
  )
}
