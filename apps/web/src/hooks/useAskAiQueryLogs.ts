import { useState } from 'react'
import { useApi } from './useApi'
import type { AskAiQueryLog } from '../types'

export type AskAiQueryLogScope = 'self' | 'tenant'

export const useAskAiQueryLogs = (scope: AskAiQueryLogScope = 'self') => {
  const { get, isLoading, error } = useApi()
  const [logs, setLogs] = useState<AskAiQueryLog[]>([])
  const [currentLog, setCurrentLog] = useState<AskAiQueryLog | null>(null)
  const listPath = scope === 'tenant' ? '/observability/ask-ai-queries' : '/ask-ai/conversations'
  const detailPath = scope === 'tenant' ? '/observability/ask-ai-queries' : '/ask-ai/conversations'

  const fetchLogs = async (options?: {
    projectId?: string
    meetingId?: string
    userId?: string
    page?: number
    pageSize?: number
  }) => {
    const params = new URLSearchParams()
    if (options?.projectId) params.append('projectId', options.projectId)
    if (options?.meetingId) params.append('meetingId', options.meetingId)
    if (scope === 'tenant' && options?.userId) params.append('userId', options.userId)
    if (options?.page) params.append('page', options.page.toString())
    if (options?.pageSize) params.append('pageSize', options.pageSize.toString())

    const raw = await get<{ items: AskAiQueryLog[] }>(
      `${listPath}?${params.toString()}`
    )
    const items = raw?.items ?? []
    setLogs(items)
    return items
  }

  const fetchLogDetail = async (logId: string) => {
    const data = await get<AskAiQueryLog>(`${detailPath}/${logId}`)
    if (data) setCurrentLog(data)
    return data
  }

  return {
    logs,
    currentLog,
    isLoading,
    error,
    fetchLogs,
    fetchLogDetail,
  }
}
