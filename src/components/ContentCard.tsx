'use client'

import { memo } from 'react'
import { Trash2 } from 'lucide-react'
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

const typeIcons: Record<string, string> = { Video: '🎞️', Image: '🖼️', WebApp: '🌐', Ad: '📢', Slideshow: '🎚️' }
const typeStyles: Record<string, string> = {
  Ad: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  Slideshow: 'border-primary/30 bg-primary/10 text-primary',
}

function ContentCard({ item, onDelete }: ContentCardProps) {
  const { id, name, content_type, file_path, url, duration_secs, tags } = item
  const variant = content_type === 'Image' ? 'secondary' : content_type === 'Video' ? 'default' : 'outline'

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border/80 shadow-xs">
      <div className="relative flex aspect-video items-center justify-center border-b border-border bg-muted text-3xl after:absolute after:inset-0 after:bg-linear-to-t after:from-background/80 after:to-transparent after:opacity-0 after:transition-opacity group-hover:after:opacity-100">
        <span className="select-none">{typeIcons[content_type] || '❓'}</span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Delete content" variant="glass" size="icon-sm" className="absolute right-3 top-3 z-10 hover:text-destructive" onClick={() => onDelete(id)}>
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete content</TooltipContent>
      </Tooltip>
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-sm font-semibold">{name}</h3>
          <Badge variant={variant} className={cn('shrink-0', typeStyles[content_type])}>{content_type}</Badge>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{content_type === 'WebApp' ? url : file_path}</p>
        {!!tags?.length && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="text-[10px]">#{tag}</Badge>)}
            {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between border-t border-border px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Duration</span><span className="font-mono text-foreground">{duration_secs}s</span>
      </CardFooter>
    </Card>
  )
}

export default memo(ContentCard)
