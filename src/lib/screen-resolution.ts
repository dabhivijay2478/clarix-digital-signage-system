export interface ScreenResolutionPreset {
  id: string
  label: string
  width: number
  height: number
}

export const SCREEN_RESOLUTION_PRESETS: ScreenResolutionPreset[] = [
  { id: 'fhd', label: 'Full HD', width: 1920, height: 1080 },
  { id: '4k', label: '4K UHD', width: 3840, height: 2160 },
  { id: 'custom', label: 'Custom Size', width: 0, height: 0 },
]

export function formatResolutionLabel(width: number, height: number): string {
  const preset = SCREEN_RESOLUTION_PRESETS.find(
    (item) => item.id !== 'custom' && item.width === width && item.height === height,
  )
  const size = `${width.toLocaleString()} × ${height.toLocaleString()}`
  return preset ? `${size} (${preset.label})` : `${size} (Custom Size)`
}

export function detectResolutionPreset(width: number, height: number): string {
  const match = SCREEN_RESOLUTION_PRESETS.find(
    (item) => item.id !== 'custom' && item.width === width && item.height === height,
  )
  return match?.id ?? 'custom'
}
