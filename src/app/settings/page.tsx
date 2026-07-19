'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Megaphone,
  MonitorPlay,
  Network,
  Radio,
  Server,
  Settings2,
  ShieldCheck,
  Database,
  Folder,
  HardDrive,
  RefreshCw,
  Loader2,
  Wifi,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  Activity,
  Terminal,
  ArrowRight,
} from 'lucide-react'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { APP_VERSION } from '@/lib/constants'
import { appConfigApi, contentLibraryApi, localNetworkApi, networkApi, screensApi } from '@/lib/tauri'
import type { ConnectionDiagnostic, ContentStorageInfo, DeviceIdentity, MarqueeSettings, PairingRequest, PeerScreen, Screen } from '@/lib/types'
import { useBrandingStore } from '@/store/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}



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
  const [networkDiagnostics, setNetworkDiagnostics] = useState<ConnectionDiagnostic | null>(null)
  const [activePairing, setActivePairing] = useState<PairingRequest | null>(null)
  const [pairingSelections, setPairingSelections] = useState<Record<string, string>>({})
  const [discoveredControllers, setDiscoveredControllers] = useState<PeerScreen[]>([])
  const [contentStorage, setContentStorage] = useState<ContentStorageInfo | null>(null)
  const [pickingDir, setPickingDir] = useState(false)

  const loadNetworkState = useCallback(async () => {
    try {
      const [nextIdentity, nextScreens, peers, diagnostics, serverPort] = await Promise.all([
        networkApi.getIdentity(),
        screensApi.getAll(),
        localNetworkApi.getPeers(),
        networkApi.getDiagnostics(),
        localNetworkApi.getServerPort(),
      ])
      setIdentity(nextIdentity)
      setScreens(nextScreens)
      setPort(serverPort)
      setNetworkDiagnostics(diagnostics)
      let displayUrl = nextIdentity.controller_url ?? ''
      if (displayUrl) {
        const lower = displayUrl.toLowerCase()
        if (!lower.endsWith('/player') && !lower.endsWith('/player/')) {
          displayUrl = displayUrl.replace(/\/+$/, '') + '/player'
        }
      }
      setControllerUrl(displayUrl)
      setDiscoveredControllers(peers.filter((peer) => peer.is_controller))
      if (nextIdentity.role === 'Controller') {
        setPairingRequests(await networkApi.getPairingRequests())
      }
      setContentStorage(await contentLibraryApi.getStorage())
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
      let cleanUrl = controllerUrl.trim()
      if (role === 'Player') {
        const lower = cleanUrl.toLowerCase()
        if (lower.endsWith('/player')) {
          cleanUrl = cleanUrl.slice(0, -7)
        } else if (lower.endsWith('/player/')) {
          cleanUrl = cleanUrl.slice(0, -8)
        }
        cleanUrl = cleanUrl.replace(/\/+$/, '')
      }
      const next = await networkApi.setMode(role, role === 'Player' ? cleanUrl : undefined)
      setIdentity(next)
      showToast(`Device mode changed to ${role}. Restart ${branding.appName} to apply.`, 'success')
      await loadNetworkState()
    } catch (error) {
      showToast(`Could not change mode: ${error}`, 'error')
    }
  }

  const handlePickDirectory = async () => {
    setPickingDir(true)
    try {
      const result = await contentLibraryApi.pickDirectory()
      setContentStorage(result)
      showToast('Content library directory updated', 'success')
      await loadNetworkState()
    } catch (error) {
      if (error !== 'No folder selected') {
        showToast(`Failed to set directory: ${error}`, 'error')
      }
    } finally {
      setPickingDir(false)
    }
  }

  const handlePairingRequest = async () => {
    try {
      let cleanUrl = controllerUrl.trim()
      const lower = cleanUrl.toLowerCase()
      if (lower.endsWith('/player')) {
        cleanUrl = cleanUrl.slice(0, -7)
      } else if (lower.endsWith('/player/')) {
        cleanUrl = cleanUrl.slice(0, -8)
      }
      cleanUrl = cleanUrl.replace(/\/+$/, '')
      await networkApi.setMode('Player', cleanUrl)
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
  const activePort = networkDiagnostics?.service_port ?? identity?.service_port ?? port
  const detectedControllerIp = identity?.role === 'Controller' ? networkDiagnostics?.local_ip : null
  const playerUrl = `http://${detectedControllerIp ?? '<controller-ip>'}:${activePort}/player`
  const healthUrl = `http://${detectedControllerIp ?? '<controller-ip>'}:${activePort}/v1/health`

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast('Copied to clipboard!', 'success')
  }

  const getControllerIpFromUrl = (url: string) => {
    try {
      const parsed = new URL(url)
      return parsed.hostname
    } catch {
      const match = url.match(/^(?:https?:\/\/)?([^:\/\s]+)/)
      return match ? match[1] : url
    }
  }

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

      <Tabs defaultValue="device" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="device" className="flex items-center gap-2">
            <Settings2 className="size-3.5" />
            <span>Device Settings</span>
          </TabsTrigger>
          <TabsTrigger value="connection" className="flex items-center gap-2">
            <Network className="size-3.5" />
            <span>Controller Connection</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="device" className="space-y-6 lg:space-y-8">
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
                {identity?.role !== 'Controller' && (
                  <Button
                    className="w-full h-8 text-xs"
                    variant="outline"
                    onClick={() => handleModeChange('Controller')}
                  >
                    Use as Controller
                  </Button>
                )}
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
                    placeholder="http://controller-ip:7420/player"
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

            {/* Content Library */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Content Library</h2>
              <Card className="border-border/60 overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Storage Location</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate" title={contentStorage?.path ?? ''}>
                        <Folder className="size-3 inline mr-1 -mt-0.5" />
                        {contentStorage?.path || 'Loading…'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={handlePickDirectory} disabled={pickingDir}>
                      {pickingDir ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Folder className="size-3.5 mr-1.5" />}
                      Browse
                    </Button>
                  </div>

                  {contentStorage && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <HardDrive className="size-3" />
                        <span>Used: {formatBytes(contentStorage.used_bytes)}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <span>Free: {formatBytes(contentStorage.free_bytes)}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <span>Total: {formatBytes(contentStorage.total_bytes)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${contentStorage.total_bytes > 0 ? (contentStorage.used_bytes / contentStorage.total_bytes) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
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
        </TabsContent>

        <TabsContent value="connection" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            
            {/* Connection Information Card */}
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Connection Status</h2>
                <Card className="border-border/60 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
                    <Activity className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Status Overview
                    </span>
                    <Badge className={cn(
                      "ml-auto text-[10px] px-2 py-0.5",
                      identity?.role === 'Controller' 
                        ? "bg-green-500/10 text-green-500 border-green-500/20" 
                        : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                    )}>
                      {identity?.role === 'Controller' ? 'Controller (Host)' : 'Player (Client)'}
                    </Badge>
                  </div>

                  <div className="divide-y divide-border/50">
                    {/* Device Role */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium">Device Role</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {identity?.role === 'Controller' 
                            ? 'Hosting screens & media content' 
                            : 'Playing synced content from controller'}
                        </p>
                      </div>
                      <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md text-foreground border border-border/40">
                        {identity?.role ?? 'Unknown'}
                      </span>
                    </div>

                    {/* Local IP Address */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium">Local IP Address</p>
                        <p className="text-xs text-muted-foreground mt-0.5">This device&apos;s IP on the local network</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md text-foreground border border-border/40">
                          {networkDiagnostics?.local_ip ?? 'Unknown'}
                        </span>
                        {networkDiagnostics?.local_ip && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => copyToClipboard(networkDiagnostics?.local_ip ?? '')}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Controller URL/IP (For Player) or LAN IP (For Controller) */}
                    {identity?.role === 'Player' ? (
                      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                        <div>
                          <p className="text-sm font-medium">Controller IP Address</p>
                          <p className="text-xs text-muted-foreground mt-0.5">IP/Host of the assigned controller</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md text-foreground border border-border/40">
                            {identity?.controller_url ? getControllerIpFromUrl(identity.controller_url) : 'Not Configured'}
                          </span>
                          {identity?.controller_url && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="size-7 text-muted-foreground hover:text-foreground"
                              onClick={() => copyToClipboard(getControllerIpFromUrl(identity.controller_url ?? ''))}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                        <div>
                          <p className="text-sm font-medium">Controller IP Address</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Other players connect to this IP</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md text-foreground border border-border/40">
                            {networkDiagnostics?.local_ip ?? 'Unknown'}
                          </span>
                          {networkDiagnostics?.local_ip && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="size-7 text-muted-foreground hover:text-foreground"
                              onClick={() => copyToClipboard(networkDiagnostics?.local_ip ?? '')}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Server Port */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium">Service Port</p>
                        <p className="text-xs text-muted-foreground mt-0.5">LAN communication port</p>
                      </div>
                      <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md text-foreground border border-border/40">
                        {activePort}
                      </span>
                    </div>
                  </div>
                </Card>
              </section>

              {/* Endpoints and URLs */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Service Endpoints</h2>
                <Card className="p-4 border-border/60 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Player Web App URL</label>
                      <Button 
                        variant="link" 
                        className="h-auto p-0 text-xs text-primary font-normal"
                        onClick={() => copyToClipboard(playerUrl)}
                      >
                        Copy URL
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs bg-muted/50 p-2 rounded border border-border/40 select-all overflow-x-auto whitespace-nowrap">
                      <Globe className="size-3.5 text-muted-foreground shrink-0" />
                      <span>{playerUrl}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">API Health Check Endpoint</label>
                      <Button 
                        variant="link" 
                        className="h-auto p-0 text-xs text-primary font-normal"
                        onClick={() => copyToClipboard(healthUrl)}
                      >
                        Copy URL
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs bg-muted/50 p-2 rounded border border-border/40 select-all overflow-x-auto whitespace-nowrap">
                      <Terminal className="size-3.5 text-muted-foreground shrink-0" />
                      <span>{healthUrl}</span>
                    </div>
                  </div>
                </Card>
              </section>
            </div>

            {/* Diagnostics and Checks Card */}
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Network Diagnostic Checks</h2>
                <Card className="border-border/60 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
                    <Wifi className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Diagnostics Checklist
                    </span>
                  </div>

                  <div className="divide-y divide-border/50">
                    {networkDiagnostics?.checks && networkDiagnostics.checks.length > 0 ? (
                      networkDiagnostics.checks.map((check, index) => {
                        let statusIcon = <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        let statusColor = "text-green-500"
                        if (check.status.toLowerCase() === 'warning' || check.status.toLowerCase() === 'warn') {
                          statusIcon = <AlertTriangle className="size-4 text-yellow-500 shrink-0" />
                          statusColor = "text-yellow-500"
                        } else if (check.status.toLowerCase() === 'error' || check.status.toLowerCase() === 'failed') {
                          statusIcon = <XCircle className="size-4 text-red-500 shrink-0" />
                          statusColor = "text-red-500"
                        }

                        return (
                          <div key={index} className="flex items-start gap-3 p-4">
                            {statusIcon}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium leading-none">{check.name}</p>
                                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", statusColor)}>
                                  {check.status}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                {check.detail}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="p-8 text-center text-muted-foreground text-xs">
                        No network diagnostics data available.
                      </div>
                    )}
                  </div>

                  {networkDiagnostics && (
                    <div className="bg-muted/10 p-4 border-t border-border/50 text-[11px] text-muted-foreground space-y-1">
                      <p><strong>Discovery Status:</strong> {networkDiagnostics.discovery_status}</p>
                      <p><strong>Pairing Status:</strong> {networkDiagnostics.pairing_status}</p>
                      {networkDiagnostics.last_successful_sync && (
                        <p><strong>Last Sync:</strong> {new Date(networkDiagnostics.last_successful_sync).toLocaleString()}</p>
                      )}
                    </div>
                  )}
                </Card>
              </section>

              {/* Discovery / Quick Connection Card */}
              {identity?.role === 'Player' && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold">Auto-Discovered Controllers</h2>
                  <Card className="p-4 border-border/60 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Below are other active MG Enterprise controllers discovered on your local network. 
                      Click one to quickly configure it as your target controller URL.
                    </p>
                    {discoveredControllers.length > 0 ? (
                      <div className="grid gap-2">
                        {discoveredControllers.map((c) => {
                          const targetUrl = `http://${c.ip}:${c.port}`
                          return (
                            <div 
                              key={c.id} 
                              className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/30 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{c.name}</p>
                                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{c.ip}:{c.port}</p>
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-7 text-[11px]"
                                onClick={() => {
                                  setControllerUrl(targetUrl)
                                  showToast(`Selected controller ${c.name}. Remember to click "Use as Player" to save.`, 'info')
                                }}
                              >
                                Select <ArrowRight className="size-3 ml-1" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-500/10 bg-yellow-500/5 text-yellow-600 dark:text-yellow-500 text-xs">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>No controllers auto-discovered on the local subnet via mDNS yet.</span>
                      </div>
                    )}
                  </Card>
                </section>
              )}
            </div>

          </div>
        </TabsContent>
      </Tabs>

    </div>
  )
}
