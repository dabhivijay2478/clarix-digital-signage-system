import { isValidGateNumber, normalizeGateNumber } from '@/store/gateStore'

export const MAX_GATES_PER_SCREEN = 2

/** Parse comma-separated gate values stored on Screen.gate */
export function parseScreenGates(gate: string | null | undefined): string[] {
  if (!gate?.trim()) return []
  return [...new Set(
    gate
      .split(',')
      .map((value) => normalizeGateNumber(value))
      .filter((value) => value && isValidGateNumber(value)),
  )].slice(0, MAX_GATES_PER_SCREEN)
}

/** Serialize gate list for Screen.gate persistence */
export function serializeScreenGates(gates: string[]): string | null {
  const normalized = [...new Set(
    gates
      .map((value) => normalizeGateNumber(value))
      .filter((value) => value && isValidGateNumber(value)),
  )].slice(0, MAX_GATES_PER_SCREEN)

  return normalized.length > 0 ? normalized.join(',') : null
}

export function formatScreenGatesLabel(gates: string[]): string {
  if (gates.length === 0) return '—'
  return gates.map((gate) => gate.toUpperCase()).join(', ')
}

export function normalizeScreenGateSelection(gates: string[]): string[] {
  return serializeScreenGates(gates)?.split(',') ?? []
}
