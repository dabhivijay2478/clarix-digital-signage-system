'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Monitor,
  PlaySquare,
  Settings,
} from 'lucide-react'
import { usePeers } from '@/hooks/usePeers'
import { APP_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useBrandingStore } from '@/store/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/screens', label: 'Screens', icon: Monitor },
  { href: '/content', label: 'Content', icon: PlaySquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { peerCount } = usePeers()
  const { appName, appIcon } = useBrandingStore()

  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/70 bg-card/80 backdrop-blur-xl transition-[width] duration-300"
      style={{ width: isCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
    >
      <div className={cn('flex h-16 items-center gap-3 px-5', !isCollapsed && 'px-6')}>
        <Avatar className="size-8 rounded-lg">
          {appIcon && <AvatarImage src={appIcon} alt="" />}
          <AvatarFallback className="rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 font-bold text-white">
            {appName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appName}</p>
            <p className="font-mono text-[10px] text-muted-foreground">v{APP_VERSION}</p>
          </div>
        )}
      </div>
      <Separator />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const content = (
            <Button
              asChild
              variant="ghost"
              className={cn(
                'relative w-full justify-start text-muted-foreground',
                isCollapsed && 'justify-center px-0',
                isActive &&
                  "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
              )}
            >
              <Link href={item.href} aria-label={item.label}>
                <item.icon />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            </Button>
          )
          return isCollapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.href}>{content}</div>
          )
        })}
      </nav>

      <Separator />
      <div className="space-y-3 p-3">
        {peerCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn('flex items-center justify-center gap-2', !isCollapsed && 'justify-start px-2')}>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-green-500" />
                </span>
                <Badge variant="secondary">{peerCount}{!isCollapsed && ' peers online'}</Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{peerCount} active LAN peers</TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" className={cn('w-full justify-start', isCollapsed && 'justify-center px-0')} onClick={onToggle}>
          {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
          {!isCollapsed && <span>Collapse Menu</span>}
        </Button>
      </div>
    </aside>
  )
}
