'use client'

import { useMemo, useState } from 'react'
import { Archive, Search, Trash2 } from 'lucide-react'
import { TruckQueueTable } from '@/components/TruckQueueTable'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTruckStore } from '@/store/trucks'

export default function HistoryPage() {
  const trucks = useTruckStore((state) => state.trucks)
  const clearCompleted = useTruckStore((state) => state.clearCompleted)
  const [query, setQuery] = useState('')
  const completed = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return trucks
      .filter((truck) => truck.status === 'completed')
      .filter((truck) => !normalized || [truck.truckNumber, truck.driverName, truck.loadType, truck.notes].some((value) => value.toLowerCase().includes(normalized)))
      .sort((a, b) => (b.outAt ?? '').localeCompare(a.outAt ?? ''))
  }, [query, trucks])

  return (
    <div className="space-y-7">
      <div>
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><Archive />Completed trips</Badge>
        <h1 className="page-title">Truck history</h1>
        <p className="page-subtitle">Search the completed movement register across previous days.</p>
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b border-border/50 lg:flex lg:flex-row lg:items-center lg:justify-between">
          <div><CardTitle>Exit register</CardTitle><p className="mt-1 text-sm text-muted-foreground">{completed.length} completed trips</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search completed trucks..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" disabled={!completed.length}><Trash2 />Clear history</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Clear completed truck history?</AlertDialogTitle><AlertDialogDescription>All completed trip records will be permanently removed. Active trucks will not be affected.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={clearCompleted}>Clear history</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent><TruckQueueTable trucks={completed} allowRemove={false} emptyMessage="No completed trips found." /></CardContent>
      </Card>
    </div>
  )
}
