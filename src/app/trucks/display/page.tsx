'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTruckStore } from '@/store/truckStore'
import { getTruckStatusInfo } from '@/lib/truck-alerts'
import type { Truck } from '@/lib/types'

function GateDisplayContent() {
  const searchParams = useSearchParams()
  const gateParam = searchParams.get('gate') || 'd4'
  const gate = gateParam.toLowerCase()

  const trucks = useTruckStore((state) => state.trucks)
  const [activeTruck, setActiveTruck] = useState<Truck | null>(null)
  const [nextTruck, setNextTruck] = useState<Truck | null>(null)

  useEffect(() => {
    // Filter trucks belonging to this gate
    const gateTrucks = trucks.filter((t) => (t.gate_no ?? '').toLowerCase() === gate)

    // Active truck: currently Loading or In Gate, but not Out yet
    const active = gateTrucks.find((t) => (t.is_loading || t.is_in) && !t.is_out) || null

    // Next truck: in Waiting queue, not yet Loading/In/Out
    const waitingList = gateTrucks.filter((t) => t.is_waiting && !t.is_loading && !t.is_in && !t.is_out)
    const next = waitingList[0] || null

    setActiveTruck(active)
    setNextTruck(next)
  }, [trucks, gate])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Loading Out.':
        return 'from-emerald-500 to-teal-600 text-white shadow-emerald-500/20'
      case 'Loading in.':
        return 'from-cyan-500 to-blue-600 text-white shadow-cyan-500/20'
      case 'Waiting':
        return 'from-amber-500 to-orange-600 text-white shadow-amber-500/20'
      default:
        return 'from-zinc-700 to-zinc-800 text-zinc-300'
    }
  }

  const activeStatusLabel = activeTruck ? getTruckStatusInfo(activeTruck).status_label : ''
  const nextStatusLabel = nextTruck ? getTruckStatusInfo(nextTruck).status_label : ''

  return (
    <div 
      className="fixed inset-0 flex flex-col justify-between bg-black text-white p-6 select-none font-sans"
      style={{
        backgroundImage: 'radial-gradient(circle at center, #0B0F19 0%, #030406 100%)',
      }}
    >
      {/* Main Flex Stack: Active on top, Next on bottom */}
      <div className="flex flex-col gap-6 flex-1 w-full justify-stretch h-full">
        
        {/* Active Truck Column */}
        <div 
          className="flex-1 flex flex-col justify-between p-8 md:p-10 rounded-4xl border border-white/5 bg-zinc-950/20 backdrop-blur-3xl relative overflow-hidden"
          style={{
            boxShadow: activeTruck ? '0 20px 80px rgba(6, 182, 212, 0.08)' : 'none',
          }}
        >
          {activeTruck && (
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-cyan-500/5 blur-[50px] pointer-events-none" />
          )}
          <div>
            <span className="text-sm font-bold tracking-[0.3em] uppercase text-white/30 block mb-3">
              CURRENT TRUCK (LOADING)
            </span>
            {activeTruck ? (
              <h2 className="text-7xl md:text-9xl font-black font-mono tracking-tight text-white leading-none break-all">
                {activeTruck.registration_number.toUpperCase()}
              </h2>
            ) : (
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-zinc-700 leading-none">
                NO ACTIVE VEHICLE
              </h2>
            )}
          </div>

          <div className="mt-4">
            {activeTruck ? (
              <span className={`inline-flex items-center justify-center px-8 py-3 rounded-full text-2xl font-black uppercase tracking-wider bg-linear-to-r shadow-lg ${getStatusColor(activeStatusLabel)}`}>
                {activeStatusLabel}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-8 py-3 rounded-full text-xl font-bold uppercase tracking-wider bg-zinc-900 border border-white/5 text-zinc-500">
                Awaiting Loading In
              </span>
            )}
          </div>
        </div>

        {/* Next Truck Column */}
        <div 
          className="flex-1 flex flex-col justify-between p-8 md:p-10 rounded-4xl border border-white/5 bg-zinc-950/20 backdrop-blur-3xl relative overflow-hidden"
          style={{
            boxShadow: nextTruck ? '0 20px 80px rgba(245, 158, 11, 0.05)' : 'none',
          }}
        >
          {nextTruck && (
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-amber-500/5 blur-[50px] pointer-events-none" />
          )}
          <div>
            <span className="text-sm font-bold tracking-[0.3em] uppercase text-white/30 block mb-3">
              NEXT VEHICLE (WAITING)
            </span>
            {nextTruck ? (
              <h2 className="text-7xl md:text-9xl font-black font-mono tracking-tight text-white/90 leading-none break-all">
                {nextTruck.registration_number.toUpperCase()}
              </h2>
            ) : (
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-zinc-700 leading-none">
                NO VEHICLE WAITING
              </h2>
            )}
          </div>

          <div className="mt-4">
            {nextTruck ? (
              <span className={`inline-flex items-center justify-center px-8 py-3 rounded-full text-2xl font-black uppercase tracking-wider bg-linear-to-r shadow-lg ${getStatusColor(nextStatusLabel)}`}>
                {nextStatusLabel}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-8 py-3 rounded-full text-xl font-bold uppercase tracking-wider bg-zinc-900 border border-white/5 text-zinc-500">
                Queue Empty
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default function GateDisplayPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black flex items-center justify-center text-white">Loading Gate Display...</div>}>
      <GateDisplayContent />
    </Suspense>
  )
}
