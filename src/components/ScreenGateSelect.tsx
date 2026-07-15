'use client'

import { Label } from '@/components/ui/label'
import { normalizeGateNumber } from '@/store/gateStore'

interface ScreenGateSelectProps {
  gateOptions: string[]
  value: string[]
  onChange: (gates: string[]) => void
  required?: boolean
}

export default function ScreenGateSelect({
  gateOptions,
  value,
  onChange,
  required = false,
}: ScreenGateSelectProps) {
  const gate1 = value[0] ?? ''
  const gate2 = value[1] ?? ''

  const setGate1 = (next: string) => {
    const normalized = next ? normalizeGateNumber(next) : ''
    const nextGates = normalized ? [normalized] : []
    if (gate2 && gate2 !== normalized) {
      nextGates.push(gate2)
    }
    onChange(nextGates)
  }

  const setGate2 = (next: string) => {
    const normalized = next ? normalizeGateNumber(next) : ''
    const nextGates = gate1 ? [gate1] : []
    if (normalized && normalized !== gate1) {
      nextGates.push(normalized)
    }
    onChange(nextGates)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{required ? 'Gate 1 *' : 'Gate 1'}</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          value={gate1}
          onChange={(event) => setGate1(event.target.value)}
        >
          <option value="">{required ? 'Select gate' : 'No gate'}</option>
          {gateOptions.map((gate) => (
            <option key={gate} value={gate}>
              Gate {gate.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Gate 2 (optional)</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          value={gate2}
          onChange={(event) => setGate2(event.target.value)}
          disabled={!gate1}
        >
          <option value="">None</option>
          {gateOptions
            .filter((gate) => gate !== gate1)
            .map((gate) => (
              <option key={gate} value={gate}>
                Gate {gate.toUpperCase()}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}
