import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PRIMARY_NAVIGATION } from '../config/navigation'

interface BreadcrumbItem {
  label: string
  to?: string
}

export default function Breadcrumb() {
  const { t } = useTranslation()
  const location = useLocation()

  // Build breadcrumb items based on current path
  const buildBreadcrumbs = (): BreadcrumbItem[] => {
    const breadcrumbs: BreadcrumbItem[] = [
      {
        label: t('common.appName'),
        to: '/dashboard',
      },
    ]

    // Find the current page in navigation
    const currentItem = PRIMARY_NAVIGATION.find((item) => {
      if (item.external) {
        return location.pathname.startsWith(item.to)
      }
      return location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    })

    if (currentItem) {
      // Add the main page
      breadcrumbs.push({
        label: currentItem.labelKey ? t(currentItem.labelKey) : currentItem.id,
        to: currentItem.to,
      })

      // Parse path for sub-pages (e.g., /continuity/:projectId)
      const pathParts = location.pathname.split('/').filter(Boolean)
      
      // Handle project-based routes
      if (pathParts[0] === 'continuity' && pathParts[1]) {
        breadcrumbs.push({
          label: t('continuity.project') || 'Project',
        })
      }
      
      if (pathParts[0] === 'reminders' && pathParts[1]) {
        breadcrumbs.push({
          label: t('reminders.project') || 'Project',
        })
      }

      if (pathParts[0] === 'meetings' && pathParts[1]) {
        breadcrumbs.push({
          label: t('meetings.project') || 'Project',
        })
      }
      
      if (pathParts[0] === 'ai-trace') {
        if (pathParts[1]) {
          breadcrumbs.push({
            label: t('aiTrace.project') || 'Project',
          })
        }
        if (pathParts[2]) {
          breadcrumbs.push({
            label: t('aiTrace.meeting') || 'Meeting',
          })
        }
      }
    }

    return breadcrumbs
  }

  const breadcrumbs = buildBreadcrumbs()

  return (
    <nav className="flex items-center gap-2" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <span className="text-gray-400 dark:text-slate-600">/</span>
              )}
              
              {isLast ? (
                <span className="text-gray-900 dark:text-white font-medium">
                  {item.label}
                </span>
              ) : item.to ? (
                <Link
                  to={item.to}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-gray-600 dark:text-slate-400">
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
