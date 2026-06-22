import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'light' | 'dark'
type ThemePreference = Theme | 'system'

const THEME_STORAGE_KEY = 'theme-preference'

interface ThemeContextType {
  theme: Theme
  preference: ThemePreference
  setThemePreference: (next: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }

  return 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(getInitialPreference)
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme)

  const theme: Theme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  }, [preference])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [theme])

  const setThemePreference = (next: ThemePreference) => {
    setPreference(next)
  }

  const toggleTheme = () => {
    setPreference((current) => {
      const effective = current === 'system' ? systemTheme : current
      return effective === 'dark' ? 'light' : 'dark'
    })
  }

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      preference,
      setThemePreference,
      toggleTheme,
    }),
    [theme, preference],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
