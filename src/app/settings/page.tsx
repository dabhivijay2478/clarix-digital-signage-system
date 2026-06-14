'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsRow, SettingsSection } from '@/components/SettingsSection'
import { showToast } from '@/components/Toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Settings</h1><p className="page-subtitle">Configure SignalOS preferences</p></div>

      <SettingsSection title="Device Operation Mode" description="Configure whether this machine runs as a central Controller or a Screen Player.">
        <Card className="flex flex-col items-start justify-between gap-4 border-dashed bg-muted/20 p-4 md:flex-row md:items-center">
          <div><h3 className="text-sm font-semibold">Digital Signage Screen Player</h3><p className="mt-1 text-xs text-muted-foreground">Switch this window to full-screen signage playback mode.</p></div>
          <Button onClick={() => router.push('/player')}>Launch Screen Player</Button>
        </Card>
      </SettingsSection>

      <SettingsSection title="Brand Customization" description="Customize the name, icon, and tab favicon of this management system.">
        <div className="space-y-6">
          <div className="space-y-2"><Label htmlFor="app-name">Custom App Name</Label><Input id="app-name" className="max-w-md" value={customAppName} onChange={(event) => setCustomAppName(event.target.value)} /></div>
          <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
            {(['icon', 'favicon'] as const).map((type) => {
              const image = type === 'icon' ? customAppIcon : customFavicon
              return <div key={type} className="space-y-2"><Label htmlFor={`${type}-upload`}>{type === 'icon' ? 'App Icon' : 'Favicon'}</Label><div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-700 p-3"><Avatar className="size-12 rounded-lg">{image && <AvatarImage src={image} alt="" />}<AvatarFallback className="rounded-lg">{type === 'icon' ? 'S' : 'F'}</AvatarFallback></Avatar><Input id={`${type}-upload`} type="file" accept="image/*" onChange={(event) => handleImageUpload(event, type)} /></div></div>
            })}
          </div>
          <div className="flex gap-3"><Button onClick={handleSaveBranding}>Save Branding Preferences</Button><Button variant="outline" onClick={handleResetBranding}>Reset to Default</Button></div>
        </div>
      </SettingsSection>

      <SettingsSection title="General">
        <SettingsRow label="Auto-start on boot" description="Launch SignalOS automatically when the system starts"><Switch checked={autoStart} onCheckedChange={setAutoStart} /></SettingsRow>
        <SettingsRow label="Notifications" description="Show desktop notifications for schedule changes and alerts"><Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} /></SettingsRow>
        <SettingsRow label="Collapse Sidebar" description="Minimize the navigation sidebar to icons only"><Switch checked={sidebar.isCollapsed} onCheckedChange={sidebar.setCollapsed} /></SettingsRow>
      </SettingsSection>

      <SettingsSection title="Network & Discovery">
        <SettingsRow label="LAN Discovery" description="Enable mDNS service discovery for peer screens"><Switch checked={discoveryEnabled} onCheckedChange={setDiscoveryEnabled} /></SettingsRow>
        <SettingsRow label="Service Type" monoValue="_signalos._tcp.local." />
        <SettingsRow label="Controller Port" monoValue={port} />
      </SettingsSection>
      <SettingsSection title="About"><SettingsRow label="Version" monoValue={APP_VERSION} /></SettingsSection>
    </div>
  )
}
