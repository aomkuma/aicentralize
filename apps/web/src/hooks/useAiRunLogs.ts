import { useState } from 'react'
import { useApi } from './useApi'
import type { AiRunLog, AiRunOperation, AiRunStatus } from '../types'

export const useAiRunLogs = () => {
  const { get, isLoading, error } = useApi()
  const [logs, setLogs] = useState<AiRunLog[]>([])
  const [currentLog, setCurrentLog] = useState<AiRunLog | null>(null)

  const fetchLogs = async (options?: {
    operation?: AiRunOperation
    status?: AiRunStatus
    projectId?: string
    meetingId?: string
    page?: number
    pageSize?: number
    limit?: number
    offset?: number
  }) => {
    const params = new URLSearchParams()
    if (options?.operation) params.append('operation', options.operation)
    if (options?.status) params.append('status', options.status)
    if (options?.projectId) params.append('projectId', options.projectId)
    if (options?.meetingId) params.append('meetingId', options.meetingId)
    if (options?.page) params.append('page', options.page.toString())
    if (options?.pageSize) params.append('pageSize', options.pageSize.toString())
    if (!options?.pageSize && options?.limit) params.append('pageSize', options.limit.toString())
    if (!options?.page && typeof options?.offset === 'number') {
      params.append('page', (Math.floor(options.offset / (options.limit || 20)) + 1).toString())
    }

    const raw = await get<{ items: AiRunLog[] }>(
      `/observability/ai-runs?${params.toString()}`
    )
    const items = raw?.items ?? []
    setLogs(items)
    return items
  }

  const fetchLogDetail = async (logId: string) => {
    const data = await get<AiRunLog>(`/observability/ai-runs/${logId}`)
    if (data) setCurrentLog(data)
    return data
  }

  const fetchLogsByOperation = async (
    operation: AiRunOperation,
    limit?: number
  ) => {
    const params = new URLSearchParams()
    params.append('operation', operation)
    if (limit) params.append('pageSize', limit.toString())

    const raw = await get<{ items: AiRunLog[] }>(
      `/observability/ai-runs?${params.toString()}`
    )
    const items = raw?.items ?? []
    setLogs(items)
    return items
  }

  return {
    logs,
    currentLog,
    isLoading,
    error,
    fetchLogs,
    fetchLogDetail,
    fetchLogsByOperation,
  }
}
