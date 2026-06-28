import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import type { AdminTenant, TenantMembership, UserInvitation } from '../types'

type TenantRole = 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'

export default function AdminOrganizationsPage() {
  const { t } = useTranslation()
  const { get, patch, isLoading, error } = useApi()
  const {
    get: getMembers,
    post: postMember,
    patch: patchMember,
    isLoading: isMemberLoading,
    error: memberError,
  } = useApi()

  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [members, setMembers] = useState<TenantMembership[]>([])
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [manualInviteUrl, setManualInviteUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null

  const fetchTenants = useCallback(async () => {
    const data = await get<AdminTenant[]>('/admin/tenants')
    if (Array.isArray(data)) {
      setTenants(data)
      setSelectedTenantId((current) => current ?? data[0]?.id ?? null)
    }
  }, [get])

  const fetchMembers = useCallback(async () => {
    if (!selectedTenantId) {
      setMembers([])
      setInvitations([])
      return
    }

    const data = await getMembers<TenantMembership[]>(`/admin/tenants/${selectedTenantId}/members`)
    if (Array.isArray(data)) {
      setMembers(data)
    }

    const inviteData = await getMembers<UserInvitation[]>(`/admin/tenants/${selectedTenantId}/invitations`)
    if (Array.isArray(inviteData)) {
      setInvitations(inviteData)
    }
  }, [getMembers, selectedTenantId])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onToggleTenant = async (tenant: AdminTenant) => {
    setNotice(null)
    const updated = await patch<AdminTenant>(`/admin/tenants/${tenant.id}`, {
      isActive: !tenant.isActive,
    })

    if (updated) {
      setTenants((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setNotice(t('adminOrganizations.organizationSaved'))
    }
  }

  const onRenameTenant = async (tenant: AdminTenant, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === tenant.name) {
      return
    }

    setNotice(null)
    const updated = await patch<AdminTenant>(`/admin/tenants/${tenant.id}`, {
      name: trimmed,
    })

    if (updated) {
      setTenants((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setNotice(t('adminOrganizations.organizationSaved'))
    }
  }

  const onToggleMember = async (member: TenantMembership) => {
    if (!selectedTenantId) {
      return
    }

    setNotice(null)
    const updated = await patchMember<TenantMembership>(`/admin/tenants/${selectedTenantId}/members/${member.userId}`, {
      isActive: !member.isActive,
    })

    if (updated) {
      setMembers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setNotice(t('adminOrganizations.memberSaved'))
    }
  }

  const onChangeMemberRole = async (member: TenantMembership, role: TenantRole) => {
    if (!selectedTenantId || role === member.role) {
      return
    }

    setNotice(null)
    const updated = await patchMember<TenantMembership>(`/admin/tenants/${selectedTenantId}/members/${member.userId}`, {
      role,
    })

    if (updated) {
      setMembers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setNotice(t('adminOrganizations.memberSaved'))
    }
  }

  const onToggleAccount = async (member: TenantMembership) => {
    if (!member.user) {
      return
    }

    const suspend = member.user.isActive !== false
    if (suspend && !window.confirm(t('adminOrganizations.confirmSuspend'))) {
      return
    }

    setNotice(null)
    const updated = await patchMember<{ id: string; isActive: boolean }>(`/admin/users/${member.userId}`, {
      isActive: !suspend,
    })

    if (updated) {
      setMembers((items) =>
        items.map((item) =>
          item.userId === member.userId && item.user
            ? { ...item, user: { ...item.user, isActive: updated.isActive } }
            : item,
        ),
      )
      setNotice(suspend ? t('adminOrganizations.accountSuspended') : t('adminOrganizations.accountRestored'))
    }
  }

  const onSaveMemberField = async (
    member: TenantMembership,
    field: 'jobTitle' | 'department',
    value: string,
  ) => {
    if (!selectedTenantId) {
      return
    }

    const trimmed = value.trim()
    if (trimmed === (member[field] ?? '')) {
      return
    }

    setNotice(null)
    const updated = await patchMember<TenantMembership>(`/admin/tenants/${selectedTenantId}/members/${member.userId}`, {
      [field]: trimmed === '' ? null : trimmed,
    })

    if (updated) {
      setMembers((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setNotice(t('adminOrganizations.memberSaved'))
    }
  }

  const onResendInvitation = async (invitation: UserInvitation) => {
    setNotice(null)
    setManualInviteUrl(null)
    const updated = await postMember<UserInvitation>(`/admin/invitations/${invitation.id}/resend`)

    if (updated) {
      setInvitations((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setManualInviteUrl(updated.inviteUrl || null)
      setNotice(updated.emailSentAt ? t('adminOrganizations.invitationResent') : t('adminOrganizations.invitationResendFallback'))
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('adminOrganizations.title')}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">{t('adminOrganizations.description')}</p>
        </div>

        {(notice || error || memberError) && (
          <div className={`mb-4 rounded-md px-3 py-2 text-sm ${
            error || memberError
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
          }`}>
            {error?.message || memberError?.message || notice}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('adminOrganizations.organizations')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">{t('adminOrganizations.organizationName')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Slug</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">{t('adminOrganizations.owner')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminOrganizations.members')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminOrganizations.projects')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminOrganizations.active')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {tenants.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className={`cursor-pointer ${selectedTenantId === tenant.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                      onClick={() => setSelectedTenantId(tenant.id)}
                    >
                      <td className="px-4 py-3">
                        <input
                          defaultValue={tenant.name}
                          onBlur={(event) => onRenameTenant(tenant, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-blue-500 dark:text-white dark:hover:border-slate-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{tenant.slug}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{tenant.createdBy?.email ?? '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">{tenant._count?.memberships ?? 0}</td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">{tenant._count?.projects ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={tenant.isActive !== false}
                          onChange={() => onToggleTenant(tenant)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          aria-label={t('adminOrganizations.toggleOrganization')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!tenants.length && (
              <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                {isLoading ? `${t('common.loading')}...` : t('adminOrganizations.empty')}
              </p>
            )}
          </section>

          <aside className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('adminOrganizations.members')}</h2>
              {selectedTenant && (
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{selectedTenant.name}</p>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {members.map((member) => (
                <div key={member.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">{member.user?.name ?? '-'}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">{member.user?.email ?? '-'}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={member.isActive !== false}
                      onChange={() => onToggleMember(member)}
                      className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label={t('adminOrganizations.toggleMember')}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      value={member.role}
                      onChange={(event) => onChangeMemberRole(member, event.target.value as TenantRole)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="TENANT_ADMIN">{t('tenant.tenantAdmin')}</option>
                      <option value="MANAGER">{t('tenant.manager')}</option>
                      <option value="MEMBER">{t('tenant.member')}</option>
                      <option value="VIEWER">{t('tenant.viewer')}</option>
                    </select>
                    <span className={`rounded-md px-2 py-1.5 text-center text-xs font-semibold ${
                      member.isActive !== false
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {member.isActive !== false ? t('adminOrganizations.active') : t('adminOrganizations.inactive')}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      defaultValue={member.jobTitle ?? ''}
                      onBlur={(event) => onSaveMemberField(member, 'jobTitle', event.target.value)}
                      placeholder={t('adminOrganizations.jobTitle')}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                    />
                    <input
                      defaultValue={member.department ?? ''}
                      onBlur={(event) => onSaveMemberField(member, 'department', event.target.value)}
                      placeholder={t('adminOrganizations.department')}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                    />
                  </div>
                  {member.user?.systemRole !== 'SUPER_ADMIN' && (
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-slate-800">
                      <span className={`text-xs font-semibold ${
                        member.user?.isActive === false
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-500 dark:text-slate-400'
                      }`}>
                        {member.user?.isActive === false
                          ? t('adminOrganizations.accountSuspendedLabel')
                          : t('adminOrganizations.accountActiveLabel')}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleAccount(member)}
                        className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                          member.user?.isActive === false
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20'
                            : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20'
                        }`}
                      >
                        {member.user?.isActive === false
                          ? t('adminOrganizations.restoreAccount')
                          : t('adminOrganizations.suspendAccount')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!members.length && (
              <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                {isMemberLoading ? `${t('common.loading')}...` : t('adminOrganizations.noMembers')}
              </p>
            )}
            <div className="border-t border-gray-200 px-4 py-3 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">{t('adminOrganizations.pendingInvitations')}</h3>
              {manualInviteUrl && (
                <code className="mt-2 block break-all rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  {manualInviteUrl}
                </code>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">{invitation.name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">{invitation.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onResendInvitation(invitation)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {t('adminOrganizations.resendInvite')}
                    </button>
                  </div>
                  <p className={`mt-2 text-xs ${invitation.emailLastError ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {invitation.emailLastError
                      ? `${t('adminOrganizations.emailError')}: ${invitation.emailLastError}`
                      : invitation.emailSentAt
                        ? t('adminOrganizations.emailSent')
                        : t('adminOrganizations.emailNotSent')}
                  </p>
                </div>
              ))}
              {!invitations.length && (
                <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
                  {t('adminOrganizations.noPendingInvitations')}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  )
}
