import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'
import type { User } from '../types'

export default function ProfilePage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const { patch, isLoading, error } = useApi()

  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)

    const response = await patch<User>('/auth/me', {
      name,
      phone: phone.trim() || null,
    })

    if (response) {
      updateUser(response)
      setNotice(t('profile.saved'))
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('profile.title')}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">{t('profile.description')}</p>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          {(notice || error) && (
            <div className={`mb-4 rounded-md px-3 py-2 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
              {error?.message || notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberName')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('dashboard.memberPhone')}</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </label>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isLoading ? `${t('common.loading')}...` : t('profile.saveProfile')}
              </button>
              <Link
                to="/change-password"
                className="rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('profile.changePassword')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}
