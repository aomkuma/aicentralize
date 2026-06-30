/** iOS Safari exposes Push only for web apps opened from the Home Screen (iOS 16.4+). */
export function isIosDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') {
    return false
  }

  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true
  }

  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) {
    return configured.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }

  return configured || 'http://localhost:4000'
}
