'use client'

import { useCallback, useMemo } from 'react'
import { useTruckStore as useBaseTruckStore } from './truckStore'
import type { Truck } from '@/lib/types'

type LegacyTruck = Truck & {
  truckNumber: string
  driverName: string
  loadType: string
  notes: string
  status: 'completed' | 'active'
  outAt: string | null
}

type LegacyTruckState = {
  trucks: LegacyTruck[]
  clearCompleted: () => void
}

function toLegacyTruck(truck: Truck): LegacyTruck {
  return {
    ...truck,
    truckNumber: truck.registration_number,
    driverName: '',
    loadType: truck.gate_no ?? '',
    notes: '',
    status: truck.is_out ? 'completed' : 'active',
    outAt: truck.out_at,
  }
}

export function useTruckStore<T>(selector: (state: LegacyTruckState) => T): T {
  const trucks = useBaseTruckStore((state) => state.trucks)
  const deleteTruck = useBaseTruckStore((state) => state.deleteTruck)

  const legacyTrucks = useMemo(() => trucks.map(toLegacyTruck), [trucks])
  const clearCompleted = useCallback(() => {
    trucks.filter((truck) => truck.is_out).forEach((truck) => deleteTruck(truck.id))
  }, [deleteTruck, trucks])

  return selector({ trucks: legacyTrucks, clearCompleted })
}
