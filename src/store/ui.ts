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
      appName: 'SignalOS',
      appIcon: null,
      customFavicon: null,
      load: () => set({ ...get() }),
      save: (appName, appIcon, customFavicon) =>
        set({ appName: appName || 'SignalOS', appIcon, customFavicon }),
    }),
    {
      name: 'signalos-branding',
      partialize: ({ appName, appIcon, customFavicon }) => ({
        appName,
        appIcon,
        customFavicon,
      }),
    }
  )
)
