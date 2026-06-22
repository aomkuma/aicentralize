import { create } from 'zustand'
import type { User, AuthResponse } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (auth: AuthResponse) => void
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

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
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
      const userJson = localStorage.getItem('user')
      if (token) {
        set({
          accessToken: token,
          refreshToken: localStorage.getItem('refreshToken'),
          user: userJson ? JSON.parse(userJson) : null,
          isAuthenticated: true,
        })
      }
    }
  },
}))
