import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import ActionItemsPanel from '../components/features/action-items/ActionItemsPanel'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { canAssignActionItemsToOthers, resolveTenantMembership } from '../lib/actionItemPermissions'

export default function MyTasksPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const currentMembership = useTenantStore((state) => state.currentMembership)
  const memberships = useTenantStore((state) => state.memberships)
  const resolvedMembership = resolveTenantMembership(currentMembership, memberships, currentTenant?.id)
  const canAssignOthers = canAssignActionItemsToOthers(user, resolvedMembership)

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('myTasks.title')}
          </h2>
          <p className="mt-1 text-gray-600 dark:text-slate-400">
            {t('myTasks.description')}
          </p>
        </div>

        <ActionItemsPanel
          mode="mine"
          showCreateForm
          showProjectColumn
          showOwnerFilter={false}
          allowReassign={canAssignOthers}
        />
      </div>
    </Layout>
  )
}
