import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { AskAiTracePanel } from '../components/features/aiTrace'

export default function AiTracePage() {
  const { t } = useTranslation()
  const { projectId, meetingId } = useParams<{
    projectId?: string
    meetingId?: string
  }>()

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <AskAiTracePanel projectId={projectId} meetingId={meetingId} />
      </div>
    </Layout>
  )
}
