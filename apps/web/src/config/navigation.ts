export type NavigationIcon = 'dashboard' | 'projects' | 'setup' | 'ai' | 'continuity' | 'reminders' | 'meetings' | 'trace' | 'settings'

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
    id: 'projects',
    to: '/projects',
    labelKey: 'navigation.projects',
    icon: 'projects',
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
    id: 'meetings',
    to: '/meetings',
    labelKey: 'meetings.title',
    icon: 'meetings',
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
    labelKey: 'setup.createOrganization',
    icon: 'setup',
  },
  {
    id: 'admin-organizations',
    to: '/admin/organizations',
    labelKey: 'adminOrganizations.title',
    icon: 'setup',
  },
  {
    id: 'settings',
    to: '/settings',
    labelKey: 'navigation.systemSettings',
    icon: 'settings',
  },
]
