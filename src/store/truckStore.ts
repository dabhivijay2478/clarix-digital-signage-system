'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { trucksApi } from '@/lib/tauri'
import type { Truck } from '@/lib/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function now(): string {
  return new Date().toISOString()
}

function defaultTruckToWaiting(truck: Truck): Truck {
  const hasProgress = truck.is_loading || truck.is_in || truck.is_out
  const isWaiting = truck.is_waiting || !hasProgress

  return {
    ...truck,
    gate_no: truck.gate_no ?? null,
    delivery_batch_no: truck.delivery_batch_no ?? null,
    delivery_batch_gate: truck.delivery_batch_gate ?? truck.gate_no ?? null,
    shipment_document_no: truck.shipment_document_no ?? null,
    is_waiting: isWaiting,
    is_loading: truck.is_loading ?? false,
    is_in: truck.is_in ?? false,
    is_out: truck.is_out ?? false,
    waiting_at: isWaiting ? (truck.waiting_at ?? truck.created_at ?? now()) : null,
    loading_at: truck.loading_at ?? null,
    in_at: truck.in_at ?? null,
    out_at: truck.out_at ?? null,
    loading_duration: truck.loading_duration ?? null,
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

function shouldSyncActiveTruckSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  const pathname = window.location.pathname
  return !pathname.startsWith('/player') && !pathname.startsWith('/trucks/display')
}

function scheduleActiveTruckSnapshot(trucks: Truck[]): void {
  if (!shouldSyncActiveTruckSnapshot()) return
  if (syncTimer) clearTimeout(syncTimer)
  const snapshot = trucks.map((truck) => ({ ...truck }))
  syncTimer = setTimeout(() => {
    void trucksApi.saveActiveSnapshot(snapshot).catch((error) => {
      console.warn('Failed to save active truck snapshot:', error)
    })
  }, 150)
}

// ── Store Interface ─────────────────────────────────────────────────────────

interface TruckStore {
  trucks: Truck[]

  // Truck CRUD
  addTruck: (data: Omit<Truck, 'id' | 'created_at'>) => Truck
  editTruck: (id: string, data: Partial<Omit<Truck, 'id' | 'created_at'>>) => void
  deleteTruck: (id: string) => void
  deleteTrucks: (ids: string[]) => void
  updateTruckChecks: (id: string, field: 'is_waiting' | 'is_loading' | 'is_in' | 'is_out', value: boolean) => void
  importTrucks: (data: Omit<Truck, 'id' | 'created_at'>[]) => number
  moveTruck: (id: string, direction: 'up' | 'down') => void
  replaceTrucks: (trucks: Truck[]) => void
}

// ── Store Implementation ────────────────────────────────────────────────────

export const useTruckStore = create<TruckStore>()(
  persist(
    (set, get) => ({
      trucks: [],

      addTruck: (data) => {
        const isWaiting = data.is_waiting ?? true
        const truck: Truck = {
          ...data,
          id: uid(),
          created_at: now(),
          gate_no: data.gate_no ?? null,
          delivery_batch_no: data.delivery_batch_no ?? null,
          delivery_batch_gate: data.delivery_batch_gate ?? data.gate_no ?? null,
          shipment_document_no: data.shipment_document_no ?? null,
          is_waiting: isWaiting,
          is_loading: data.is_loading ?? false,
          is_in: data.is_in ?? false,
          is_out: data.is_out ?? false,
          waiting_at: isWaiting ? (data.waiting_at ?? now()) : null,
          loading_at: data.is_loading ? now() : null,
          in_at: data.is_in ? now() : null,
          out_at: data.is_out ? now() : null,
          loading_duration: data.is_out ? (data.loading_duration ?? null) : null,
        }
        set((s) => ({ trucks: [...s.trucks, truck] }))
        void trucksApi.upsertAll([truck]).catch((error) => {
          console.warn('Failed to save truck record:', error)
        })
        scheduleActiveTruckSnapshot(get().trucks)
        return truck
      },

      editTruck: (id, data) => {
        set((s) => ({
          trucks: s.trucks.map((t) => (t.id === id ? { ...t, ...data } : t)),
        }))
        const updated = get().trucks.find((t) => t.id === id)
        if (updated) {
          void trucksApi.upsertAll([updated]).catch((error) => {
            console.warn('Failed to update truck record:', error)
          })
        }
        scheduleActiveTruckSnapshot(get().trucks)
      },

      deleteTruck: (id) => {
        set((s) => ({
          trucks: s.trucks.filter((t) => t.id !== id),
        }))
        void trucksApi.deleteAll([id]).catch((error) => {
          console.warn('Failed to delete truck record:', error)
        })
        scheduleActiveTruckSnapshot(get().trucks)
      },

      deleteTrucks: (ids) => {
        const idSet = new Set(ids)
        set((s) => ({
          trucks: s.trucks.filter((t) => !idSet.has(t.id)),
        }))
        void trucksApi.deleteAll(ids).catch((error) => {
          console.warn('Failed to delete truck records:', error)
        })
        scheduleActiveTruckSnapshot(get().trucks)
      },

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
              else if (field === 'is_out') {
                updated.out_at = time
                if (updated.loading_at) {
                  const start = new Date(updated.loading_at).getTime()
                  const end = new Date(time).getTime()
                  updated.loading_duration = Math.max(0, Math.floor((end - start) / 1000))
                }
              }
            } else {
              if (field === 'is_waiting') updated.waiting_at = null
              else if (field === 'is_loading' || field === 'is_in') {
                updated.loading_at = null
                updated.in_at = null
              }
              else if (field === 'is_out') {
                updated.out_at = null
                updated.loading_duration = null
              }
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
                updated.loading_duration = null
              } else if (field === 'is_loading' || field === 'is_in') {
                updated.is_loading = false
                updated.loading_at = null
                updated.is_in = false
                updated.in_at = null
                updated.is_out = false
                updated.out_at = null
                updated.loading_duration = null
              }
            }

            return updated
          }),
        }))
        const updated = get().trucks.find((t) => t.id === id)
        if (updated) {
          void trucksApi.upsertAll([updated]).catch((error) => {
            console.warn('Failed to update truck record:', error)
          })
        }
        scheduleActiveTruckSnapshot(get().trucks)
      },

      importTrucks: (data) => {
        const newTrucks: Truck[] = data.map((d) => ({
          ...d,
          id: uid(),
          created_at: now(),
          gate_no: d.gate_no ?? null,
          delivery_batch_no: d.delivery_batch_no ?? null,
          delivery_batch_gate: d.delivery_batch_gate ?? d.gate_no ?? null,
          shipment_document_no: d.shipment_document_no ?? null,
          is_waiting: d.is_waiting ?? true,
          is_loading: d.is_loading ?? false,
          is_in: d.is_in ?? false,
          is_out: d.is_out ?? false,
          waiting_at: (d.is_waiting ?? true) ? (d.waiting_at ?? now()) : null,
          loading_at: d.is_loading ? now() : null,
          in_at: d.is_in ? now() : null,
          out_at: d.is_out ? now() : null,
          loading_duration: d.loading_duration ?? null,
        }))
        set((s) => ({ trucks: [...s.trucks, ...newTrucks] }))
        void trucksApi.upsertAll(newTrucks).catch((error) => {
          console.warn('Failed to save imported truck records:', error)
        })
        scheduleActiveTruckSnapshot(get().trucks)
        return newTrucks.length
      },

      moveTruck: (id, direction) => {
        set((s) => {
          const index = s.trucks.findIndex((t) => t.id === id)
          if (index === -1) return {}
          if (s.trucks[index].is_out) return {}

          const newTrucks = [...s.trucks]
          if (direction === 'up') {
            // Find closest waiting truck above it
            let targetIndex = -1
            for (let i = index - 1; i >= 0; i--) {
              if (newTrucks[i].is_waiting && !newTrucks[i].is_out) {
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
              if (newTrucks[i].is_waiting && !newTrucks[i].is_out) {
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
        })
        scheduleActiveTruckSnapshot(get().trucks)
      },

      replaceTrucks: (trucks) => {
        set({ trucks: trucks.map(defaultTruckToWaiting) })
        scheduleActiveTruckSnapshot(get().trucks)
      },
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
