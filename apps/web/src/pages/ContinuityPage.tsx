import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { ContinuityDashboard } from '../components/features/continuity'

export default function ContinuityPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId?: string }>()

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ContinuityDashboard projectId={projectId} />
      </div>
    </Layout>
  )
}
