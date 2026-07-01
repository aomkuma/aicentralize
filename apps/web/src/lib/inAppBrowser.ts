export type InAppBrowserKind =
  | 'line'
  | 'instagram'
  | 'facebook'
  | 'messenger'
  | 'twitter'
  | 'wechat'
  | 'tiktok'
  | 'linkedin'
  | 'kakao'
  | 'generic'

export type InAppBrowserDetection = {
  isInApp: boolean
  kind: InAppBrowserKind | null
  isIos: boolean
  isAndroid: boolean
}

const IN_APP_PATTERNS: Array<{ kind: InAppBrowserKind; pattern: RegExp }> = [
  { kind: 'line', pattern: /\bLine\//i },
  { kind: 'instagram', pattern: /\bInstagram\b/i },
  { kind: 'facebook', pattern: /\bFBAN\b|\bFBAV\b|\bFB_IAB\b|\bFBIOS\b|\bFBMD\b/i },
  { kind: 'messenger', pattern: /\bMessenger\b/i },
  { kind: 'twitter', pattern: /\bTwitter\b/i },
  { kind: 'wechat', pattern: /\bMicroMessenger\b/i },
  { kind: 'tiktok', pattern: /\bTikTok\b|\bmusical_ly\b|\bBytedanceWebview\b/i },
  { kind: 'linkedin', pattern: /\bLinkedInApp\b/i },
  { kind: 'kakao', pattern: /\bKAKAOTALK\b/i },
]

function getUserAgent() {
  if (typeof navigator === 'undefined') {
    return ''
  }

  return navigator.userAgent || ''
}

function detectInAppKind(userAgent: string): InAppBrowserKind | null {
  for (const entry of IN_APP_PATTERNS) {
    if (entry.pattern.test(userAgent)) {
      return entry.kind
    }
  }

  return null
}

function isAndroidWebView(userAgent: string) {
  return /\bAndroid\b/i.test(userAgent) && /\bwv\b/i.test(userAgent)
}

function isGoogleSearchApp(userAgent: string) {
  return /\bGSA\//i.test(userAgent)
}

function isStandardBrowser(userAgent: string) {
  if (detectInAppKind(userAgent)) {
    return false
  }

  if (isAndroidWebView(userAgent) || isGoogleSearchApp(userAgent)) {
    return false
  }

  if (/\bCriOS\//i.test(userAgent) || /\bFxiOS\//i.test(userAgent) || /\bEdgiOS\//i.test(userAgent)) {
    return true
  }

  if (/\bSamsungBrowser\//i.test(userAgent) || /\bOPR\//i.test(userAgent) || /\bOpera\//i.test(userAgent)) {
    return true
  }

  if (/\bEdg\//i.test(userAgent) || /\bFirefox\//i.test(userAgent)) {
    return true
  }

  if (/\bChrome\//i.test(userAgent) && !/\bEdg\//i.test(userAgent)) {
    return true
  }

  if (/\bSafari\//i.test(userAgent) && /\bVersion\//i.test(userAgent) && !/\bChrome|CriOS|FxiOS|EdgiOS/i.test(userAgent)) {
    return true
  }

  return false
}

export function detectInAppBrowser(): InAppBrowserDetection {
  const userAgent = getUserAgent()
  const isIos = /\biPhone\b|\biPad\b|\biPod\b/i.test(userAgent)
    || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /\bAndroid\b/i.test(userAgent)

  if (isStandardBrowser(userAgent)) {
    return {
      isInApp: false,
      kind: null,
      isIos,
      isAndroid,
    }
  }

  return {
    isInApp: true,
    kind: detectInAppKind(userAgent) ?? 'generic',
    isIos,
    isAndroid,
  }
}

export const IN_APP_BROWSER_DISMISS_KEY = 'kora_in_app_browser_dismissed'
