'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Timer,
  Truck as TruckIcon,
} from 'lucide-react'

import { getTruckStatusInfo } from '@/lib/truck-alerts'
import {
  formatQueueDuration,
  getEstimatedWaitMinsForTruck,
} from '@/lib/truck-queue'
import { truckAlertsApi } from '@/lib/tauri'
import type { GateQueueSettings, Truck, TruckDispatchSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useGateStore } from '@/store/gateStore'

type QueueMode = 'loading' | 'waiting'

interface TruckTokenDisplayProps {
  trucks: Truck[]
  className?: string
  title?: string
  showHeader?: boolean
  gateSettings?: GateQueueSettings[]
}

function DisplayStatCard({
  icon: Icon,
  value,
  label,
  sublabel,
  color,
}: {
  icon: React.ElementType
  value: number | string
  label: string
  sublabel: string
  color: 'primary' | 'blue' | 'violet' | 'green' | 'amber' | 'rose'
}) {
  const colorMap: Record<typeof color, string> = {
    primary: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
  }

  return (
    <div className="flex min-w-0 items-center gap-4 rounded-xl border border-white/10 bg-zinc-950/60 px-5 py-4 shadow-2xl shadow-black/20">
      <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl font-black', colorMap[color])}>
        {value}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-black leading-tight text-white">{label}</p>
        <p className="truncate text-sm font-medium text-white/45">{sublabel}</p>
      </div>
      <Icon className="size-7 shrink-0 text-white/25" />
    </div>
  )
}

function formatElapsed(from: string | null): string {
  if (!from) return '-'
  const ms = Date.now() - new Date(from).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`
}

function statusClass(statusLabel: string): string {
  switch (statusLabel) {
    case 'Loading Out.':
      return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200'
    case 'Loading in.':
      return 'border-cyan-400/30 bg-cyan-400/15 text-cyan-200'
    case 'Waiting':
      return 'border-amber-400/30 bg-amber-400/15 text-amber-200'
    default:
      return 'border-white/10 bg-white/5 text-white/60'
  }
}

function useRotatingQueueMode(hasLoading: boolean, hasWaiting: boolean): QueueMode {
  const [mode, setMode] = useState<QueueMode>('loading')

  useEffect(() => {
    if (!hasLoading && hasWaiting) {
      setMode('waiting')
      return
    }
    if (hasLoading && !hasWaiting) {
      setMode('loading')
      return
    }
    if (!hasLoading && !hasWaiting) return

    const interval = setInterval(() => {
      setMode((current) => (current === 'loading' ? 'waiting' : 'loading'))
    }, 8000)

    return () => clearInterval(interval)
  }, [hasLoading, hasWaiting])

  return mode
}

export default function TruckTokenDisplay({ trucks, className, title = 'Truck Token Alert', showHeader = true, gateSettings }: TruckTokenDisplayProps) {
  const gates = useGateStore((state) => state.gates)
  const [dispatchSummary, setDispatchSummary] = useState<TruckDispatchSummary | null>(null)

  useEffect(() => {
    truckAlertsApi.getDispatchSummary()
      .then(setDispatchSummary)
      .catch((error) => console.warn('Failed to load truck dispatch summary:', error))
  }, [])

  const activeTrucks = useMemo(() => trucks.filter((truck) => !truck.is_out), [trucks])
  const loadingTrucks = useMemo(
    () => activeTrucks.filter((truck) => truck.is_loading || truck.is_in),
    [activeTrucks]
  )
  const waitingTrucks = useMemo(
    () => activeTrucks.filter((truck) => truck.is_waiting && !truck.is_loading && !truck.is_in),
    [activeTrucks]
  )

  const gateNumbers = useMemo(() => {
    const configured = (gateSettings ?? gates).map((gate) => gate.number)
    const discovered = trucks
      .map((truck) => (truck.gate_no ?? '').toLowerCase())
      .filter(Boolean)
    return [...new Set([...configured, ...discovered])]
  }, [gateSettings, gates, trucks])

  const resolvedGateSettings = useMemo<GateQueueSettings[]>(
    () => gateSettings ?? gates.map((gate) => ({
      number: gate.number,
      loadingDurationMins: gate.loadingDurationMins,
    })),
    [gateSettings, gates]
  )

  const queueRows = useMemo(() => {
    const buildRows = (source: Truck[]) => gateNumbers.flatMap((gate) =>
      source
        .filter((truck) => (truck.gate_no ?? '').toLowerCase() === gate)
        .slice(0, 2)
    )

    return {
      loading: buildRows(loadingTrucks),
      waiting: buildRows(waitingTrucks),
    }
  }, [gateNumbers, loadingTrucks, waitingTrucks])

  const mode = useRotatingQueueMode(queueRows.loading.length > 0, queueRows.waiting.length > 0)
  const rows = queueRows[mode]

  return (
    <div
      className={cn('fixed inset-0 overflow-hidden bg-black p-6 text-white select-none', className)}
      style={{
        backgroundImage: 'radial-gradient(circle at center, #0B0F19 0%, #030406 100%)',
      }}
    >
      <div className="flex h-full min-h-0 flex-col gap-6">
        {showHeader && (
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-emerald-300/70">{title}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Live Gate Queue</h1>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-bold uppercase tracking-[0.2em] text-white/60">
              {mode === 'loading' ? 'Loading Now' : 'Waiting Queue'}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <DisplayStatCard icon={TruckIcon} value={activeTrucks.length} label="Total" sublabel="Active trucks" color="primary" />
          <DisplayStatCard icon={Timer} value={waitingTrucks.length} label="Waiting" sublabel="In queue" color="amber" />
          <DisplayStatCard icon={Activity} value={loadingTrucks.length} label="Loading" sublabel="In progress" color="blue" />
          <DisplayStatCard icon={CheckCircle2} value={dispatchSummary?.today ?? 0} label="Dispatched" sublabel="Today" color="green" />
          <DisplayStatCard icon={CalendarDays} value={dispatchSummary?.this_month ?? 0} label="This Month" sublabel="Month total" color="rose" />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 shadow-2xl shadow-black/20">
          <div className="grid grid-cols-[110px_minmax(220px,1fr)_170px_150px_170px] border-b border-white/10 bg-white/[0.03] px-6 py-4 text-xs font-black uppercase tracking-[0.24em] text-white/35">
            <span>Gate</span>
            <span>Truck Number</span>
            <span>Status</span>
            <span>Waited</span>
            <span>Est. Wait</span>
          </div>

          {rows.length === 0 ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <p className="text-4xl font-black text-white/20">
                {mode === 'loading' ? 'No loading trucks' : 'No waiting trucks'}
              </p>
              <p className="mt-3 text-lg font-medium text-white/35">Queue updates will appear here automatically.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {rows.map((truck, index) => {
                const statusLabel = getTruckStatusInfo(truck).status_label
                return (
                  <div
                    key={`${mode}-${truck.id}`}
                    className="grid grid-cols-[110px_minmax(220px,1fr)_170px_150px_170px] items-center px-6 py-6"
                  >
                    <span className="inline-flex w-fit rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-lg font-black uppercase text-emerald-200">
                      {(truck.gate_no || '-').toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-4xl font-black tracking-tight text-white">
                        {truck.registration_number.toUpperCase()}
                      </p>
                      <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-white/30">
                        #{index + 1} of visible {mode}
                      </p>
                    </div>
                    <span className={cn('w-fit rounded-full border px-4 py-2 text-sm font-black uppercase tracking-wider', statusClass(statusLabel))}>
                      {statusLabel}
                    </span>
                    <span className="font-mono text-2xl font-black text-white/70">
                      {formatElapsed(truck.waiting_at)}
                    </span>
                    <span className="font-mono text-2xl font-black text-white/70">
                      {mode === 'loading'
                        ? 'Now'
                        : formatQueueDuration(getEstimatedWaitMinsForTruck(trucks, truck, resolvedGateSettings))}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
