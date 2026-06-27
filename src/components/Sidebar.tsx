'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Monitor,
  PlaySquare,
  Settings,
  Truck,
  Users,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { usePeers } from '@/hooks/usePeers'
import { APP_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useBrandingStore } from '@/store/ui'
import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  badge?: string
  developerOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/screens', label: 'Screens', icon: Monitor },
  { href: '/content', label: 'Content', icon: PlaySquare },
  { href: '/production-data', label: 'Production Data', icon: FileSpreadsheet },
  { href: '/trucks', label: 'Truck Token', icon: Truck },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings, developerOnly: true },
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { appName, appIcon } = useBrandingStore()
  return (
    <div className={cn('flex h-16 items-center gap-3 px-4', compact && 'justify-center px-3')}>
      <Avatar className={cn('rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20', compact ? 'size-9' : 'size-10')}>
        {appIcon && <AvatarImage src={appIcon} alt={`${appName} logo`} className="object-contain p-1.5" />}
        <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-secondary font-bold text-primary-foreground text-sm">
          {appName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {!compact && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">{appName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">v{APP_VERSION}</p>
        </div>
      )}
    </div>
  )
}

function NavLinks({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  
  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {navItems.map((item) => {
        if (item.developerOnly && !user?.is_developer) return null
        
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        
        const linkContent = (
          <Button
            asChild
            variant="ghost"
            className={cn(
              'relative h-10 w-full justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200',
              'hover:bg-muted/80 hover:text-foreground',
              compact && 'justify-center px-0',
              isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
            )}
          >
            <Link href={item.href} aria-label={item.label}>
              <item.icon className={cn('shrink-0', compact ? 'size-5' : 'size-4')} />
              {!compact && <span>{item.label}</span>}
              {!compact && isActive && (
                <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
              )}
            </Link>
          </Button>
        )
        
        if (mobile) {
          return <SheetClose key={item.href} asChild>{linkContent}</SheetClose>
        }
        
        if (compact) {
          return (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
              <TooltipContent side="right" className="border-border bg-popover">
                {item.label}
              </TooltipContent>
            </Tooltip>
          )
        }
        
        return <div key={item.href}>{linkContent}</div>
      })}
    </nav>
  )
}

function PeerStatus({ compact = false }: { compact?: boolean }) {
  const { peerCount } = usePeers()
  if (peerCount < 1) return null
  
  return (
    <div className={cn('flex items-center gap-2 px-3', compact && 'justify-center px-2')}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {!compact && (
        <span className="text-xs font-medium text-muted-foreground">
          {peerCount} peer{peerCount !== 1 ? 's' : ''} online
        </span>
      )}
    </div>
  )
}

function UserSection({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuthStore()
  if (!user) return null
  
  if (compact) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-full rounded-lg"
            onClick={() => void logout()}
          >
            <LogOut className="size-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Logout</TooltipContent>
      </Tooltip>
    )
  }
  
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-sm font-medium">
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.role}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        onClick={() => void logout()}
      >
        <LogOut className="size-3.5" />
        <span className="text-xs">Logout</span>
      </Button>
    </div>
  )
}

export function MobileSidebar() {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-xl lg:hidden">
      <Brand />
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] gap-0 border-r-border bg-background p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <Brand />
            <Separator />
            <ScrollArea className="flex-1">
              <NavLinks mobile />
            </ScrollArea>
            <Separator />
            <div className="p-4 space-y-4">
              <PeerStatus />
              <UserSection />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-border bg-card/95 backdrop-blur-xl transition-all duration-300 lg:flex',
        isCollapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      <Brand compact={isCollapsed} />
      <Separator />
      
      <ScrollArea className="flex-1">
        <NavLinks compact={isCollapsed} />
      </ScrollArea>
      
      <Separator />
      
      <div className="space-y-3 p-3">
        <PeerStatus compact={isCollapsed} />
        <UserSection compact={isCollapsed} />
        
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'h-9 w-full gap-2 text-muted-foreground hover:text-foreground',
                isCollapsed && 'justify-center px-0'
              )}
              onClick={onToggle}
            >
              {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!isCollapsed && <span className="text-xs">Collapse</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isCollapsed ? 'Expand' : 'Collapse'}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}
