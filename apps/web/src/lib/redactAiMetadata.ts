const HIDDEN_TRACE_KEYS = new Set([
  'model',
  'confidence',
  'llmmodel',
  'promptmodel',
  'generationmodel'
])

export function redactAiMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactAiMetadata(item)) as T
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (HIDDEN_TRACE_KEYS.has(key.toLowerCase())) {
        continue
      }
      result[key] = redactAiMetadata(nested)
    }
    return result as T
  }

  return value
}
