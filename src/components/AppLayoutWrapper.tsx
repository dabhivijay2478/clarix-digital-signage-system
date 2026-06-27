'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sun, Moon, Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import Sidebar, { MobileSidebar } from './Sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBrandingStore, useSidebarStore } from '@/store/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { showToast } from '@/components/Toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    document.title = `${appName} — Digital Signage`
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
        showToast('Welcome back', 'success')
      }
    } catch (error) {
      showToast(`Login failed: ${error}`, 'error')
    } finally {
      setLoggingIn(false)
    }
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                {appName}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold">
              {inviteMode ? 'Accept Invite' : 'Sign In'}
            </CardTitle>
            <CardDescription>
              {inviteMode
                ? 'Enter your invite code to create your account.'
                : 'Sign in with your credentials to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {inviteMode ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Invite Code</label>
                    <Input
                      placeholder="Enter invite code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Name</label>
                    <Input
                      placeholder="Enter your name"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait...
                  </>
                ) : inviteMode ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setInviteMode(!inviteMode)}
              >
                {inviteMode ? 'Back to Sign In' : 'I have an invite code'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (pathname === '/settings' && !user.is_developer) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
        <main 
          className="app-main flex min-h-screen items-center justify-center transition-all duration-300"
          style={{ marginLeft: isCollapsed ? '72px' : '260px' }}
        >
          <Card className="max-w-md border-border">
            <CardHeader>
              <CardTitle>Settings Locked</CardTitle>
              <CardDescription>
                Only developer accounts can access system settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => void logout()}>
                Switch Account
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Theme Toggle */}
      <div className="fixed top-4 right-4 z-50">
        {mounted ? (
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-lg border-border bg-card shadow-sm"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-500" />
            )}
          </Button>
        ) : (
          <div className="h-9 w-9 rounded-lg border border-border bg-card animate-pulse" />
        )}
      </div>

      <Sidebar isCollapsed={isCollapsed} onToggle={toggle} />
      <MobileSidebar />
      
      <main 
        className="app-main h-[calc(100vh-3.5rem)] transition-all duration-300 lg:h-screen"
        style={{ marginLeft: isCollapsed ? '72px' : '260px' }}
      >
        <ScrollArea className="h-full">
          <div className="main-content">
            {children}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
