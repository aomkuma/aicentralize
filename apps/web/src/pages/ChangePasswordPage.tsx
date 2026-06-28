import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'

export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { post, isLoading, error } = useApi()
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const mustChangePassword = Boolean(user?.mustChangePassword)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)

    if (newPassword !== confirmPassword) {
      setNotice(t('profile.passwordMismatch'))
      return
    }

    const response = await post<{ ok: boolean }>('/auth/change-password', {
      currentPassword: mustChangePassword ? undefined : currentPassword,
      newPassword,
    })

    if (response?.ok) {
      updateUser({ mustChangePassword: false })
      navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {mustChangePassword ? t('profile.mustChangePasswordTitle') : t('profile.changePassword')}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
          {mustChangePassword ? t('profile.mustChangePasswordDesc') : t('profile.changePasswordDesc')}
        </p>

        {(notice || error) && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {notice || error?.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!mustChangePassword && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('profile.currentPassword')}</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                required
              />
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('profile.newPassword')}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('profile.confirmPassword')}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              required
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isLoading ? `${t('common.loading')}...` : t('profile.savePassword')}
          </button>
        </form>
      </div>
    </div>
  )
}
