import type { GateQueueSettings, Truck } from './types'

export const DEFAULT_GATE_LOADING_MINS = 30
export const GATE_LOADING_CAPACITY = 2

export function formatQueueDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Now'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const remaining = rounded % 60
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`
}

export function getGateLoadingDurationMins(
  gateNumber: string | null | undefined,
  gateSettings: GateQueueSettings[]
): number {
  const normalized = (gateNumber ?? '').toLowerCase()
  const configured = gateSettings.find((gate) => gate.number.toLowerCase() === normalized)?.loadingDurationMins
  if (!configured || !Number.isFinite(configured)) return DEFAULT_GATE_LOADING_MINS
  return Math.max(1, Math.round(configured))
}

export function getGateQueue(trucks: Truck[], gateNumber: string | null | undefined): Truck[] {
  const normalized = (gateNumber ?? '').toLowerCase()
  if (!normalized) return []
  return trucks.filter((truck) => !truck.is_out && (truck.gate_no ?? '').toLowerCase() === normalized)
}

export function getTruckGateQueueIndex(trucks: Truck[], truck: Truck): number {
  return getGateQueue(trucks, truck.gate_no).findIndex((entry) => entry.id === truck.id)
}

export function getEstimatedWaitMinsForTruck(
  trucks: Truck[],
  truck: Truck,
  gateSettings: GateQueueSettings[]
): number {
  const queueIndex = getTruckGateQueueIndex(trucks, truck)
  if (queueIndex < 0) return 0
  const cyclesAhead = Math.floor(queueIndex / GATE_LOADING_CAPACITY)
  return cyclesAhead * getGateLoadingDurationMins(truck.gate_no, gateSettings)
}
