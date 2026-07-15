'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Megaphone,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  FileText,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { appConfigApi, contentApi } from '@/lib/tauri'
import type { ContentItem, MarqueeSettings } from '@/lib/types'

interface MarqueeItem {
  id: string
  type: 'text' | 'image'
  content: string
}

export default function MarqueePage() {
  const [enabled, setEnabled] = useState(false)
  const [speed, setSpeed] = useState(45)
  const [limit, setLimit] = useState(10)
  const [items, setItems] = useState<MarqueeItem[]>([])
  const [contentLibrary, setContentLibrary] = useState<ContentItem[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load marquee settings & content items
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [marqueeSettings, allContent] = await Promise.all([
        appConfigApi.getMarquee(),
        contentApi.getAll(),
      ])

      setEnabled(marqueeSettings.enabled)
      setSpeed(marqueeSettings.speed)

      // Filter content library to only images for the picker
      setContentLibrary(allContent.filter((item) => item.content_type === 'Image'))

      // Parse text field JSON
      const rawText = marqueeSettings.text || ''
      if (rawText.startsWith('{') || rawText.startsWith('[')) {
        try {
          const parsed = JSON.parse(rawText)
          if (Array.isArray(parsed)) {
            setItems(parsed.map((item: any, idx: number) => ({
              id: item.id || `item-${Date.now()}-${idx}-${Math.random()}`,
              type: item.type || 'text',
              content: item.content || '',
            })))
            setLimit(10)
          } else if (parsed.items) {
            setItems((parsed.items || []).map((item: any, idx: number) => ({
              id: item.id || `item-${Date.now()}-${idx}-${Math.random()}`,
              type: item.type || 'text',
              content: item.content || '',
            })))
            setLimit(parsed.limit || 10)
          }
        } catch (e) {
          // Fallback legacy parse error
          setItems([{ id: 'legacy-1', type: 'text', content: rawText }])
          setLimit(10)
        }
      } else {
        // Fallback for legacy plain text format
        if (rawText.trim()) {
          setItems([{ id: 'legacy-1', type: 'text', content: rawText }])
        }
        setLimit(10)
      }
    } catch (err) {
      console.error('Failed to load marquee settings:', err)
      showToast('Failed to load marquee configuration', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Save payload to tauri
  const handleSave = async () => {
    setSaving(true)
    try {
      const serializedText = JSON.stringify({
        items: items.map((item) => ({ type: item.type, content: item.content })),
        limit,
      })
      await appConfigApi.updateMarquee(enabled, serializedText, speed)
      showToast('Marquee settings updated successfully', 'success')
    } catch (err) {
      console.error('Failed to save marquee settings:', err)
      showToast(`Failed to save settings: ${err}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddItem = (type: 'text' | 'image') => {
    setItems((curr) => [
      ...curr,
      {
        id: `item-${Date.now()}-${Math.random()}`,
        type,
        content: '',
      },
    ])
  }

  const handleRemoveItem = (id: string) => {
    setItems((curr) => curr.filter((item) => item.id !== id))
  }

  const handleUpdateItemContent = (id: string, content: string) => {
    setItems((curr) =>
      curr.map((item) => (item.id === id ? { ...item, content } : item))
    )
  }

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === items.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const updated = [...items]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    setItems(updated)
  }

  return (
    <div className="space-y-7 lg:space-y-9 max-w-5xl">
      <div>
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
          <Megaphone className="size-3.5" /> Marquee Ticker Management
        </Badge>
        <h1 className="page-title">Marquee Settings</h1>
        <p className="page-subtitle">
          Configure a custom scrolling message or image gallery to display at the bottom of all player screens.
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
          Loading Marquee Settings...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Controls Card */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-bold uppercase tracking-wider">General Configurations</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Enabled</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Speed (seconds per cycle)</label>
                  <Input
                    type="number"
                    min={15}
                    max={120}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value) || 45)}
                    className="h-9"
                    placeholder="45"
                  />
                  <p className="text-[10px] text-muted-foreground">Speed is calculated as animation cycle duration. Lower numbers scroll faster.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Items to Show</label>
                  <Select value={String(limit)} onValueChange={(val) => setLimit(Number(val))}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select limit" />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((num) => (
                        <SelectItem key={num} value={String(num)}>
                          Show First {num} Items
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Limits the items loaded on screen at any time for layout spacing.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items Builder Card */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-wider">Marquee Items</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Build a sequence of plain text and image items.</p>
              </div>
              <div className="flex gap-2">
                <Button size="xs" variant="outline" onClick={() => handleAddItem('text')} className="h-8 gap-1 text-xs">
                  <FileText className="size-3.5" /> Add Text
                </Button>
                <Button size="xs" variant="outline" onClick={() => handleAddItem('image')} className="h-8 gap-1 text-xs">
                  <ImageIcon className="size-3.5" /> Add Image
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border/40 rounded-xl text-center text-muted-foreground">
                  <HelpCircle className="size-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium">No items added to the marquee ticker</p>
                  <p className="text-xs text-muted-foreground/80 max-w-xs mt-1">
                    Add plain text or library images using the buttons in the header to populate the scrolling bottom marquee.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const isFirst = index === 0
                    const isLast = index === items.length - 1
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/10 group hover:bg-muted/20 transition-all"
                      >
                        {/* Position handles */}
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 p-0 opacity-60 hover:opacity-100 disabled:opacity-30"
                            disabled={isFirst}
                            onClick={() => handleMoveItem(index, 'up')}
                            aria-label="Move item up"
                          >
                            <ArrowUp className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 p-0 opacity-60 hover:opacity-100 disabled:opacity-30"
                            disabled={isLast}
                            onClick={() => handleMoveItem(index, 'down')}
                            aria-label="Move item down"
                          >
                            <ArrowDown className="size-3" />
                          </Button>
                        </div>

                        {/* Item Type Badge */}
                        <div className="shrink-0">
                          {item.type === 'text' ? (
                            <Badge variant="outline" className="h-6 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-400">
                              <FileText className="size-3" /> Text
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-6 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-400">
                              <ImageIcon className="size-3" /> Image
                            </Badge>
                          )}
                        </div>

                        {/* Content input */}
                        <div className="flex-1 min-w-0">
                          {item.type === 'text' ? (
                            <Input
                              value={item.content}
                              onChange={(e) => handleUpdateItemContent(item.id, e.target.value)}
                              placeholder="Enter message text..."
                              className="h-9 text-xs"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <Input
                                value={item.content}
                                onChange={(e) => handleUpdateItemContent(item.id, e.target.value)}
                                placeholder="Enter image file path or URL..."
                                className="h-9 text-xs flex-1"
                              />
                              {contentLibrary.length > 0 && (
                                <Select
                                  value={contentLibrary.find((c) => c.file_path === item.content)?.file_path || ''}
                                  onValueChange={(val) => handleUpdateItemContent(item.id, val)}
                                >
                                  <SelectTrigger className="h-9 w-40 text-xs text-left bg-muted/30">
                                    <SelectValue placeholder="Select media" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-card w-60">
                                    {contentLibrary.map((c) => (
                                      <SelectItem key={c.id} value={c.file_path || ''} className="text-xs">
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => handleRemoveItem(item.id)}
                          aria-label="Delete item"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Row */}
          <div className="flex justify-end gap-3">
            <Button size="lg" disabled={saving} className="px-6 gap-2 text-sm" onClick={handleSave}>
              <Save className="size-4" /> {saving ? 'Saving...' : 'Save Marquee Settings'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
