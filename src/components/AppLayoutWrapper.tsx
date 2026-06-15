'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar, { MobileSidebar } from './Sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBrandingStore, useSidebarStore } from '@/store/ui'

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPlayer = pathname === '/player' || pathname?.startsWith('/player/')
  const { isCollapsed, toggle } = useSidebarStore()
  const { appName, customFavicon } = useBrandingStore()

  useEffect(() => {
    document.title = `${appName} — Digital Signage Management`
    if (customFavicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = customFavicon
    }
  }, [appName, customFavicon])

  if (isPlayer) {
    return <div className="h-screen w-screen select-none overflow-hidden bg-black">{children}</div>
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
      <MobileSidebar />
      <main
        className="app-main h-[calc(100vh-4rem)] transition-[margin] duration-300 lg:h-screen"
        style={{ '--active-sidebar-width': isCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' } as React.CSSProperties}
      >
        <ScrollArea className="h-full">
          <div className="main-content">{children}</div>
        </ScrollArea>
      </main>
    </div>
  )
}
