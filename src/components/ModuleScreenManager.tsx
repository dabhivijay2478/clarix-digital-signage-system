'use client'

import { useMemo, useState } from 'react'
import { Edit2, Monitor, Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/Modal'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScreens } from '@/hooks/useScreens'
import { customConfirm } from '@/lib/tauri'
import type { Screen, ScreenPurpose } from '@/lib/types'

interface ModuleScreenManagerProps {
  title: string
  description: string
  purpose: ScreenPurpose
  emptyLabel: string
  productionDashboardId?: string | null
  productionDashboardName?: string
  fixedGate?: string | null
  allowGateSelection?: boolean
}

type ScreenForm = {
  name: string
  location: string
  width: string
  height: string
  orientation: string
  gate: string
}

const initialForm = (gate: string = ''): ScreenForm => ({
  name: '',
  location: '',
  width: '1920',
  height: '1080',
  orientation: 'Landscape',
  gate,
})

function describePurpose(screen: Screen, dashboardName?: string) {
  if (screen.purpose === 'truck_gate') return `Gate ${(screen.gate ?? 'd4').toUpperCase()} display`
  if (screen.purpose === 'production_dashboard') return dashboardName ? `${dashboardName} dashboard` : 'Production dashboard'
  return 'Playlist screen'
}

export default function ModuleScreenManager({
  title,
  description,
  purpose,
  emptyLabel,
  productionDashboardId,
  productionDashboardName,
  fixedGate,
  allowGateSelection = false,
}: ModuleScreenManagerProps) {
  const { screens, loading, addScreen, editScreen, deleteScreen, refresh } = useScreens()
  const [showForm, setShowForm] = useState(false)
  const [editingScreen, setEditingScreen] = useState<Screen | null>(null)
  const [form, setForm] = useState<ScreenForm>(() => initialForm(fixedGate ?? ''))

  const moduleScreens = useMemo(() => {
    return screens.filter((screen) => {
      if (screen.purpose !== purpose) return false
      if (fixedGate && screen.gate !== fixedGate) return false
      if (purpose === 'production_dashboard' && productionDashboardId) {
        return screen.production_dashboard_id === productionDashboardId
      }
      return true
    })
  }, [fixedGate, productionDashboardId, purpose, screens])

  const openAdd = () => {
    setEditingScreen(null)
    setForm(initialForm(fixedGate ?? ''))
    setShowForm(true)
  }

  const openEdit = (screen: Screen) => {
    setEditingScreen(screen)
    setForm({
      name: screen.name,
      location: screen.location ?? '',
      width: String(screen.resolution?.width ?? 1920),
      height: String(screen.resolution?.height ?? 1080),
      orientation: screen.orientation ?? 'Landscape',
      gate: screen.gate ?? fixedGate ?? '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingScreen(null)
  }

  const saveScreen = async () => {
    if (!form.name.trim()) {
      showToast('Enter a screen name first', 'warning')
      return
    }
    if (purpose === 'truck_gate' && !fixedGate && !form.gate) {
      showToast('Select D4 or D5 gate for this display', 'warning')
      return
    }
    if (purpose === 'production_dashboard' && !productionDashboardId) {
      showToast('Open or create a production dashboard before adding a screen', 'warning')
      return
    }

    const width = Number.parseInt(form.width, 10) || 1920
    const height = Number.parseInt(form.height, 10) || 1080
    const gate = purpose === 'truck_gate' ? (fixedGate ?? (form.gate || null)) : null

    try {
      if (editingScreen) {
        await editScreen(
          editingScreen.id,
          form.name.trim(),
          form.location.trim(),
          editingScreen.ip_address ?? undefined,
          form.orientation,
          width,
          height,
          editingScreen.playlist_id ?? undefined,
          purpose,
          gate,
          purpose === 'production_dashboard' ? productionDashboardId ?? null : editingScreen.production_dashboard_id,
          editingScreen.default_content_id
        )
        showToast(`Screen "${form.name}" updated`, 'success')
      } else {
        await addScreen(
          form.name.trim(),
          form.location.trim(),
          undefined,
          form.orientation,
          width,
          height,
          undefined,
          purpose,
          gate,
          purpose === 'production_dashboard' ? productionDashboardId ?? null : null,
          null
        )
        showToast(`Screen "${form.name}" added`, 'success')
      }
      closeForm()
      await refresh()
    } catch (error) {
      showToast(`Failed to save screen: ${error}`, 'error')
    }
  }

  const removeScreen = async (screen: Screen) => {
    const confirmed = await customConfirm(`Delete screen "${screen.name}"?`)
    if (!confirmed) return
    await deleteScreen(screen.id)
    showToast('Screen deleted', 'info')
    await refresh()
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-xl shadow-black/10">
      <CardHeader className="gap-4 border-b border-border/60 bg-muted/20 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
            <Monitor className="size-3" /> Screen setup
          </Badge>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">{description}</CardDescription>
        </div>
        <Button onClick={openAdd}>
          <Plus /> Add Screen
        </Button>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Loading screens...</div>
        ) : moduleScreens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 p-10 text-center">
            <Monitor className="mx-auto mb-3 size-10 text-muted-foreground/40" />
            <p className="font-semibold">{emptyLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a screen here and it will be configured for this module automatically.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {moduleScreens.map((screen) => (
              <div key={screen.id} className="rounded-2xl border border-border/70 bg-background/55 p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{screen.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{screen.location || 'No location set'}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{describePurpose(screen, productionDashboardName)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/25 p-3 text-xs">
                  <span className="text-muted-foreground">Resolution</span>
                  <span className="text-right font-mono">{screen.resolution.width} x {screen.resolution.height}</span>
                  <span className="text-muted-foreground">Orientation</span>
                  <span className="text-right">{screen.orientation}</span>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(screen)}><Edit2 className="size-3.5" />Edit</Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeScreen(screen)}><Trash2 className="size-3.5" />Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={showForm}
        onClose={closeForm}
        title={editingScreen ? 'Edit Screen' : 'Add Screen'}
        actions={
          <>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={saveScreen}>{editingScreen ? 'Save Changes' : 'Add Screen'}</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Screen name *</Label>
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g., Gate D4 Display" />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="e.g., Dispatch area" />
          </div>
          {purpose === 'truck_gate' && allowGateSelection && !fixedGate && (
            <div className="space-y-2">
              <Label>Gate</Label>
              <Select value={form.gate || undefined} onValueChange={(gate) => setForm((current) => ({ ...current, gate: gate as 'd4' | 'd5' }))}>
                <SelectTrigger><SelectValue placeholder="Select gate" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="d4">D4</SelectItem>
                  <SelectItem value="d5">D5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label>Orientation</Label>
              <Select value={form.orientation} onValueChange={(orientation) => setForm((current) => ({ ...current, orientation }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Landscape">Landscape</SelectItem>
                  <SelectItem value="Portrait">Portrait</SelectItem>
                  <SelectItem value="LandscapeFlipped">Landscape flipped</SelectItem>
                  <SelectItem value="PortraitFlipped">Portrait flipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Width</Label>
              <Input type="number" value={form.width} onChange={(event) => setForm((current) => ({ ...current, width: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Height</Label>
              <Input type="number" value={form.height} onChange={(event) => setForm((current) => ({ ...current, height: event.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
