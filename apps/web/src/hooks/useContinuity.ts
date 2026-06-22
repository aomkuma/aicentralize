import { useState, useEffect } from 'react'
import { useApi } from './useApi'
import type {
  ProjectContinuitySummary,
  OverdueByOwner,
  OverdueByProject,
  MissingOwnerItem,
  RecentApprovedMeeting,
  ProjectMemorySnapshot,
} from '../types'

export const useContinuity = () => {
  const { get, isLoading, error } = useApi()
  const [summary, setSummary] = useState<ProjectContinuitySummary | null>(null)
  const [overdueByOwner, setOverdueByOwner] = useState<OverdueByOwner[]>([])
  const [overdueByProject, setOverdueByProject] = useState<OverdueByProject[]>([])
  const [missingOwnerItems, setMissingOwnerItems] = useState<MissingOwnerItem[]>([])
  const [recentMeetings, setRecentMeetings] = useState<RecentApprovedMeeting[]>([])
  const [memorySnapshot, setMemorySnapshot] = useState<ProjectMemorySnapshot | null>(null)

  const fetchSummary = async (projectId?: string) => {
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    const data = await get<ProjectContinuitySummary[]>(
      `/continuity/summary?${params.toString()}`
    )
    if (data && data.length > 0) setSummary(data[0])
    return data
  }

  const fetchOverdueByOwner = async (projectId?: string) => {
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    const data = await get<OverdueByOwner[]>(
      `/continuity/overdue-by-owner?${params.toString()}`
    )
    if (data) setOverdueByOwner(data)
    return data
  }

  const fetchOverdueByProject = async () => {
    const data = await get<OverdueByProject[]>('/continuity/overdue-by-project')
    if (data) setOverdueByProject(data)
    return data
  }

  const fetchMissingOwnerItems = async (projectId?: string) => {
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    const data = await get<MissingOwnerItem[]>(
      `/continuity/missing-owner-or-due-date?${params.toString()}`
    )
    if (data) setMissingOwnerItems(data)
    return data
  }

  const fetchRecentMeetings = async (projectId?: string, days?: number) => {
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (days) params.append('days', days.toString())
    const data = await get<RecentApprovedMeeting[]>(
      `/continuity/recent-approved-meetings?${params.toString()}`
    )
    if (data) setRecentMeetings(data)
    return data
  }

  const fetchMemorySnapshot = async (projectId: string) => {
    const data = await get<ProjectMemorySnapshot>(
      `/continuity/project-memory/${projectId}`
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
