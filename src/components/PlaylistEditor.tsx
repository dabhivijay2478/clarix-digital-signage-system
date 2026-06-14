'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import type { ContentItem, Playlist, PlaylistItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

interface PlaylistEditorProps {
  playlist: Playlist
  contentItems: ContentItem[]
  onUpdateItems: (playlistId: string, items: PlaylistItem[]) => void
  onClose?: () => void
}

export default function PlaylistEditor({ playlist, contentItems, onUpdateItems, onClose }: PlaylistEditorProps) {
  const [items, setItems] = useState<PlaylistItem[]>(playlist.items || [])
  const totalDuration = items.reduce((acc, item) => acc + (item.override_duration ?? contentItems.find((content) => content.id === item.content_id)?.duration_secs ?? 0), 0)
  const handleAddItem = (contentId: string) => setItems((current) => [...current, { content_id: contentId, order: current.length, override_duration: null }])
  const handleRemoveItem = (index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, order) => ({ ...item, order })))
  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]
    setItems(next.map((item, order) => ({ ...item, order })))
  }
  const handleOverrideDuration = (index: number, duration: number | null) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, override_duration: duration } : item))

  return (
    <Card className="max-h-[85vh] overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between"><div><CardTitle>{playlist.name}</CardTitle><CardDescription>Edit playlist items and duration overrides</CardDescription></div><Badge variant="outline" className="font-mono">{totalDuration}s</Badge></CardHeader>
      <CardContent className="grid min-h-80 gap-6 md:grid-cols-5">
        <ScrollArea className="max-h-[58vh] md:col-span-3">
          <div className="space-y-2 pr-3">
            {items.length === 0 && <Card className="border-dashed bg-transparent"><CardContent className="py-16 text-center text-sm text-muted-foreground">Add items from the content library</CardContent></Card>}
            {items.map((item, index) => {
              const content = contentItems.find((entry) => entry.id === item.content_id)
              if (!content) return null
              return <Card key={`${item.content_id}-${index}`} className="bg-muted/20"><CardContent className="flex items-center gap-2 p-3">
                <div className="flex flex-col"><Button aria-label="Move up" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => handleMoveItem(index, 'up')}><ChevronUp /></Button><Button aria-label="Move down" variant="ghost" size="icon-xs" disabled={index === items.length - 1} onClick={() => handleMoveItem(index, 'down')}><ChevronDown /></Button></div>
                <div className="min-w-0 flex-1"><CardTitle className="truncate text-sm">{content.name}</CardTitle><CardDescription>{content.content_type} · Default {content.duration_secs}s</CardDescription></div>
                <Input aria-label={`Duration override for ${content.name}`} type="number" className="w-20" placeholder={String(content.duration_secs)} value={item.override_duration ?? ''} onChange={(event) => handleOverrideDuration(index, event.target.value ? parseInt(event.target.value) : null)} />
                <Button aria-label="Remove item" variant="ghost" size="icon-sm" className="hover:text-destructive" onClick={() => handleRemoveItem(index)}><X /></Button>
              </CardContent></Card>
            })}
          </div>
        </ScrollArea>
        <ScrollArea className="max-h-[58vh] border-t border-border pt-4 md:col-span-2 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <div className="space-y-2 pr-3">{contentItems.map((content) => <Card key={content.id} className="bg-muted/20"><CardContent className="flex items-center justify-between gap-2 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{content.name}</p><p className="text-xs text-muted-foreground">{content.content_type} · {content.duration_secs}s</p></div><Button size="sm" onClick={() => handleAddItem(content.id)}><Plus />Add</Button></CardContent></Card>)}</div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="justify-end gap-3 border-t border-border pt-4">{onClose && <Button variant="outline" onClick={onClose}>Cancel</Button>}<Button onClick={() => { onUpdateItems(playlist.id, items); onClose?.() }}>Save Changes</Button></CardFooter>
    </Card>
  )
}
