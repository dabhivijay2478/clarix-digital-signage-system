'use client'

import { memo } from 'react'
import { X } from 'lucide-react'
import type { ScheduleSlot } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface ScheduleTimelineProps {
  slots: ScheduleSlot[]
  onDelete?: (id: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function ScheduleTimeline({ slots, onDelete }: ScheduleTimelineProps) {
  const getSlotPosition = (startTimeStr: string, durationMins: number) => {
    const parts = startTimeStr.split(':')
    const hours = parseInt(parts[0]) || 0
    const minutes = parseInt(parts[1]) || 0
    return {
      left: `${((hours * 60 + minutes) / (24 * 60)) * 100}%`,
      width: `${(durationMins / (24 * 60)) * 100}%`,
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Weekly Timeline</CardTitle>
        <Badge variant="secondary">{slots.length} slots</Badge>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-[900px] pb-4">
            <div className="mb-4 flex border-b border-border pb-2 pl-16 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {HOURS.map((hour) => <div key={hour} className="min-w-8 flex-1 border-l border-border text-center first:border-l-0">{hour.toString().padStart(2, '0')}:00</div>)}
            </div>
            <div className="flex flex-col gap-2">
              {DAYS.map((day) => (
                <div key={day} className="group/row relative flex min-h-11 items-center pl-16">
                  <div className="absolute left-0 w-12 text-xs font-medium text-muted-foreground">{day}</div>
                  <div className="relative h-8 flex-1 overflow-hidden rounded-md border border-border bg-muted/30">
                    <div className="absolute inset-0 flex">{HOURS.map((hour) => <div key={hour} className="flex-1 border-l border-border/60 first:border-l-0" />)}</div>
                    {slots.filter((slot) => slot.days_of_week.includes(day as never)).map((slot) => (
                      <div key={`${slot.id}-${day}`} style={getSlotPosition(slot.start_time, slot.duration_mins)} className="group absolute bottom-1 top-1 flex items-center justify-between truncate rounded bg-gradient-to-r from-primary to-primary/70 px-2 text-[10px] font-semibold text-primary-foreground" title={`${slot.name} (${slot.start_time} · ${slot.duration_mins} mins)`}>
                        <span className="truncate">{slot.name}</span>
                        {onDelete && <Button aria-label={`Delete ${slot.name}`} variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); onDelete(slot.id) }}><X /></Button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export default memo(ScheduleTimeline)
