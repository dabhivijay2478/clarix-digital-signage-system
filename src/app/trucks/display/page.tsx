'use client'

import { Suspense } from 'react'

import TruckTokenDisplay from '@/components/TruckTokenDisplay'
import { useTruckStore } from '@/store/truckStore'

function GateDisplayContent() {
  const trucks = useTruckStore((state) => state.trucks)

  return <TruckTokenDisplay trucks={trucks} title="Truck Token Display" />
}

export default function GateDisplayPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-black text-white">Loading Truck Token Display...</div>}>
      <GateDisplayContent />
    </Suspense>
  )
}
