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

// ── Store Interface ─────────────────────────────────────────────────────────

interface TruckStore {
  trucks: Truck[]

  // Truck CRUD
  addTruck: (data: Omit<Truck, 'id' | 'created_at'>) => Truck
  editTruck: (id: string, data: Partial<Omit<Truck, 'id' | 'created_at'>>) => void
  deleteTruck: (id: string) => void
  updateTruckChecks: (id: string, field: 'is_waiting' | 'is_loading' | 'is_in' | 'is_out', value: boolean) => void
  importTrucks: (data: Omit<Truck, 'id' | 'created_at'>[]) => number
}

// ── Store Implementation ────────────────────────────────────────────────────

export const useTruckStore = create<TruckStore>()(
  persist(
    (set) => ({
      trucks: [],

      addTruck: (data) => {
        const truck: Truck = {
          ...data,
          id: uid(),
          created_at: now(),
          is_waiting: data.is_waiting ?? false,
          is_loading: data.is_loading ?? false,
          is_in: data.is_in ?? false,
          is_out: data.is_out ?? false,
          waiting_at: data.is_waiting ? now() : null,
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

            // Update timestamps based on the value changed
            const time = now()
            if (value) {
              if (field === 'is_waiting') updated.waiting_at = time
              else if (field === 'is_loading') updated.loading_at = time
              else if (field === 'is_in') updated.in_at = time
              else if (field === 'is_out') updated.out_at = time
            } else {
              if (field === 'is_waiting') updated.waiting_at = null
              else if (field === 'is_loading') updated.loading_at = null
              else if (field === 'is_in') updated.in_at = null
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
              } else if (field === 'is_loading') {
                updated.is_in = false
                updated.in_at = null
                updated.is_out = false
                updated.out_at = null
              } else if (field === 'is_in') {
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
          is_waiting: d.is_waiting ?? false,
          is_loading: d.is_loading ?? false,
          is_in: d.is_in ?? false,
          is_out: d.is_out ?? false,
          waiting_at: d.is_waiting ? now() : null,
          loading_at: d.is_loading ? now() : null,
          in_at: d.is_in ? now() : null,
          out_at: d.is_out ? now() : null,
        }))
        set((s) => ({ trucks: [...s.trucks, ...newTrucks] }))
        return newTrucks.length
      },
    }),
    {
      name: 'clarix-truck-management',
    }
  )
)
