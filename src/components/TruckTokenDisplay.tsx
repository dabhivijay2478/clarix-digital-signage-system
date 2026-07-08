'use client'

import { useEffect, useMemo, useState } from 'react'

import { getTruckStatusInfo } from '@/lib/truck-alerts'
import {
  getEstimatedWaitMinsForTruck,
  getGateLoadingDurationMins,
} from '@/lib/truck-queue'
import { truckAlertsApi, trucksApi } from '@/lib/tauri'
import type { GateQueueSettings, Truck, TruckDispatchSummary } from '@/lib/types'
import { useGateStore } from '@/store/gateStore'
import { TRUCK_DISPLAY_CRITICAL_CSS } from './truck-display-critical-styles'

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

type StatColor = 'primary' | 'blue' | 'violet' | 'green' | 'amber' | 'rose'

const STAT_VALUE_COLORS: Record<StatColor, string> = {
  primary: '#059669',
  blue: '#2563eb',
  violet: '#7c3aed',
  green: '#16a34a',
  amber: '#d97706',
  rose: '#e11d48',
}

function DisplayStatCard({
  value,
  label,
  color,
}: {
  value: number | string
  label: string
  color: StatColor
}) {
  return (
    <div className="mg-truck-stat">
      <p className="mg-truck-stat-line">
        <span className="mg-truck-stat-num" style={{ color: STAT_VALUE_COLORS[color] }}>{value}</span>
        <span className="mg-truck-stat-sep">:</span>
        <span className="mg-truck-stat-label">{label}</span>
      </p>
    </div>
  )
}

const GATE_PALETTE = [
  { border: '#10b981', bg: '#ecfdf5', text: '#047857' },
  { border: '#06b6d4', bg: '#ecfeff', text: '#0e7490' },
  { border: '#6366f1', bg: '#eef2ff', text: '#4338ca' },
  { border: '#d946ef', bg: '#fdf4ff', text: '#a21caf' },
  { border: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
  { border: '#f43f5e', bg: '#fff1f2', text: '#be123c' },
  { border: '#0ea5e9', bg: '#f0f9ff', text: '#0369a1' },
  { border: '#f97316', bg: '#fff7ed', text: '#c2410c' },
]

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

function getStatusStyle(statusLabel: string): React.CSSProperties {
  switch (statusLabel) {
    case 'Loading Out.':
      return { borderColor: '#10b981', background: '#ecfdf5', color: '#047857' }
    case 'Loading in.':
      return { borderColor: '#06b6d4', background: '#ecfeff', color: '#0e7490' }
    case 'Waiting':
      return { borderColor: '#f59e0b', background: '#fffbeb', color: '#b45309' }
    default:
      return { borderColor: '#d1d5db', background: '#f9fafb', color: '#4b5563' }
  }
}

function getGateStyle(gateNo: string | null | undefined): React.CSSProperties {
  if (!gateNo) {
    return { borderColor: '#9ca3af', background: '#f3f4f6', color: '#4b5563' }
  }

  const cleanGate = gateNo.trim().toUpperCase()
  let hash = 0
  for (let i = 0; i < cleanGate.length; i++) {
    hash = cleanGate.charCodeAt(i) + ((hash << 5) - hash)
  }

  const palette = GATE_PALETTE[Math.abs(hash) % GATE_PALETTE.length]
  return { borderColor: palette.border, background: palette.bg, color: palette.text }
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

export default function TruckTokenDisplay({
  trucks,
  className,
  title = 'Truck Token Alert',
  showHeader = false,
  gateSettings,
  gateFilter,
  loadRemoteSnapshot = true,
}: TruckTokenDisplayProps) {
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
          truckAlertsApi.getDispatchSummary(),
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
    [sourceTrucks, normalizedGateFilter],
  )
  const activeTrucks = useMemo(() => displayTrucks.filter((truck) => !truck.is_out), [displayTrucks])
  const loadingTrucks = useMemo(
    () => activeTrucks.filter((truck) => truck.is_loading || truck.is_in),
    [activeTrucks],
  )
  const waitingTrucks = useMemo(
    () => activeTrucks.filter((truck) => truck.is_waiting && !truck.is_loading && !truck.is_in),
    [activeTrucks],
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
    [gateSettings, gates],
  )

  const queueRows = useMemo(() => {
    const buildRows = (source: Truck[]) => gateNumbers.flatMap((gate) =>
      source
        .filter((truck) => (truck.gate_no ?? '').toLowerCase() === gate)
        .slice(0, 2),
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
      className={`mg-truck-root ${className ?? ''}`.trim()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#f4f6f8',
        color: '#111827',
        padding: 28,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TRUCK_DISPLAY_CRITICAL_CSS }} />

      <div
        className="mg-truck-layout"
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
        <div className="mg-truck-topbar">
          {showHeader && (
            <div>
              <p className="mg-truck-title-sub">{title}</p>
              <h1 className="mg-truck-title-main">Live Gate Queue</h1>
            </div>
          )}

          {currentTime && (
            <div className="mg-truck-clock-wrap" style={{ marginLeft: 'auto' }}>
              <span className="mg-truck-clock-date">
                {currentTime.toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="mg-truck-clock-divider" />
              <span className="mg-truck-clock-time">
                {currentTime.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </span>
            </div>
          )}
        </div>

        <div className="mg-truck-stats">
          <DisplayStatCard value={activeTrucks.length} label="Total" color="primary" />
          <DisplayStatCard value={waitingTrucks.length} label="Waiting" color="amber" />
          <DisplayStatCard value={loadingTrucks.length} label="Loading" color="blue" />
          <DisplayStatCard value={dispatchSummary?.today ?? 0} label="Dispatched" color="green" />
          <DisplayStatCard value={dispatchSummary?.this_month ?? 0} label="This Month" color="rose" />
        </div>

        <div className="mg-truck-panel">
          <div className="mg-truck-table-wrap">
            <table className="mg-truck-table">
              <thead>
                <tr>
                  <th className="col-gate">Gate</th>
                  <th className="col-plate">Truck Number / License Plate</th>
                  <th className="col-status">Status</th>
                  {mode === 'waiting' && (
                    <th className="col-est">Est. Wait</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={mode === 'waiting' ? 4 : 3}>
                      <div className="mg-truck-empty">
                        <p className="mg-truck-empty-title">
                          {mode === 'loading' ? 'No loading trucks' : 'No waiting trucks'}
                        </p>
                        <p className="mg-truck-empty-sub">Queue updates will appear here automatically.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((truck) => {
                    const statusLabel = getTruckStatusInfo(truck).status_label
                    return (
                      <tr key={`${mode}-${truck.id}`}>
                        <td className="col-gate">
                          <span className="mg-truck-gate" style={{ color: getGateStyle(truck.gate_no).color }}>
                            {(truck.gate_no || '-').toUpperCase()}
                          </span>
                        </td>
                        <td className="col-plate text-8xl">
                          <p className="mg-truck-plate">
                            {truck.registration_number.toUpperCase()}
                          </p>
                        </td>
                        <td className="col-status">
                          <span className="mg-truck-status" style={{ color: getStatusStyle(statusLabel).color }}>
                            {statusLabel}
                          </span>
                        </td>
                        {mode === 'waiting' && (
                          <td className="col-est">
                            <span className="mg-truck-time">
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
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
