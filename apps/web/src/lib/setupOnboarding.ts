export type SetupOnboardingStatus = 'skipped' | 'completed'

const SETUP_ONBOARDING_STORAGE_KEY = 'setup-onboarding-status-by-user'

type SetupOnboardingStatusMap = Record<string, SetupOnboardingStatus>

function readStatusMap(): SetupOnboardingStatusMap {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.localStorage.getItem(SETUP_ONBOARDING_STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as SetupOnboardingStatusMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStatusMap(value: SetupOnboardingStatusMap) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SETUP_ONBOARDING_STORAGE_KEY, JSON.stringify(value))
}

export function getSetupOnboardingStatus(userId?: string): SetupOnboardingStatus | null {
  if (!userId) {
    return null
  }

  const map = readStatusMap()
  return map[userId] ?? null
}

export function setSetupOnboardingStatus(userId: string, status: SetupOnboardingStatus) {
  const map = readStatusMap()
  map[userId] = status
  writeStatusMap(map)
}
