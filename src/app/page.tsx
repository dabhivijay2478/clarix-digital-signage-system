'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { contentApi, playlistsApi, scheduleApi, screensApi } from '@/lib/tauri'
import type { AppWeekday, ContentItem, Playlist, ScheduleSlot, Screen } from '@/lib/types'
import {
  APP_WEEKDAYS,
  formatScheduleTime,
  getControllerTimeZone,
  normalizePlaylistItemSchedule,
  parseTimeToMinutes,
} from '@/lib/signage-schedule'
import { cn } from '@/lib/utils'
import type { ScheduleTimelineSlot } from '@/components/ScheduleTimeline'

const ScheduleTimeline = dynamic(() => import('@/components/ScheduleTimeline'), {
  loading: () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm font-medium">Loading schedule...</span>
    </div>
  ),
})

function getNextWeekday(day: AppWeekday): AppWeekday {
  const index = APP_WEEKDAYS.indexOf(day)
  return APP_WEEKDAYS[(index + 1) % APP_WEEKDAYS.length]
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 1439))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function addTimelineWindow(
  slots: ScheduleTimelineSlot[],
  slotBase: Omit<ScheduleTimelineSlot, 'start_time' | 'duration_mins' | 'days_of_week'>,
  day: AppWeekday,
  start: string,
  end: string,
) {
  const startMinutes = parseTimeToMinutes(start)
  const endMinutes = parseTimeToMinutes(end)
  if (startMinutes === null || endMinutes === null) return

  if (startMinutes === endMinutes) {
    slots.push({
      ...slotBase,
      id: `${slotBase.id}-${day}-all-day`,
      start_time: '00:00',
      duration_mins: 24 * 60,
      days_of_week: [day],
    })
    return
  }

  if (startMinutes < endMinutes) {
    slots.push({
      ...slotBase,
      id: `${slotBase.id}-${day}`,
      start_time: start,
      duration_mins: endMinutes - startMinutes,
      days_of_week: [day],
    })
    return
  }

  slots.push({
    ...slotBase,
    id: `${slotBase.id}-${day}-late`,
    start_time: start,
    duration_mins: 24 * 60 - startMinutes,
    days_of_week: [day],
  })

  if (endMinutes > 0) {
    slots.push({
      ...slotBase,
      id: `${slotBase.id}-${day}-early`,
      start_time: '00:00',
      duration_mins: endMinutes,
      days_of_week: [getNextWeekday(day)],
    })
  }
}

function buildDashboardTimelineSlots(
  screens: Screen[],
  playlists: Playlist[],
  schedules: ScheduleSlot[],
  contentItems: ContentItem[],
): ScheduleTimelineSlot[] {
  const slots: ScheduleTimelineSlot[] = schedules.map((slot) => ({
    id: `schedule-${slot.id}`,
    name: slot.name,
    start_time: slot.start_time,
    duration_mins: slot.duration_mins,
    days_of_week: slot.days_of_week,
    description: `${slot.name} (${formatScheduleTime(slot.start_time)} · ${slot.duration_mins} mins)`,
  }))
  const playlistsById = new Map(playlists.map((playlist) => [playlist.id, playlist]))
  const contentById = new Map(contentItems.map((item) => [item.id, item]))

  for (const screen of screens) {
    if (!screen.playlist_id) continue
    const playlist = playlistsById.get(screen.playlist_id)
    if (!playlist) continue

    playlist.items.forEach((item, itemIndex) => {
      const schedule = normalizePlaylistItemSchedule(item.display_schedule)
      if (!schedule.time_restricted) return
      const contentName = contentById.get(item.content_id)?.name ?? `Item ${itemIndex + 1}`
      const name = `${screen.name} · ${contentName}`
      const dateText = schedule.date_restricted
        ? ` · ${schedule.start_date || 'Any start'} to ${schedule.end_date || 'Any end'}`
        : ''

      for (const day of APP_WEEKDAYS) {
        const daySchedule = schedule.day_times?.[day]
        if (!daySchedule?.enabled) continue
        addTimelineWindow(
          slots,
          {
            id: `playlist-${screen.id}-${playlist.id}-${itemIndex}`,
            name,
            description: `${screen.name} · ${playlist.name} · ${contentName} (${formatScheduleTime(daySchedule.start)}-${formatScheduleTime(daySchedule.end)}${dateText})`,
          },
          day,
          daySchedule.start,
          daySchedule.end,
        )
      }
    })
  }

  return slots
}

export default function DashboardPage() {
  const router = useRouter()
  const [time, setTime] = useState('')
  const [screensCount, setScreensCount] = useState(0)
  const [playlistsCount, setPlaylistsCount] = useState(0)
  const [timelineSlots, setTimelineSlots] = useState<ScheduleTimelineSlot[]>([])
  const [loading, setLoading] = useState(true)
  const controllerTimeZone = getControllerTimeZone()

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-US', { 
        timeZone: controllerTimeZone,
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true
      }))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [controllerTimeZone])

  const loadDashboardData = useCallback(async () => {
    try {
      const [screens, playlists, schedules, contentItems] = await Promise.all([
        screensApi.getAll(),
        playlistsApi.getAll(),
        scheduleApi.getAll(),
        contentApi.getAll(),
      ])
      setScreensCount(screens.length)
      setPlaylistsCount(playlists.length)
      setTimelineSlots(buildDashboardTimelineSlots(screens, playlists, schedules, contentItems))
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  useEffect(() => {
    const refreshOnFocus = () => {
      void loadDashboardData()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [loadDashboardData])



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
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-3">
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
                    onClick={() => router.push(action.href)}
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
          <ScheduleTimeline slots={timelineSlots} />
        </>
      )}
    </div>
  )
}
