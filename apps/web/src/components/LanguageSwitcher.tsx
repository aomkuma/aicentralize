import { useTranslation } from 'react-i18next'

interface LanguageSwitcherProps {
  compact?: boolean
}

export default function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const currentLanguage = i18n.resolvedLanguage || i18n.language

  const changeLanguage = (language: 'en' | 'th') => {
    window.localStorage.setItem('app-language', language)
    window.localStorage.setItem('i18nextLng', language)
    void i18n.changeLanguage(language)
  }

  const buttonClass = (language: 'en' | 'th') => {
    const active = currentLanguage.startsWith(language)
    return `flex-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
      active
        ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300'
        : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700'
    }`
  }

  return (
    <div className={`grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1 dark:bg-slate-800 ${compact ? '' : 'min-w-32'}`}>
      <button
        type="button"
        onClick={() => changeLanguage('en')}
        className={buttonClass('en')}
        aria-pressed={currentLanguage.startsWith('en')}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => changeLanguage('th')}
        className={buttonClass('th')}
        aria-pressed={currentLanguage.startsWith('th')}
      >
        ไทย
      </button>
    </div>
  )
}
