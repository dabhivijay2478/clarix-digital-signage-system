'use client'

import { memo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Screen } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

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
  const status = isSyncing ? 'Syncing' : screen.is_online ? 'Online' : 'Offline'
  const pairingBadgeStyle = screen.pairing_status === 'paired'
    ? 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400'
    : screen.pairing_status === 'unpaired'
      ? 'bg-muted text-muted-foreground border-border'
      : 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400'

  return (
    <Card className="group cursor-pointer border-border bg-card transition-colors hover:border-border/80 shadow-xs p-0 gap-0" onClick={() => onManage?.(screen.id)}>
      <CardHeader className="relative p-6 pb-2">
        <div className="absolute right-4 top-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(event) => event.stopPropagation()}>
          {onEdit && <Button aria-label="Edit screen" variant="ghost" size="icon-sm" onClick={() => onEdit(screen)}><Pencil /></Button>}
          <Button aria-label="Delete screen" variant="ghost" size="icon-sm" className="hover:text-destructive" onClick={() => onDelete(screen.id)}><Trash2 /></Button>
        </div>
        <CardTitle className="pr-20 text-base">{screen.name}</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Tooltip>
            <TooltipTrigger asChild><span className={cn('size-2 rounded-full', isSyncing ? 'animate-pulse bg-primary' : screen.is_online ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/60')} /></TooltipTrigger>
            <TooltipContent>{status}</TooltipContent>
          </Tooltip>
          {status} · {screen.location || 'No location set'}
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-4 pt-2" onClick={(event) => event.stopPropagation()}>
        <Table>
          <TableBody>
            <TableRow><TableCell className="py-1.5 text-muted-foreground">Resolution</TableCell><TableCell className="py-1.5 text-right font-mono text-xs">{screen.resolution?.width ?? 1920} × {screen.resolution?.height ?? 1080}</TableCell></TableRow>
            <TableRow><TableCell className="py-1.5 text-muted-foreground">Orientation</TableCell><TableCell className="py-1.5 text-right">{screen.orientation ?? 'Landscape'}</TableCell></TableRow>
            <TableRow><TableCell className="py-1.5 text-muted-foreground">Pairing</TableCell><TableCell className="py-1.5 text-right"><Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 font-medium capitalize', pairingBadgeStyle)}>{screen.pairing_status.replace('_', ' ')}</Badge></TableCell></TableRow>
            <TableRow><TableCell className="py-1.5 text-muted-foreground">Device</TableCell><TableCell className="py-1.5 max-w-48 truncate text-right font-mono text-xs">{screen.device_id ?? 'Not paired'}</TableCell></TableRow>
            <TableRow><TableCell className="py-1.5 text-muted-foreground">Revision</TableCell><TableCell className="py-1.5 text-right font-mono text-xs">{screen.last_sync_revision}</TableCell></TableRow>
          </TableBody>
        </Table>
        {isSyncing && <Progress value={undefined} className="animate-pulse mt-3" />}
      </CardContent>
      <CardFooter className="flex-col gap-2 p-6 pt-2" onClick={(event) => event.stopPropagation()}>
        {onSync && <Button className="w-full text-xs py-2 h-9" disabled={isSyncing} onClick={() => onSync(screen.id)}>{isSyncing ? 'Publishing…' : 'Publish Revision'}</Button>}
        {onManage && <Button variant="link" className="self-end px-0 text-xs h-auto py-0" onClick={() => onManage(screen.id)}>Manage →</Button>}
      </CardFooter>
    </Card>
  )
}

export default memo(ScreenCard)
