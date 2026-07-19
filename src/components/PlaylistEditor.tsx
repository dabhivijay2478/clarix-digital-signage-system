'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X, Search, Film, Image as ImageIcon, Clock } from 'lucide-react'
import type { ContentItem, Playlist, PlaylistItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatMediaDuration } from '@/lib/media-duration'

interface PlaylistEditorProps {
  playlist: Playlist
  contentItems: ContentItem[]
  onUpdateItems: (playlistId: string, items: PlaylistItem[]) => void
  onClose?: () => void
}

export default function PlaylistEditor({ playlist, contentItems, onUpdateItems, onClose }: PlaylistEditorProps) {
  const [items, setItems] = useState<PlaylistItem[]>(() => 
    (playlist.items || []).map((item) => ({ ...item, override_duration: null }))
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'video' | 'image'>('all')

  const totalDuration = items.reduce(
    (acc, item) => acc + (contentItems.find((content) => content.id === item.content_id)?.duration_secs ?? 0), 
    0
  )

  const handleAddItem = (contentId: string) => 
    setItems((current) => [...current, { content_id: contentId, order: current.length, override_duration: null }])

  const handleRemoveItem = (index: number) => 
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, order) => ({ ...item, order })))

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    const next = [...items]; 
    [next[index], next[target]] = [next[target], next[index]]
    setItems(next.map((item, order) => ({ ...item, order })))
  }

  const handleSave = () => {
    onUpdateItems(playlist.id, items.map((item, order) => ({ ...item, order, override_duration: null })))
    onClose?.()
  }

  // Filter content items by search query and category
  const filteredContentItems = contentItems.filter((content) => {
    const matchesSearch = content.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = 
      categoryFilter === 'all' || 
      (categoryFilter === 'video' && content.content_type.toLowerCase() === 'video') ||
      (categoryFilter === 'image' && content.content_type.toLowerCase() === 'image')
    return matchesSearch && matchesCategory
  })

  return (
    <Card className="max-h-[85vh] overflow-hidden border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-2xl flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <div>
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <span>{playlist.name}</span>
          </CardTitle>
          <CardDescription className="text-zinc-400 text-xs mt-1">
            Build your screen playback rotation. Items play sequentially using their default durations.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
          <Clock className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-mono font-semibold text-zinc-200">{formatMediaDuration(totalDuration)} total</span>
        </div>
      </CardHeader>
      
      <CardContent className="grid gap-6 md:grid-cols-5 p-6 flex-1 overflow-hidden min-h-[350px]">
        {/* Left Side: Playlist Items Sequence */}
        <div className="md:col-span-3 flex flex-col overflow-hidden max-h-[50vh]">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Sequence Order ({items.length} items)</h3>
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-2.5">
              {items.length === 0 && (
                <Card className="border-dashed bg-zinc-900/20 border-white/5">
                  <CardContent className="py-24 text-center text-sm text-zinc-500">
                    <Plus className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
                    <span>Select items from the library on the right to build your playlist</span>
                  </CardContent>
                </Card>
              )}
              {items.map((item, index) => {
                const content = contentItems.find((entry) => entry.id === item.content_id)
                if (!content) return null
                const isVideo = content.content_type.toLowerCase() === 'video'
                
                return (
                  <Card key={`${item.content_id}-${index}`} className="border-white/5 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors duration-150 relative overflow-hidden group">
                    <CardContent className="flex items-center gap-3 p-3">
                      {/* Drag/Order Handles */}
                      <div className="flex flex-col gap-0.5">
                        <Button 
                          aria-label="Move up" 
                          variant="ghost" 
                          size="icon-xs" 
                          disabled={index === 0} 
                          onClick={() => handleMoveItem(index, 'up')}
                          className="h-6 w-6 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 cursor-pointer"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button 
                          aria-label="Move down" 
                          variant="ghost" 
                          size="icon-xs" 
                          disabled={index === items.length - 1} 
                          onClick={() => handleMoveItem(index, 'down')}
                          className="h-6 w-6 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 cursor-pointer"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Number Index */}
                      <div className="text-xs font-mono font-bold text-zinc-500 bg-zinc-950/40 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border border-white/5">
                        {index + 1}
                      </div>

                      {/* Type Icon */}
                      <div className={cn(
                        "p-2 rounded-lg shrink-0 border border-white/5",
                        isVideo ? "bg-indigo-500/10 text-indigo-400" : "bg-teal-500/10 text-teal-400"
                      )}>
                        {isVideo ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                      </div>

                      {/* Content Name and Duration */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white leading-snug">{content.name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5">
                          <span className="capitalize">{content.content_type}</span>
                          <span>•</span>
                          <span>{formatMediaDuration(content.duration_secs)}</span>
                        </p>
                      </div>

                      {/* Remove Button */}
                      <Button 
                        aria-label="Remove item" 
                        variant="ghost" 
                        size="icon-sm" 
                        className="hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer" 
                        onClick={() => handleRemoveItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right Side: Available Content Library */}
        <div className="md:col-span-2 border-t border-white/5 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0 flex flex-col overflow-hidden max-h-[50vh]">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Content Library</h3>
          
          {/* Search Input */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-white/10 bg-zinc-950/60 placeholder-zinc-500 text-white text-xs h-9 focus-visible:ring-violet-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1 mb-3 bg-zinc-950/65 p-1 rounded-lg border border-white/5 text-[11px]">
            <button
              onClick={() => setCategoryFilter('all')}
              className={cn(
                "flex-1 py-1 rounded-md transition-colors cursor-pointer text-center",
                categoryFilter === 'all' 
                  ? "bg-zinc-800 text-white font-semibold" 
                  : "text-zinc-400 hover:text-white"
              )}
            >
              All
            </button>
            <button
              onClick={() => setCategoryFilter('video')}
              className={cn(
                "flex-1 py-1 rounded-md transition-colors cursor-pointer text-center",
                categoryFilter === 'video' 
                  ? "bg-zinc-800 text-white font-semibold" 
                  : "text-zinc-400 hover:text-white"
              )}
            >
              Videos
            </button>
            <button
              onClick={() => setCategoryFilter('image')}
              className={cn(
                "flex-1 py-1 rounded-md transition-colors cursor-pointer text-center",
                categoryFilter === 'image' 
                  ? "bg-zinc-800 text-white font-semibold" 
                  : "text-zinc-400 hover:text-white"
              )}
            >
              Images
            </button>
          </div>

          {/* Available Items List */}
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-2">
              {filteredContentItems.length === 0 && (
                <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-white/5 rounded-xl bg-zinc-900/10">
                  No matching media items found
                </div>
              )}
              {filteredContentItems.map((content) => {
                const isVideo = content.content_type.toLowerCase() === 'video'
                return (
                  <Card key={content.id} className="border-white/5 bg-zinc-900/20 hover:bg-zinc-900/40 transition-all duration-150">
                    <CardContent className="flex items-center justify-between gap-3 p-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Miniature Type Icon */}
                        <div className={cn(
                          "p-1.5 rounded-md border border-white/5 text-zinc-400",
                          isVideo ? "bg-indigo-500/5 text-indigo-400/80" : "bg-teal-500/5 text-teal-400/80"
                        )}>
                          {isVideo ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-200 leading-snug">{content.name}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{formatMediaDuration(content.duration_secs)}</p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => handleAddItem(content.id)}
                        className="h-7 px-2.5 text-xs bg-violet-600 hover:bg-violet-500 text-white gap-1 font-medium cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add</span>
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </CardContent>

      <CardFooter className="justify-end gap-3 border-t border-white/5 p-4 bg-zinc-950/80">
        {onClose && (
          <Button variant="outline" onClick={onClose} className="border-white/10 hover:bg-white/5 text-zinc-300">
            Cancel
          </Button>
        )}
        <Button 
          onClick={handleSave}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold transition-all duration-200"
        >
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  )
}
