import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useApi } from '../hooks/useApi'
import Layout from '../components/Layout'
import type { MemberOnboardRequest, MemberOnboardResponse, TenantMembership } from '../types'

type DashboardProject = {
  id: string
  name: string
  code?: string
  description?: string | null
  tenant?: {
    name: string
  } | null
  _count?: {
    meetings: number
  }
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const currentTenant = useTenantStore((state) => state.currentTenant)
  const setCurrentTenant = useTenantStore((state) => state.setCurrentTenant)
  const clearCurrentTenant = useTenantStore((state) => state.clearCurrentTenant)

  const { get: getMemberships } = useApi()
  const {
    get: getProjects,
    isLoading: isProjectLoading,
    error: projectError,
  } = useApi()
  const {
    post: createProject,
    isLoading: isCreatingProject,
    error: createProjectError,
  } = useApi()
  const {
    get: getTenantMembers,
    isLoading: isTeamLoading,
    error: teamError,
  } = useApi()
  const {
    post: onboardTeamMember,
    isLoading: isOnboardingMember,
    error: onboardMemberError,
  } = useApi()

  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [projectCode, setProjectCode] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [createProjectNotice, setCreateProjectNotice] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TenantMembership[]>([])
  const [showCreateMember, setShowCreateMember] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [memberJobTitle, setMemberJobTitle] = useState('')
  const [memberDepartment, setMemberDepartment] = useState('')
  const [memberRole, setMemberRole] = useState<'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'>('MEMBER')
  const [memberNotice, setMemberNotice] = useState<string | null>(null)
  const [memberInviteUrl, setMemberInviteUrl] = useState<string | null>(null)
  const [memberTemporaryPassword, setMemberTemporaryPassword] = useState<string | null>(null)

  const activeMembership = memberships.find((membership) => membership.tenantId === currentTenant?.id) ?? memberships[0]
  const activeTenantId = activeMembership?.tenantId
  const activeTenantName = activeMembership?.tenant?.name ?? currentTenant?.name

  if (user?.systemRole === 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  const tenantRoleLabelKey: Record<'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER', string> = {
    TENANT_ADMIN: 'tenant.tenantAdmin',
    MANAGER: 'tenant.manager',
    MEMBER: 'tenant.member',
    VIEWER: 'tenant.viewer',
  }

  const fetchProjects = useCallback(async () => {
    const url = activeTenantId ? `/projects?tenantId=${encodeURIComponent(activeTenantId)}` : '/projects'
    const data = await getProjects<DashboardProject[]>(url)
    if (Array.isArray(data)) {
      setProjects(data)
    }
  }, [activeTenantId, getProjects])

  useEffect(() => {
    const fetchMemberships = async () => {
      const data = await getMemberships<TenantMembership[]>('/tenants/me')
      if (data) {
        setMemberships(data)
        const matchingMembership = data.find((membership) => membership.tenantId === currentTenant?.id)
        const nextMembership = matchingMembership ?? data[0]

        if (nextMembership?.tenant && (
          nextMembership.tenantId !== currentTenant?.id ||
          nextMembership.tenant.name !== currentTenant?.name
        )) {
          setCurrentTenant(nextMembership.tenant, nextMembership)
        }

        if (data.length === 0) {
          clearCurrentTenant()
        }
      }
    }

    fetchMemberships()
  }, [getMemberships, currentTenant?.id, setCurrentTenant, clearCurrentTenant])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const fetchTenantTeam = useCallback(async () => {
    if (!activeTenantId) {
      setTeamMembers([])
      return
    }

    const data = await getTenantMembers<TenantMembership[]>(`/tenants/${activeTenantId}/members`)
    if (Array.isArray(data)) {
      setTeamMembers(data)
    }
  }, [activeTenantId, getTenantMembers])

  useEffect(() => {
    fetchTenantTeam()
  }, [fetchTenantTeam])

  const handleCreateProject = async () => {
    const code = projectCode.trim()
    const name = projectName.trim()
    const description = projectDescription.trim()
    const tenantId = activeTenantId

    if (!tenantId) {
      setCreateProjectNotice(t('dashboard.selectOrganizationFirst'))
      return
    }

    if (code.length < 2 || name.length < 2) {
      setCreateProjectNotice(t('dashboard.projectValidation'))
      return
    }

    const duplicateCode = projects.some((project) => project.code?.toLowerCase() === code.toLowerCase())
    if (duplicateCode) {
      setCreateProjectNotice(t('dashboard.projectCodeDuplicate'))
      return
    }

    setCreateProjectNotice(null)
    const created = await createProject('/projects', {
      code,
      name,
      description: description || undefined,
      tenantId,
    })

    if (created) {
      setProjectCode('')
      setProjectName('')
      setProjectDescription('')
      setShowCreateProject(false)
      setCreateProjectNotice(t('dashboard.projectCreated'))
      await fetchProjects()
    }
  }

  const handleCreateTeamMember = async () => {
    if (!activeTenantId) {
      setMemberNotice(t('dashboard.selectOrganizationFirst'))
      return
    }

    const payload: MemberOnboardRequest = {
      name: memberName.trim(),
      email: memberEmail.trim().toLowerCase(),
      phone: memberPhone.trim(),
      tenantRole: memberRole,
      jobTitle: memberJobTitle.trim(),
      department: memberDepartment.trim() || undefined,
    }

    if (!payload.name || !payload.email || !payload.phone || !payload.jobTitle) {
      setMemberNotice(t('dashboard.memberValidation'))
      return
    }

    setMemberNotice(null)
    setMemberInviteUrl(null)
    setMemberTemporaryPassword(null)
    const created = await onboardTeamMember<MemberOnboardResponse>(`/tenants/${activeTenantId}/members/create`, payload)
    if (created) {
      setMemberName('')
      setMemberEmail('')
      setMemberPhone('')
      setMemberJobTitle('')
      setMemberDepartment('')
      setMemberRole('MEMBER')
      setShowCreateMember(false)
      setMemberTemporaryPassword(created.temporaryPassword || null)
      setMemberInviteUrl(created.inviteUrl || null)
      setMemberNotice(created.invitationEmailSent ? t('dashboard.memberInvited') : t('dashboard.memberCreated'))
      await fetchTenantTeam()
    }
  }

  return (
    <Layout currentTenantName={activeTenantName}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {t('dashboard.projectsOnHand')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
            {t('dashboard.projectsOnHandDesc')}
          </p>
        </div>

        <div className="mb-12">
          <div className="mb-10 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {t('dashboard.teamManagement')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  {t('dashboard.teamManagementDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateMember((prev) => !prev)
                  setMemberNotice(null)
                }}
                className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                {t('dashboard.addTeamMember')}
              </button>
            </div>

            {showCreateMember && (
              <div className="mb-4 mt-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                  {t('dashboard.addTeamMemberTitle')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberName')}</span>
                    <input
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                      placeholder={t('dashboard.memberNamePlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberEmail')}</span>
                    <input
                      type="email"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder={t('dashboard.memberEmailPlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberPhone')}</span>
                    <input
                      value={memberPhone}
                      onChange={(e) => setMemberPhone(e.target.value)}
                      placeholder={t('dashboard.memberPhonePlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberJobTitle')}</span>
                    <input
                      value={memberJobTitle}
                      onChange={(e) => setMemberJobTitle(e.target.value)}
                      placeholder={t('dashboard.memberJobTitlePlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberDepartment')}</span>
                    <input
                      value={memberDepartment}
                      onChange={(e) => setMemberDepartment(e.target.value)}
                      placeholder={t('dashboard.memberDepartmentPlaceholder')}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberRole')}</span>
                    <select
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value as 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER')}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value="TENANT_ADMIN">{t('tenant.tenantAdmin')}</option>
                      <option value="MANAGER">{t('tenant.manager')}</option>
                      <option value="MEMBER">{t('tenant.member')}</option>
                      <option value="VIEWER">{t('tenant.viewer')}</option>
                    </select>
                  </label>
                </div>

                {memberNotice && (
                  <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">{memberNotice}</p>
                )}
                {(memberInviteUrl || memberTemporaryPassword) && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    {memberInviteUrl && (
                      <code className="block break-all rounded bg-white px-2 py-1 font-mono text-xs dark:bg-slate-950">
                        {memberInviteUrl}
                      </code>
                    )}
                    {memberTemporaryPassword && (
                      <p className="mt-2">
                        {t('setup.temporaryPassword')}: <code className="font-mono">{memberTemporaryPassword}</code>
                      </p>
                    )}
                  </div>
                )}
                {onboardMemberError && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">{onboardMemberError.message}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCreateTeamMember}
                    disabled={isOnboardingMember}
                    className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isOnboardingMember ? t('dashboard.memberCreating') : t('dashboard.memberCreateSubmit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateMember(false)}
                    className="px-3 py-2 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600"
                  >
                    {t('dashboard.cancel')}
                  </button>
                </div>
              </div>
            )}

            {isTeamLoading ? (
              <p className="text-sm text-gray-600 dark:text-slate-400">{t('common.loading')}</p>
            ) : teamError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{teamError.message}</p>
            ) : teamMembers.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-slate-400">{t('dashboard.teamEmpty')}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-200 dark:border-slate-700">
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberName')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberEmail')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberPhone')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberRole')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberJobTitle')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.id} className="border-b border-gray-100 dark:border-slate-800">
                        <td className="py-2 pr-3 text-gray-800 dark:text-slate-200">{member.user?.name || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{member.user?.email || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{member.user?.phone || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{t(tenantRoleLabelKey[member.role])}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{member.jobTitle || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {t('dashboard.projectsOnHand')}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowCreateProject((prev) => !prev)
                setCreateProjectNotice(null)
              }}
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              {t('dashboard.createProject')}
            </button>
          </div>

          {showCreateProject && (
            <div className="mb-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                {t('dashboard.createProjectTitle')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.projectCode')}</span>
                  <input
                    value={projectCode}
                    onChange={(e) => setProjectCode(e.target.value)}
                    placeholder={t('dashboard.projectCodePlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.projectName')}</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t('dashboard.projectNamePlaceholder')}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block mt-3">
                <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.projectDescription')}</span>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder={t('dashboard.projectDescriptionPlaceholder')}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </label>

              {createProjectNotice && (
                <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">{createProjectNotice}</p>
              )}
              {createProjectError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{createProjectError.message}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={isCreatingProject}
                  className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isCreatingProject ? t('dashboard.creatingProject') : t('dashboard.createProjectSubmit')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateProject(false)}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  {t('dashboard.cancel')}
                </button>
              </div>
            </div>
          )}

          {isProjectLoading ? (
            <div className="flex items-center justify-center p-6 sm:p-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
              <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">{t('common.loading')}</p>
            </div>
          ) : projectError ? (
            <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
              <p className="text-sm sm:text-base text-red-600 dark:text-red-400 mb-2 font-semibold">
                {t('dashboard.errorLoadingProjects')}
              </p>
              <p className="text-xs sm:text-sm text-red-500 dark:text-red-300">{projectError.message}</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex items-center justify-center p-6 sm:p-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
              <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
                {t('dashboard.noProjectsOnHand')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"
                >
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                    {project.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1 truncate">
                    {project.tenant?.name || t('dashboard.noTenant')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                    {t('dashboard.meetingsCount', { count: project._count?.meetings ?? 0 })}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/continuity/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                      {t('continuity.title')}
                    </Link>
                    <Link
                      to={`/reminders/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                    >
                      {t('reminders.title')}
                    </Link>
                    <Link
                      to={`/ai-trace/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                    >
                      {t('aiTrace.title')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
