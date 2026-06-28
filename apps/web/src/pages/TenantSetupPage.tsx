import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useTheme } from '../contexts/ThemeContext'
import { useAuthStore } from '../stores/authStore'
import { getSetupOnboardingStatus, setSetupOnboardingStatus } from '../lib/setupOnboarding'
import LanguageSwitcher from '../components/LanguageSwitcher'
import type { MemberOnboardRequest, MemberOnboardResponse, Tenant, TenantCreateRequest } from '../types'

export default function TenantSetupPage() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { post, isLoading } = useApi()
  const userId = useAuthStore((state) => state.user?.id)

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    organizationName: '',
    contactEmail: '',
    contactName: '',
  })
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    phone: '',
    jobTitle: '',
    department: '',
    tenantRole: 'MEMBER' as MemberOnboardRequest['tenantRole'],
  })
  const [createdTenant, setCreatedTenant] = useState<Tenant | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [invitationEmailSent, setInvitationEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredField, setHoveredField] = useState<string | null>(null)

  const coachMarks = {
    organizationName: {
      title: t('setup.organizationName'),
      description: t('setup.organizationNamePlaceholder'),
      icon: '🏢',
    },
    contactName: {
      title: t('setup.yourName'),
      description: t('setup.yourNamePlaceholder'),
      icon: '👤',
    },
    contactEmail: {
      title: t('setup.emailForUpdates'),
      description: t('setup.emailForUpdates'),
      icon: '📧',
    },
  }

  useEffect(() => {
    const status = getSetupOnboardingStatus(userId)
    if (status === 'skipped' || status === 'completed') {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate, userId])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleMemberInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setMemberForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleNext = async () => {
    if (step === 1) {
      if (!formData.organizationName.trim()) {
        setError('Organization name is required')
        return
      }
      setStep(2)
      setError(null)
    } else if (step === 2) {
      if (!formData.contactName.trim() && !formData.contactEmail.trim()) {
        setError('Please provide at least a name or email')
        return
      }
      setStep(3)
      setError(null)
    }
  }

  const handleSubmit = async () => {
    try {
      setError(null)

      const payload: TenantCreateRequest = {
        name: formData.organizationName,
      }

      const response = await post<Tenant>('/tenants', payload)

      if (response) {
        setCreatedTenant(response)
        setMemberForm((prev) => ({
          ...prev,
          name: formData.contactName,
          email: formData.contactEmail,
        }))
        setStep(4)
      } else {
        setError('Failed to create organization')
      }
    } catch (err) {
      console.error('[TenantSetupPage] Exception:', err)
      setError('An error occurred while creating the organization')
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
      setError(null)
    }
  }

  const handleSkip = () => {
    if (userId) {
      setSetupOnboardingStatus(userId, 'skipped')
    }

    navigate('/dashboard')
  }

  const handleFinish = () => {
    if (userId) {
      setSetupOnboardingStatus(userId, 'completed')
    }

    navigate('/dashboard')
  }

  const handleCreateFirstMember = async () => {
    if (!createdTenant) {
      setError('Please create an organization first')
      return
    }

    const payload: MemberOnboardRequest = {
      name: memberForm.name.trim(),
      email: memberForm.email.trim().toLowerCase(),
      phone: memberForm.phone.trim(),
      jobTitle: memberForm.jobTitle.trim(),
      department: memberForm.department.trim() || undefined,
      tenantRole: memberForm.tenantRole,
    }

    if (!payload.name || !payload.email || !payload.phone || !payload.jobTitle) {
      setError('Name, email, phone, and job title are required')
      return
    }

    setError(null)
    const response = await post<MemberOnboardResponse>(`/tenants/${createdTenant.id}/members/create`, payload)

    if (response) {
      setTemporaryPassword(response.temporaryPassword || null)
      setInviteUrl(response.inviteUrl || null)
      setInvitationEmailSent(Boolean(response.invitationEmailSent))
    } else {
      setError('Failed to create team member')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 dark:from-slate-950 dark:via-blue-950 dark:to-slate-950 lg:from-white lg:via-blue-50 lg:to-white dark:lg:from-slate-950 dark:lg:via-blue-950 dark:lg:to-slate-950 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 dark:bg-blue-500/20 rounded-full blur-3xl hidden dark:block"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/20 dark:bg-cyan-500/20 rounded-full blur-3xl hidden dark:block"></div>
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl dark:hidden"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-200/30 rounded-full blur-3xl dark:hidden"></div>
      </div>

      {/* Theme and Language switcher */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
          title="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l-2.12-2.12a4 4 0 00-5.656 5.656l2.12 2.12a4 4 0 005.656-5.656zM9 16.9a1 1 0 11-1.414-1.414l5.656-5.656a1 1 0 111.414 1.414L9 16.9z" clipRule="evenodd"></path>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
            </svg>
          )}
        </button>
        <LanguageSwitcher />
      </div>

      {/* Main container */}
      <div className="relative z-10 w-full max-w-2xl">
          {/* Progress indicator */}
          <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all ${
                  s <= step
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400'
                    : 'bg-gray-200 dark:bg-slate-700'
                }`}
              ></div>
            ))}
          </div>

          {/* Card */}
          <div className="rounded-2xl shadow-2xl p-8 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
              {t('setup.welcomeTitle')}
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mb-8 text-lg">
              {t('setup.welcomeSubtitle')}
            </p>

            <div className="mb-6 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-900/20 p-4">
              <h2 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">
                {t('setup.startHereTitle')}
              </h2>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-300">
                <li>{t('setup.startHereStep1')}</li>
                <li>{t('setup.startHereStep2')}</li>
                <li>{t('setup.startHereStep3')}</li>
              </ol>
              <p className="mt-3 text-xs text-blue-700 dark:text-blue-300/90">
                {t('setup.startHereTip')}
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Step 1: Organization Name */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    {t('setup.organizationName')}
                  </label>
                  <div
                    className="relative"
                    onMouseEnter={() => setHoveredField('organizationName')}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    <input
                      type="text"
                      name="organizationName"
                      placeholder={t('setup.organizationNamePlaceholder')}
                      value={formData.organizationName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-all"
                    />
                    <p className="mt-2 text-xs text-gray-600 dark:text-slate-400">
                      {t('setup.organizationNameHelp')}
                    </p>

                    {/* Coach mark */}
                    {hoveredField === 'organizationName' && (
                      <div className="absolute -top-24 right-0 bg-yellow-400 text-slate-900 text-xs font-semibold px-3 py-2 rounded-lg shadow-lg z-50 w-48 text-center">
                        <div className="text-sm font-bold">
                          {coachMarks.organizationName.title}
                        </div>
                        <div className="text-xs mt-1">
                          {coachMarks.organizationName.description}
                        </div>
                        <div className="absolute -bottom-1 right-6 w-2 h-2 bg-yellow-400 transform rotate-45"></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Contact Information */}
            {step === 2 && (
              <div className="space-y-5">
                <div
                  className="relative"
                  onMouseEnter={() => setHoveredField('contactName')}
                  onMouseLeave={() => setHoveredField(null)}
                >
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    {t('setup.yourName')}
                  </label>
                  <input
                    type="text"
                    name="contactName"
                    placeholder={t('setup.yourNamePlaceholder')}
                    value={formData.contactName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-all"
                  />
                  <p className="mt-2 text-xs text-gray-600 dark:text-slate-400">
                    {t('setup.contactNameHelp')}
                  </p>

                  {hoveredField === 'contactName' && (
                    <div className="absolute -top-24 right-0 bg-yellow-400 text-slate-900 text-xs font-semibold px-3 py-2 rounded-lg shadow-lg z-50 w-48 text-center">
                      <div className="text-sm font-bold">
                        {coachMarks.contactName.title}
                      </div>
                      <div className="text-xs mt-1">
                        {coachMarks.contactName.description}
                      </div>
                      <div className="absolute -bottom-1 right-6 w-2 h-2 bg-yellow-400 transform rotate-45"></div>
                    </div>
                  )}
                </div>

                <div
                  className="relative"
                  onMouseEnter={() => setHoveredField('contactEmail')}
                  onMouseLeave={() => setHoveredField(null)}
                >
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    {t('setup.emailAddress')}
                  </label>
                  <input
                    type="email"
                    name="contactEmail"
                    placeholder={t('setup.emailAddressPlaceholder')}
                    value={formData.contactEmail}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-all"
                  />
                  <p className="mt-2 text-xs text-gray-600 dark:text-slate-400">
                    {t('setup.contactEmailHelp')}
                  </p>

                  {hoveredField === 'contactEmail' && (
                    <div className="absolute -top-24 right-0 bg-yellow-400 text-slate-900 text-xs font-semibold px-3 py-2 rounded-lg shadow-lg z-50 w-48 text-center">
                      <div className="text-sm font-bold">
                        {coachMarks.contactEmail.title}
                      </div>
                      <div className="text-xs mt-1">
                        {coachMarks.contactEmail.description}
                      </div>
                      <div className="absolute -bottom-1 right-6 w-2 h-2 bg-yellow-400 transform rotate-45"></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Review & Confirm */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    {t('setup.reviewHelp')}
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 space-y-3">
                  <h3 className="font-semibold text-gray-900 dark:text-slate-200">
                    {t('setup.reviewSetup')}
                  </h3>

                  <div className="flex items-center gap-3">
                    <div className="text-2xl">🏢</div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-slate-400">
                        {t('setup.organizationName')}
                      </p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formData.organizationName}
                      </p>
                    </div>
                  </div>

                  {formData.contactName && (
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">👤</div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('setup.yourName')}
                        </p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formData.contactName}
                        </p>
                      </div>
                    </div>
                  )}

                  {formData.contactEmail && (
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">📧</div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('setup.emailAddress')}
                        </p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formData.contactEmail}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-slate-400 text-center">
                  {t('setup.welcomeSubtitle')}
                </p>
              </div>
            )}

            {/* Step 4: First team member */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    {t('setup.organizationCreated')} {t('setup.firstMemberIntro')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberName')}</span>
                    <input
                      name="name"
                      value={memberForm.name}
                      onChange={handleMemberInputChange}
                      placeholder={t('dashboard.memberNamePlaceholder')}
                      className="mt-1 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberEmail')}</span>
                    <input
                      type="email"
                      name="email"
                      value={memberForm.email}
                      onChange={handleMemberInputChange}
                      placeholder={t('dashboard.memberEmailPlaceholder')}
                      className="mt-1 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberPhone')}</span>
                    <input
                      name="phone"
                      value={memberForm.phone}
                      onChange={handleMemberInputChange}
                      placeholder={t('dashboard.memberPhonePlaceholder')}
                      className="mt-1 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberJobTitle')}</span>
                    <input
                      name="jobTitle"
                      value={memberForm.jobTitle}
                      onChange={handleMemberInputChange}
                      placeholder={t('dashboard.memberJobTitlePlaceholder')}
                      className="mt-1 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberDepartment')}</span>
                    <input
                      name="department"
                      value={memberForm.department}
                      onChange={handleMemberInputChange}
                      placeholder={t('dashboard.memberDepartmentPlaceholder')}
                      className="mt-1 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.memberRole')}</span>
                    <select
                      name="tenantRole"
                      value={memberForm.tenantRole}
                      onChange={handleMemberInputChange}
                      className="mt-1 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    >
                      <option value="TENANT_ADMIN">{t('tenant.tenantAdmin')}</option>
                      <option value="MANAGER">{t('tenant.manager')}</option>
                      <option value="MEMBER">{t('tenant.member')}</option>
                      <option value="VIEWER">{t('tenant.viewer')}</option>
                    </select>
                  </label>
                </div>

                {(invitationEmailSent || inviteUrl || temporaryPassword) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <p className="font-semibold">
                      {invitationEmailSent ? t('setup.invitationEmailSent') : t('setup.invitationFallback')}
                    </p>
                    {inviteUrl && (
                      <code className="mt-2 block break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-amber-900 dark:bg-slate-950 dark:text-amber-200">
                        {inviteUrl}
                      </code>
                    )}
                    {temporaryPassword && (
                      <>
                        <p className="mt-3 font-semibold">{t('setup.temporaryPassword')}</p>
                        <code className="mt-2 block rounded-md bg-white px-3 py-2 font-mono text-base text-amber-900 dark:bg-slate-950 dark:text-amber-200">
                          {temporaryPassword}
                        </code>
                        <p className="mt-2">{t('setup.temporaryPasswordHelp')}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={step === 4 ? handleFinish : handleSkip}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold hover:bg-gray-100 dark:hover:bg-slate-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
                type="button"
              >
                {step === 4 ? t('setup.finishSetup') : t('common.skip')}
              </button>

              {step > 1 && step < 4 && (
                <button
                  onClick={handleBack}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold hover:bg-gray-100 dark:hover:bg-slate-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  type="button"
                >
                  {t('common.back')}
                </button>
              )}

              {step < 3 ? (
                <button
                  onClick={handleNext}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  type="button"
                >
                  {t('common.next')}
                </button>
              ) : step === 3 ? (
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  type="button"
                >
                  {isLoading ? `${t('common.loading')}...` : t('setup.createOrganization')}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCreateFirstMember}
                    className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLoading || Boolean(temporaryPassword || invitationEmailSent || inviteUrl)}
                    type="button"
                  >
                    {isLoading ? `${t('common.loading')}...` : t('setup.createFirstMember')}
                  </button>
                  <button
                    onClick={handleFinish}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLoading}
                    type="button"
                  >
                    {(temporaryPassword || invitationEmailSent || inviteUrl) ? t('setup.finishSetup') : t('setup.skipFirstMember')}
                  </button>
                </>
              )}
            </div>

            {/* Step counter */}
            <p className="text-center text-sm text-gray-600 dark:text-slate-400 mt-4">
              {t('setup.step', { current: step, total: 4 })}
            </p>
        </div>
      </div>
    </div>
  )
}
