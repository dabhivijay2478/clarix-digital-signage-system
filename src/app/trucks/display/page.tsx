'use client'

import { Suspense } from 'react'

import TruckTokenDisplay from '@/components/TruckTokenDisplay'
import PlayerThemeLock from '@/app/player/PlayerThemeLock'
import { getControllerTimeZone } from '@/lib/signage-schedule'
import { useTruckStore } from '@/store/truckStore'

function GateDisplayContent() {
  const trucks = useTruckStore((state) => state.trucks)
  const controllerTimeZone = getControllerTimeZone()

  return <TruckTokenDisplay trucks={trucks} timeZone={controllerTimeZone} />
}

export default function GateDisplayPage() {
  return (
    <>
      <PlayerThemeLock />
      <Suspense
        fallback={(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f4f6f8',
              color: '#111827',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 24,
            }}
          >
            Loading Truck Token Display...
          </div>
        )}
      >
        <GateDisplayContent />
      </Suspense>
    </>
  )
}
