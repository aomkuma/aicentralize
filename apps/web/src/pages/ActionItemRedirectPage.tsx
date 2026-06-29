import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'

type ActionItemDetail = {
  id: string
  title: string
  meeting?: {
    project?: {
      id: string
      name?: string
    }
  }
}

export default function ActionItemRedirectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { actionItemId } = useParams<{ actionItemId: string }>()
  const { get, isLoading, error } = useApi()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const loadActionItem = async () => {
      if (!actionItemId) {
        setNotFound(true)
        return
      }

      const item = await get<ActionItemDetail>(`/action-items/${actionItemId}`)
      const projectId = item?.meeting?.project?.id
      if (!projectId) {
        setNotFound(true)
        return
      }

      navigate(`/continuity/${projectId}?tab=actions&actionItemId=${encodeURIComponent(actionItemId)}`, {
        replace: true,
      })
    }

    loadActionItem()
  }, [actionItemId, get, navigate])

  if (!actionItemId) {
    return <Navigate to="/continuity" replace />
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('actionItems.opening')}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            {notFound || error
              ? error?.message || t('actionItems.openFailed')
              : isLoading
                ? `${t('common.loading')}...`
                : t('actionItems.openingHelp')}
          </p>
        </div>
      </div>
    </Layout>
  )
}
