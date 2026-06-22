import { useTranslation } from 'react-i18next'

interface LanguageSwitcherProps {
  compact?: boolean
}

export default function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()

  if (compact) {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => i18n.changeLanguage('en')}
          className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
            i18n.language === 'en'
              ? 'bg-blue-600 dark:bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => i18n.changeLanguage('th')}
          className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
            i18n.language === 'th'
              ? 'bg-blue-600 dark:bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
          }`}
        >
          ไทย
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => i18n.changeLanguage('en')}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          i18n.language === 'en'
            ? 'bg-blue-500 dark:bg-blue-600 text-white'
            : 'bg-slate-700 dark:bg-slate-600 text-slate-300 hover:bg-slate-600 dark:hover:bg-slate-500'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => i18n.changeLanguage('th')}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          i18n.language === 'th'
            ? 'bg-blue-500 dark:bg-blue-600 text-white'
            : 'bg-slate-700 dark:bg-slate-600 text-slate-300 hover:bg-slate-600 dark:hover:bg-slate-500'
        }`}
      >
        ไทย
      </button>
    </div>
  )
}
