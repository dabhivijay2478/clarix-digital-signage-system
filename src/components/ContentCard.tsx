'use client'

import { memo, useRef, useState } from 'react'
import { Trash2, Film, Image as ImageIcon, Globe, Megaphone, Presentation, FileText, FileSpreadsheet } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { ContentItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ContentCardProps {
  item: ContentItem
  onDelete: (id: string) => void
}

const typeIcons: Record<string, React.ReactNode> = {
  Video: <Film className="size-5 text-primary" />,
  Image: <ImageIcon className="size-5 text-blue-500" />,
  WebApp: <Globe className="size-5 text-indigo-500" />,
  Ad: <Megaphone className="size-5 text-amber-500" />,
  Slideshow: <Presentation className="size-5 text-emerald-500" />,
  Presentation: <Presentation className="size-5 text-purple-500" />,
  Document: <FileText className="size-5 text-rose-500" />,
  Spreadsheet: <FileSpreadsheet className="size-5 text-green-500" />,
}

const typeStyles: Record<string, string> = {
  Ad: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Slideshow: 'border-primary/30 bg-primary/10 text-primary',
  Presentation: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  Document: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  Spreadsheet: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
}

function ContentCard({ item, onDelete }: ContentCardProps) {
  const { id, name, content_type, file_path, url, duration_secs, tags } = item
  const variant = content_type === 'Image' ? 'secondary' : content_type === 'Video' ? 'default' : 'outline'
  const videoRef = useRef<HTMLVideoElement>(null)
  const [previewError, setPreviewError] = useState(false)

  const getMediaUrl = (): string => {
    if (url) return url
    if (file_path) {
      const tauriWindow = typeof window !== 'undefined' ? (window as typeof window & { __TAURI_INTERNALS__?: unknown }) : null
      if (tauriWindow?.__TAURI_INTERNALS__) {
        try {
          return convertFileSrc(file_path)
        } catch (e) {
          console.error('Failed to convert file source', e)
        }
      }
      const filename = file_path.split(/[/\\]/).pop() || ''
      const origin = typeof window !== 'undefined'
        ? (window.location.port === '7420' ? window.location.origin : `http://${window.location.hostname}:7420`)
        : 'http://localhost:7420'
      return `${origin}/media/${encodeURIComponent(filename)}`
    }
    return ''
  }

  const mediaUrl = getMediaUrl()

  const handleMouseEnter = () => {
    if (content_type === 'Video' && videoRef.current) {
      videoRef.current.play().catch(() => {})
    }
  }

  const handleMouseLeave = () => {
    if (content_type === 'Video' && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  const renderPreview = () => {
    if (previewError || !mediaUrl) {
      return (
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-transform duration-300 group-hover:scale-110">
          {typeIcons[content_type] || <span>❓</span>}
        </div>
      )
    }

    if (content_type === 'Image') {
      return (
        <img
          src={mediaUrl}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setPreviewError(true)}
        />
      )
    }

    if (content_type === 'Video') {
      return (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          muted
          playsInline
          preload="metadata"
          onError={() => setPreviewError(true)}
        />
      )
    }

    return (
      <div className="flex size-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary transition-transform duration-300 group-hover:scale-110">
        {typeIcons[content_type] || <span>❓</span>}
      </div>
    )
  }

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border/80 shadow-xs p-0 gap-0">
      <div 
        className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-border bg-muted/20 after:absolute after:inset-0 after:bg-linear-to-t after:from-background/20 after:to-transparent after:opacity-0 after:transition-opacity group-hover:after:opacity-100"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {renderPreview()}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Delete content" variant="glass" size="icon-sm" className="absolute right-2.5 top-2.5 z-10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={() => onDelete(id)}>
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete content</TooltipContent>
      </Tooltip>
      <CardContent className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-xs font-semibold leading-snug">{name}</h3>
          <Badge variant={variant} className={cn('shrink-0 text-[9px] px-1.5 py-0.5', typeStyles[content_type])}>{content_type}</Badge>
        </div>
        <p className="truncate font-mono text-[9px] text-muted-foreground">{content_type === 'WebApp' ? url : file_path}</p>
        {!!tags?.length && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">#{tag}</Badge>)}
            {tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{tags.length - 2}</span>}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between border-t border-border px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Duration</span><span className="font-mono text-foreground text-xs">{duration_secs}s</span>
      </CardFooter>
    </Card>
  )
}

export default memo(ContentCard)
