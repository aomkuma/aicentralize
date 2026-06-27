import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './en.json'
import th from './th.json'

const resources = {
  en: { translation: en },
  th: { translation: th }
}

const storedLanguage = typeof window === 'undefined'
  ? undefined
  : window.localStorage.getItem('app-language') || window.localStorage.getItem('i18nextLng') || undefined

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: storedLanguage === 'en' || storedLanguage === 'th' ? storedLanguage : undefined,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app-language',
      caches: ['localStorage']
    }
  })

export default i18n
