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
  getEstimatedWaitMinsForTruck,
  getGateLoadingDurationMins,
} from '@/lib/truck-queue'
import { truckAlertsApi, trucksApi } from '@/lib/tauri'
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
  gateFilter?: string | null
  loadRemoteSnapshot?: boolean
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

function formatTimeOfDay(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return '-'
    let hours = d.getHours()
    const minutes = d.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12
    const minStr = minutes.toString().padStart(2, '0')
    return `${hours}:${minStr} ${ampm}`
  } catch {
    return '-'
  }
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

function getGateColorClass(gateNo: string | null | undefined): string {
  if (!gateNo) {
    return 'border-zinc-400/25 bg-zinc-400/10 text-zinc-300'
  }
  const cleanGate = gateNo.trim().toUpperCase()
  
  let hash = 0
  for (let i = 0; i < cleanGate.length; i++) {
    hash = cleanGate.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const colors = [
    'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
    'border-indigo-400/25 bg-indigo-400/10 text-indigo-200',
    'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200',
    'border-amber-400/25 bg-amber-400/10 text-amber-200',
    'border-rose-400/25 bg-rose-400/10 text-rose-200',
    'border-sky-400/25 bg-sky-400/10 text-sky-200',
    'border-orange-400/25 bg-orange-400/10 text-orange-200',
  ]
  
  const index = Math.abs(hash) % colors.length
  return colors[index]
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

export default function TruckTokenDisplay({ trucks, className, title = 'Truck Token Alert', showHeader = false, gateSettings, gateFilter, loadRemoteSnapshot = true }: TruckTokenDisplayProps) {
  const gates = useGateStore((state) => state.gates)
  const [remoteTrucks, setRemoteTrucks] = useState<Truck[]>([])
  const [hasLoadedRemoteTrucks, setHasLoadedRemoteTrucks] = useState(false)
  const [dispatchSummary, setDispatchSummary] = useState<TruckDispatchSummary | null>(null)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const normalizedGateFilter = gateFilter?.trim().toLowerCase() || null
  const sourceTrucks = loadRemoteSnapshot && hasLoadedRemoteTrucks ? remoteTrucks : trucks

  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let disposed = false

    const refreshData = async () => {
      try {
        const [activeTrucks, summary] = await Promise.all([
          loadRemoteSnapshot ? trucksApi.getActive() : Promise.resolve(null),
          truckAlertsApi.getDispatchSummary()
        ])

        if (!disposed) {
          if (summary) {
            setDispatchSummary(summary)
          }
          if (loadRemoteSnapshot && activeTrucks) {
            setRemoteTrucks(activeTrucks)
            setHasLoadedRemoteTrucks(true)
          }
        }
      } catch (error) {
        console.warn('Failed to refresh live truck data:', error)
      }
    }

    void refreshData()
    const interval = setInterval(() => {
      void refreshData()
    }, 3000)

    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [loadRemoteSnapshot])

  const displayTrucks = useMemo(
    () => normalizedGateFilter
      ? sourceTrucks.filter((truck) => (truck.gate_no ?? '').toLowerCase() === normalizedGateFilter)
      : sourceTrucks,
    [sourceTrucks, normalizedGateFilter]
  )
  const activeTrucks = useMemo(() => displayTrucks.filter((truck) => !truck.is_out), [displayTrucks])
  const loadingTrucks = useMemo(
    () => activeTrucks.filter((truck) => truck.is_loading || truck.is_in),
    [activeTrucks]
  )
  const waitingTrucks = useMemo(
    () => activeTrucks.filter((truck) => truck.is_waiting && !truck.is_loading && !truck.is_in),
    [activeTrucks]
  )

  const gateNumbers = useMemo(() => {
    const configured = (gateSettings ?? gates ?? []).map((gate) => gate?.number).filter(Boolean)
    const discovered = displayTrucks
      .map((truck) => (truck?.gate_no ?? '').toLowerCase())
      .filter(Boolean)
    const allGates = [...new Set([...configured, ...discovered])]
    return normalizedGateFilter ? [normalizedGateFilter] : allGates
  }, [gateSettings, gates, displayTrucks, normalizedGateFilter])

  const resolvedGateSettings = useMemo<GateQueueSettings[]>(
    () => gateSettings ?? (gates ?? []).map((gate) => ({
      number: gate?.number || '',
      loadingDurationMins: gate?.loadingDurationMins ?? 30,
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

        {currentTime && (
          <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-950/20 px-6 py-3 text-white/80 shadow-inner">
            <div className="flex items-center gap-3">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Live Monitoring Active</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-mono text-sm font-bold tracking-widest text-white/45 uppercase">
                {currentTime.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="h-4 w-px bg-white/10" />
              <span className="font-mono text-2xl font-black tracking-widest text-emerald-400">
                {currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 shadow-2xl shadow-black/20">
          <div className={cn(
            "grid border-b border-white/10 bg-white/[0.03] px-6 py-4 text-xs font-black uppercase tracking-[0.24em] text-white/35",
            mode === 'loading'
              ? 'grid-cols-[110px_minmax(220px,1fr)_170px]'
              : 'grid-cols-[110px_minmax(220px,1fr)_170px_150px_170px]'
          )}>
            <span>Gate</span>
            <span>Truck Number</span>
            <span>Status</span>
            {mode === 'waiting' && (
              <>
                <span>Waited</span>
                <span>Est. Wait</span>
              </>
            )}
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
              {rows.map((truck) => {
                const statusLabel = getTruckStatusInfo(truck).status_label
                return (
                  <div
                    key={`${mode}-${truck.id}`}
                    className={cn(
                      "grid items-center px-6 py-5",
                      mode === 'loading'
                        ? 'grid-cols-[110px_minmax(220px,1fr)_170px]'
                        : 'grid-cols-[110px_minmax(220px,1fr)_170px_150px_170px]'
                    )}
                  >
                    <span className={cn("inline-flex w-fit rounded-full border px-4 py-1.5 text-lg font-black uppercase", getGateColorClass(truck.gate_no))}>
                      {(truck.gate_no || '-').toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-3xl font-black tracking-tight text-white">
                        {truck.registration_number.toUpperCase()}
                      </p>
                    </div>
                    <span className={cn('w-fit rounded-full border px-4 py-2 text-sm font-black uppercase tracking-wider', statusClass(statusLabel))}>
                      {statusLabel}
                    </span>
                    {mode === 'waiting' && (
                      <>
                        <span className="font-mono text-2xl font-black text-white/70">
                          {formatTimeOfDay(truck.waiting_at)}
                        </span>
                        <span className="font-mono text-2xl font-black text-white/70">
                          {(() => {
                            if (!truck.waiting_at) return '-'
                            const baseTime = new Date(truck.waiting_at)
                            if (Number.isNaN(baseTime.getTime())) return '-'
                            const cyclesWaitMins = getEstimatedWaitMinsForTruck(displayTrucks, truck, resolvedGateSettings)
                            const defaultMins = getGateLoadingDurationMins(truck.gate_no, resolvedGateSettings)
                            const totalWaitMins = cyclesWaitMins + defaultMins
                            const expectedTime = new Date(baseTime.getTime() + totalWaitMins * 60000)
                            return formatTimeOfDay(expectedTime.toISOString())
                          })()}
                        </span>
                      </>
                    )}
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
