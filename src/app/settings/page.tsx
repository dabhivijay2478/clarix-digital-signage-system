'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MonitorPlay, Palette, Settings2 } from 'lucide-react'
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
import { useBrandingStore, useSidebarStore } from '@/store/ui'

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

  useEffect(() => {
    import('@/lib/tauri').then(({ lanApi }) => lanApi.getServerPort().then(setPort).catch(console.error))
  }, [])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'icon' | 'favicon') => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => type === 'icon' ? setCustomAppIcon(reader.result as string) : setCustomFavicon(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSaveBranding = () => {
    branding.save(customAppName, customAppIcon, customFavicon)
    showToast('Branding preferences saved successfully', 'success')
  }

  const handleResetBranding = () => {
    setCustomAppName('SignalOS')
    setCustomAppIcon(null)
    setCustomFavicon(null)
    branding.save('SignalOS', null, null)
    showToast('Branding reset to system defaults', 'success')
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="page-header"><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><Settings2 /> Workspace preferences</Badge><h1 className="page-title">Settings</h1><p className="page-subtitle">Tune the controller, branding, and network behavior.</p></div>

      <SettingsSection className="overflow-hidden" title="Device Operation Mode" description="Configure whether this machine runs as a central Controller or a Screen Player.">
        <Card className="flex flex-col items-start justify-between gap-4 border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 md:flex-row md:items-center">
          <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><MonitorPlay /></span><div><h3 className="font-semibold">Digital Signage Screen Player</h3><p className="mt-1 text-sm text-muted-foreground">Switch this window to full-screen signage playback mode.</p></div></div>
          <Button className="w-full md:w-auto" onClick={() => router.push('/player')}>Launch Screen Player</Button>
        </Card>
      </SettingsSection>

      <SettingsSection className="overflow-hidden" title="Brand Customization" description="Customize the name, icon, and tab favicon of this management system.">
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><Palette className="size-4 text-primary" />Branding updates appear throughout the desktop controller.</div>
          <div className="space-y-2"><Label htmlFor="app-name">Custom App Name</Label><Input id="app-name" className="max-w-xl" value={customAppName} onChange={(event) => setCustomAppName(event.target.value)} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            {(['icon', 'favicon'] as const).map((type) => {
              const image = type === 'icon' ? customAppIcon : customFavicon
              return <div key={type} className="space-y-2"><Label htmlFor={`${type}-upload`}>{type === 'icon' ? 'App Icon' : 'Favicon'}</Label><div className="flex min-w-0 items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-3"><Avatar className="size-12 shrink-0 rounded-xl">{image && <AvatarImage src={image} alt="" />}<AvatarFallback className="rounded-xl">{type === 'icon' ? 'S' : 'F'}</AvatarFallback></Avatar><Input className="min-w-0 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs" id={`${type}-upload`} type="file" accept="image/*" onChange={(event) => handleImageUpload(event, type)} /></div></div>
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row"><Button onClick={handleSaveBranding}>Save Branding Preferences</Button><Button variant="outline" onClick={handleResetBranding}>Reset to Default</Button></div>
        </div>
      </SettingsSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection title="General">
          <SettingsRow label="Auto-start on boot" description="Launch SignalOS automatically when the system starts"><Switch checked={autoStart} onCheckedChange={setAutoStart} /></SettingsRow>
          <SettingsRow label="Notifications" description="Show desktop notifications for schedule changes and alerts"><Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} /></SettingsRow>
          <SettingsRow label="Collapse Sidebar" description="Minimize the navigation sidebar to icons only"><Switch checked={sidebar.isCollapsed} onCheckedChange={sidebar.setCollapsed} /></SettingsRow>
        </SettingsSection>

        <SettingsSection title="Wi-Fi & Discovery" description="Discover and sync screens connected to the same Wi-Fi router.">
          <SettingsRow label="Wi-Fi Discovery" description="Automatically find nearby SignalOS screens on the same Wi-Fi router"><Switch checked={discoveryEnabled} onCheckedChange={setDiscoveryEnabled} /></SettingsRow>
          <SettingsRow label="Service Type" monoValue="_signalos._tcp.local." />
          <SettingsRow label="Controller Port" monoValue={port} />
        </SettingsSection>
      </div>
      <SettingsSection title="About"><SettingsRow label="Version" monoValue={APP_VERSION} /></SettingsSection>
    </div>
  )
}
