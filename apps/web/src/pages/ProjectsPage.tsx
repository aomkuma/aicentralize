import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useTenantStore } from '../stores/tenantStore'
import { useFeatureFlagStore } from '../stores/featureFlagStore'
import { useApi } from '../hooks/useApi'
import Layout from '../components/Layout'
import { memberNickname as getMemberNickname } from '../lib/memberDisplay'
import {
  canCreateProjectForPackage,
  canManageOrganizationTeam,
} from '../lib/packageAccess'
import ConfirmDialog from '../components/ConfirmDialog'
import EditMemberDialog from '../components/EditMemberDialog'
import EditProjectDialog from '../components/EditProjectDialog'
import TeamSentimentBadge from '../components/TeamSentimentBadge'
import type { CommunicationSentimentSnapshot, MemberOnboardRequest, MemberOnboardResponse, TenantMembership } from '../types'

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
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)
  const packageCode = useFeatureFlagStore((state) => state.packageCode)
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
  const {
    get: getSentimentMembers,
    post: runSentimentBatch,
    isLoading: isSentimentLoading,
  } = useApi()
  const {
    delete: removeTeamMember,
    isLoading: isRemovingMember,
    error: removeMemberError,
  } = useApi()
  const {
    patch: updateTeamMember,
    isLoading: isUpdatingMember,
    error: updateMemberError,
  } = useApi()
  const {
    patch: updateProject,
    isLoading: isUpdatingProject,
    error: updateProjectError,
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
  const [memberNickname, setMemberNickname] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [memberJobTitle, setMemberJobTitle] = useState('')
  const [memberDepartment, setMemberDepartment] = useState('')
  const [memberRole, setMemberRole] = useState<'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'>('MEMBER')
  const [memberNotice, setMemberNotice] = useState<string | null>(null)
  const [memberInviteUrl, setMemberInviteUrl] = useState<string | null>(null)
  const [memberTemporaryPassword, setMemberTemporaryPassword] = useState<string | null>(null)
  const [memberSentiments, setMemberSentiments] = useState<Record<string, CommunicationSentimentSnapshot>>({})
  const [sentimentNotice, setSentimentNotice] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<TenantMembership | null>(null)
  const [memberToEdit, setMemberToEdit] = useState<TenantMembership | null>(null)
  const [editNickname, setEditNickname] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editRole, setEditRole] = useState<TenantMembership['role']>('MEMBER')
  const [projectToEdit, setProjectToEdit] = useState<DashboardProject | null>(null)
  const [editProjectCode, setEditProjectCode] = useState('')
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectDescription, setEditProjectDescription] = useState('')
  const [editProjectNotice, setEditProjectNotice] = useState<string | null>(null)

  const activeMembership = memberships.find((membership) => membership.tenantId === currentTenant?.id) ?? memberships[0]
  const activeTenantId = activeMembership?.tenantId
  const activeTenantName = activeMembership?.tenant?.name ?? currentTenant?.name
  const canViewTeamSentiment = activeMembership?.role === 'TENANT_ADMIN' || activeMembership?.role === 'MANAGER'
  const canManageTeam = canViewTeamSentiment
  const canShowTeamActions = canManageOrganizationTeam(packageCode)
  const packageMaxProjects =
    activeMembership?.tenant?.currentPackage?.maxProjects
    ?? currentTenant?.currentPackage?.maxProjects
  const canCreateProject = canCreateProjectForPackage(projects.length, packageMaxProjects)

  const canRemoveTeamMember = (member: TenantMembership) => {
    if (!canManageTeam || !user?.id) {
      return false
    }

    if (member.userId === user.id) {
      return false
    }

    if (activeMembership?.role === 'MANAGER' && member.role === 'TENANT_ADMIN') {
      return false
    }

    return true
  }

  const canEditTeamMember = (member: TenantMembership) => {
    if (!canManageTeam) {
      return false
    }

    if (activeMembership?.role === 'MANAGER' && member.role === 'TENANT_ADMIN' && member.userId !== user?.id) {
      return false
    }

    return true
  }

  const canChangeMemberRole = (member: TenantMembership) => {
    if (member.userId === user?.id) {
      return false
    }

    if (activeMembership?.role === 'MANAGER' && member.role === 'TENANT_ADMIN') {
      return false
    }

    return true
  }

  const openEditProject = (project: DashboardProject) => {
    setProjectToEdit(project)
    setEditProjectCode(project.code ?? '')
    setEditProjectName(project.name)
    setEditProjectDescription(project.description ?? '')
    setEditProjectNotice(null)
  }

  const handleSaveProjectEdit = async () => {
    if (!projectToEdit) {
      return
    }

    const code = editProjectCode.trim()
    const name = editProjectName.trim()
    const description = editProjectDescription.trim()

    if (code.length < 2 || name.length < 2) {
      setEditProjectNotice(t('dashboard.projectValidation'))
      return
    }

    const duplicateCode = projects.some(
      (project) => project.id !== projectToEdit.id && project.code?.toLowerCase() === code.toLowerCase(),
    )
    if (duplicateCode) {
      setEditProjectNotice(t('dashboard.projectCodeDuplicate'))
      return
    }

    setEditProjectNotice(null)
    const updated = await updateProject<DashboardProject>(`/projects/${projectToEdit.id}`, {
      code,
      name,
      description,
    })

    if (updated) {
      setProjects((current) => current.map((project) => (
        project.id === updated.id ? { ...project, ...updated } : project
      )))
      setProjectToEdit(null)
      setEditProjectNotice(t('dashboard.projectUpdated'))
    }
  }

  const openEditMember = (member: TenantMembership) => {
    setMemberToEdit(member)
    setEditNickname(getMemberNickname(member))
    setEditJobTitle(member.jobTitle || '')
    setEditDepartment(member.department || '')
    setEditRole(member.role)
  }

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

  const fetchMemberSentiments = useCallback(async () => {
    if (!activeTenantId || !canViewTeamSentiment) {
      setMemberSentiments({})
      return
    }

    const data = await getSentimentMembers<{
      members: Array<{ userId: string; userName: string; snapshot: CommunicationSentimentSnapshot }>
    }>(`/tenants/${activeTenantId}/communication-sentiment/members`)

    if (data?.members) {
      const next: Record<string, CommunicationSentimentSnapshot> = {}
      for (const item of data.members) {
        next[item.userId] = item.snapshot
      }
      setMemberSentiments(next)
    }
  }, [activeTenantId, canViewTeamSentiment, getSentimentMembers])

  useEffect(() => {
    void fetchMemberSentiments()
  }, [fetchMemberSentiments])

  const handleRefreshSentiment = async () => {
    if (!activeTenantId || !canViewTeamSentiment) {
      return
    }

    setSentimentNotice(null)
    await runSentimentBatch(`/tenants/${activeTenantId}/communication-sentiment/run`, {})
    setSentimentNotice(t('communicationSentiment.refreshed'))
    await fetchMemberSentiments()
  }

  const handleCreateProject = async () => {
    if (!canCreateProject) {
      setCreateProjectNotice(t('dashboard.projectLimit', { count: packageMaxProjects ?? 0 }))
      return
    }

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
      nickname: memberNickname.trim() || undefined,
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
      setMemberNickname('')
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

  const handleConfirmRemoveMember = async () => {
    if (!activeTenantId || !memberToRemove) {
      return
    }

    const result = await removeTeamMember<{ removed: boolean }>(
      `/tenants/${activeTenantId}/members/${memberToRemove.userId}`,
    )

    if (result?.removed) {
      setMemberNotice(t('dashboard.memberRemoved'))
      setMemberToRemove(null)
      await fetchTenantTeam()
    }
  }

  const handleSaveMemberEdit = async () => {
    if (!activeTenantId || !memberToEdit) {
      return
    }

    const payload: {
      nickname?: string | null
      jobTitle?: string | null
      department?: string | null
      role?: TenantMembership['role']
    } = {
      nickname: editNickname.trim() || null,
      jobTitle: editJobTitle.trim() || null,
      department: editDepartment.trim() || null,
    }

    if (canChangeMemberRole(memberToEdit)) {
      payload.role = editRole
    }

    const updated = await updateTeamMember<TenantMembership>(
      `/tenants/${activeTenantId}/members/${memberToEdit.userId}`,
      payload,
    )

    if (updated) {
      setMemberNotice(t('dashboard.memberSaved'))
      setMemberToEdit(null)
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
              <div className="flex flex-wrap gap-2">
                {canViewTeamSentiment && canShowTeamActions && (
                  <button
                    type="button"
                    onClick={() => void handleRefreshSentiment()}
                    disabled={isSentimentLoading}
                    className="px-3 py-2 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"
                  >
                    {isSentimentLoading ? t('communicationSentiment.refreshing') : t('communicationSentiment.refresh')}
                  </button>
                )}
                {canShowTeamActions && (
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
                )}
              </div>
            </div>

            {sentimentNotice && (
              <p className="mb-3 text-sm text-indigo-700 dark:text-indigo-300">{sentimentNotice}</p>
            )}

            {showCreateMember && canShowTeamActions && (
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
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberNickname')}</span>
                    <input
                      value={memberNickname}
                      onChange={(e) => setMemberNickname(e.target.value)}
                      placeholder={t('dashboard.memberNicknamePlaceholder')}
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
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberNickname')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberEmail')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberPhone')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberRole')}</th>
                      <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberJobTitle')}</th>
                      {canViewTeamSentiment && canShowTeamActions && (
                        <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('communicationSentiment.columnLabel')}</th>
                      )}
                      {canManageTeam && (
                        <th className="py-2 pr-3 font-semibold text-gray-700 dark:text-slate-300">{t('common.actions', { defaultValue: 'Actions' })}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.id} className="border-b border-gray-100 dark:border-slate-800">
                        <td className="py-2 pr-3 text-gray-800 dark:text-slate-200">{member.user?.name || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{getMemberNickname(member) || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{member.user?.email || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{member.user?.phone || '-'}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{t(tenantRoleLabelKey[member.role])}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">{member.jobTitle || '-'}</td>
                        {canViewTeamSentiment && canShowTeamActions && (
                          <td className="py-2 pr-3 text-gray-700 dark:text-slate-300">
                            <TeamSentimentBadge snapshot={member.user?.id ? memberSentiments[member.user.id] : null} />
                          </td>
                        )}
                        {canManageTeam && (
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-1">
                              {canEditTeamMember(member) && (
                                <button
                                  type="button"
                                  onClick={() => openEditMember(member)}
                                  title={t('dashboard.memberEdit')}
                                  aria-label={t('dashboard.memberEdit')}
                                  className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {canRemoveTeamMember(member) && (
                                <button
                                  type="button"
                                  onClick={() => setMemberToRemove(member)}
                                  title={t('dashboard.memberRemove')}
                                  aria-label={t('dashboard.memberRemove')}
                                  className="rounded-md border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                              {!canEditTeamMember(member) && !canRemoveTeamMember(member) && (
                                <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <ConfirmDialog
            open={Boolean(memberToRemove)}
            title={t('dashboard.memberRemoveTitle')}
            description={t('dashboard.memberRemoveDescription', {
              name: memberToRemove?.user?.name || memberToRemove?.user?.email || '-',
              organization: activeTenantName || t('dashboard.selectOrganizationFirst'),
            })}
            confirmLabel={t('dashboard.memberRemoveConfirm')}
            cancelLabel={t('dashboard.cancel')}
            tone="danger"
            isLoading={isRemovingMember}
            onCancel={() => setMemberToRemove(null)}
            onConfirm={() => void handleConfirmRemoveMember()}
          />

          <EditProjectDialog
            open={Boolean(projectToEdit)}
            projectName={editProjectName}
            projectCode={editProjectCode}
            projectDescription={editProjectDescription}
            title={t('dashboard.editProjectTitle')}
            saveLabel={isUpdatingProject ? t('dashboard.savingProject') : t('dashboard.saveProject')}
            cancelLabel={t('dashboard.cancel')}
            codeLabel={t('dashboard.projectCode')}
            nameLabel={t('dashboard.projectName')}
            descriptionLabel={t('dashboard.projectDescription')}
            codePlaceholder={t('dashboard.projectCodePlaceholder')}
            namePlaceholder={t('dashboard.projectNamePlaceholder')}
            descriptionPlaceholder={t('dashboard.projectDescriptionPlaceholder')}
            onProjectNameChange={setEditProjectName}
            onProjectCodeChange={setEditProjectCode}
            onProjectDescriptionChange={setEditProjectDescription}
            onSave={() => void handleSaveProjectEdit()}
            onCancel={() => setProjectToEdit(null)}
            isLoading={isUpdatingProject}
            errorMessage={updateProjectError?.message ?? null}
            noticeMessage={editProjectNotice}
          />

          <EditMemberDialog
            open={Boolean(memberToEdit)}
            member={memberToEdit}
            canChangeRole={memberToEdit ? canChangeMemberRole(memberToEdit) : false}
            title={t('dashboard.memberEditTitle')}
            saveLabel={t('dashboard.memberSave')}
            cancelLabel={t('dashboard.cancel')}
            nicknameLabel={t('dashboard.memberNickname')}
            jobTitleLabel={t('dashboard.memberJobTitle')}
            departmentLabel={t('dashboard.memberDepartment')}
            roleLabel={t('dashboard.memberRole')}
            nicknamePlaceholder={t('dashboard.memberNicknamePlaceholder')}
            jobTitlePlaceholder={t('dashboard.memberJobTitlePlaceholder')}
            departmentPlaceholder={t('dashboard.memberDepartmentPlaceholder')}
            roleOptions={([
              'TENANT_ADMIN',
              'MANAGER',
              'MEMBER',
              'VIEWER',
            ] as const).map((role) => ({
              value: role,
              label: t(tenantRoleLabelKey[role]),
            }))}
            nickname={editNickname}
            jobTitle={editJobTitle}
            department={editDepartment}
            role={editRole}
            onNicknameChange={setEditNickname}
            onJobTitleChange={setEditJobTitle}
            onDepartmentChange={setEditDepartment}
            onRoleChange={setEditRole}
            isLoading={isUpdatingMember}
            errorMessage={updateMemberError?.message ?? null}
            onCancel={() => setMemberToEdit(null)}
            onSave={() => void handleSaveMemberEdit()}
          />

          {removeMemberError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{removeMemberError.message}</p>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {t('dashboard.projectsOnHand')}
            </h2>
            {canCreateProject && (
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
            )}
          </div>

          {showCreateProject && canCreateProject && (
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
                  className="relative p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => openEditProject(project)}
                    title={t('dashboard.editProject')}
                    aria-label={t('dashboard.editProject')}
                    className="absolute top-3 right-3 rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <h3 className="pr-10 text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                    {project.name}
                  </h3>
                  {project.code && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5 truncate">
                      {project.code}
                    </p>
                  )}
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1 truncate">
                    {project.tenant?.name || t('dashboard.noTenant')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                    {t('dashboard.meetingsCount', { count: project._count?.meetings ?? 0 })}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {canAccessFeature('CONTINUITY_SUMMARY') && (
                    <Link
                      to={`/continuity/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                      {t('continuity.title')}
                    </Link>
                    )}
                    {canAccessFeature('REMINDERS_BASIC') && (
                    <Link
                      to={`/reminders/${project.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                    >
                      {t('reminders.title')}
                    </Link>
                    )}
                    <Link
                      to={`/projects/${project.id}/knowledge`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    >
                      {t('projectKnowledge.shortLabel')}
                    </Link>
                    <Link
                      to={`/projects/${project.id}/notes`}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/30"
                    >
                      {t('generalNotes.shortLabel')}
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
