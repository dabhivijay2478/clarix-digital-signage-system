'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MonitorPlay, Palette, Radio, RefreshCw, Server, Settings2, ShieldCheck, Upload, Wifi } from 'lucide-react'
import { SettingsRow, SettingsSection } from '@/components/SettingsSection'
import { showToast } from '@/components/Toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { APP_VERSION } from '@/lib/constants'
import { localNetworkApi, networkApi, screensApi } from '@/lib/tauri'
import type { ConnectionDiagnostic, DeviceIdentity, PairingRequest, PeerScreen, Screen } from '@/lib/types'
import { useBrandingStore, useSidebarStore } from '@/store/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function SettingsPage() {
  const router = useRouter()
  const [port, setPort] = useState(7420)
  const [autoStart, setAutoStart] = useState(true)
  const [discoveryEnabled, setDiscoveryEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const branding = useBrandingStore()
  const sidebar = useSidebarStore()
  const [customAppName, setCustomAppName] = useState(branding.appName)
  const [customAppIcon, setCustomAppIcon] = useState<string | null>(branding.appIcon)
  const [customFavicon, setCustomFavicon] = useState<string | null>(branding.customFavicon)
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null)
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostic | null>(null)
  const [pairingRequests, setPairingRequests] = useState<PairingRequest[]>([])
  const [screens, setScreens] = useState<Screen[]>([])
  const [controllerUrl, setControllerUrl] = useState('')
  const [activePairing, setActivePairing] = useState<PairingRequest | null>(null)
  const [pairingSelections, setPairingSelections] = useState<Record<string, string>>({})
  const [discoveredControllers, setDiscoveredControllers] = useState<PeerScreen[]>([])
  const [iconFileName, setIconFileName] = useState('')
  const [faviconFileName, setFaviconFileName] = useState('')

  const loadNetworkState = useCallback(async () => {
    try {
      const [nextIdentity, nextDiagnostics, nextScreens, peers] = await Promise.all([
        networkApi.getIdentity(),
        networkApi.getDiagnostics(),
        screensApi.getAll(),
        localNetworkApi.getPeers(),
      ])
      setIdentity(nextIdentity)
      setDiagnostics(nextDiagnostics)
      setScreens(nextScreens)
      setControllerUrl(nextIdentity.controller_url ?? '')
      setPort(nextDiagnostics.service_port ?? 0)
      setDiscoveredControllers(peers.filter((peer) => peer.is_controller))
      if (nextIdentity.role === 'Controller') {
        setPairingRequests(await networkApi.getPairingRequests())
      }
    } catch (error) {
      console.error('Failed to load network state:', error)
    }
  }, [])

  useEffect(() => {
    loadNetworkState()
    const interval = window.setInterval(loadNetworkState, 5000)
    return () => window.clearInterval(interval)
  }, [loadNetworkState])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'icon' | 'favicon') => {
    const file = event.target.files?.[0]
    if (!file) return
    if (type === 'icon') {
      setIconFileName(file.name)
    } else {
      setFaviconFileName(file.name)
    }
    const reader = new FileReader()
    reader.onloadend = () => type === 'icon' ? setCustomAppIcon(reader.result as string) : setCustomFavicon(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSaveBranding = () => {
    branding.save(customAppName, customAppIcon, customFavicon)
    showToast('Branding preferences saved successfully', 'success')
  }

  const handleResetBranding = () => {
    const defaultName = process.env.NEXT_PUBLIC_APP_NAME || 'Clarix'
    setCustomAppName(defaultName)
    setCustomAppIcon(null)
    setCustomFavicon(null)
    setIconFileName('')
    setFaviconFileName('')
    branding.save(defaultName, null, null)
    showToast('Branding reset to system defaults', 'success')
  }

  const handleModeChange = async (role: 'Controller' | 'Player') => {
    try {
      const next = await networkApi.setMode(role, role === 'Player' ? controllerUrl : undefined)
      setIdentity(next)
      showToast(`Device mode changed to ${role}. Restart ${branding.appName} to apply the networking role.`, 'success')
      await loadNetworkState()
    } catch (error) {
      showToast(`Could not change mode: ${error}`, 'error')
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

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="page-header"><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><Settings2 /> Workspace preferences</Badge><h1 className="page-title">Settings</h1><p className="page-subtitle">Tune the controller, branding, and network behavior.</p></div>

      <SettingsSection className="overflow-hidden" title="Device Operation Mode" description="Choose one controller per site. Player devices connect outward and keep the last valid playlist offline.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className={`p-5 ${identity?.role === 'Controller' ? 'border-primary/40 bg-primary/5' : ''}`}>
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Server /></span><div><h3 className="font-semibold">Controller</h3><p className="mt-1 text-sm text-muted-foreground">Hosts the management database, browser player, assets, and pairing service.</p></div></div>
            <Button className="mt-5 w-full" variant={identity?.role === 'Controller' ? 'default' : 'outline'} onClick={() => handleModeChange('Controller')}>Use as Controller</Button>
          </Card>
          <Card className={`p-5 ${identity?.role === 'Player' ? 'border-primary/40 bg-primary/5' : ''}`}>
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><MonitorPlay /></span><div><h3 className="font-semibold">Packaged Player</h3><p className="mt-1 text-sm text-muted-foreground">Pulls authenticated revisions from the controller and plays cached media offline.</p></div></div>
            <div className="mt-5 space-y-3"><Input value={controllerUrl} onChange={(event) => setControllerUrl(event.target.value)} placeholder="http://controller-ip:7420" /><Button className="w-full" variant={identity?.role === 'Player' ? 'default' : 'outline'} onClick={() => handleModeChange('Player')}>Use as Player</Button></div>
          </Card>
        </div>
        {identity?.role === 'Player' && (
          <Card className="mt-4 border-primary/20 bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-5">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <div><h3 className="font-semibold">One-time Pairing</h3><p className="mt-1 text-sm text-muted-foreground">Send a request, then approve it on the controller and assign this device to a screen.</p></div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button variant="outline" onClick={handlePairingRequest}><ShieldCheck />Request Pairing</Button><Button onClick={() => router.push('/player')}><MonitorPlay />Launch Player</Button></div>
            </div>
            {(activePairing || identity.pending_pairing_id) && <div className="mt-4 rounded-xl border border-primary/20 bg-background/60 p-4 font-mono text-sm">Pairing code: <strong className="text-primary">{activePairing?.code ?? 'Waiting for controller approval'}</strong></div>}
            {discoveredControllers.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{discoveredControllers.map((controller) => <Button key={controller.id} variant="secondary" className="justify-start" onClick={() => setControllerUrl(`http://${controller.ip}:${controller.port}`)}><Radio />Use {controller.name} · {controller.ip}:{controller.port}</Button>)}</div>}
          </Card>
        )}
      </SettingsSection>

      {identity?.role === 'Controller' && pairingRequests.some((request) => request.status === 'pending') && (
        <SettingsSection title="Pending Player Pairings" description="Approve only the display devices you recognize.">
          <div className="space-y-3">
            {pairingRequests.filter((request) => request.status === 'pending').map((request) => (
              <Card key={request.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1"><p className="font-semibold">{request.device_name}</p><p className="font-mono text-xs text-muted-foreground">{request.code} · {request.player_kind} · {request.device_id}</p></div>
                <Select value={pairingSelections[request.id]} onValueChange={(value) => setPairingSelections((current) => ({ ...current, [request.id]: value }))}><SelectTrigger className="w-full lg:w-64"><SelectValue placeholder="Assign to screen" /></SelectTrigger><SelectContent>{screens.map((screen) => <SelectItem key={screen.id} value={screen.id}>{screen.name}</SelectItem>)}</SelectContent></Select>
                <Button onClick={() => handleApprovePairing(request)}><ShieldCheck />Approve</Button>
              </Card>
            ))}
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Network Diagnostics" description="Separate discovery, pairing, connectivity, and sync state.">
        <div className="mb-4 flex justify-end"><Button size="sm" variant="outline" onClick={loadNetworkState}><RefreshCw />Refresh</Button></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="p-4"><Wifi className="mb-3 size-5 text-primary" /><p className="text-xs uppercase tracking-wider text-muted-foreground">Selected interface</p><p className="mt-1 font-mono text-sm">{diagnostics?.selected_interface ?? 'Unavailable'} · {diagnostics?.local_ip ?? 'No local IP'}</p></Card>
          <Card className="p-4"><Radio className="mb-3 size-5 text-primary" /><p className="text-xs uppercase tracking-wider text-muted-foreground">Discovery</p><p className="mt-1 text-sm">{diagnostics?.discovery_status ?? 'Checking'}</p></Card>
          <Card className="p-4"><ShieldCheck className="mb-3 size-5 text-primary" /><p className="text-xs uppercase tracking-wider text-muted-foreground">Pairing</p><p className="mt-1 text-sm">{diagnostics?.pairing_status ?? 'Checking'}</p></Card>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{diagnostics?.checks.map((check) => <Card key={check.name} className="flex items-start gap-3 p-4"><span className={`mt-1 size-2 shrink-0 rounded-full ${check.status === 'pass' ? 'bg-green-500' : check.status === 'fail' ? 'bg-red-500' : 'bg-amber-500'}`} /><div><p className="font-medium">{check.name}</p><p className="mt-1 text-sm text-muted-foreground">{check.detail}</p></div></Card>)}</div>
        <div className="mt-4 space-y-2">{diagnostics?.hints.map((hint) => <div key={hint} className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">{hint}</div>)}</div>
      </SettingsSection>

      <SettingsSection className="overflow-hidden" title="Brand Customization" description="Customize the name, icon, and tab favicon of this management system.">
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><Palette className="size-4 text-primary" />Branding updates appear throughout the desktop controller.</div>
          <div className="space-y-2"><Label htmlFor="app-name">Custom App Name</Label><Input id="app-name" className="max-w-xl" value={customAppName} onChange={(event) => setCustomAppName(event.target.value)} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            {(['icon', 'favicon'] as const).map((type) => {
              const image = type === 'icon' ? customAppIcon : customFavicon
              const fileName = type === 'icon' ? iconFileName : faviconFileName
              return (
                <div key={type} className="space-y-2">
                  <Label htmlFor={`${type}-upload`}>{type === 'icon' ? 'App Icon' : 'Favicon'}</Label>
                  <div className="flex min-w-0 items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-3">
                    <Avatar className="size-12 shrink-0 rounded-xl border border-border bg-card">
                      {image && <AvatarImage src={image} alt="" />}
                      <AvatarFallback className="rounded-xl">{type === 'icon' ? 'S' : 'F'}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <label
                        htmlFor={`${type}-upload`}
                        className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3.5 text-xs font-semibold text-foreground shadow-xs transition-all hover:bg-muted active:scale-98"
                      >
                        <Upload className="size-3.5 text-muted-foreground" />
                        Choose Image
                      </label>
                      <input
                        id={`${type}-upload`}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => handleImageUpload(event, type)}
                      />
                      <span className="truncate text-xs text-muted-foreground">
                        {fileName ? fileName : image ? 'Using custom image' : 'No file selected'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row"><Button onClick={handleSaveBranding}>Save Branding Preferences</Button><Button variant="outline" onClick={handleResetBranding}>Reset to Default</Button></div>
        </div>
      </SettingsSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection title="General">
          <SettingsRow label="Auto-start on boot" description={`Launch ${branding.appName} automatically when the system starts`}><Switch checked={autoStart} onCheckedChange={setAutoStart} /></SettingsRow>
          <SettingsRow label="Notifications" description="Show desktop notifications for schedule changes and alerts"><Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} /></SettingsRow>
          <SettingsRow label="Collapse Sidebar" description="Minimize the navigation sidebar to icons only"><Switch checked={sidebar.isCollapsed} onCheckedChange={sidebar.setCollapsed} /></SettingsRow>
          <SettingsRow label="Database Console" description="View system database tables, export CSV data, and download backups.">
            <Button size="sm" variant="outline" onClick={() => router.push('/database')}>
              <Server className="mr-1.5 size-4" /> Open Database
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Local Network & Discovery" description="Discover the controller and sync players connected to the same Wi-Fi router.">
          <SettingsRow label="Controller Discovery" description={`Automatically find the ${branding.appName} controller on the same local network`}><Switch checked={discoveryEnabled} onCheckedChange={setDiscoveryEnabled} /></SettingsRow>
          <SettingsRow label="Service Type" monoValue="_clarix._tcp.local." />
          <SettingsRow label="Controller Port" monoValue={port || 'Player outbound only'} />
          <SettingsRow label="Device ID" monoValue={identity?.device_id ?? 'Loading'} />
          <SettingsRow label="Protocol" monoValue={identity?.protocol_version ?? '1'} />
        </SettingsSection>
      </div>
      <SettingsSection title="About"><SettingsRow label="Version" monoValue={APP_VERSION} /></SettingsSection>
    </div>
  )
}
