export type NavigationIcon = 'dashboard' | 'projects' | 'setup' | 'ai' | 'continuity' | 'reminders' | 'meetings' | 'trace' | 'settings' | 'users'

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
    labelKey: 'navigation.dashboard',
    icon: 'dashboard',
  },
  {
    id: 'meetings',
    to: '/meetings',
    labelKey: 'navigation.meetingStudio',
    icon: 'meetings',
  },
  {
    id: 'projects',
    to: '/projects',
    labelKey: 'navigation.allProjects',
    icon: 'projects',
  },
  {
    id: 'general-notes',
    to: '/general-notes',
    labelKey: 'navigation.generalNotes',
    icon: 'continuity',
  },
  {
    id: 'reminders',
    to: '/reminders',
    labelKey: 'navigation.taskReminders',
    icon: 'reminders',
  },
  {
    id: 'meeting-history',
    to: '/meetings/history',
    labelKey: 'navigation.meetingHistory',
    icon: 'meetings',
  },
  {
    id: 'ai-trace',
    to: '/ai-trace',
    labelKey: 'navigation.aiTrace',
    icon: 'trace',
  },
  {
    id: 'setup',
    to: '/setup',
    labelKey: 'navigation.organizationSetup',
    icon: 'setup',
  },
  {
    id: 'admin-organizations',
    to: '/admin/organizations',
    labelKey: 'navigation.organizationAdmin',
    icon: 'setup',
  },
  {
    id: 'admin-platform-users',
    to: '/admin/platform-users',
    labelKey: 'navigation.platformUsers',
    icon: 'users',
  },
  {
    id: 'settings',
    to: '/settings',
    labelKey: 'navigation.systemSettings',
    icon: 'settings',
  },
]
