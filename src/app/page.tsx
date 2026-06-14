'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { CircleStop, MonitorPlus, PlaySquare, Rows3 } from 'lucide-react'
import StatCard from '@/components/StatCard'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePeers } from '@/hooks/usePeers'
import { analyticsApi, playlistsApi, scheduleApi, screensApi } from '@/lib/tauri'
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
  const [impressions, setImpressions] = useState('0')
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
        const [screens, playlists, schedules, summary] = await Promise.all([screensApi.getAll(), playlistsApi.getAll(), scheduleApi.getAll(), analyticsApi.getSummary()])
        setScreensCount(screens.length)
        setPlaylistsCount(playlists.length)
        setUptime(`${summary.uptime_pct.toFixed(1)}%`)
        setImpressions(summary.impressions >= 1000 ? `${(summary.impressions / 1000).toFixed(1)}K` : String(summary.impressions))
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Dashboard</h1><p className="page-subtitle">System overview</p></div>
        <Badge variant="outline" className="font-mono">{time}</Badge>
      </div>

      {loading ? (
        <div aria-busy="true" className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon="▣" value={screensCount} label="Active Screens" />
            <StatCard icon="☰" value={playlistsCount} label="Playlists" color="info" />
            <StatCard icon="◔" value={uptime} label="Uptime" color="success" />
            <StatCard icon="◉" value={impressions} label="Impressions" color="warning" />
          </div>
          <ScheduleTimeline slots={scheduleSlots} />
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => router.push('/screens')}><MonitorPlus />Add Screen</Button>
            <Button variant="outline" onClick={() => router.push('/content')}><PlaySquare />Upload Content</Button>
            <Button variant="outline" onClick={() => router.push('/playlists')}><Rows3 />New Playlist</Button>
            <Tooltip><TooltipTrigger asChild><Button variant="destructive" onClick={handleEmergencyStop}><CircleStop />Emergency Stop</Button></TooltipTrigger><TooltipContent>Immediately powers off every registered screen</TooltipContent></Tooltip>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Network Status</CardTitle></CardHeader>
          <CardContent>
            <Table><TableBody>
              <TableRow><TableCell className="text-muted-foreground">LAN Peers</TableCell><TableCell className="text-right font-bold">{peerCount}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Discovery</TableCell><TableCell className="text-right"><Badge className="bg-green-600">Active</Badge></TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Service</TableCell><TableCell className="text-right"><code className="rounded bg-muted px-1 font-mono text-xs">_signalos._tcp.local</code></TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Sync Mode</TableCell><TableCell className="text-right font-medium">mDNS + TCP</TableCell></TableRow>
            </TableBody></Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
