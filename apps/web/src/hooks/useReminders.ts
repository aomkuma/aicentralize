import { useState } from 'react'
import { useApi } from './useApi'
import type { ReminderDigest, ReminderDigestDetail } from '../types'

export const useReminders = () => {
  const { get, isLoading, error } = useApi()
  const [digests, setDigests] = useState<ReminderDigest[]>([])
  const [currentDigest, setCurrentDigest] = useState<ReminderDigestDetail | null>(null)

  const fetchDigests = async (projectId?: string, limit?: number) => {
    // API returns { items: [...], page, pageSize, total }
    const params = new URLSearchParams()
    if (projectId) params.append('projectId', projectId)
    if (limit) params.append('pageSize', limit.toString())

    const raw = await get<{ items: ReminderDigest[] }>(
      `/reminders/digests?${params.toString()}`
    )
    const items = raw?.items ?? []
    setDigests(items)
    return items
  }

  const fetchDigestDetail = async (digestId: string) => {
    const data = await get<ReminderDigestDetail>(`/reminders/digests/${digestId}`)
    if (data) setCurrentDigest(data)
    return data
  }

  const fetchDigestsByDateRange = async (
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
  }

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
