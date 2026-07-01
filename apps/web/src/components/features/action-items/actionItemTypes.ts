export type ActionItemStatus = 'TODO' | 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
export type ActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ActionOverdueFilter = 'all' | 'overdue' | 'notOverdue'
export type ActionFilterDateType = 'createdAt' | 'dueDate'
export type ActionSortMode = 'focus' | 'dueDateAsc' | 'priorityDesc' | 'createdAtDesc'

export type ActionItemRow = {
  id: string
  title: string
  description?: string | null
  ownerUserId: string
  ownerDisplayName?: string | null
  dueDate: string
  priority: ActionPriority
  status: string
  createdAt?: string
  overdue: boolean
  meeting?: {
    id: string
    title: string
    meetingDate: string
  } | null
  project?: {
    id: string
    code: string
    name: string
  } | null
}

export type ActionItemLogRow = {
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

export type ActionItemDetail = ActionItemRow & {
  statusHistory?: ActionItemLogRow[]
}

export type OwnerOption = {
  id: string
  name: string
  email: string
  nickname?: string
}

export function formatOwnerLabel(owner: Pick<OwnerOption, 'name' | 'nickname'>): string {
  const nickname = owner.nickname?.trim()
  return nickname ? `${owner.name} (@${nickname})` : owner.name
}

export type ProjectOption = {
  id: string
  name: string
  code: string
}

export const actionItemStatuses: ActionItemStatus[] = ['TODO', 'OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']
export const actionPriorities: ActionPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export const priorityWeight: Record<ActionPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

export const isClosedActionStatus = (status: string) => ['DONE', 'CANCELLED'].includes(status)

export function getActionItemCardSurfaceClass(
  item: Pick<ActionItemRow, 'status' | 'priority'>,
  isHighlighted: boolean
): string {
  if (isHighlighted) {
    return 'border-blue-400 bg-white ring-2 ring-blue-200 dark:border-blue-500 dark:bg-slate-800 dark:ring-blue-900/60'
  }

  if (item.status === 'DONE') {
    return 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/70 dark:bg-emerald-950/40'
  }

  if (item.priority === 'CRITICAL') {
    return 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/35'
  }

  return 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800'
}
