import { APP_TIME_ZONE, getValidTimeZone } from './signage-schedule'

export type DispatchedTruckCsvRow = Record<string, unknown>

const DISPATCHED_TRUCK_HEADERS = [
  'Sr. No.',
  'Truck Number',
  'Gate',
  'Date',
  'Loading In Time',
  'Loading Out Time',
  'Loading Duration',
]

function escapeCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function getZonedParts(value: unknown, timeZone: string): Record<string, string> | null {
  const date = asDate(value)
  if (!date) return null

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: getValidTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )
}

export function formatTruckExportDate(value: unknown, timeZone = APP_TIME_ZONE): string {
  const parts = getZonedParts(value, timeZone)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

export function formatTruckExportTime12(value: unknown, timeZone = APP_TIME_ZONE): string {
  const parts = getZonedParts(value, timeZone)
  if (!parts) return ''

  const hour24 = Number(parts.hour) % 24
  const hour12 = hour24 % 12 || 12
  const period = hour24 >= 12 ? 'PM' : 'AM'
  return `${String(hour12).padStart(2, '0')}:${parts.minute} ${period}`
}

export function formatTruckExportDuration(seconds: unknown): string {
  if (seconds === null || seconds === undefined || seconds === '') return ''
  const totalSeconds = Number(seconds)
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return ''

  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getLoadingDurationSeconds(row: DispatchedTruckCsvRow): unknown {
  if (row.loading_duration !== null && row.loading_duration !== undefined && row.loading_duration !== '') {
    return row.loading_duration
  }

  const loadingAt = asDate(row.loading_at)
  const outAt = asDate(row.out_at)
  if (!loadingAt || !outAt) return null
  return Math.max(0, Math.floor((outAt.getTime() - loadingAt.getTime()) / 1000))
}

export function buildDispatchedTrucksCsv(
  rows: DispatchedTruckCsvRow[],
  timeZone = APP_TIME_ZONE,
): string {
  const headerLine = DISPATCHED_TRUCK_HEADERS.map(escapeCsvValue).join(',')
  const rowLines = rows.map((row, index) => [
    index + 1,
    row.registration_number,
    row.gate_no,
    formatTruckExportDate(row.loading_at || row.created_at, timeZone),
    formatTruckExportTime12(row.loading_at, timeZone),
    formatTruckExportTime12(row.out_at, timeZone),
    formatTruckExportDuration(getLoadingDurationSeconds(row)),
  ].map(escapeCsvValue).join(','))

  return `\uFEFF${[headerLine, ...rowLines].join('\n')}`
}
