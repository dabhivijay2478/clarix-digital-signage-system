'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

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
  gateFilters?: string[] | null
  loadRemoteSnapshot?: boolean
  /** Override the loading ↔ waiting rotation interval (seconds). */
  displayRotationSecs?: number
  /** Show a back control before the stats row (player screen selection). */
  showBackButton?: boolean
  onBack?: () => void
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

function DisplayPlate({ text }: { text: string }) {
  return (
    <p className="mg-truck-plate">
      {text}
    </p>
  )
}

function DisplayStatus({
  text,
  color,
}: {
  text: string
  color: string
}) {
  return (
    <span
      className="mg-truck-status"
      style={{ color }}
    >
      {text}
    </span>
  )
}

function DisplayTime({ text }: { text: string }) {
  return (
    <span className="mg-truck-time">
      {text}
    </span>
  )
}

const MAX_QUEUE_ROWS = 4
const PER_GATE_ROWS = 2

function buildBalancedQueueRows(source: Truck[], gates: string[], maxRows = MAX_QUEUE_ROWS): Truck[] {
  if (gates.length === 0) {
    return source.slice(0, maxRows)
  }

  const perGate = Math.min(PER_GATE_ROWS, Math.max(1, Math.floor(maxRows / gates.length)))

  return gates
    .flatMap((gate) => {
      const normalizedGate = gate.toLowerCase()
      return source
        .filter((truck) => (truck.gate_no ?? '').toLowerCase() === normalizedGate)
        .slice(0, perGate)
    })
    .slice(0, maxRows)
}

/** Short board labels so large type fits column widths on 4K. */
function boardStatusLabel(statusLabel: string): string {
  switch (statusLabel) {
    case 'Waiting':
      return 'WAITING'
    case 'Loading in.':
      return 'LOADING'
    case 'Loading Out.':
      return 'OUT'
    default:
      return statusLabel.toUpperCase()
  }
}

function DisplayStatCard({
  line1,
  line2Prefix,
  value,
  color,
}: {
  line1: string
  line2Prefix: string
  value: number | string
  color: StatColor
}) {
  return (
    <div
      className="mg-truck-stat"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'visible' }}
    >
      <p className="mg-truck-stat-title" style={{ margin: 0, lineHeight: 1.05, textAlign: 'center' }}>
        {line1}
      </p>
      <p
        className="mg-truck-stat-value-line"
        style={{ margin: '4px 0 0', display: 'flex', alignItems: 'baseline', justifyContent: 'center', lineHeight: 1, overflow: 'visible' }}
      >
        <span className="mg-truck-stat-suffix">{line2Prefix}:</span>
        <span className="mg-truck-stat-num" style={{ color: STAT_VALUE_COLORS[color] }}>
          {value}
        </span>
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

function getEstWaitLabel(
  truck: Truck,
  displayTrucks: Truck[],
  gateSettings: GateQueueSettings[],
): string {
  if (!truck.waiting_at) return '-'
  const baseTime = new Date(truck.waiting_at)
  if (Number.isNaN(baseTime.getTime())) return '-'
  const cyclesWaitMins = getEstimatedWaitMinsForTruck(displayTrucks, truck, gateSettings)
  const defaultMins = getGateLoadingDurationMins(truck.gate_no, gateSettings)
  const totalWaitMins = cyclesWaitMins + defaultMins
  const expectedTime = new Date(baseTime.getTime() + totalWaitMins * 60000)
  return formatTimeOfDay(expectedTime.toISOString())
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

function useRotatingQueueMode(
  hasLoading: boolean,
  hasWaiting: boolean,
  intervalMs: number,
): QueueMode {
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
    }, intervalMs)

    return () => clearInterval(interval)
  }, [hasLoading, hasWaiting, intervalMs])

  return mode
}

export default function TruckTokenDisplay({
  trucks,
  className,
  title = 'Truck Token Alert',
  showHeader = false,
  gateSettings,
  gateFilter,
  gateFilters,
  loadRemoteSnapshot = true,
  displayRotationSecs: displayRotationSecsProp,
  showBackButton = false,
  onBack,
}: TruckTokenDisplayProps) {
  const gates = useGateStore((state) => state.gates)
  const storedRotationSecs = useGateStore((state) => state.displayRotationSecs)
  const rotationMs = (displayRotationSecsProp ?? storedRotationSecs) * 1000
  const [remoteTrucks, setRemoteTrucks] = useState<Truck[]>([])
  const [hasLoadedRemoteTrucks, setHasLoadedRemoteTrucks] = useState(false)
  const [dispatchSummary, setDispatchSummary] = useState<TruckDispatchSummary | null>(null)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const normalizedGateFilters = useMemo(() => {
    const fromList = (gateFilters ?? [])
      .map((gate) => gate.trim().toLowerCase())
      .filter(Boolean)
    if (fromList.length > 0) return [...new Set(fromList)]
    const single = gateFilter?.trim().toLowerCase()
    return single ? [single] : null
  }, [gateFilter, gateFilters])
  const sourceTrucks = useMemo(() => {
    if (!loadRemoteSnapshot) return trucks
    if (hasLoadedRemoteTrucks) {
      return remoteTrucks.length > 0 ? remoteTrucks : trucks
    }
    return trucks
  }, [loadRemoteSnapshot, hasLoadedRemoteTrucks, remoteTrucks, trucks])

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
    () => normalizedGateFilters
      ? sourceTrucks.filter((truck) => normalizedGateFilters.includes((truck.gate_no ?? '').toLowerCase()))
      : sourceTrucks,
    [sourceTrucks, normalizedGateFilters],
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
    if (normalizedGateFilters?.length) {
      return normalizedGateFilters.map((gate) => gate.toLowerCase())
    }
    const configured = (gateSettings ?? gates ?? []).map((gate) => gate?.number).filter(Boolean)
    const discovered = displayTrucks
      .map((truck) => (truck?.gate_no ?? '').toLowerCase())
      .filter(Boolean)
    return [...new Set([...configured, ...discovered].map((gate) => gate.toLowerCase()))]
  }, [gateSettings, gates, displayTrucks, normalizedGateFilters])

  const resolvedGateSettings = useMemo<GateQueueSettings[]>(
    () => gateSettings ?? (gates ?? []).map((gate) => ({
      number: gate?.number || '',
      loadingDurationMins: gate?.loadingDurationMins ?? 30,
    })),
    [gateSettings, gates],
  )

  const queueRows = useMemo(() => ({
    loading: buildBalancedQueueRows(loadingTrucks, gateNumbers),
    waiting: buildBalancedQueueRows(waitingTrucks, gateNumbers),
  }), [gateNumbers, loadingTrucks, waitingTrucks])

  const mode = useRotatingQueueMode(
    queueRows.loading.length > 0,
    queueRows.waiting.length > 0,
    rotationMs,
  )
  const rows = queueRows[mode]

  const displaySlots = useMemo(() => {
    const slots: Array<Truck | null> = rows.slice(0, MAX_QUEUE_ROWS).map((truck) => truck)
    while (slots.length < MAX_QUEUE_ROWS) {
      slots.push(null)
    }
    return slots
  }, [rows])

  const statItems: Array<{ line1: string; line2Prefix: string; value: number | string; color: StatColor }> = [
    { line1: 'Total in', line2Prefix: 'trucks', value: activeTrucks.length, color: 'primary' },
    { line1: 'Waiting', line2Prefix: 'trucks', value: waitingTrucks.length, color: 'amber' },
    { line1: 'Loading', line2Prefix: 'trucks', value: loadingTrucks.length, color: 'blue' },
    { line1: 'Dispatched', line2Prefix: 'trucks', value: dispatchSummary?.today ?? 0, color: 'green' },
    { line1: 'This Month', line2Prefix: 'trucks', value: dispatchSummary?.this_month ?? 0, color: 'rose' },
  ]

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
        padding: 0,
        boxSizing: 'border-box',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TRUCK_DISPLAY_CRITICAL_CSS }} />

      <div className="mg-truck-layout">
      
        <div className="mg-truck-top-row">
          {showBackButton && onBack ? (
            <>
              <button
                type="button"
                className="mg-truck-back-btn"
                onClick={onBack}
                aria-label="Back to screen selection"
                title="Change screen"
              >
                ←
              </button>
              <span className="mg-truck-stat-divider mg-truck-back-divider" aria-hidden="true" />
            </>
          ) : null}
          <div className="mg-truck-stats">
            {statItems.map((item, index) => (
              <Fragment key={item.line1}>
                {index > 0 && <span className="mg-truck-stat-divider" aria-hidden="true" />}
                <div className="mg-truck-stat-cell">
                  <DisplayStatCard
                    line1={item.line1}
                    line2Prefix={item.line2Prefix}
                    value={item.value}
                    color={item.color}
                  />
                </div>
              </Fragment>
            ))}

            {currentTime && (
              <>
                <span className="mg-truck-clock-divider" aria-hidden="true" />
                <div className="mg-truck-clock-cell">
                  <div className="mg-truck-clock-wrap">
                    <span className="mg-truck-clock-time">
                      {currentTime.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mg-truck-branding">
            <Image
              src="/company-logo/AMNS_Logo_Mid.png"
              alt="AMNS India logo"
              width={250}
              height={105}
              style={{ display: 'block', height: '100%', width: 'auto', objectFit: 'contain' }}
            />
          </div>
        </div>

        <div className="mg-truck-panel">
          <div className="mg-truck-table-wrap">
            <div className={`mg-truck-grid${mode === 'waiting' ? ' mg-truck-grid--waiting' : ''}`}>
              <div className="mg-truck-grid-head">
                <div className="mg-truck-col-gate mg-truck-col-label">Gate</div>
                <div className="mg-truck-col-plate mg-truck-col-label">Truck Number</div>
                <div className="mg-truck-col-status mg-truck-col-label">Status</div>
                {mode === 'waiting' && (
                  <div className="mg-truck-col-est mg-truck-col-label">Est. Wait</div>
                )}
              </div>

              <div className="mg-truck-grid-body">
                {rows.length === 0 && (
                  <div className="mg-truck-empty">
                    <p className="mg-truck-empty-title">
                      {mode === 'loading' ? 'No loading trucks' : 'No waiting trucks'}
                    </p>
                    <p className="mg-truck-empty-sub">Queue updates will appear here automatically.</p>
                  </div>
                )}
                {displaySlots.map((truck, slotIndex) => {
                  if (!truck) {
                    return (
                      <div
                        key={`${mode}-placeholder-${slotIndex}`}
                        className="mg-truck-grid-row mg-truck-grid-row--placeholder"
                        aria-hidden="true"
                      />
                    )
                  }

                  const statusLabel = getTruckStatusInfo(truck).status_label
                  return (
                    <div
                      key={`${mode}-${truck.id}`}
                      className="mg-truck-grid-row"
                    >
                        <div className="mg-truck-col-gate">
                          <span
                            className="mg-truck-gate"
                            style={{ color: getGateStyle(truck.gate_no).color }}
                          >
                            {(truck.gate_no || '-').toUpperCase()}
                          </span>
                        </div>
                        <div className="mg-truck-col-plate">
                          <DisplayPlate
                            text={truck.registration_number.toUpperCase()}
                          />
                        </div>
                        <div className="mg-truck-col-status">
                          <DisplayStatus
                            text={boardStatusLabel(statusLabel)}
                            color={getStatusStyle(statusLabel).color ?? '#4b5563'}
                          />
                        </div>
                        {mode === 'waiting' && (
                          <div className="mg-truck-col-est">
                            <DisplayTime
                              text={getEstWaitLabel(truck, displayTrucks, resolvedGateSettings)}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
