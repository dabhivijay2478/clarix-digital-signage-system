'use client'

import { useTruckStore } from '@/store/truckStore'

export function useTrucks() {
  const store = useTruckStore()

  // Helpers
  const getTruckById = (id: string) => store.trucks.find((t) => t.id === id)

  return {
    trucks: store.trucks,
    getTruckById,

    // Actions
    addTruck: store.addTruck,
    editTruck: store.editTruck,
    deleteTruck: store.deleteTruck,
    updateTruckChecks: store.updateTruckChecks,
    importTrucks: store.importTrucks,
  }
}
