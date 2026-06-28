import { create } from 'zustand'
import type { User, AuthResponse } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (auth: AuthResponse) => void
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  clearAuth: () => void
  updateUser: (user: Partial<User>) => void
  loadFromLocalStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  setAuth: (auth: AuthResponse) => {
    // Write to localStorage
    if (typeof window !== 'undefined') {
      const previousUserJson = localStorage.getItem('user')
      let previousUser: User | null = null
      try {
        previousUser = previousUserJson ? JSON.parse(previousUserJson) as User : null
      } catch {
        previousUser = null
      }
      if (previousUser?.id !== auth.user.id) {
        localStorage.removeItem('tenant-store')
      }
      localStorage.setItem('accessToken', auth.accessToken)
      localStorage.setItem('refreshToken', auth.refreshToken)
      localStorage.setItem('user', JSON.stringify(auth.user))
    }
    
    // Update store
    set({
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      isAuthenticated: true,
    })
  },

  setTokens: ({ accessToken, refreshToken }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
    }

    set((state) => ({
      accessToken,
      refreshToken,
      isAuthenticated: Boolean(state.user),
    }))
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      localStorage.removeItem('tenant-store')
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    })
  },

  updateUser: (updates) => {
    set((state) => {
      const updatedUser = state.user ? { ...state.user, ...updates } : null
      // Sync to localStorage
      if (updatedUser && typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(updatedUser))
      }
      return { user: updatedUser }
    })
  },

  loadFromLocalStorage: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken')
      const refreshToken = localStorage.getItem('refreshToken')
      const userJson = localStorage.getItem('user')
      const parsedUser = userJson ? JSON.parse(userJson) : null

      if (token || refreshToken) {
        set({
          accessToken: token,
          refreshToken,
          user: parsedUser,
          isAuthenticated: Boolean(parsedUser),
        })
      }
    }
  },
}))
