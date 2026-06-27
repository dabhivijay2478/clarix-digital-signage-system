'use client'

import { memo } from 'react'
import { Trash2, Film, Image as ImageIcon, Globe, Megaphone, Presentation, FileText, FileSpreadsheet } from 'lucide-react'
import type { ContentItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ContentCardProps {
  item: ContentItem
  onDelete: (id: string) => void
}

const typeIcons: Record<string, React.ReactNode> = {
  Video: <Film className="size-4 text-primary" />,
  Image: <ImageIcon className="size-4 text-blue-500" />,
  WebApp: <Globe className="size-4 text-indigo-500" />,
  Ad: <Megaphone className="size-4 text-amber-500" />,
  Slideshow: <Presentation className="size-4 text-emerald-500" />,
  Presentation: <Presentation className="size-4 text-purple-500" />,
  Document: <FileText className="size-4 text-rose-500" />,
  Spreadsheet: <FileSpreadsheet className="size-4 text-green-500" />,
}

const typeStyles: Record<string, string> = {
  Ad: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Slideshow: 'border-primary/30 bg-primary/10 text-primary',
  Presentation: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  Document: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  Spreadsheet: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
}

function ContentCard({ item, onDelete }: ContentCardProps) {
  const { id, name, content_type, url, duration_secs, tags } = item
  const variant = content_type === 'Image' ? 'secondary' : content_type === 'Video' ? 'default' : 'outline'

  return (
    <Card className="group relative overflow-hidden border-border bg-card transition-all duration-200 hover:shadow-md hover:border-border/60 hover:-translate-y-0.5">
      {/* Delete button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-2 top-2 z-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete content</TooltipContent>
      </Tooltip>

      <CardContent className="p-3">
        {/* Icon and Type Badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className={cn(
            "flex size-8 items-center justify-center rounded-lg border",
            "bg-muted/50 border-border/60"
          )}>
            {typeIcons[content_type] || <span className="text-xs">❓</span>}
          </div>
          <Badge 
            variant={variant} 
            className={cn('text-[10px] px-1.5 py-0 h-5', typeStyles[content_type])}
          >
            {content_type}
          </Badge>
        </div>

        {/* Name */}
        <h3 className="font-medium text-sm leading-tight line-clamp-2 mb-1 pr-6" title={name}>
          {name}
        </h3>

        {/* Source */}
        <p className="text-[10px] text-muted-foreground truncate mb-2" title={url || item.file_path || undefined}>
          {url || item.file_path || 'Local file'}
        </p>

        {/* Footer: Tags and Duration */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex flex-wrap gap-1">
            {tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                #{tag}
              </span>
            ))}
            {tags && tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {duration_secs}s
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default memo(ContentCard)
