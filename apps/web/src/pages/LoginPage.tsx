import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi'
import { useTheme } from '../contexts/ThemeContext'
import { useAuthStore } from '../stores/authStore'
import LanguageSwitcher from '../components/LanguageSwitcher'
import type { AuthResponse } from '../types'

export default function LoginPage() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { post, error } = useApi()
  const setAuth = useAuthStore((state) => state.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setIsLoading(true)

    const response = await post<AuthResponse>('/auth/login', {
      email,
      password,
    })

    if (response) {
      setAuth(response)
      // App.tsx will auto-navigate to /setup
    } else {
      setSubmitError(error?.message || t('auth.loginFailed'))
      setIsLoading(false)
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
        <Link
          to="/"
          className="hidden sm:inline-flex rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/10 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
        >
          {t('landing.backToHome')}
        </Link>
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
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl shadow-2xl p-8 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
              {t('common.appName')}
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mb-8 text-lg">
              {t('common.tagline')}
            </p>

            {submitError && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? `${t('common.loading')}...` : t('auth.signIn')}
              </button>
            </form>
        </div>
      </div>
    </div>
  )
}
