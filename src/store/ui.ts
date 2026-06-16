'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  isCollapsed: boolean
  toggle: () => void
  setCollapsed: (value: boolean) => void
}

interface BrandingState {
  appName: string
  appIcon: string | null
  customFavicon: string | null
  load: () => void
  save: (name: string, icon: string | null, favicon: string | null) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (isCollapsed) => set({ isCollapsed }),
    }),
    { name: 'signalos-sidebar' }
  )
)

export const useBrandingStore = create<BrandingState>()(
  persist(
    (set, get) => ({
      appName: process.env.NEXT_PUBLIC_APP_NAME || 'MG Enterprise',
      appIcon: process.env.NEXT_PUBLIC_APP_ICON || null,
      customFavicon: process.env.NEXT_PUBLIC_CUSTOM_FAVICON || null,
      load: () => set({ ...get() }),
      save: (appName, appIcon, customFavicon) =>
        set({
          appName: appName || process.env.NEXT_PUBLIC_APP_NAME || 'MG Enterprise',
          appIcon: appIcon || process.env.NEXT_PUBLIC_APP_ICON || null,
          customFavicon: customFavicon || process.env.NEXT_PUBLIC_CUSTOM_FAVICON || null,
        }),
    }),
    {
      name: 'signalos-branding',
      partialize: ({ appName, appIcon, customFavicon }) => ({
        appName,
        appIcon,
        customFavicon,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<BrandingState>) || {}
        return {
          ...currentState,
          ...persisted,
          appName: process.env.NEXT_PUBLIC_APP_NAME || persisted.appName || 'MG Enterprise',
          appIcon: process.env.NEXT_PUBLIC_APP_ICON || persisted.appIcon || null,
          customFavicon: process.env.NEXT_PUBLIC_CUSTOM_FAVICON || persisted.customFavicon || null,
        }
      },
    }
  )
)
