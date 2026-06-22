export type NavigationIcon = 'dashboard' | 'setup' | 'ai' | 'continuity' | 'reminders' | 'trace' | 'settings'

export interface NavigationItemConfig {
  id: string
  to: string
  labelKey?: string
  icon: NavigationIcon
  external?: boolean
}

export const PRIMARY_NAVIGATION: NavigationItemConfig[] = [
  {
    id: 'dashboard',
    to: '/dashboard',
    labelKey: 'dashboard.home',
    icon: 'dashboard',
  },
  {
    id: 'continuity',
    to: '/continuity',
    labelKey: 'continuity.title',
    icon: 'continuity',
  },
  {
    id: 'reminders',
    to: '/reminders',
    labelKey: 'reminders.title',
    icon: 'reminders',
  },
  {
    id: 'ai-trace',
    to: '/ai-trace',
    labelKey: 'aiTrace.title',
    icon: 'trace',
  },
  {
    id: 'setup',
    to: '/setup',
    labelKey: 'setup.welcomeTitle',
    icon: 'setup',
  },
  {
    id: 'settings',
    to: '/settings',
    labelKey: 'navigation.systemSettings',
    icon: 'settings',
  },
  {
    id: 'ai-playground',
    to: '/ai/playground/page',
    labelKey: 'navigation.aiPlayground',
    icon: 'ai',
    external: true,
  },
]
