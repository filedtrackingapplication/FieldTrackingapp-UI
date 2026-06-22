import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '../types'
import { authApi, setAuthToken } from '../services/api'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearAuth: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      login: async (username, password) => {
        const res = await authApi.login(username, password)
        const { access_token, user } = res.data
        localStorage.setItem('access_token', access_token)
        setAuthToken(access_token)
        // Mark as hydrated so ProtectedRoute stops returning null
        set({ user, token: access_token, isAuthenticated: true, _hasHydrated: true })
      },

      logout: async () => {
        try {
          await authApi.logout()
        } catch {
          // ignore errors on logout
        }
        localStorage.removeItem('access_token')
        setAuthToken(null)
        set({ user: null, token: null, isAuthenticated: false })
      },

      // Synchronous local-only clear of auth (does not call backend).
      clearAuth: () => {
        localStorage.removeItem('access_token')
        setAuthToken(null)
        set({ user: null, token: null, isAuthenticated: false })
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
        // Ensure axios default header is set from the rehydrated token.
        if (state?.token) {
          import('../services/api').then(m => m.setAuthToken(state.token))
        }
      },
    }
  )
)
