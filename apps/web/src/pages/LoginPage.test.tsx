import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

let mockApiErrorMessage = 'Account suspended'
const mockSetAuth = vi.fn()

vi.mock('../hooks/useApi', async () => {
  const React = await import('react')

  return {
    useApi: () => {
      const [error, setError] = React.useState<{ message: string } | null>(null)

      return {
        post: async () => {
          setError({ message: mockApiErrorMessage })
          return null
        },
        error
      }
    }
  }
})

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: vi.fn()
  })
}))

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: { setAuth: typeof mockSetAuth }) => unknown) =>
    selector({ setAuth: mockSetAuth })
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div>language-switcher</div>
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'common.appName': 'Kora',
        'common.tagline': 'AI-Powered Meeting & Work OS',
        'common.loading': 'Loading',
        'landing.backToHome': 'Back to home',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.signIn': 'Sign In',
        'auth.loginFailed': 'Login failed',
        'auth.invalidCredentials': 'Invalid email or password',
        'auth.accountSuspended': 'Account access has been suspended. Please contact your administrator.'
      }

      return messages[key] ?? key
    }
  })
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiErrorMessage = 'Account suspended'
  })

  it('shows a friendly suspended-account message on login failure', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    await userEvent.type(screen.getByLabelText('Email'), 'member@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Password123!')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByText('Account access has been suspended. Please contact your administrator.')).toBeInTheDocument()
    })

    expect(mockSetAuth).not.toHaveBeenCalled()
  })
})
