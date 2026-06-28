'use client'

import { memo } from 'react'
import { Trash2, Eye, Film, Image as ImageIcon, Globe, Megaphone, Presentation, FileText, FileSpreadsheet, Clock } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { ContentItem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ContentCardProps {
  item: ContentItem
  onDelete: (id: string) => void
  onView?: (item: ContentItem) => void
}

const typeConfig: Record<string, {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  badgeColor: string
  label: string
}> = {
  Video:        { icon: Film,            iconColor: 'text-primary',       iconBg: 'bg-primary/10',       badgeColor: 'bg-primary/10 text-primary border-primary/20',             label: 'Video' },
  Image:        { icon: ImageIcon,       iconColor: 'text-blue-500',      iconBg: 'bg-blue-500/10',      badgeColor: 'bg-blue-500/10 text-blue-600 border-blue-500/20',           label: 'Image' },
  WebApp:       { icon: Globe,           iconColor: 'text-indigo-500',    iconBg: 'bg-indigo-500/10',    badgeColor: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',     label: 'WebApp' },
  Ad:           { icon: Megaphone,       iconColor: 'text-amber-500',     iconBg: 'bg-amber-500/10',     badgeColor: 'bg-amber-500/10 text-amber-600 border-amber-500/20',         label: 'Ad' },
  Slideshow:    { icon: Presentation,    iconColor: 'text-emerald-500',   iconBg: 'bg-emerald-500/10',   badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',   label: 'Slideshow' },
  Presentation: { icon: Presentation,    iconColor: 'text-purple-500',    iconBg: 'bg-purple-500/10',    badgeColor: 'bg-purple-500/10 text-purple-600 border-purple-500/20',       label: 'Presentation' },
  Document:     { icon: FileText,        iconColor: 'text-rose-500',      iconBg: 'bg-rose-500/10',      badgeColor: 'bg-rose-500/10 text-rose-600 border-rose-500/20',             label: 'Document' },
  Spreadsheet:  { icon: FileSpreadsheet, iconColor: 'text-green-500',     iconBg: 'bg-green-500/10',     badgeColor: 'bg-green-500/10 text-green-600 border-green-500/20',         label: 'Spreadsheet' },
}

const fallbackConfig = {
  icon: FileText,
  iconColor: 'text-muted-foreground',
  iconBg: 'bg-muted',
  badgeColor: 'bg-muted text-muted-foreground border-border',
  label: 'File',
}

function ContentCard({ item, onDelete, onView }: ContentCardProps) {
  const { id, name, content_type, url, duration_secs, tags } = item
  const cfg = typeConfig[content_type] ?? fallbackConfig
  const IconComponent = cfg.icon
  const source = url || item.file_path || ''
  // Show just filename for local paths
  const displaySource = source.startsWith('/') || source.startsWith('C:')
    ? source.split('/').pop() || source.split('\\').pop() || source
    : source

  const mediaSrc = item.file_path ? convertFileSrc(item.file_path) : (item.url || '')

  return (
    <div className="group relative flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:border-border hover:border-border">

      {/* Thumbnail / Preview area */}
      <div className={cn('relative flex items-center justify-center h-28 w-full overflow-hidden', item.content_type === 'Image' || item.content_type === 'Video' ? 'bg-black/5' : cfg.iconBg)}>
        {item.content_type === 'Image' && (item.file_path || item.url) ? (
          <img
            src={mediaSrc}
            alt={name}
            className="size-full object-contain"
            loading="lazy"
          />
        ) : item.content_type === 'Video' && (item.file_path || item.url) ? (
          <video
            src={mediaSrc}
            className="size-full object-contain"
            muted
            preload="metadata"
          />
        ) : (
          <IconComponent className={cn('size-8 opacity-60', cfg.iconColor)} />
        )}

        {/* Type badge top-right */}
        <span className={cn(
          'absolute top-2 right-2 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
          cfg.badgeColor
        )}>
          {cfg.label}
        </span>

        {/* View button — appears on hover */}
        {onView && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 left-2 size-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-primary/10 hover:text-primary rounded-md"
                onClick={() => onView(item)}
              >
                <Eye className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">View</TooltipContent>
          </Tooltip>
        )}

        {/* Delete button — appears on hover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 left-2 size-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-destructive/10 hover:text-destructive rounded-md"
              style={onView ? { left: '34px' } : undefined}
              onClick={() => onDelete(id)}
            >
              <Trash2 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Delete</TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        {/* Name */}
        <h3 className="text-xs font-semibold leading-snug line-clamp-2 text-foreground" title={name}>
          {name}
        </h3>

        {/* Source URL */}
        <p className="text-[10px] text-muted-foreground/70 truncate leading-tight" title={displaySource}>
          {displaySource || '—'}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/40">
          <div className="flex flex-wrap gap-1 min-w-0">
            {tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded-md">
                #{tag}
              </span>
            ))}
            {tags && tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground/60">+{tags.length - 2}</span>
            )}
          </div>
          <span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground shrink-0 ml-1">
            <Clock className="size-2.5" />
            {duration_secs}s
          </span>
        </div>
      </div>
    </div>
  )
}

export default memo(ContentCard)
