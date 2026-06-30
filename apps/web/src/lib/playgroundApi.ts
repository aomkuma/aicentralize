type PlaygroundErrorBody = {
  message?: string
  detail?: string | { message?: string }
}

export function playgroundUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized.startsWith('/ai/playground/')) {
    return normalized
  }
  if (normalized.startsWith('/playground/')) {
    return `/ai${normalized}`
  }
  return `/ai/playground${normalized}`
}

export async function readPlaygroundJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>
  }

  const text = await response.text()

  if (response.status === 413) {
    throw new Error('FILE_TOO_LARGE')
  }

  if (response.status === 404) {
    throw new Error('PLAYGROUND_NOT_FOUND')
  }

  if (response.status === 502 || response.status === 504) {
    throw new Error('PLAYGROUND_GATEWAY')
  }

  throw new Error(text.trim().slice(0, 240) || `Request failed (${response.status})`)
}

export function playgroundErrorMessage(
  error: unknown,
  fallback: string,
  t?: (key: string) => string
) {
  const code = error instanceof Error ? error.message : ''
  const translate = (key: string) => (t ? t(key) : fallback)

  if (code === 'FILE_TOO_LARGE') {
    return translate('meetings.errors.fileTooLarge')
  }
  if (code === 'PLAYGROUND_NOT_FOUND') {
    return translate('meetings.errors.playgroundNotFound')
  }
  if (code === 'PLAYGROUND_GATEWAY') {
    return translate('meetings.errors.playgroundGateway')
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

export function playgroundResponseMessage(data: PlaygroundErrorBody | null | undefined, fallback: string) {
  if (!data) {
    return fallback
  }

  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail
  }

  if (data.detail && typeof data.detail === 'object' && typeof data.detail.message === 'string') {
    return data.detail.message
  }

  return data.message?.trim() || fallback
}

export async function postPlaygroundFormData<T>(path: string, formData: FormData) {
  const response = await fetch(playgroundUrl(path), {
    method: 'POST',
    body: formData,
  })

  const data = await readPlaygroundJson<T & PlaygroundErrorBody>(response)
  if (!response.ok) {
    throw new Error(playgroundResponseMessage(data, `Request failed (${response.status})`))
  }

  return data
}
