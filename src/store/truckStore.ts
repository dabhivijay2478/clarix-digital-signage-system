'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Truck } from '@/lib/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

function defaultTruckToWaiting(truck: Truck): Truck {
  const hasProgress = truck.is_loading || truck.is_in || truck.is_out
  const isWaiting = truck.is_waiting || !hasProgress

  return {
    ...truck,
    gate_no: truck.gate_no ?? null,
    is_waiting: isWaiting,
    is_loading: truck.is_loading ?? false,
    is_in: truck.is_in ?? false,
    is_out: truck.is_out ?? false,
    waiting_at: isWaiting ? (truck.waiting_at ?? truck.created_at ?? now()) : null,
    loading_at: truck.loading_at ?? null,
    in_at: truck.in_at ?? null,
    out_at: truck.out_at ?? null,
  }
}

// ── Store Interface ─────────────────────────────────────────────────────────

interface TruckStore {
  trucks: Truck[]

  // Truck CRUD
  addTruck: (data: Omit<Truck, 'id' | 'created_at'>) => Truck
  editTruck: (id: string, data: Partial<Omit<Truck, 'id' | 'created_at'>>) => void
  deleteTruck: (id: string) => void
  updateTruckChecks: (id: string, field: 'is_waiting' | 'is_loading' | 'is_in' | 'is_out', value: boolean) => void
  importTrucks: (data: Omit<Truck, 'id' | 'created_at'>[]) => number
  moveTruck: (id: string, direction: 'up' | 'down') => void
}

// ── Store Implementation ────────────────────────────────────────────────────

export const useTruckStore = create<TruckStore>()(
  persist(
    (set) => ({
      trucks: [],

      addTruck: (data) => {
        const isWaiting = data.is_waiting ?? true
        const truck: Truck = {
          ...data,
          id: uid(),
          created_at: now(),
          gate_no: data.gate_no ?? null,
          is_waiting: isWaiting,
          is_loading: data.is_loading ?? false,
          is_in: data.is_in ?? false,
          is_out: data.is_out ?? false,
          waiting_at: isWaiting ? (data.waiting_at ?? now()) : null,
          loading_at: data.is_loading ? now() : null,
          in_at: data.is_in ? now() : null,
          out_at: data.is_out ? now() : null,
        }
        set((s) => ({ trucks: [...s.trucks, truck] }))
        return truck
      },

      editTruck: (id, data) =>
        set((s) => ({
          trucks: s.trucks.map((t) => (t.id === id ? { ...t, ...data } : t)),
        })),

      deleteTruck: (id) =>
        set((s) => ({
          trucks: s.trucks.filter((t) => t.id !== id),
        })),

      updateTruckChecks: (id, field, value) => {
        set((s) => ({
          trucks: s.trucks.map((t) => {
            if (t.id !== id) return t

            const updated = { ...t, [field]: value }

            if (field === 'is_loading') {
              updated.is_in = value
            } else if (field === 'is_in') {
              updated.is_loading = value
            }

            // Update timestamps based on the value changed
            const time = now()
            if (value) {
              if (field === 'is_waiting') updated.waiting_at = time
              else if (field === 'is_loading' || field === 'is_in') {
                updated.loading_at = time
                updated.in_at = time
              }
              else if (field === 'is_out') updated.out_at = time
            } else {
              if (field === 'is_waiting') updated.waiting_at = null
              else if (field === 'is_loading' || field === 'is_in') {
                updated.loading_at = null
                updated.in_at = null
              }
              else if (field === 'is_out') updated.out_at = null
            }

            // If unchecking a step, also uncheck all subsequent steps and clear their timestamps
            if (!value) {
              if (field === 'is_waiting') {
                updated.is_loading = false
                updated.loading_at = null
                updated.is_in = false
                updated.in_at = null
                updated.is_out = false
                updated.out_at = null
              } else if (field === 'is_loading' || field === 'is_in') {
                updated.is_loading = false
                updated.loading_at = null
                updated.is_in = false
                updated.in_at = null
                updated.is_out = false
                updated.out_at = null
              }
            }

            return updated
          }),
        }))
      },

      importTrucks: (data) => {
        const newTrucks: Truck[] = data.map((d) => ({
          ...d,
          id: uid(),
          created_at: now(),
          gate_no: d.gate_no ?? null,
          is_waiting: d.is_waiting ?? true,
          is_loading: d.is_loading ?? false,
          is_in: d.is_in ?? false,
          is_out: d.is_out ?? false,
          waiting_at: (d.is_waiting ?? true) ? (d.waiting_at ?? now()) : null,
          loading_at: d.is_loading ? now() : null,
          in_at: d.is_in ? now() : null,
          out_at: d.is_out ? now() : null,
        }))
        set((s) => ({ trucks: [...s.trucks, ...newTrucks] }))
        return newTrucks.length
      },

      moveTruck: (id, direction) =>
        set((s) => {
          const index = s.trucks.findIndex((t) => t.id === id)
          if (index === -1) return {}

          const newTrucks = [...s.trucks]
          if (direction === 'up') {
            // Find closest waiting truck above it
            let targetIndex = -1
            for (let i = index - 1; i >= 0; i--) {
              if (newTrucks[i].is_waiting) {
                targetIndex = i
                break
              }
            }
            if (targetIndex !== -1) {
              const temp = newTrucks[index]
              newTrucks[index] = newTrucks[targetIndex]
              newTrucks[targetIndex] = temp
            }
          } else {
            // Find closest waiting truck below it
            let targetIndex = -1
            for (let i = index + 1; i < newTrucks.length; i++) {
              if (newTrucks[i].is_waiting) {
                targetIndex = i
                break
              }
            }
            if (targetIndex !== -1) {
              const temp = newTrucks[index]
              newTrucks[index] = newTrucks[targetIndex]
              newTrucks[targetIndex] = temp
            }
          }
          return { trucks: newTrucks }
        }),
    }),
    {
      name: 'clarix-truck-management',
      version: 1,
      migrate: (persistedState, version) => {
        if (version >= 1 || !persistedState || typeof persistedState !== 'object') {
          return persistedState as TruckStore
        }

        const state = persistedState as Partial<TruckStore>
        return {
          ...state,
          trucks: (state.trucks ?? []).map(defaultTruckToWaiting),
        } as TruckStore
      },
    }
  )
)
