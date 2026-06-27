'use client'

import { screensApi } from './tauri'
import type { Screen, ScreenPurpose } from './types'
import { useGateStore, type Gate } from '@/store/gateStore'

/**
 * Assign a screen to a gate, and when the gate has a production dashboard
 * linked, automatically bind the screen's purpose + dashboard so the player
 * starts showing the dashboard data right away.
 *
 * Returns the gate that the screen was assigned to (or null if the gate
 * doesn't exist). The caller is responsible for refreshing any local screen
 * lists afterwards.
 */
export async function assignScreenToGate(
  screen: Screen,
  gateNumber: string,
): Promise<Gate | null> {
  const assignedGate = useGateStore.getState().assignScreen(gateNumber, screen.id)
  if (!assignedGate) return null

  const dashboardId = assignedGate.productionDashboardId ?? null
  const purpose: ScreenPurpose = dashboardId ? 'production_dashboard' : 'playlist'

  await screensApi.edit(
    screen.id,
    screen.name,
    screen.location,
    screen.ip_address ?? undefined,
    screen.orientation,
    screen.resolution.width,
    screen.resolution.height,
    screen.playlist_id ?? undefined,
    purpose,
    assignedGate.number,
    dashboardId,
    screen.default_content_id ?? null,
  )

  return assignedGate
}

/** Remove a screen from its gate and reset purpose back to playlist. */
export async function unassignScreenFromGate(screen: Screen): Promise<void> {
  useGateStore.getState().unassignScreenFromAll(screen.id)
  await screensApi.edit(
    screen.id,
    screen.name,
    screen.location,
    screen.ip_address ?? undefined,
    screen.orientation,
    screen.resolution.width,
    screen.resolution.height,
    screen.playlist_id ?? undefined,
    'playlist',
    null,
    null,
    screen.default_content_id ?? null,
  )
}