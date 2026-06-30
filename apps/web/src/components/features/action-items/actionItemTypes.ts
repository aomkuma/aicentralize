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
