'use client'

import { screensApi } from './tauri'
import type { Screen } from './types'
import { serializeScreenGates } from './screen-gates'
import { useGateStore, type Gate } from '@/store/gateStore'

/**
 * Assign a screen to one or more gates and persist the gate list on the screen record.
 */
export async function assignScreenToGates(
  screen: Screen,
  gateNumbers: string[],
): Promise<void> {
  const serializedGate = serializeScreenGates(gateNumbers)
  useGateStore.getState().assignScreenToGates(screen.id, gateNumbers)

  await screensApi.edit(
    screen.id,
    screen.name,
    screen.location,
    screen.ip_address ?? undefined,
    screen.orientation,
    screen.resolution.width,
    screen.resolution.height,
    screen.playlist_id ?? undefined,
    gateNumbers.length > 0 ? 'truck_gate' : 'playlist',
    serializedGate,
    null,
    screen.default_content_id ?? null,
  )
}

/**
 * Assign a screen to a single gate.
 */
export async function assignScreenToGate(
  screen: Screen,
  gateNumber: string,
): Promise<Gate | null> {
  await assignScreenToGates(screen, [gateNumber])
  const normalized = gateNumber.trim().toLowerCase()
  return useGateStore.getState().gates.find((gate) => gate.number === normalized) ?? null
}

/** Remove a screen from all gates and reset purpose back to playlist. */
export async function unassignScreenFromGate(screen: Screen): Promise<void> {
  await assignScreenToGates(screen, [])
}
