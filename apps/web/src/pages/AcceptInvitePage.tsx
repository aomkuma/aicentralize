import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi'
import { useAuthStore } from '../stores/authStore'
import type { AuthResponse } from '../types'

type InvitationPreview = {
  email: string
  name: string
  tenantName: string
  expiresAt: string
}

export default function AcceptInvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const { get, post, isLoading, error } = useApi()
  const setAuth = useAuthStore((state) => state.setAuth)

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) {
        setNotice(t('invite.missingToken'))
        return
      }

      const data = await get<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`)
      if (data) {
        setInvitation(data)
      }
    }

    loadInvitation()
  }, [get, token, t])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setNotice(null)

    if (password !== confirmPassword) {
      setNotice(t('profile.passwordMismatch'))
      return
    }

    const response = await post<AuthResponse>(`/auth/invitations/${encodeURIComponent(token)}/accept`, {
      password,
    })

    if (response) {
      setAuth(response)
      navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 px-4 py-10">
      <div className="mx-auto max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">{t('invite.title')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('invite.description')}</p>

        {(notice || error) && (
          <div className="mt-4 rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-300">
            {notice || error?.message}
          </div>
        )}

        {invitation && (
          <div className="mt-5 rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm text-slate-200">
            <p className="font-semibold">{invitation.tenantName}</p>
            <p className="mt-1 text-slate-400">{invitation.name} · {invitation.email}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">{t('profile.newPassword')}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">{t('profile.confirmPassword')}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </label>

          <button
            type="submit"
            disabled={isLoading || !invitation}
            className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isLoading ? `${t('common.loading')}...` : t('invite.accept')}
          </button>
        </form>

        <Link to="/auth/login" className="mt-4 block text-center text-sm text-blue-300 hover:text-blue-200">
          {t('auth.signIn')}
        </Link>
      </div>
    </div>
  )
}
