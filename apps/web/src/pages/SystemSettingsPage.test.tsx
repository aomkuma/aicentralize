import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import SystemSettingsPage from './SystemSettingsPage'
import type { SystemSettings } from '../types'

const mockGet = vi.fn()
const mockPatch = vi.fn()
const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('../hooks/useApi', () => ({
  useApi: () => ({
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
    isLoading: false,
    error: null
  })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const settingsFixture: SystemSettings = {
  ai: {
    asrMode: 'hybrid',
    generation: {
      defaultModel: 'qwen2.5:7b',
      maxPromptChars: 4000,
      provider: 'ollama',
      fallbackProviders: ['openai']
    },
    whisper: {
      enabled: true,
      model: 'tiny',
      language: 'th',
      timeoutMs: 30000
    }
  },
  security: {
    forceMfaForSuperAdmin: false,
    sessionTtlHours: 12
  },
  notifications: {
    emailEnabled: true,
    digestEnabled: true,
    escalationEnabled: true
  },
  integrations: {
    ollamaEnabled: true,
    whisperEnabled: true
  },
  aiProviders: {
    accounts: []
  }
}

describe('SystemSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGet.mockImplementation(async (url: string) => {
      if (url === '/system-settings') {
        return settingsFixture
      }

      if (url === '/system-settings/ai-keys') {
        return { items: [] }
      }

      return null
    })

    mockPatch.mockResolvedValue(settingsFixture)
    mockPost.mockResolvedValue({ id: 'key-1' })
    mockDelete.mockResolvedValue({ ok: true })
  })

  it('renders generation provider controls and saves settings payload', async () => {
    render(<SystemSettingsPage />)

    await screen.findByText('settings.title')
    const providerSelect = await screen.findByLabelText('settings.generationProvider')
    expect(providerSelect).toBeDisabled()
    expect((providerSelect as HTMLSelectElement).value).toBe('ollama')

    const saveButton = await screen.findByRole('button', { name: 'settings.save' })

    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/system-settings', expect.objectContaining({
        ai: expect.any(Object),
        security: expect.any(Object),
        notifications: expect.any(Object),
        integrations: expect.any(Object)
      }))
    })

    const payload = mockPatch.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('aiProviders')
  })

  it('creates a new AI key account from form', async () => {
    render(<SystemSettingsPage />)

    const accountNameInput = await screen.findByLabelText('settings.aiKeyAccountName')
    const secretInput = await screen.findByLabelText('settings.aiKeySecret')
    const saveKeyButton = await screen.findByRole('button', { name: 'settings.aiKeySave' })

    await userEvent.type(accountNameInput, 'superadmin')
    await userEvent.type(secretInput, 'AIzaSyExampleSecretKey12345')
    await userEvent.click(saveKeyButton)

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/system-settings/ai-keys', expect.objectContaining({
        accountName: 'superadmin',
        provider: 'gemini',
        apiKey: 'AIzaSyExampleSecretKey12345'
      }))
    })
  })
})
