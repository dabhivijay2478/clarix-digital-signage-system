'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { clockApi } from '@/lib/tauri'
import { APP_TIME_ZONE, getValidTimeZone } from '@/lib/signage-schedule'

const TICK_INTERVAL_MS = 1000
const RESYNC_INTERVAL_MS = 30000

export interface ControllerClockState {
  now: Date
  timeZone: string
  isSynced: boolean
  lastSyncedAt: Date | null
  syncError: string | null
  syncNow: () => Promise<void>
}

export function useControllerClock(): ControllerClockState {
  const offsetMsRef = useRef(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [timeZone, setTimeZone] = useState(APP_TIME_ZONE)
  const [isSynced, setIsSynced] = useState(false)
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const getControllerNowMs = useCallback(() => Date.now() + offsetMsRef.current, [])

  const syncNow = useCallback(async () => {
    const requestStartedAt = Date.now()

    try {
      const controllerTime = await clockApi.getControllerTime()
      const responseReceivedAt = Date.now()
      const requestMidpoint = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2

      offsetMsRef.current = controllerTime.server_time_ms - requestMidpoint
      setTimeZone(getValidTimeZone(controllerTime.server_time_zone))
      setNowMs(getControllerNowMs())
      setIsSynced(true)
      setLastSyncedAtMs(responseReceivedAt)
      setSyncError(null)
    } catch (error) {
      setNowMs(getControllerNowMs())
      setIsSynced(false)
      setSyncError(error instanceof Error ? error.message : String(error))
    }
  }, [getControllerNowMs])

  useEffect(() => {
    void syncNow()

    const tickTimer = window.setInterval(() => {
      setNowMs(getControllerNowMs())
    }, TICK_INTERVAL_MS)

    const syncTimer = window.setInterval(() => {
      void syncNow()
    }, RESYNC_INTERVAL_MS)

    const handleReconnect = () => {
      void syncNow()
    }

    window.addEventListener('focus', handleReconnect)
    window.addEventListener('online', handleReconnect)

    return () => {
      window.clearInterval(tickTimer)
      window.clearInterval(syncTimer)
      window.removeEventListener('focus', handleReconnect)
      window.removeEventListener('online', handleReconnect)
    }
  }, [getControllerNowMs, syncNow])

  return useMemo(() => ({
    now: new Date(nowMs),
    timeZone,
    isSynced,
    lastSyncedAt: lastSyncedAtMs === null ? null : new Date(lastSyncedAtMs),
    syncError,
    syncNow,
  }), [isSynced, lastSyncedAtMs, nowMs, syncError, syncNow, timeZone])
}
