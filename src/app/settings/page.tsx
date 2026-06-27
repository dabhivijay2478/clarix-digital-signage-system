'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Megaphone,
  MonitorPlay,
  Radio,
  Server,
  Settings2,
  ShieldCheck,
  LayoutGrid,
  Bell,
  PanelLeftClose,
  Database,
  Info,
  Cpu,
} from 'lucide-react'
import { SettingsRow, SettingsSection } from '@/components/SettingsSection'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { APP_VERSION } from '@/lib/constants'
import { appConfigApi, localNetworkApi, networkApi, screensApi } from '@/lib/tauri'
import type { DeviceIdentity, MarqueeSettings, PairingRequest, PeerScreen, Screen } from '@/lib/types'
import { useBrandingStore } from '@/store/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const router = useRouter()
  const [port, setPort] = useState(7420)
  const [autoStart, setAutoStart] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const branding = useBrandingStore()
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null)
  const [pairingRequests, setPairingRequests] = useState<PairingRequest[]>([])
  const [screens, setScreens] = useState<Screen[]>([])
  const [controllerUrl, setControllerUrl] = useState('')
  const [activePairing, setActivePairing] = useState<PairingRequest | null>(null)
  const [pairingSelections, setPairingSelections] = useState<Record<string, string>>({})
  const [discoveredControllers, setDiscoveredControllers] = useState<PeerScreen[]>([])
  const [marquee, setMarquee] = useState<MarqueeSettings | null>(null)

  const loadNetworkState = useCallback(async () => {
    try {
      const [nextIdentity, nextScreens, peers] = await Promise.all([
        networkApi.getIdentity(),
        screensApi.getAll(),
        localNetworkApi.getPeers(),
      ])
      setIdentity(nextIdentity)
      setScreens(nextScreens)
      setControllerUrl(nextIdentity.controller_url ?? '')
      setDiscoveredControllers(peers.filter((peer) => peer.is_controller))
      if (nextIdentity.role === 'Controller') {
        setPairingRequests(await networkApi.getPairingRequests())
      }
      setMarquee(await appConfigApi.getMarquee())
    } catch (error) {
      console.error('Failed to load network state:', error)
    }
  }, [])

  useEffect(() => {
    loadNetworkState()
    const interval = window.setInterval(loadNetworkState, 5000)
    return () => window.clearInterval(interval)
  }, [loadNetworkState])

  const handleModeChange = async (role: 'Controller' | 'Player') => {
    try {
      const next = await networkApi.setMode(role, role === 'Player' ? controllerUrl : undefined)
      setIdentity(next)
      showToast(`Device mode changed to ${role}. Restart ${branding.appName} to apply.`, 'success')
      await loadNetworkState()
    } catch (error) {
      showToast(`Could not change mode: ${error}`, 'error')
    }
  }

  const handleSaveMarquee = async () => {
    if (!marquee) return
    try {
      const updated = await appConfigApi.updateMarquee(marquee.enabled, marquee.text, marquee.speed)
      setMarquee(updated)
      showToast('Marquee updated and synced to players', 'success')
    } catch (error) {
      showToast(`Failed to save marquee: ${error}`, 'error')
    }
  }

  const handlePairingRequest = async () => {
    try {
      await networkApi.setMode('Player', controllerUrl)
      const request = await networkApi.requestPairing()
      setActivePairing(request)
      showToast(`Pairing request ${request.code} sent to the controller.`, 'success')
      await loadNetworkState()
    } catch (error) {
      showToast(`Pairing failed: ${error}`, 'error')
    }
  }

  const handleApprovePairing = async (request: PairingRequest) => {
    const screenId = pairingSelections[request.id]
    if (!screenId) {
      showToast('Choose the screen this player should control.', 'error')
      return
    }
    try {
      await networkApi.approvePairing(request.id, screenId)
      showToast(`${request.device_name} is now paired.`, 'success')
      await loadNetworkState()
    } catch (error) {
      showToast(`Approval failed: ${error}`, 'error')
    }
  }

  const pendingPairings = pairingRequests.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6 lg:space-y-8 animate-fadeIn">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Settings2 className="size-4 text-primary" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Settings</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage device mode, display preferences, and app configuration.
        </p>
      </div>

      {/* ── Device Operation Mode ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Device Operation Mode</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose one controller per site. Player devices pull content from the controller.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Controller Card */}
          <Card className={cn(
            'p-4 transition-all duration-200',
            identity?.role === 'Controller'
              ? 'border-primary/40 bg-primary/5'
              : 'border-border/60 hover:border-border'
          )}>
            <div className="flex items-start gap-3 mb-4">
              <span className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                identity?.role === 'Controller' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <Server className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Controller</h3>
                  {identity?.role === 'Controller' && (
                    <Badge className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">Active</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hosts the database, assets, and pairing service for all player devices.
                </p>
              </div>
            </div>
            <Button
              className="w-full h-8 text-xs"
              variant={identity?.role === 'Controller' ? 'default' : 'outline'}
              onClick={() => handleModeChange('Controller')}
            >
              Use as Controller
            </Button>
          </Card>

          {/* Player Card */}
          <Card className={cn(
            'p-4 transition-all duration-200',
            identity?.role === 'Player'
              ? 'border-primary/40 bg-primary/5'
              : 'border-border/60 hover:border-border'
          )}>
            <div className="flex items-start gap-3 mb-4">
              <span className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                identity?.role === 'Player' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <MonitorPlay className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Player</h3>
                  {identity?.role === 'Player' && (
                    <Badge className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">Active</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connects to the controller and plays synced media in offline mode.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                value={controllerUrl}
                onChange={(e) => setControllerUrl(e.target.value)}
                placeholder="http://controller-ip:7420"
                className="h-8 text-xs"
              />
              <Button
                className="w-full h-8 text-xs"
                variant={identity?.role === 'Player' ? 'default' : 'outline'}
                onClick={() => handleModeChange('Player')}
              >
                Use as Player
              </Button>
            </div>
          </Card>
        </div>

        {/* Pairing section (Player only) */}
        {identity?.role === 'Player' && (
          <Card className="p-4 border-primary/20 bg-primary/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-sm">Device Pairing</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send a pairing request to the controller, then approve it there to assign this device to a screen.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePairingRequest}>
                  <ShieldCheck className="size-3.5 mr-1.5" /> Request Pairing
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={() => router.push('/player')}>
                  <MonitorPlay className="size-3.5 mr-1.5" /> Launch Player
                </Button>
              </div>
            </div>
            {(activePairing || identity.pending_pairing_id) && (
              <div className="mt-3 rounded-lg border border-primary/20 bg-background/60 px-3 py-2 font-mono text-xs">
                Pairing code:{' '}
                <strong className="text-primary">
                  {activePairing?.code ?? 'Waiting for controller approval'}
                </strong>
              </div>
            )}
            {discoveredControllers.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {discoveredControllers.map((c) => (
                  <Button
                    key={c.id}
                    variant="secondary"
                    size="sm"
                    className="h-8 justify-start text-xs"
                    onClick={() => setControllerUrl(`http://${c.ip}:${c.port}`)}
                  >
                    <Radio className="size-3.5 mr-1.5" />
                    {c.name} · {c.ip}:{c.port}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        )}
      </section>

      {/* ── Pending Pairings (Controller only) ──────────────────────────────── */}
      {identity?.role === 'Controller' && pendingPairings.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Pending Player Pairings</h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{pendingPairings.length}</Badge>
          </div>
          <div className="space-y-2">
            {pendingPairings.map((request) => (
              <Card key={request.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center border-border/60">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{request.device_name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                    {request.code} · {request.player_kind} · {request.device_id}
                  </p>
                </div>
                <Select
                  value={pairingSelections[request.id]}
                  onValueChange={(value) => setPairingSelections((curr) => ({ ...curr, [request.id]: value }))}
                >
                  <SelectTrigger className="w-full h-8 text-xs lg:w-52">
                    <SelectValue placeholder="Assign to screen" />
                  </SelectTrigger>
                  <SelectContent>
                    {screens.map((screen) => (
                      <SelectItem key={screen.id} value={screen.id}>{screen.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" onClick={() => handleApprovePairing(request)}>
                  <ShieldCheck className="size-3.5 mr-1.5" /> Approve
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Player Bottom Marquee ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Player Bottom Marquee</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Show a custom ticker message at the bottom of all player screens.
          </p>
        </div>
        <Card className="border-border/60 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
            <Megaphone className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marquee Ticker</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Enabled</span>
              <Switch
                checked={marquee?.enabled ?? false}
                onCheckedChange={(enabled) => setMarquee((curr) => curr ? { ...curr, enabled } : curr)}
              />
            </div>
          </div>
          {/* Fields */}
          <div className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Message Text</label>
                <Input
                  value={marquee?.text ?? ''}
                  onChange={(e) => setMarquee((curr) => curr ? { ...curr, text: e.target.value } : curr)}
                  placeholder="Enter bottom ticker message..."
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Speed (px/s)</label>
                <Input
                  type="number"
                  min={15}
                  max={120}
                  value={marquee?.speed ?? 45}
                  onChange={(e) => setMarquee((curr) => curr ? { ...curr, speed: Number(e.target.value) || 45 } : curr)}
                  className="h-9"
                />
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveMarquee}>
              Save Marquee
            </Button>
          </div>
        </Card>
      </section>

      {/* ── General & About ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* General */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">General</h2>
          <Card className="border-border/60 overflow-hidden">
            {[
              {
                label: 'Auto-start on boot',
                desc: `Launch ${branding.appName} automatically when the system starts`,
                control: <Switch checked={autoStart} onCheckedChange={setAutoStart} />,
              },
              {
                label: 'Notifications',
                desc: 'Desktop notifications for schedule changes and alerts',
                control: <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />,
              },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                className={cn(
                  'flex items-center justify-between gap-6 px-4 py-3.5',
                  i < arr.length - 1 && 'border-b border-border/50'
                )}
              >
                <div>
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.desc}</p>
                </div>
                {row.control}
              </div>
            ))}
            <div className="flex items-center justify-between gap-6 px-4 py-3.5 border-t border-border/50">
              <div>
                <p className="text-sm font-medium">Database Console</p>
                <p className="text-xs text-muted-foreground mt-0.5">View system tables, export CSV, and download backups</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => router.push('/database')}>
                <Database className="size-3.5 mr-1.5" /> Open
              </Button>
            </div>
          </Card>
        </section>

        {/* About */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">About</h2>
          <Card className="border-border/60 overflow-hidden">
            {[
              { label: 'Application', value: branding.appName },
              { label: 'Version', value: APP_VERSION },
              { label: 'Device ID', value: identity?.device_id ?? 'Loading…' },
              { label: 'Device Role', value: identity?.role ?? 'Unknown' },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                className={cn(
                  'flex items-center justify-between gap-4 px-4 py-3.5',
                  i < arr.length - 1 && 'border-b border-border/50'
                )}
              >
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md text-foreground max-w-[220px] truncate border border-border/40">
                  {row.value}
                </span>
              </div>
            ))}
          </Card>
        </section>
      </div>

    </div>
  )
}
