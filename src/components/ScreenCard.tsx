'use client'

import { memo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Screen } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface ScreenCardProps {
  screen: Screen
  onDelete: (id: string) => void
  onEdit?: (screen: Screen) => void
  onHours?: (screen: Screen) => void
  onSync?: (id: string) => void
  onManage?: (id: string) => void
  isSyncing?: boolean
}

function ScreenCard({ screen, onDelete, onEdit, onSync, onManage, isSyncing = false }: ScreenCardProps) {
  return (
    <Card className="group cursor-pointer border-border bg-card transition-colors hover:border-border/80 shadow-xs p-0 gap-0" onClick={() => onManage?.(screen.id)}>
      <CardHeader className="relative p-6 pb-2">
        <div className="absolute right-4 top-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(event) => event.stopPropagation()}>
          {onEdit && <Button aria-label="Edit screen" variant="ghost" size="icon-sm" onClick={() => onEdit(screen)}><Pencil /></Button>}
          <Button aria-label="Delete screen" variant="ghost" size="icon-sm" className="hover:text-destructive" onClick={() => onDelete(screen.id)}><Trash2 /></Button>
        </div>
        <CardTitle className="pr-20 text-base">{screen.name}</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          {screen.location || 'No location set'}
        </div>
      </CardHeader>
      {isSyncing && (
        <CardContent className="px-6 pb-4 pt-2" onClick={(event) => event.stopPropagation()}>
          <Progress value={undefined} className="animate-pulse" />
        </CardContent>
      )}
      <CardFooter className="flex-col gap-2 p-6 pt-2" onClick={(event) => event.stopPropagation()}>
        {onSync && <Button className="w-full text-xs py-2 h-9" disabled={isSyncing} onClick={() => onSync(screen.id)}>{isSyncing ? 'Syncing…' : 'Force Sync'}</Button>}
        {onManage && <Button variant="link" className="self-end px-0 text-xs h-auto py-0" onClick={() => onManage(screen.id)}>Manage →</Button>}
      </CardFooter>
    </Card>
  )
}

export default memo(ScreenCard)
