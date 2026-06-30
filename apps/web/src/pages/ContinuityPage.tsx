import { Navigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { ContinuityDashboard } from '../components/features/continuity'

export default function ContinuityPage() {
  const { projectId } = useParams<{ projectId?: string }>()
  if (!projectId) {
    return <Navigate to="/projects" replace />
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ContinuityDashboard projectId={projectId} />
      </div>
    </Layout>
  )
}
