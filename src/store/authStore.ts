'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '@/lib/tauri'
import type { AuthUser } from '@/lib/types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  checked: boolean
  login: (email: string, password: string) => Promise<void>
  acceptInvite: (code: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  validate: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      checked: false,

      login: async (email, password) => {
        const session = await authApi.login(email, password)
        set({ token: session.token, user: session.user, checked: true })
      },

      acceptInvite: async (code, name, password) => {
        const session = await authApi.acceptInvite(code, name, password)
        set({ token: session.token, user: session.user, checked: true })
      },

      logout: async () => {
        const token = get().token
        if (token) {
          await authApi.logout(token).catch(() => undefined)
        }
        set({ token: null, user: null, checked: true })
      },

      validate: async () => {
        const token = get().token
        if (!token) {
          set({ user: null, checked: true })
          return
        }
        try {
          const user = await authApi.currentUser(token)
          set({ user, token: user ? token : null, checked: true })
        } catch {
          set({ user: null, token: null, checked: true })
        }
      },
    }),
    {
      name: 'mg-enterprise-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)
