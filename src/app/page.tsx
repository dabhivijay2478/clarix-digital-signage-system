'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { 
  CircleStop, 
  Clock, 
  Monitor, 
  PlaySquare, 
  Rows3, 
  Sparkles, 
  Loader2,
  Zap,
  ArrowRight
} from 'lucide-react'
import StatCard from '@/components/StatCard'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { playlistsApi, scheduleApi, screensApi } from '@/lib/tauri'
import type { ScheduleSlot } from '@/lib/types'
import { cn } from '@/lib/utils'

const ScheduleTimeline = dynamic(() => import('@/components/ScheduleTimeline'), {
  loading: () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm font-medium">Loading schedule...</span>
    </div>
  ),
})

export default function DashboardPage() {
  const router = useRouter()
  const [time, setTime] = useState('')
  const [screensCount, setScreensCount] = useState(0)
  const [playlistsCount, setPlaylistsCount] = useState(0)
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false
      }))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [screens, playlists, schedules] = await Promise.all([
          screensApi.getAll(), 
          playlistsApi.getAll(), 
          scheduleApi.getAll()
        ])
        setScreensCount(screens.length)
        setPlaylistsCount(playlists.length)
        setScheduleSlots(schedules)
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadDashboardData()
  }, [])

  const handleEmergencyStop = async () => {
    try {
      const screens = await screensApi.getAll()
      if (!screens.length) {
        showToast('No registered screens to stop', 'info')
        return
      }
      showToast('Shutting down all screens...', 'warning')
      await Promise.all(screens.map((screen) => screensApi.setPower(screen.id, false)))
      showToast('All screens powered off successfully', 'success')
      setScreensCount(screens.length)
    } catch (error) {
      showToast(`Emergency shutdown failed: ${error}`, 'error')
    }
  }

  const quickActions = [
    {
      icon: Monitor,
      label: 'Add Screen',
      description: 'Register a new display',
      href: '/screens',
      iconBg: 'bg-emerald-500/10',
      iconText: 'text-emerald-600 dark:text-emerald-400',
      danger: false,
    },
    {
      icon: PlaySquare,
      label: 'Upload Content',
      description: 'Add media to library',
      href: '/content',
      iconBg: 'bg-blue-500/10',
      iconText: 'text-blue-600 dark:text-blue-400',
      danger: false,
    },
    {
      icon: Rows3,
      label: 'Create Playlist',
      description: 'Organize your content',
      href: '/playlists',
      iconBg: 'bg-violet-500/10',
      iconText: 'text-violet-600 dark:text-violet-400',
      danger: false,
    },
    {
      icon: CircleStop,
      label: 'Emergency Stop',
      description: 'Power off all screens',
      onClick: handleEmergencyStop,
      iconBg: 'bg-red-500/10',
      iconText: 'text-red-500',
      danger: true,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/5 text-primary">
            <Sparkles className="mr-1 h-3 w-3" />
            Control Center
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A live view of your signage network and scheduled playback.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium tabular-nums">{time}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading dashboard...</span>
        </div>
      ) : (
        <>
          {/* Compact Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="▣" value={screensCount} label="Screens" compact />
            <StatCard icon="☰" value={playlistsCount} label="Playlists" color="info" compact />
          </div>

          {/* Quick Actions - Above Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" />
                Quick Actions
              </CardTitle>
              <CardDescription className="text-xs">
                Jump into the most common workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 text-left',
                      'transition-all duration-150 hover:bg-muted/60 hover:border-border',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      action.danger && 'hover:border-red-500/30 hover:bg-red-500/5'
                    )}
                    onClick={action.onClick || (() => router.push(action.href!))}
                  >
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      action.iconBg
                    )}>
                      <action.icon className={cn('h-4 w-4', action.iconText)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-sm font-semibold leading-tight',
                        action.danger ? 'text-red-500' : 'text-foreground'
                      )}>
                        {action.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {action.description}
                      </p>
                    </div>
                    {!action.danger && (
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Schedule Timeline */}
          <ScheduleTimeline slots={scheduleSlots} />
        </>
      )}
    </div>
  )
}
