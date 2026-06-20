'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { APP_LOGO, APP_NAME } from '@/lib/branding'

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
    { name: 'clarix-sidebar' }
  )
)

export const useBrandingStore = create<BrandingState>()(
  (set) => ({
    appName: APP_NAME,
    appIcon: APP_LOGO,
    customFavicon: APP_LOGO,
    load: () => set({ appName: APP_NAME, appIcon: APP_LOGO, customFavicon: APP_LOGO }),
    save: () => set({ appName: APP_NAME, appIcon: APP_LOGO, customFavicon: APP_LOGO }),
  })
)
