import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../contexts/ThemeContext'
import LanguageSwitcher from './LanguageSwitcher'
import { PRIMARY_NAVIGATION, type NavigationIcon } from '../config/navigation'

interface SidebarProps {
  currentTenantName?: string
  isDesktopCollapsed: boolean
  onToggleDesktopCollapse: () => void
  isMobileOpen: boolean
  onToggleMobile: () => void
  onCloseMobile: () => void
}

function DashboardIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h8V3H3v9zm10 9h8v-7h-8v7zm0-11h8V3h-8v7zM3 21h8v-7H3v7z" />
    </svg>
  )
}

function ProjectsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}

function SetupIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 16v-2m8-6h-2M6 12H4m12.364 5.364l-1.414-1.414M9.05 9.05 7.636 7.636m8.728 0L14.95 9.05M9.05 14.95l-1.414 1.414M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function AiIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3a2.25 2.25 0 00-2.25 2.25V6h9v-.75A2.25 2.25 0 0014.25 3h-4.5zM6 9.75A2.25 2.25 0 018.25 7.5h7.5A2.25 2.25 0 0118 9.75v7.5A2.25 2.25 0 0115.75 19.5h-7.5A2.25 2.25 0 016 17.25v-7.5zM10 12h.01M14 12h.01M9 15.75h6" />
    </svg>
  )
}

function ContinuityIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function RemindersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function MeetingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm3-6h2v2H8v-2zm4 0h2v2h-2v-2z" />
    </svg>
  )
}

function TraceIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l.5.2a1 1 0 00.766 0l.5-.2a1 1 0 011.35.936l.06.538a1 1 0 00.498.762l.457.264a1 1 0 01.366 1.366l-.264.457a1 1 0 000 .998l.264.457a1 1 0 01-.366 1.366l-.457.264a1 1 0 00-.498.762l-.06.538a1 1 0 01-1.35.936l-.5-.2a1 1 0 00-.766 0l-.5.2a1 1 0 01-1.35-.936l-.06-.538a1 1 0 00-.498-.762l-.457-.264a1 1 0 01-.366-1.366l.264-.457a1 1 0 000-.998l-.264-.457a1 1 0 01.366-1.366l.457-.264a1 1 0 00.498-.762l.06-.538z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9a3 3 0 100 6 3 3 0 000-6z" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-1a4 4 0 00-4-4h-1M9 20H4v-1a4 4 0 014-4h1m0-4a4 4 0 100-8 4 4 0 000 8zm8 0a4 4 0 100-8 4 4 0 000 8z" />
    </svg>
  )
}

function JournalIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}

function iconFor(type: NavigationIcon) {
  if (type === 'ai') {
    return <AiIcon />
  }

  if (type === 'projects') {
    return <ProjectsIcon />
  }

  if (type === 'setup') {
    return <SetupIcon />
  }

  if (type === 'continuity') {
    return <ContinuityIcon />
  }

  if (type === 'reminders') {
    return <RemindersIcon />
  }

  if (type === 'meetings') {
    return <MeetingsIcon />
  }

  if (type === 'trace') {
    return <TraceIcon />
  }

  if (type === 'settings') {
    return <SettingsIcon />
  }

  if (type === 'users') {
    return <UsersIcon />
  }

  if (type === 'journal') {
    return <JournalIcon />
  }

  return <DashboardIcon />
}

export default function Sidebar({
  currentTenantName,
  isDesktopCollapsed,
  onToggleDesktopCollapse,
  isMobileOpen,
  onToggleMobile,
  onCloseMobile,
}: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const isCollapsed = isDesktopCollapsed
  const isPlatformAdmin = user?.systemRole === 'SUPER_ADMIN' || user?.systemRole === 'MODERATOR'
  const navItems = PRIMARY_NAVIGATION.filter((item) => {
    if (isPlatformAdmin) {
      return item.id === 'admin-organizations' ||
        (user?.systemRole === 'SUPER_ADMIN' && (item.id === 'admin-platform-users' || item.id === 'settings' || item.id === 'setup'))
    }

    if (item.id === 'admin-organizations' || item.id === 'admin-platform-users') {
      return false
    }

    if (item.id === 'projects') {
      return user?.systemRole !== 'SUPER_ADMIN'
    }

    if (item.id === 'settings' || item.id === 'setup') {
      return user?.systemRole === 'SUPER_ADMIN'
    }

    return true
  })

  const handleLogout = () => {
    clearAuth()
    onCloseMobile()
  }

  const getNavLabel = (item: (typeof PRIMARY_NAVIGATION)[number]) => item.labelKey ? t(item.labelKey) : item.id

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={onToggleMobile}
        className={`fixed left-[max(1rem,calc(env(safe-area-inset-left)+1rem))] top-[max(1.75rem,calc(env(safe-area-inset-top)+0.875rem))] z-50 h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 lg:hidden ${
          isMobileOpen ? 'hidden' : 'inline-flex'
        }`}
        aria-label="Open navigation menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 flex h-screen flex-col overflow-hidden bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 shadow-lg transition-all duration-300 ease-in-out z-40 w-64 lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isDesktopCollapsed ? 'lg:w-20' : 'lg:w-64'
        }`}
      >
        {/* Logo section */}
        <div className={`border-b border-gray-200 dark:border-slate-700 transition-[padding] duration-300 ease-out ${isCollapsed ? 'p-3 lg:p-4' : 'p-6'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className={`font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent text-2xl transition-all duration-300 ease-out ${isCollapsed ? 'lg:hidden' : 'lg:block'}`}>
                {t('common.appName')}
              </h1>
              <p className={`text-xs text-gray-500 dark:text-slate-400 mt-1 transition-all duration-300 ease-out ${isCollapsed ? 'lg:hidden' : 'lg:block'}`}>
                {t('common.tagline')}
              </p>
              <div className={`hidden h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white lg:grid place-items-center font-bold transition-all duration-300 ease-out ${isCollapsed ? 'lg:grid' : 'lg:hidden'}`}>
                A
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseMobile}
              className="inline-flex lg:hidden items-center justify-center h-8 w-8 rounded-md border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              aria-label="Close navigation menu"
              title="Close menu"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onToggleDesktopCollapse}
              className="hidden lg:inline-flex items-center justify-center h-8 w-8 rounded-md border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              title={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg className={`h-4 w-4 transition-transform ${isDesktopCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Current tenant info */}
        {currentTenantName && (
          <div className={`border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 transition-[padding] duration-300 ease-out ${isCollapsed ? 'px-2 py-3 lg:px-3' : 'px-6 py-4'}`}>
            <p className={`text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide transition-all duration-300 ease-out ${isCollapsed ? 'lg:hidden' : 'lg:block'}`}>
              {t('dashboard.currentOrganization')}
            </p>
            <p className={`text-sm font-semibold text-gray-900 dark:text-white mt-1 truncate transition-all duration-300 ease-out ${isCollapsed ? 'lg:text-center lg:mt-0' : ''}`} title={currentTenantName}>
              <span className={isCollapsed ? 'lg:hidden' : ''}>{currentTenantName}</span>
              <span className={`hidden ${isCollapsed ? 'lg:inline-block' : ''}`}>{currentTenantName.slice(0, 2).toUpperCase()}</span>
            </p>
          </div>
        )}

        {/* Navigation menu */}
        <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 transition-[padding] duration-300 ease-out ${isCollapsed ? 'px-2 lg:px-3' : 'px-4'}`}>
          <ul className="space-y-2">
            {navItems.map((item) => {
              const label = getNavLabel(item)
              const sharedClass = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ease-out ${isCollapsed ? 'lg:justify-center lg:gap-0 lg:px-2' : 'lg:justify-start'}`
              const activeClass = 'bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300'
              const inactiveClass = 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800'

              if (item.external) {
                const isActive = location.pathname.startsWith(item.to)
                return (
                  <li key={item.to}>
                    <a
                      href={item.to}
                      onClick={onCloseMobile}
                      title={isCollapsed ? label : undefined}
                      className={`${sharedClass} ${isActive ? activeClass : inactiveClass}`}
                    >
                      <span className="shrink-0">{iconFor(item.icon)}</span>
                      <span className={`text-sm font-medium ${isCollapsed ? 'lg:hidden' : ''}`}>
                        {label}
                      </span>
                    </a>
                  </li>
                )
              }

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onCloseMobile}
                    title={isCollapsed ? label : undefined}
                    className={({ isActive }) => `${sharedClass} ${isActive ? activeClass : inactiveClass}`}
                  >
                    <span className="shrink-0">{iconFor(item.icon)}</span>
                    <span className={`text-sm font-medium ${isCollapsed ? 'lg:hidden' : ''}`}>
                      {label}
                    </span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Theme & Language toggles */}
        <div className={`shrink-0 border-t border-gray-200 bg-white/95 dark:border-slate-700 dark:bg-slate-900/95 transition-[padding] duration-300 ease-out ${isCollapsed ? 'p-2 lg:p-3 space-y-2' : 'p-4 space-y-3'}`}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDesktopCollapsed ? 'Toggle theme' : undefined}
            className={`w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-300 ease-out hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${isCollapsed ? 'lg:justify-center lg:px-2 lg:py-2.5' : ''}`}
          >
            <span className="flex items-center gap-2">
              {theme === 'dark' ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                  </svg>
                  <span className={isCollapsed ? 'lg:hidden' : ''}>Dark</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l-2.12-2.12a4 4 0 00-5.656 5.656l2.12 2.12a4 4 0 005.656-5.656zM9 16.9a1 1 0 11-1.414-1.414l5.656-5.656a1 1 0 111.414 1.414L9 16.9z" clipRule="evenodd"></path>
                  </svg>
                  <span className={isCollapsed ? 'lg:hidden' : ''}>Light</span>
                </>
              )}
            </span>
            <span className={`text-xs transition-all duration-300 ease-out ${isCollapsed ? 'hidden lg:inline' : ''}`}>{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>

          {/* Language Switcher */}
          <div className={`transition-all duration-300 ease-out ${isCollapsed ? 'lg:flex lg:justify-center' : ''}`}>
            <LanguageSwitcher compact />
          </div>

          {/* User section */}
          <div className="border-t border-gray-200 dark:border-slate-700 pt-3">
            <NavLink
              to="/profile"
              onClick={onCloseMobile}
              title={isDesktopCollapsed ? t('profile.title') : undefined}
              className={`flex items-center gap-3 px-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 mb-3 transition-all duration-300 ease-out ${isCollapsed ? 'lg:justify-center lg:gap-0' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                  {user?.email}
                </p>
              </div>
            </NavLink>

            {user?.systemRole === 'SUPER_ADMIN' && (
              <NavLink
                to="/settings"
                onClick={onCloseMobile}
                title={isDesktopCollapsed ? t('navigation.systemSettings') : undefined}
                className={`w-full mb-2 flex items-center justify-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all duration-300 ease-out text-sm font-medium px-4 py-2 ${isCollapsed ? 'lg:px-2 lg:py-2.5' : ''}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l.5.2a1 1 0 00.766 0l.5-.2a1 1 0 011.35.936l.06.538a1 1 0 00.498.762l.457.264a1 1 0 01.366 1.366l-.264.457a1 1 0 000 .998l.264.457a1 1 0 01-.366 1.366l-.457.264a1 1 0 00-.498.762l-.06.538a1 1 0 01-1.35.936l-.5-.2a1 1 0 00-.766 0l-.5.2a1 1 0 01-1.35-.936l-.06-.538a1 1 0 00-.498-.762l-.457-.264a1 1 0 01-.366-1.366l.264-.457a1 1 0 000-.998l-.264-.457a1 1 0 01.366-1.366l.457-.264a1 1 0 00.498-.762l.06-.538z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9a3 3 0 100 6 3 3 0 000-6z" />
                </svg>
                <span className={isCollapsed ? 'lg:hidden' : ''}>{t('navigation.systemSettings')}</span>
              </NavLink>
            )}

            <button
              onClick={handleLogout}
              title={isDesktopCollapsed ? t('common.logout') : undefined}
              className={`w-full flex items-center justify-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-300 ease-out text-sm font-medium px-4 py-2 ${isCollapsed ? 'lg:px-2 lg:py-2.5' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className={isCollapsed ? 'lg:hidden' : ''}>{t('common.logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onCloseMobile}
        ></div>
      )}
    </>
  )
}
