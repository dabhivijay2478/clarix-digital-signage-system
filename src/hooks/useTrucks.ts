'use client'

import { useTruckStore } from '@/store/truckStore'
import type {
  Truck,
  TruckStatus,
  Driver,
  Trip,
  TripStatus,
  MaintenanceRecord,
} from '@/lib/types'

export function useTrucks() {
  const store = useTruckStore()

  // Derived data
  const activeTrucks = store.trucks.filter((t) => t.status !== 'Inactive')
  const availableTrucks = store.trucks.filter((t) => t.status === 'Available')
  const trucksOnTrip = store.trucks.filter((t) => t.status === 'On Trip')
  const trucksInMaintenance = store.trucks.filter((t) => t.status === 'Maintenance')

  const activeDrivers = store.drivers.filter((d) => d.status === 'Active')
  const availableDrivers = store.drivers.filter(
    (d) => d.status === 'Active' && !d.assigned_truck_id
  )

  const activeTrips = store.trips.filter((t) => t.status === 'In Progress')
  const recentTrips = [...store.trips]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)

  const upcomingMaintenance = store.maintenance
    .filter((m) => m.next_due_date && new Date(m.next_due_date) > new Date())
    .sort((a, b) => new Date(a.next_due_date!).getTime() - new Date(b.next_due_date!).getTime())

  const overdueMaintenance = store.maintenance.filter(
    (m) => m.next_due_date && new Date(m.next_due_date) <= new Date()
  )

  // Helpers
  const getTruckById = (id: string) => store.trucks.find((t) => t.id === id)
  const getDriverById = (id: string) => store.drivers.find((d) => d.id === id)
  const getDriverForTruck = (truckId: string) => {
    const truck = store.trucks.find((t) => t.id === truckId)
    if (!truck?.driver_id) return null
    return store.drivers.find((d) => d.id === truck.driver_id) ?? null
  }
  const getMaintenanceForTruck = (truckId: string) =>
    store.maintenance.filter((m) => m.truck_id === truckId)
  const getTripsForTruck = (truckId: string) =>
    store.trips.filter((t) => t.truck_id === truckId)
  const getTripsForDriver = (driverId: string) =>
    store.trips.filter((t) => t.driver_id === driverId)

  // Stats
  const totalDistanceKm = store.trips
    .filter((t) => t.status === 'Completed')
    .reduce((sum, t) => sum + t.distance_km, 0)
  const totalFuelConsumed = store.trips
    .filter((t) => t.status === 'Completed' && t.fuel_consumed)
    .reduce((sum, t) => sum + (t.fuel_consumed ?? 0), 0)
  const totalMaintenanceCost = store.maintenance.reduce((sum, m) => sum + m.cost, 0)

  return {
    // Raw data
    trucks: store.trucks,
    drivers: store.drivers,
    trips: store.trips,
    maintenance: store.maintenance,

    // Derived
    activeTrucks,
    availableTrucks,
    trucksOnTrip,
    trucksInMaintenance,
    activeDrivers,
    availableDrivers,
    activeTrips,
    recentTrips,
    upcomingMaintenance,
    overdueMaintenance,

    // Helpers
    getTruckById,
    getDriverById,
    getDriverForTruck,
    getMaintenanceForTruck,
    getTripsForTruck,
    getTripsForDriver,

    // Stats
    totalDistanceKm,
    totalFuelConsumed,
    totalMaintenanceCost,

    // Actions
    addTruck: store.addTruck,
    editTruck: store.editTruck,
    deleteTruck: store.deleteTruck,
    setTruckStatus: store.setTruckStatus,
    addDriver: store.addDriver,
    editDriver: store.editDriver,
    deleteDriver: store.deleteDriver,
    addTrip: store.addTrip,
    updateTrip: store.updateTrip,
    completeTrip: store.completeTrip,
    cancelTrip: store.cancelTrip,
    addMaintenance: store.addMaintenance,
    editMaintenance: store.editMaintenance,
    deleteMaintenance: store.deleteMaintenance,
  }
}
