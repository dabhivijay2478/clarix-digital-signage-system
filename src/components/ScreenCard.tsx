'use client'

import { memo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Screen } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ScreenCardProps {
  screen: Screen
  onTogglePower: (id: string, on: boolean) => void
  onBrightnessChange: (id: string, brightness: number) => void
  onDelete: (id: string) => void
  onEdit?: (screen: Screen) => void
  onHours?: (screen: Screen) => void
  onSync?: (id: string) => void
  onManage?: (id: string) => void
  isSyncing?: boolean
}

function ScreenCard({ screen, onTogglePower, onBrightnessChange, onDelete, onEdit, onSync, onManage, isSyncing = false }: ScreenCardProps) {
  const status = isSyncing ? 'Syncing' : screen.is_online ? 'Online' : 'Offline'
  return (
    <Card className="group cursor-pointer border-border bg-card transition-colors hover:border-border/80 shadow-xs" onClick={() => onManage?.(screen.id)}>
      <CardHeader className="relative">
        <div className="absolute right-4 top-4 flex gap-1" onClick={(event) => event.stopPropagation()}>
          {onEdit && <Button aria-label="Edit screen" variant="ghost" size="icon-sm" onClick={() => onEdit(screen)}><Pencil /></Button>}
          <Button aria-label="Delete screen" variant="ghost" size="icon-sm" className="hover:text-destructive" onClick={() => onDelete(screen.id)}><Trash2 /></Button>
        </div>
        <CardTitle className="pr-20">{screen.name}</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild><span className={cn('size-2 rounded-full', isSyncing ? 'animate-pulse bg-primary' : screen.is_online ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/60')} /></TooltipTrigger>
            <TooltipContent>{status}</TooltipContent>
          </Tooltip>
          {status} · {screen.location || 'No location set'}
        </div>
      </CardHeader>
      <CardContent className="space-y-5" onClick={(event) => event.stopPropagation()}>
        <Table>
          <TableBody>
            <TableRow><TableCell className="text-muted-foreground">Resolution</TableCell><TableCell className="text-right font-mono">{screen.resolution?.width ?? 1920} × {screen.resolution?.height ?? 1080}</TableCell></TableRow>
            <TableRow><TableCell className="text-muted-foreground">Orientation</TableCell><TableCell className="text-right">{screen.orientation ?? 'Landscape'}</TableCell></TableRow>
            <TableRow><TableCell className="text-muted-foreground">Pairing</TableCell><TableCell className="text-right"><Badge variant={screen.pairing_status === 'paired' ? 'default' : 'outline'}>{screen.pairing_status.replace('_', ' ')}</Badge></TableCell></TableRow>
            <TableRow><TableCell className="text-muted-foreground">Device</TableCell><TableCell className="max-w-48 truncate text-right font-mono text-xs">{screen.device_id ?? 'Not paired'}</TableCell></TableRow>
            <TableRow><TableCell className="text-muted-foreground">Revision</TableCell><TableCell className="text-right font-mono">{screen.last_sync_revision}</TableCell></TableRow>
          </TableBody>
        </Table>
        <div className="flex items-center justify-between">
          <Label htmlFor={`power-${screen.id}`}>Power</Label>
          <Switch id={`power-${screen.id}`} checked={screen.power_on} onCheckedChange={(checked) => onTogglePower(screen.id, checked)} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><Label>Brightness</Label><Badge variant="outline">{screen.brightness}%</Badge></div>
          <Slider value={[screen.brightness]} disabled={!screen.power_on} onValueChange={([value]) => onBrightnessChange(screen.id, value)} />
        </div>
        {isSyncing && <Progress value={undefined} className="animate-pulse" />}
      </CardContent>
      <CardFooter className="flex-col gap-2" onClick={(event) => event.stopPropagation()}>
        {onSync && <Button className="w-full" disabled={isSyncing} onClick={() => onSync(screen.id)}>{isSyncing ? 'Publishing…' : 'Publish Revision'}</Button>}
        {onManage && <Button variant="link" className="self-end px-0" onClick={() => onManage(screen.id)}>Manage →</Button>}
      </CardFooter>
    </Card>
  )
}

export default memo(ScreenCard)
