'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Monitor,
  PlaySquare,
  Server,
  Settings,
  Truck,
} from 'lucide-react'
import { usePeers } from '@/hooks/usePeers'
import { APP_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useBrandingStore } from '@/store/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/screens', label: 'Screens', icon: Monitor },
  { href: '/content', label: 'Content', icon: PlaySquare },
  { href: '/production-data', label: 'Production Data', icon: FileSpreadsheet },
  { href: '/trucks', label: 'Truck Token', icon: Truck },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { appName, appIcon } = useBrandingStore()
  return (
    <div className={cn('flex h-18 items-center gap-3 px-5', !compact && 'px-6')}>
      <Avatar className="size-9 rounded-xl bg-white shadow-lg shadow-primary/15">
        {appIcon && <AvatarImage src={appIcon} alt={`${appName} logo`} className="object-contain p-1" />}
        <AvatarFallback className="rounded-xl bg-linear-to-br from-primary via-primary/80 to-secondary font-bold text-primary-foreground">
          {appName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{appName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">Control center · v{APP_VERSION}</p>
        </div>
      )}
    </div>
  )
}

function NavLinks({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3 scrollbar-none">
      {navItems.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        const link = (
          <Button
            asChild
            variant="ghost"
            className={cn(
              'relative h-11 w-full justify-start rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors duration-200',
              compact && 'justify-center px-0',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Link
              href={item.href}
              aria-label={item.label}
              className={cn('flex items-center w-full h-full', compact ? 'justify-center' : 'gap-3')}
            >
              <item.icon className="size-4.5 shrink-0" />
              {!compact && <span>{item.label}</span>}
            </Link>
          </Button>
        )
        if (mobile) return <SheetClose key={item.href} asChild>{link}</SheetClose>
        if (!compact) return <div key={item.href}>{link}</div>
        return (
          <div key={item.href}>
            <Tooltip>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          </div>
        )
      })}
    </nav>
  )
}

function PeerStatus({ compact = false }: { compact?: boolean }) {
  const { peerCount } = usePeers()
  if (peerCount < 1) return null
  return (
    <div className={cn('flex items-center justify-center gap-2', !compact && 'justify-start px-2')}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-green-500" />
      </span>
      {!compact && <Badge variant="secondary">{peerCount} peers online</Badge>}
    </div>
  )
}

export function MobileSidebar() {
  return (
    <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl lg:hidden">
      <Brand />
      <Sheet>
        <SheetTrigger asChild><Button aria-label="Open navigation" variant="outline" size="icon"><Menu /></Button></SheetTrigger>
        <SheetContent side="left" className="w-[280px] gap-0 border-border/70 bg-card/95 p-0 backdrop-blur-xl">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <Separator />
          <NavLinks mobile />
          <Separator />
          <div className="p-4"><PeerStatus /></div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-border/60 bg-card/75 shadow-2xl shadow-black/10 backdrop-blur-xl transition-[width] duration-300 lg:flex"
      style={{ width: isCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
    >
      <Brand compact={isCollapsed} />
      <Separator />
      <NavLinks compact={isCollapsed} />
      <Separator />
      <div className="space-y-3 p-3">
        <PeerStatus compact={isCollapsed} />
        <Button variant="ghost" className={cn('h-10 w-full justify-start rounded-xl', isCollapsed && 'justify-center px-0')} onClick={onToggle}>
          {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
          {!isCollapsed && <span>Collapse menu</span>}
        </Button>
      </div>
    </aside>
  )
}
