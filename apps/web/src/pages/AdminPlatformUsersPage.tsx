import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import type { PlatformUser, User } from '../types'

type EditableSystemRole = Extract<User['systemRole'], 'USER' | 'MODERATOR'>

export default function AdminPlatformUsersPage() {
  const { t } = useTranslation()
  const { get, patch, isLoading, error } = useApi()
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    const data = await get<PlatformUser[]>('/admin/platform-users')
    if (Array.isArray(data)) {
      setUsers(data)
    }
  }, [get])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateUser = async (userId: string, payload: { systemRole?: EditableSystemRole; isActive?: boolean }) => {
    setNotice(null)
    const updated = await patch<PlatformUser>(`/admin/platform-users/${userId}`, payload)
    if (updated) {
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setNotice(t('adminPlatformUsers.saved'))
    }
  }

  const onChangeSystemRole = async (user: PlatformUser, systemRole: EditableSystemRole) => {
    if (user.systemRole === systemRole) {
      return
    }

    await updateUser(user.id, { systemRole })
  }

  const onToggleActive = async (user: PlatformUser) => {
    const suspend = user.isActive !== false
    if (suspend && !window.confirm(t('adminPlatformUsers.confirmSuspend'))) {
      return
    }

    await updateUser(user.id, { isActive: !suspend })
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-300">
            {t('common.platformConsole')}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{t('adminPlatformUsers.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-slate-400">
            {t('adminPlatformUsers.description')}
          </p>
        </div>

        {(notice || error) && (
          <div className={`mb-4 rounded-md px-3 py-2 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
          }`}>
            {error?.message || notice}
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('adminPlatformUsers.accounts')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">{t('adminPlatformUsers.user')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">{t('adminPlatformUsers.systemRole')}</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminPlatformUsers.memberships')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">{t('adminPlatformUsers.loginStatus')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">{t('adminPlatformUsers.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {users.map((user) => {
                  const readOnly = user.systemRole === 'SUPER_ADMIN'
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {readOnly ? (
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                            {t('adminPlatformUsers.roles.SUPER_ADMIN')}
                          </span>
                        ) : (
                          <select
                            value={user.systemRole}
                            onChange={(event) => onChangeSystemRole(user, event.target.value as EditableSystemRole)}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="USER">{t('adminPlatformUsers.roles.USER')}</option>
                            <option value="MODERATOR">{t('adminPlatformUsers.roles.MODERATOR')}</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">
                        {user._count?.tenantMemberships ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          user.isActive === false
                            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                        }`}>
                          {user.isActive === false ? t('adminPlatformUsers.suspended') : t('adminPlatformUsers.active')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {readOnly ? (
                          <span className="text-xs text-gray-500 dark:text-slate-400">{t('adminPlatformUsers.protected')}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleActive(user)}
                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                              user.isActive === false
                                ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20'
                                : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20'
                            }`}
                          >
                            {user.isActive === false ? t('adminPlatformUsers.restore') : t('adminPlatformUsers.suspend')}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!users.length && (
            <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
              {isLoading ? `${t('common.loading')}...` : t('adminPlatformUsers.empty')}
            </p>
          )}
        </section>
      </div>
    </Layout>
  )
}
