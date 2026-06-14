'use client'

import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import ScheduleTimeline from '@/components/ScheduleTimeline'
import Modal from '@/components/Modal'
import { showToast } from '@/components/Toast'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { usePlaylists } from '@/hooks/usePlaylists'
import { useSchedule } from '@/hooks/useSchedule'
import { useScreens } from '@/hooks/useScreens'
import type { AppWeekday } from '@/lib/types'

const ALL_DAYS: AppWeekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
  const { slots, loading, addSlot, deleteSlot } = useSchedule()
  const { screens } = useScreens()
  const { playlists } = usePlaylists()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formStart, setFormStart] = useState('09:00')
  const [formDuration, setFormDuration] = useState('60')
  const [formPriority, setFormPriority] = useState('1')
  const [formDays, setFormDays] = useState<AppWeekday[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  const [formScreenIds, setFormScreenIds] = useState<string[]>([])
  const [formPlaylistId, setFormPlaylistId] = useState('')

  const handleAdd = async () => {
    if (!formName.trim()) return showToast('Please enter a slot name', 'error')
    if (!formPlaylistId) return showToast('Please select a playlist', 'error')
    if (!formScreenIds.length) return showToast('Please select at least one screen', 'error')
    try {
      await addSlot(formName, formScreenIds, formPlaylistId, formStart, parseInt(formDuration) || 60, formDays, parseInt(formPriority) || 1)
      showToast(`Schedule "${formName}" created`, 'success')
      setShowAdd(false); setFormName(''); setFormScreenIds([]); setFormPlaylistId('')
    } catch {
      showToast('Failed to create schedule', 'error')
    }
  }
  const handleDelete = async (id: string) => {
    await deleteSlot(id); setDeleteId(null); showToast('Schedule deleted', 'info')
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between"><div><h1 className="page-title">Schedule</h1><Badge variant="secondary">{slots.length} active slots</Badge></div><Button onClick={() => setShowAdd(true)}>+ Add Slot</Button></div>
      {loading ? <Skeleton className="h-80" /> : <ScheduleTimeline slots={slots} onDelete={setDeleteId} />}
      <section className="space-y-3">
        <h2 className="section-title">Active Slots</h2>
        {!slots.length ? <Card className="border-dashed bg-transparent"><CardContent className="flex flex-col items-center py-16 text-center"><CalendarClock className="mb-4 size-10 text-muted-foreground/40" /><CardTitle>No schedule slots</CardTitle><CardDescription>Create a slot to automate playback.</CardDescription></CardContent></Card> : slots.map((slot) => {
          const playlist = playlists.find((entry) => entry.id === slot.playlist_id)
          const assignedScreens = screens.filter((screen) => slot.screen_ids.includes(screen.id))
          return <Card key={slot.id}><CardHeader className="flex flex-row items-start justify-between"><div><CardTitle className="text-base">{slot.name}</CardTitle><CardDescription>{slot.start_time} · {slot.duration_mins}min · Priority {slot.priority}</CardDescription></div><Button variant="ghost" size="sm" onClick={() => setDeleteId(slot.id)}>Delete</Button></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge>{playlist?.name || 'Unknown Playlist'}</Badge>{assignedScreens.map((screen) => <Badge key={screen.id} variant="secondary">{screen.name}</Badge>)}{slot.days_of_week.map((day) => <Badge key={day} variant="outline">{day}</Badge>)}</CardContent></Card>
        })}
      </section>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete schedule slot?</AlertDialogTitle><AlertDialogDescription>This removes “{slots.find((slot) => slot.id === deleteId)?.name}”.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Schedule Slot" actions={<><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={handleAdd}>Create</Button></>}>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="slot-name">Slot Name *</Label><Input id="slot-name" value={formName} onChange={(event) => setFormName(event.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="slot-start">Start Time</Label><Input id="slot-start" type="time" value={formStart} onChange={(event) => setFormStart(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="slot-duration">Duration (minutes)</Label><Input id="slot-duration" type="number" value={formDuration} onChange={(event) => setFormDuration(event.target.value)} /></div></div>
          <div className="space-y-2"><Label htmlFor="slot-priority">Priority</Label><Input id="slot-priority" type="number" min="1" max="10" value={formPriority} onChange={(event) => setFormPriority(event.target.value)} /></div>
          <div className="space-y-2"><Label>Playlist *</Label><Select value={formPlaylistId} onValueChange={setFormPlaylistId}><SelectTrigger><SelectValue placeholder="Select playlist" /></SelectTrigger><SelectContent>{playlists.map((playlist) => <SelectItem key={playlist.id} value={playlist.id}>{playlist.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Target Screens *</Label><ScrollArea className="h-32 rounded-md border border-border p-3"><div className="space-y-3">{screens.map((screen) => <div key={screen.id} className="flex items-center gap-2"><Checkbox id={`screen-${screen.id}`} checked={formScreenIds.includes(screen.id)} onCheckedChange={(checked) => setFormScreenIds((current) => checked ? [...current, screen.id] : current.filter((id) => id !== screen.id))} /><Label htmlFor={`screen-${screen.id}`}>{screen.name}</Label></div>)}</div></ScrollArea></div>
          <div className="space-y-2"><Label>Days</Label><ToggleGroup type="multiple" value={formDays} onValueChange={(values) => setFormDays(values as AppWeekday[])}>{ALL_DAYS.map((day) => <ToggleGroupItem key={day} value={day}>{day}</ToggleGroupItem>)}</ToggleGroup></div>
        </div>
      </Modal>
    </div>
  )
}
