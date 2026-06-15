'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Truck,
  TruckStatus,
  FuelType,
  Driver,
  DriverStatus,
  Trip,
  TripStatus,
  MaintenanceRecord,
  MaintenanceType,
} from '@/lib/types'

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
  drivers: Driver[]
  trips: Trip[]
  maintenance: MaintenanceRecord[]

  // Truck CRUD
  addTruck: (data: Omit<Truck, 'id' | 'created_at'>) => Truck
  editTruck: (id: string, data: Partial<Omit<Truck, 'id' | 'created_at'>>) => void
  deleteTruck: (id: string) => void
  setTruckStatus: (id: string, status: TruckStatus) => void

  // Driver CRUD
  addDriver: (data: Omit<Driver, 'id' | 'created_at'>) => Driver
  editDriver: (id: string, data: Partial<Omit<Driver, 'id' | 'created_at'>>) => void
  deleteDriver: (id: string) => void

  // Trip CRUD
  addTrip: (data: Omit<Trip, 'id' | 'created_at'>) => Trip
  updateTrip: (id: string, data: Partial<Omit<Trip, 'id' | 'created_at'>>) => void
  completeTrip: (id: string, endTime: string, fuelConsumed?: number) => void
  cancelTrip: (id: string) => void

  // Maintenance CRUD
  addMaintenance: (data: Omit<MaintenanceRecord, 'id' | 'created_at'>) => MaintenanceRecord
  editMaintenance: (id: string, data: Partial<Omit<MaintenanceRecord, 'id' | 'created_at'>>) => void
  deleteMaintenance: (id: string) => void
}

// ── Store Implementation ────────────────────────────────────────────────────

export const useTruckStore = create<TruckStore>()(
  persist(
    (set, get) => ({
      trucks: [],
      drivers: [],
      trips: [],
      maintenance: [],

      // ── Trucks ──────────────────────────────────────────────────────────

      addTruck: (data) => {
        const truck: Truck = { ...data, id: uid(), created_at: now() }
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
          // Also unassign drivers from this truck
          drivers: s.drivers.map((d) =>
            d.assigned_truck_id === id ? { ...d, assigned_truck_id: null } : d
          ),
        })),

      setTruckStatus: (id, status) =>
        set((s) => ({
          trucks: s.trucks.map((t) => (t.id === id ? { ...t, status } : t)),
        })),

      // ── Drivers ─────────────────────────────────────────────────────────

      addDriver: (data) => {
        const driver: Driver = { ...data, id: uid(), created_at: now() }
        set((s) => ({ drivers: [...s.drivers, driver] }))
        return driver
      },

      editDriver: (id, data) =>
        set((s) => ({
          drivers: s.drivers.map((d) => (d.id === id ? { ...d, ...data } : d)),
        })),

      deleteDriver: (id) =>
        set((s) => ({
          drivers: s.drivers.filter((d) => d.id !== id),
          // Also unassign from trucks
          trucks: s.trucks.map((t) =>
            t.driver_id === id ? { ...t, driver_id: null } : t
          ),
        })),

      // ── Trips ───────────────────────────────────────────────────────────

      addTrip: (data) => {
        const trip: Trip = { ...data, id: uid(), created_at: now() }
        set((s) => ({ trips: [...s.trips, trip] }))
        // If trip is "In Progress", set truck status
        if (data.status === 'In Progress') {
          get().setTruckStatus(data.truck_id, 'On Trip')
        }
        return trip
      },

      updateTrip: (id, data) =>
        set((s) => ({
          trips: s.trips.map((t) => (t.id === id ? { ...t, ...data } : t)),
        })),

      completeTrip: (id, endTime, fuelConsumed) => {
        const trip = get().trips.find((t) => t.id === id)
        if (!trip) return
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === id
              ? { ...t, status: 'Completed' as TripStatus, end_time: endTime, fuel_consumed: fuelConsumed ?? t.fuel_consumed }
              : t
          ),
        }))
        // Set the truck back to Available
        get().setTruckStatus(trip.truck_id, 'Available')
      },

      cancelTrip: (id) => {
        const trip = get().trips.find((t) => t.id === id)
        if (!trip) return
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === id ? { ...t, status: 'Cancelled' as TripStatus } : t
          ),
        }))
        if (trip.status === 'In Progress') {
          get().setTruckStatus(trip.truck_id, 'Available')
        }
      },

      // ── Maintenance ─────────────────────────────────────────────────────

      addMaintenance: (data) => {
        const record: MaintenanceRecord = { ...data, id: uid(), created_at: now() }
        set((s) => ({ maintenance: [...s.maintenance, record] }))
        return record
      },

      editMaintenance: (id, data) =>
        set((s) => ({
          maintenance: s.maintenance.map((m) =>
            m.id === id ? { ...m, ...data } : m
          ),
        })),

      deleteMaintenance: (id) =>
        set((s) => ({
          maintenance: s.maintenance.filter((m) => m.id !== id),
        })),
    }),
    {
      name: 'signalos-truck-management',
    }
  )
)
