'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SCREEN_RESOLUTION_PRESETS,
  formatResolutionLabel,
} from '@/lib/screen-resolution'

interface ScreenResolutionFieldsProps {
  presetId: string
  width: string
  height: string
  onPresetChange: (presetId: string) => void
  onWidthChange: (value: string) => void
  onHeightChange: (value: string) => void
}

export default function ScreenResolutionFields({
  presetId,
  width,
  height,
  onPresetChange,
  onWidthChange,
  onHeightChange,
}: ScreenResolutionFieldsProps) {
  const parsedWidth = Number.parseInt(width, 10) || 0
  const parsedHeight = Number.parseInt(height, 10) || 0
  const isCustom = presetId === 'custom'

  return (
    <div className="space-y-5 rounded-2xl border border-border/70 bg-muted/20 p-5">
      <div className="space-y-2">
        <Label className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Display Resolution
        </Label>
        <p className="text-2xl font-bold leading-tight text-foreground">
          Resolution:{' '}
          <span className="text-primary">
            {parsedWidth > 0 && parsedHeight > 0
              ? formatResolutionLabel(parsedWidth, parsedHeight)
              : 'Select a resolution'}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-base font-semibold">Resolution preset</Label>
        <select
          className="flex h-12 w-full rounded-xl border border-input bg-card px-4 text-base font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          value={presetId}
          onChange={(event) => onPresetChange(event.target.value)}
        >
          {SCREEN_RESOLUTION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.id === 'custom'
                ? preset.label
                : `${preset.width.toLocaleString()} × ${preset.height.toLocaleString()} (${preset.label})`}
            </option>
          ))}
        </select>
      </div>

      {isCustom && (
        <div className="space-y-3 rounded-xl border border-border/60 bg-card/80 p-4">
          <p className="text-base font-semibold text-foreground">Custom Size</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Width (px)</Label>
              <Input
                type="number"
                min={1}
                value={width}
                onChange={(event) => onWidthChange(event.target.value)}
                className="h-12 rounded-xl px-4 text-lg font-semibold"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Height (px)</Label>
              <Input
                type="number"
                min={1}
                value={height}
                onChange={(event) => onHeightChange(event.target.value)}
                className="h-12 rounded-xl px-4 text-lg font-semibold"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
