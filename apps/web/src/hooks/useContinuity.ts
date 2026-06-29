import { useState, useEffect } from 'react'
import { useApi, type ApiError } from './useApi'
import type {
  ProjectContinuitySummary,
  OverdueByOwner,
  OverdueByProject,
  MissingOwnerItem,
  RecentApprovedMeeting,
  ProjectMemorySnapshot,
} from '../types'

type UseContinuityResult = {
  summary: ProjectContinuitySummary | null
  overdueByOwner: OverdueByOwner[]
  overdueByProject: OverdueByProject[]
  missingOwnerItems: MissingOwnerItem[]
  recentMeetings: RecentApprovedMeeting[]
  memorySnapshot: ProjectMemorySnapshot | null
  isLoading: boolean
  error: ApiError | null
  fetchSummary: (projectId?: string, tenantId?: string) => Promise<{ items: Array<{ project: { id: string; name: string; code: string }; summary: { totalOpenActionItems: number; overdueActionItems: number; dueSoonActionItems: number; staleProject: boolean; lastMeetingDate: string | null } }> } | null>
  fetchOverdueByOwner: (projectId?: string, tenantId?: string) => Promise<{ items: Array<{ owner?: { id: string; name: string; email: string }; overdueCount: number; items: Array<{ id: string; task: string; dueDate: string; status: string }> }> } | null>
  fetchOverdueByProject: (tenantId?: string) => Promise<{ items: Array<{ project: { id: string; name: string }; overdueCount: number; items: Array<{ id: string; task: string; dueDate: string; status: string }> }> } | null>
  fetchMissingOwnerItems: (projectId?: string, tenantId?: string) => Promise<{ missingOwner: Array<{ id: string; task: string; status: string; dueDate: string; meeting?: { id?: string; title?: string; project?: { id: string; name?: string } } }>; missingDueDate: Array<{ id: string; task: string; status: string; meeting?: { id?: string; title?: string; project?: { id: string; name?: string } } }> } | null>
  fetchRecentMeetings: (projectId?: string, days?: number, tenantId?: string) => Promise<RecentApprovedMeeting[] | null>
  fetchMemorySnapshot: (projectId: string) => Promise<ProjectMemorySnapshot | null>
}

export const useContinuity = (): UseContinuityResult => {
  const { get, isLoading, error } = useApi()
  const [summary, setSummary] = useState<ProjectContinuitySummary | null>(null)
  const [overdueByOwner, setOverdueByOwner] = useState<OverdueByOwner[]>([])
  const [overdueByProject, setOverdueByProject] = useState<OverdueByProject[]>([])
  const [missingOwnerItems, setMissingOwnerItems] = useState<MissingOwnerItem[]>([])
  const [recentMeetings, setRecentMeetings] = useState<RecentApprovedMeeting[]>([])
  const [memorySnapshot, setMemorySnapshot] = useState<ProjectMemorySnapshot | null>(null)

  const fetchSummary = async (projectId?: string, tenantId?: string) => {
    // API returns { page, pageSize, total, items: [{ project, summary }] }
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (tenantId) params.append('tenantId', tenantId)
    const raw = await get<{ items: Array<{ project: { id: string; name: string; code: string }; summary: { totalOpenActionItems: number; overdueActionItems: number; dueSoonActionItems: number; staleProject: boolean; lastMeetingDate: string | null } }> }>(
      `/continuity/summary?${params.toString()}`
    )
    if (raw?.items?.length) {
      const item = raw.items[0]
      setSummary({
        projectId: item.project.id,
        projectName: item.project.name,
        totalOpenItems: item.summary.totalOpenActionItems,
        totalOverdueItems: item.summary.overdueActionItems,
        totalDueSoonItems: item.summary.dueSoonActionItems,
        lastUpdated: item.summary.lastMeetingDate ?? new Date().toISOString(),
        riskLevel: item.summary.overdueActionItems >= 3
          ? 'high'
          : item.summary.overdueActionItems >= 1 ? 'medium' : 'low',
      })
    } else {
      setSummary(null)
    }
    return raw
  }

  const fetchOverdueByOwner = async (projectId?: string, tenantId?: string) => {
    // API returns { items: [{ owner: { id, name, email }, overdueCount, items: [...] }] }
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (tenantId) params.append('tenantId', tenantId)
    const raw = await get<{ items: Array<{ owner?: { id: string; name: string; email: string }; overdueCount: number; items: Array<{ id: string; task: string; dueDate: string; status: string }> }> }>(
      `/continuity/overdue/by-owner?${params.toString()}`
    )
    if (raw?.items) {
      setOverdueByOwner(
        raw.items.map((r) => ({
          ownerId: r.owner?.id,
          ownerName: r.owner?.name,
          ownerEmail: r.owner?.email,
          count: r.overdueCount,
          items: r.items.map((i) => ({
            id: i.id,
            title: i.task,
            dueDate: i.dueDate,
            status: i.status,
            projectId: projectId ?? '',
          })),
        }))
      )
    }
    return raw
  }

  const fetchOverdueByProject = async (tenantId?: string) => {
    // API returns { items: [{ project: { id, name }, overdueCount, items: [...] }] }
    const params = new URLSearchParams()
    if (tenantId) params.append('tenantId', tenantId)
    const raw = await get<{ items: Array<{ project: { id: string; name: string }; overdueCount: number; items: Array<{ id: string; task: string; dueDate: string; status: string }> }> }>(
      `/continuity/overdue/by-project?${params.toString()}`
    )
    if (raw?.items) {
      setOverdueByProject(
        raw.items.map((r) => ({
          projectId: r.project.id,
          projectName: r.project.name,
          count: r.overdueCount,
          items: r.items.map((i) => ({
            id: i.id,
            title: i.task,
            dueDate: i.dueDate,
            status: i.status,
            projectId: r.project.id,
          })),
        }))
      )
    }
    return raw
  }

  const fetchMissingOwnerItems = async (projectId?: string, tenantId?: string) => {
    // API returns { missingOwner: [...], missingDueDate: [...] }
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (tenantId) params.append('tenantId', tenantId)
    const raw = await get<{ missingOwner: Array<{ id: string; task: string; status: string; dueDate: string; meeting?: { id?: string; title?: string; project?: { id: string; name?: string } } }>; missingDueDate: Array<{ id: string; task: string; status: string; meeting?: { id?: string; title?: string; project?: { id: string; name?: string } } }> }>(
      `/continuity/action-items/missing-owner-or-due-date?${params.toString()}`
    )
    if (raw) {
      const combined = [
        ...(raw.missingOwner ?? []).map((i) => ({
          id: i.id,
          title: i.task,
          status: i.status,
          type: 'ACTION_ITEM' as const,
          projectId: i.meeting?.project?.id ?? projectId ?? '',
          projectName: i.meeting?.project?.name,
          meetingId: i.meeting?.id,
          meetingTitle: i.meeting?.title,
          missingReason: 'owner',
        })),
        ...(raw.missingDueDate ?? []).map((i) => ({
          id: i.id,
          title: i.task,
          status: i.status,
          type: 'ACTION_ITEM' as const,
          projectId: i.meeting?.project?.id ?? projectId ?? '',
          projectName: i.meeting?.project?.name,
          meetingId: i.meeting?.id,
          meetingTitle: i.meeting?.title,
          missingReason: 'dueDate',
        })),
      ]
      setMissingOwnerItems(combined)
    }
    return raw
  }

  const fetchRecentMeetings = async (projectId?: string, days?: number, tenantId?: string) => {
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (days) params.append('days', days.toString())
    if (tenantId) params.append('tenantId', tenantId)
    const data = await get<RecentApprovedMeeting[]>(
      `/continuity/meetings/recent-approved?${params.toString()}`
    )
    if (data) setRecentMeetings(data)
    return data
  }

  const fetchMemorySnapshot = async (projectId: string) => {
    const data = await get<ProjectMemorySnapshot>(
      `/continuity/projects/${projectId}/memory-snapshot`
    )
    if (data) setMemorySnapshot(data)
    return data
  }

  return {
    summary,
    overdueByOwner,
    overdueByProject,
    missingOwnerItems,
    recentMeetings,
    memorySnapshot,
    isLoading,
    error,
    fetchSummary,
    fetchOverdueByOwner,
    fetchOverdueByProject,
    fetchMissingOwnerItems,
    fetchRecentMeetings,
    fetchMemorySnapshot,
  }
}
