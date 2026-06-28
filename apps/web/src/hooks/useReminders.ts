import { useCallback, useState } from 'react'
import { useApi } from './useApi'
import type { ReminderDigest, ReminderDigestDetail } from '../types'

export const useReminders = () => {
  const { get, isLoading, error } = useApi()
  const [digests, setDigests] = useState<ReminderDigest[]>([])
  const [currentDigest, setCurrentDigest] = useState<ReminderDigestDetail | null>(null)

  const fetchDigests = useCallback(async (
    projectId?: string,
    limit?: number,
    dateRange?: { start?: string; end?: string }
  ) => {
    // API returns { items: [...], page, pageSize, total }
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (limit) params.append('pageSize', limit.toString())
    if (dateRange?.start) params.append('startDate', dateRange.start)
    if (dateRange?.end) params.append('endDate', dateRange.end)

    const raw = await get<{ items: ReminderDigest[] }>(
      `/reminders/digests?${params.toString()}`
    )
    const items = raw?.items ?? []
    setDigests(items)
    return items
  }, [get])

  const fetchDigestDetail = useCallback(async (digestId: string) => {
    const data = await get<ReminderDigestDetail>(`/reminders/digests/${digestId}`)
    if (data) setCurrentDigest(data)
    return data
  }, [get])

  const fetchDigestsByDateRange = useCallback(async (
    startDate: string,
    endDate: string,
    projectId?: string
  ) => {
    const params = new URLSearchParams()
    params.append('startDate', startDate)
    params.append('endDate', endDate)
    if (projectId) params.append('projectId', projectId)

    const data = await get<ReminderDigest[]>(
      `/reminders/digests/range?${params.toString()}`
    )
    if (data) setDigests(data)
    return data
  }, [get])

  return {
    digests,
    currentDigest,
    isLoading,
    error,
    fetchDigests,
    fetchDigestDetail,
    fetchDigestsByDateRange,
  }
}
