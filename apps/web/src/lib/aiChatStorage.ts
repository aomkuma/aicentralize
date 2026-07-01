export const CHAT_STATE_KEY_PREFIX = 'aicentralize-ai-chat-state'

export function chatStateStorageKey(projectId?: string) {
  return `${CHAT_STATE_KEY_PREFIX}:${projectId || 'dashboard'}`
}

export function clearPersistedChatState(projectId?: string) {
  if (typeof window === 'undefined') {
    return
  }
  window.sessionStorage.removeItem(chatStateStorageKey(projectId))
}

export function clearAllPersistedChatStates() {
  if (typeof window === 'undefined') {
    return
  }

  const keysToRemove: string[] = []
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index)
    if (key?.startsWith(`${CHAT_STATE_KEY_PREFIX}:`)) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    window.sessionStorage.removeItem(key)
  }
}
