'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  Megaphone,
  MonitorPlay,
  Network,
  Radio,
  Router,
  Server,
  Settings2,
  ShieldCheck,
  Database,
  Folder,
  HardDrive,
  RefreshCw,
  Loader2,
  Wifi,
} from 'lucide-react'
import { showToast } from '@/components/Toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { APP_VERSION } from '@/lib/constants'
import { appConfigApi, contentLibraryApi, localNetworkApi, networkApi, screensApi } from '@/lib/tauri'
import type { ConnectionDiagnostic, ContentStorageInfo, DeviceIdentity, MarqueeSettings, PairingRequest, PeerScreen, Screen } from '@/lib/types'
import { useBrandingStore } from '@/store/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

const OFFLINE_NETWORK_CHECKLIST = [
  {
    id: 'router-reset',
    title: 'Router reset and setup',
    detail: 'Use any standard router. For TP-Link Archer C20 / AC750, run Quick Setup and create the site Wi-Fi name.',
  },
  {
    id: 'isolation-off',
    title: 'AP or client isolation disabled',
    detail: 'Turn off AP Isolation, Client Isolation, Wireless Isolation, and guest-network isolation so devices can talk locally.',
  },
  {
    id: 'dhcp-on',
    title: 'DHCP enabled',
    detail: 'Keep the router DHCP server enabled so the controller and displays receive LAN IP addresses automatically.',
  },
  {
    id: 'same-subnet',
    title: 'Same-subnet IP verified',
    detail: 'Controller and player IPs should usually share the first three numbers, for example 192.168.0.x.',
  },
  {
    id: 'device-test',
    title: 'Device-to-device test passed',
    detail: 'From a player or display browser, test the controller health URL before pairing or launching signage.',
  },
  {
    id: 'firewall-7420',
    title: 'Firewall allows TCP 7420',
    detail: 'Allow inbound TCP port 7420 on the controller computer for Private/local networks.',
  },
  {
    id: 'controller-url',
    title: 'Controller URL opens',
    detail: 'Open the player URL from a device on the same router and confirm the Clarix player loads.',
  },
  {
    id: 'static-ip',
    title: 'Static IP or DHCP reservation set',
    detail: 'Reserve the controller IP in the router so display URLs do not break after reboot.',
  },
  {
    id: 'samsung-qb55c',
    title: 'Samsung QB55C URL Launcher configured',
    detail: 'Set Custom Home / URL Launcher to the controller player URL and confirm the display stays on the same LAN.',
  },
] as const

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
  const [offlineChecklist, setOfflineChecklist] = useState<Record<string, boolean>>({})
  const [activePairing, setActivePairing] = useState<PairingRequest | null>(null)
  const [pairingSelections, setPairingSelections] = useState<Record<string, string>>({})
  const [discoveredControllers, setDiscoveredControllers] = useState<PeerScreen[]>([])
  const [marquee, setMarquee] = useState<MarqueeSettings | null>(null)
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
      setControllerUrl(nextIdentity.controller_url ?? '')
      setDiscoveredControllers(peers.filter((peer) => peer.is_controller))
      if (nextIdentity.role === 'Controller') {
        setPairingRequests(await networkApi.getPairingRequests())
      }
      setMarquee(await appConfigApi.getMarquee())
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
  const activePort = networkDiagnostics?.service_port ?? identity?.service_port ?? port
  const detectedControllerIp = identity?.role === 'Controller' ? networkDiagnostics?.local_ip : null
  const playerUrl = `http://${detectedControllerIp ?? '<controller-ip>'}:${activePort}/player`
  const healthUrl = `http://${detectedControllerIp ?? '<controller-ip>'}:${activePort}/v1/health`
  const completedChecklistItems = OFFLINE_NETWORK_CHECKLIST.filter((item) => offlineChecklist[item.id]).length
  const checklistComplete = completedChecklistItems === OFFLINE_NETWORK_CHECKLIST.length

  const toggleChecklistItem = (id: string, checked: boolean) => {
    setOfflineChecklist((current) => ({ ...current, [id]: checked }))
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

      {/* ── Offline Network Checklist ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Offline Network Checklist</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manual router and display checks for same-LAN Clarix playback.
            </p>
          </div>
          <Badge variant={checklistComplete ? 'default' : 'secondary'} className="w-fit">
            {completedChecklistItems}/{OFFLINE_NETWORK_CHECKLIST.length} complete
          </Badge>
        </div>

        <Card className="border-border/60 overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="divide-y divide-border/50">
              {OFFLINE_NETWORK_CHECKLIST.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20"
                >
                  <Checkbox
                    checked={offlineChecklist[item.id] ?? false}
                    onCheckedChange={(checked) => toggleChecklistItem(item.id, checked === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="border-t border-border/60 bg-muted/10 p-4 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Router className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Router requirements</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Use a normal router LAN, not guest Wi-Fi. TP-Link Archer C20 / AC750 labels may say AP Isolation,
                      Wireless Isolation, DHCP, and Address Reservation.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Network className="size-3.5" /> Controller IP
                    </span>
                    <span className="max-w-[150px] truncate font-mono text-foreground">
                      {detectedControllerIp ?? 'Check diagnostics'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Wifi className="size-3.5" /> TCP port
                    </span>
                    <span className="font-mono text-foreground">{activePort}</span>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                    <p className="mb-1 text-muted-foreground">Player URL</p>
                    <p className="break-all font-mono text-foreground">{playerUrl}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                    <p className="mb-1 text-muted-foreground">Health test</p>
                    <p className="break-all font-mono text-foreground">{healthUrl}</p>
                  </div>
                </div>

                <Alert className="border-primary/20 bg-primary/5">
                  {checklistComplete ? (
                    <CheckCircle2 className="text-primary" />
                  ) : (
                    <AlertCircle className="text-primary" />
                  )}
                  <AlertTitle className="text-sm">
                    {checklistComplete ? 'Ready for display validation' : 'Samsung QB55C setup'}
                  </AlertTitle>
                  <AlertDescription className="text-xs leading-5">
                    Set Custom Home or URL Launcher to <span className="font-mono text-foreground">{playerUrl}</span>,
                    then confirm the display stays connected to the same router.
                  </AlertDescription>
                </Alert>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={() => setOfflineChecklist({})}
                >
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Reset Checklist
                </Button>
              </div>
            </div>
          </div>
        </Card>
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

    </div>
  )
}
