'use client'

import type { Truck } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type TruckLike = Partial<Truck> & {
  id: string
  truckNumber?: string
  driverName?: string
  loadType?: string
  notes?: string
  status?: string
  outAt?: string | null
}

interface TruckQueueTableProps {
  trucks: TruckLike[]
  allowRemove?: boolean
  emptyMessage?: string
}

function getTruckNumber(truck: TruckLike): string {
  return truck.truckNumber || truck.registration_number || 'Unknown truck'
}

function getGate(truck: TruckLike): string {
  return truck.gate_no || truck.loadType || '-'
}

function getStatus(truck: TruckLike): string {
  if (truck.status) return truck.status
  if (truck.is_out) return 'completed'
  if (truck.is_loading || truck.is_in) return 'loading'
  if (truck.is_waiting) return 'waiting'
  return 'registered'
}

function formatDate(value?: string | null): string {
  return formatDateTime(value)
}

export function TruckQueueTable({ trucks, emptyMessage = 'No trucks found.' }: TruckQueueTableProps) {
  if (trucks.length === 0) {
    return <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Truck Number</TableHead>
            <TableHead>Gate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Completed At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trucks.map((truck) => (
            <TableRow key={truck.id}>
              <TableCell className="font-mono font-semibold">{getTruckNumber(truck)}</TableCell>
              <TableCell>{getGate(truck)}</TableCell>
              <TableCell><Badge variant="outline" className="capitalize">{getStatus(truck)}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{formatDate(truck.outAt || truck.out_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
