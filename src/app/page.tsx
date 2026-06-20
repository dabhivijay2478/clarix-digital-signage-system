'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { CircleStop, Clock3, Monitor, Network, PlaySquare, Rows3, Sparkles } from 'lucide-react'
import StatCard from '@/components/StatCard'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePeers } from '@/hooks/usePeers'
import { playlistsApi, scheduleApi, screensApi } from '@/lib/tauri'
import type { ScheduleSlot } from '@/lib/types'

const ScheduleTimeline = dynamic(() => import('@/components/ScheduleTimeline'), {
  loading: () => <Skeleton className="h-80 w-full" />,
})

export default function DashboardPage() {
  const router = useRouter()
  const { peerCount } = usePeers()
  const [time, setTime] = useState('')
  const [screensCount, setScreensCount] = useState(0)
  const [playlistsCount, setPlaylistsCount] = useState(0)
  const [uptime, setUptime] = useState('0%')
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [screens, playlists, schedules] = await Promise.all([screensApi.getAll(), playlistsApi.getAll(), scheduleApi.getAll()])
        setScreensCount(screens.length)
        setPlaylistsCount(playlists.length)
        const onlineScreens = screens.filter((screen) => screen.is_online).length
        setUptime(screens.length ? `${((onlineScreens / screens.length) * 100).toFixed(1)}%` : '0%')
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
      if (!screens.length) return showToast('No registered screens to stop', 'info')
      showToast('Shutting down all screens...', 'warning')
      await Promise.all(screens.map((screen) => screensApi.setPower(screen.id, false)))
      showToast('All screens powered off successfully', 'success')
      setScreensCount(screens.length)
    } catch (error) {
      showToast(`Emergency shutdown failed: ${error}`, 'error')
    }
  }

  return (
    <div className="space-y-7 lg:space-y-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><Sparkles /> Control center</Badge>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">A live view of your signage network and scheduled playback.</p>
        </div>
        <Badge variant="outline" className="h-9 gap-2 self-start rounded-lg bg-card/60 px-3 font-mono sm:self-auto"><Clock3 />{time}</Badge>
      </div>

      {loading ? (
        <div aria-busy="true" className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard icon="▣" value={screensCount} label="Active Screens" />
            <StatCard icon="☰" value={playlistsCount} label="Playlists" color="info" />
            <StatCard icon="◔" value={uptime} label="Uptime" color="success" />
          </div>
          <ScheduleTimeline slots={scheduleSlots} />
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-5"><div><CardTitle>Quick Actions</CardTitle><p className="mt-1 text-sm text-muted-foreground">Jump into the most common workflows.</p></div><Sparkles className="size-5 text-primary" /></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button className="group h-14 justify-start px-4" onClick={() => router.push('/screens')}><span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-white transition-colors group-hover:bg-white/20"><Monitor className="size-4" /></span>Add a screen</Button>
            <Button className="group h-14 justify-start px-4" variant="accent" onClick={() => router.push('/content')}><span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-white transition-colors group-hover:bg-white/20"><PlaySquare className="size-4" /></span>Upload content</Button>
            <Button className="group h-14 justify-start px-4" variant="outline" onClick={() => router.push('/playlists')}><span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground/70 transition-colors group-hover:bg-white/20 group-hover:text-white"><Rows3 className="size-4" /></span>Create playlist</Button>
            <Tooltip><TooltipTrigger asChild><Button className="group h-14 justify-start px-4" variant="destructive" onClick={handleEmergencyStop}><span className="flex size-8 items-center justify-center rounded-lg bg-black/10 text-white transition-colors group-hover:bg-black/20"><CircleStop className="size-4" /></span>Emergency stop</Button></TooltipTrigger><TooltipContent>Immediately powers off every registered screen</TooltipContent></Tooltip>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-5"><div><CardTitle>Network Status</CardTitle><p className="mt-1 text-sm text-muted-foreground">Discovery and sync health.</p></div><Network className="size-5 text-chart-2" /></CardHeader>
          <CardContent>
            <Table><TableBody>
              <TableRow><TableCell className="text-muted-foreground">Nearby Wi-Fi Devices</TableCell><TableCell className="text-right font-bold">{peerCount}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Discovery</TableCell><TableCell className="text-right"><Badge className="bg-green-600">Active</Badge></TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Service</TableCell><TableCell className="text-right"><code className="rounded bg-muted px-1 font-mono text-xs">_clarix._tcp.local</code></TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Sync Mode</TableCell><TableCell className="text-right font-medium">mDNS + TCP</TableCell></TableRow>
            </TableBody></Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
