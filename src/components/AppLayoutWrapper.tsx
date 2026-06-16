'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import Sidebar, { MobileSidebar } from './Sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBrandingStore, useSidebarStore } from '@/store/ui'
import { Button } from '@/components/ui/button'

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPresentation = pathname === '/player'
    || pathname?.startsWith('/player/')
    || pathname === '/data-view'
    || pathname?.startsWith('/data-view/')
  const { isCollapsed, toggle } = useSidebarStore()
  const { appName, customFavicon } = useBrandingStore()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  if (isPresentation) {
    return <div className="h-screen w-screen select-none overflow-hidden bg-black">{children}</div>
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Floating Theme Switcher */}
      <div className="fixed top-4 right-4 z-50">
        {mounted ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl border border-border bg-card shadow-sm hover:bg-muted"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="size-4 text-amber-500 transition-transform hover:scale-110" />
            ) : (
              <Moon className="size-4 text-indigo-500 transition-transform hover:scale-110" />
            )}
          </Button>
        ) : (
          <div className="size-9 rounded-xl border border-border bg-card shadow-sm animate-pulse" />
        )}
      </div>

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
