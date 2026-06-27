'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import Sidebar, { MobileSidebar } from './Sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBrandingStore, useSidebarStore } from '@/store/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { showToast } from '@/components/Toast'

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPresentation = pathname === '/player'
    || pathname?.startsWith('/player/')
    || pathname === '/production-data/view'
    || pathname?.startsWith('/production-data/view/')
  const { isCollapsed, toggle } = useSidebarStore()
  const { appName, customFavicon } = useBrandingStore()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { user, checked, login, acceptInvite, logout, validate } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteMode, setInviteMode] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    setMounted(true)
    validate()
  }, [validate])

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

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoggingIn(true)
    try {
      if (inviteMode) {
        await acceptInvite(inviteCode, inviteName, password)
        showToast('Invite accepted', 'success')
      } else {
        await login(email, password)
        showToast('Logged in successfully', 'success')
      }
    } catch (error) {
      showToast(`Login failed: ${error}`, 'error')
    } finally {
      setLoggingIn(false)
    }
  }

  if (!checked) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Checking session...</div>
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <form onSubmit={handleLogin} className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
          <Badge variant="outline" className="mb-4 border-primary/20 bg-primary/5 text-primary">MG Enterprise Admin</Badge>
          <h1 className="text-3xl font-bold">{inviteMode ? 'Accept invite' : 'Sign in'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {inviteMode
              ? 'Enter the invite code from your Super Admin and create your local account.'
              : 'Use your local controller account. First-run accounts can be set with MG_SUPER_ADMIN_EMAIL/PASSWORD and MG_DEVELOPER_EMAIL/PASSWORD.'}
          </p>
          <div className="mt-6 space-y-3">
            {inviteMode ? (
              <>
                <Input placeholder="invite code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required />
                <Input placeholder="your name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} required />
              </>
            ) : (
              <Input type="email" placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            )}
            <Input type="password" placeholder="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <Button className="mt-6 w-full" disabled={loggingIn}>
            {loggingIn ? 'Please wait...' : inviteMode ? 'Create account' : 'Sign in'}
          </Button>
          <Button type="button" variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={() => setInviteMode((current) => !current)}>
            {inviteMode ? 'Back to sign in' : 'I have an invite code'}
          </Button>
        </form>
      </div>
    )
  }

  if (pathname === '/settings' && !user.is_developer) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
        <main className="app-main h-screen" style={{ '--active-sidebar-width': isCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' } as React.CSSProperties}>
          <div className="main-content flex min-h-screen items-center justify-center">
            <div className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
              <h1 className="text-2xl font-bold">Settings locked</h1>
              <p className="mt-3 text-sm text-muted-foreground">Only developer accounts can access system settings.</p>
              <Button className="mt-6" variant="outline" onClick={() => void logout()}>Switch account</Button>
            </div>
          </div>
        </main>
      </div>
    )
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
