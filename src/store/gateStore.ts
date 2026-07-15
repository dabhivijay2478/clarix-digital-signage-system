'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ScreenPurpose } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Gate {
  id: string
  number: string // e.g. "d1", "d2", "g10" — letter prefix + numeric suffix
  purpose: ScreenPurpose
  productionDashboardId: string | null
  playlistId: string | null
  loadingDurationMins: number
}

// gate number → array of screen IDs assigned to that gate
export type GateScreenAssignments = Record<string, string[]>

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Gate number must start with a letter and be followed by one or more digits (case-insensitive). e.g. d1, D2, g10 */
export function isValidGateNumber(value: string): boolean {
  return /^[a-zA-Z]\d+$/.test(value.trim())
}

/** Normalize gate number to lowercase */
export function normalizeGateNumber(value: string): string {
  return value.trim().toLowerCase()
}

// ── Store Interface ──────────────────────────────────────────────────────────

interface GateStore {
  gates: Gate[]
  assignments: GateScreenAssignments // gateNumber → screenIds[]

  addGate: (number: string) => Gate | null   // returns null if duplicate or invalid
  removeGate: (id: string) => void
  assignScreen: (gateNumber: string, screenId: string) => Gate | null
  assignScreenToGates: (screenId: string, gateNumbers: string[]) => void
  unassignScreen: (gateNumber: string, screenId: string) => void
  unassignScreenFromAll: (screenId: string) => void
  getAssignedGateForScreen: (screenId: string) => string | null
  getAssignedGatesForScreen: (screenId: string) => string[]
  getScreensForGate: (gateNumber: string) => string[]
  getAllAssignedScreenIds: () => string[]
  updateGateConfig: (
    gateNumber: string,
    purpose: ScreenPurpose,
    productionDashboardId: string | null,
    playlistId: string | null
  ) => void
  updateGateLoadingDuration: (gateNumber: string, loadingDurationMins: number) => void
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useGateStore = create<GateStore>()(
  persist(
    (set, get) => ({
      gates: [], // No default gates - user adds them manually
      assignments: {},

      addGate: (number) => {
        const normalized = normalizeGateNumber(number)
        if (!isValidGateNumber(normalized)) return null
        const exists = get().gates.some((g) => g.number === normalized)
        if (exists) return null
        const gate: Gate = {
          id: uid(),
          number: normalized,
          purpose: 'playlist',
          productionDashboardId: null,
          playlistId: null,
          loadingDurationMins: 30,
        }
        set((s) => ({ gates: [...s.gates, gate] }))
        return gate
      },

      removeGate: (id) => {
        const gate = get().gates.find((g) => g.id === id)
        if (!gate) return
        set((s) => {
          const newAssignments = { ...s.assignments }
          delete newAssignments[gate.number]
          return {
            gates: s.gates.filter((g) => g.id !== id),
            assignments: newAssignments,
          }
        })
      },

      assignScreen: (gateNumber, screenId) => {
        get().assignScreenToGates(screenId, [gateNumber])
        const normalized = normalizeGateNumber(gateNumber)
        return get().gates.find((g) => g.number === normalized) ?? null
      },

      assignScreenToGates: (screenId, gateNumbers) => {
        const normalized = [...new Set(
          gateNumbers
            .map((gateNumber) => normalizeGateNumber(gateNumber))
            .filter((gateNumber) => gateNumber && isValidGateNumber(gateNumber)),
        )].slice(0, 2)

        set((s) => {
          const newAssignments: GateScreenAssignments = {}
          for (const [gateNumber, ids] of Object.entries(s.assignments)) {
            newAssignments[gateNumber] = ids.filter((id) => id !== screenId)
          }
          for (const gateNumber of normalized) {
            const existing = newAssignments[gateNumber] ?? []
            if (!existing.includes(screenId)) {
              newAssignments[gateNumber] = [...existing, screenId]
            }
          }
          return { assignments: newAssignments }
        })
      },

      unassignScreen: (gateNumber, screenId) => {
        const normalized = normalizeGateNumber(gateNumber)
        set((s) => ({
          assignments: {
            ...s.assignments,
            [normalized]: (s.assignments[normalized] ?? []).filter((id) => id !== screenId),
          },
        }))
      },

      unassignScreenFromAll: (screenId) => {
        set((s) => {
          const newAssignments: GateScreenAssignments = {}
          for (const [gn, ids] of Object.entries(s.assignments)) {
            newAssignments[gn] = ids.filter((id) => id !== screenId)
          }
          return { assignments: newAssignments }
        })
      },

      getAssignedGateForScreen: (screenId) => {
        return get().getAssignedGatesForScreen(screenId)[0] ?? null
      },

      getAssignedGatesForScreen: (screenId) => {
        const assignments = get().assignments
        const gates = Object.entries(assignments)
          .filter(([, ids]) => ids.includes(screenId))
          .map(([gateNumber]) => gateNumber)
        return gates.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      },

      getScreensForGate: (gateNumber) => {
        return get().assignments[normalizeGateNumber(gateNumber)] ?? []
      },

      getAllAssignedScreenIds: () => {
        const all: string[] = []
        for (const ids of Object.values(get().assignments)) {
          all.push(...ids)
        }
        return all
      },

      updateGateConfig: (gateNumber, purpose, productionDashboardId, playlistId) => {
        const normalized = normalizeGateNumber(gateNumber)
        set((s) => ({
          gates: s.gates.map((g) =>
            g.number === normalized
              ? { ...g, purpose, productionDashboardId, playlistId }
              : g
          ),
        }))
      },

      updateGateLoadingDuration: (gateNumber, loadingDurationMins) => {
        const normalized = normalizeGateNumber(gateNumber)
        const safeMinutes = Math.max(1, Math.min(Math.round(loadingDurationMins), 24 * 60))
        set((s) => ({
          gates: s.gates.map((g) =>
            g.number === normalized
              ? { ...g, loadingDurationMins: safeMinutes }
              : g
          ),
        }))
      },
    }),
    {
      name: 'mg-enterprise-gates',
      version: 3, // Adds per-gate loading duration
      migrate: (persistedState: any, version: number) => {
        // Clear all gates on version upgrade to remove default D4/D5
        if (version < 2) {
          return { gates: [], assignments: {} }
        }
        if (version < 3) {
          return {
            ...persistedState,
            gates: (persistedState?.gates ?? []).map((gate: Gate) => ({
              ...gate,
              loadingDurationMins: gate.loadingDurationMins ?? 30,
            })),
          }
        }
        return persistedState
      },
    }
  )
)
