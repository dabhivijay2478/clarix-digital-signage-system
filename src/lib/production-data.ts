export type ProductionLine = 'FSL' | 'PSL1' | 'PSL2'

export interface ProductionPoint {
  date: string
  FSL: number | null
  PSL1: number | null
  PSL2: number | null
}

export interface ProductionPlan {
  line: ProductionLine
  abp: number | null
  monthlyPlan: number | null
  updatedAt: string | null
}

export interface NormalizedProductionData {
  monthlyProduction: ProductionPoint[]
  todayProduction: ProductionPoint | null
  planning: ProductionPlan[]
}

export interface ProductionApiConfig {
  endpoint: string
  refreshIntervalSecs: number
  apiKeyConfigured: boolean
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

export interface ProductionLiveSnapshot {
  configured: boolean
  endpoint: string
  refreshIntervalSecs: number
  data: unknown | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

export interface ProductionApiConfigUpdate {
  endpoint: string
  refreshIntervalSecs: number
  apiKey?: string
  clearApiKey?: boolean
}

type UnknownRecord = Record<string, unknown>

const LINES: ProductionLine[] = ['FSL', 'PSL1', 'PSL2']

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function getField(record: UnknownRecord, aliases: string[]): unknown {
  const entries = Object.entries(record)
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.toLowerCase() === alias.toLowerCase())
    if (match) return match[1]
  }
  return undefined
}

function getArray(record: UnknownRecord | null, aliases: string[]): unknown[] {
  if (!record) return []
  const value = getField(record, aliases)
  return Array.isArray(value) ? value : []
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function mapPoint(value: unknown): ProductionPoint | null {
  const record = asRecord(value)
  if (!record) return null
  const date = toText(getField(record, ['Date', 'ProductionDate', 'date_time', 'timestamp'])) ?? ''
  const point: ProductionPoint = {
    date,
    FSL: toNumber(getField(record, ['FSL'])),
    PSL1: toNumber(getField(record, ['PSL1', 'PSL_1'])),
    PSL2: toNumber(getField(record, ['PSL2', 'PSL_2'])),
  }
  return LINES.some((line) => point[line] !== null) ? point : null
}

function aggregateLineOutputRows(values: unknown[]): ProductionPoint[] {
  const grouped = new Map<string, ProductionPoint>()

  for (const value of values) {
    const record = asRecord(value)
    if (!record) continue
    const lineText = toText(getField(record, ['Line', 'ProductionLine', 'Plant']))?.toUpperCase()
    const line = LINES.find((candidate) => candidate === lineText)
    const output = toNumber(getField(record, ['Output', 'Quantity', 'Qty', 'Value']))
    if (!line || output === null) continue

    const date = toText(getField(record, ['Date', 'ProductionDate', 'date_time', 'timestamp'])) ?? ''
    const current = grouped.get(date) ?? { date, FSL: null, PSL1: null, PSL2: null }
    current[line] = (current[line] ?? 0) + output
    grouped.set(date, current)
  }

  return Array.from(grouped.values())
}

function mapPoints(values: unknown[]): ProductionPoint[] {
  const direct = values.map(mapPoint).filter((value): value is ProductionPoint => Boolean(value))
  return direct.length > 0 ? direct : aggregateLineOutputRows(values)
}

function mapPlanning(values: unknown[]): ProductionPlan[] {
  return values.flatMap((value) => {
    const record = asRecord(value)
    if (!record) return []
    const lineText = toText(getField(record, ['LINE', 'Line', 'ProductionLine']))?.toUpperCase()
    const line = LINES.find((candidate) => candidate === lineText)
    if (!line) return []
    return [{
      line,
      abp: toNumber(getField(record, ['ABP'])),
      monthlyPlan: toNumber(getField(record, ['MONTHLY_PLAN', 'MonthlyPlan', 'Plan'])),
      updatedAt: toText(getField(record, ['UPD_TIME', 'UpdatedAt', 'LastUpdated'])),
    }]
  })
}

export function normalizeProductionPayload(payload: unknown): NormalizedProductionData {
  const root = asRecord(payload)
  const nestedData = root ? getField(root, ['data', 'result']) : null
  const nestedRecord = asRecord(nestedData)
  const sourceRecord = nestedRecord ?? root

  let monthlyRows: unknown[]
  if (Array.isArray(payload)) {
    monthlyRows = payload
  } else if (Array.isArray(nestedData)) {
    monthlyRows = nestedData
  } else {
    monthlyRows = getArray(sourceRecord, [
      'monthlyProduction',
      'MonthlyProduction',
      'productionSummary',
      'ProductionSummary',
    ])
    if (monthlyRows.length === 0 && sourceRecord && mapPoint(sourceRecord)) {
      monthlyRows = [sourceRecord]
    }
  }

  const dailyRows = getArray(sourceRecord, [
    'dailyProduction',
    'DailyProduction',
    'todayLiveData',
    'TodayLiveData',
    'todayProduction',
  ])
  const planningRows = getArray(sourceRecord, [
    'planningData',
    'PlanningData',
    'Planingdata',
    'plans',
  ])

  const monthlyProduction = mapPoints(monthlyRows)
  const todayPoints = mapPoints(dailyRows)

  return {
    monthlyProduction,
    todayProduction: todayPoints.at(-1) ?? monthlyProduction.at(-1) ?? null,
    planning: mapPlanning(planningRows),
  }
}

export function hasProductionValues(data: NormalizedProductionData): boolean {
  return data.monthlyProduction.length > 0
    || Boolean(data.todayProduction)
    || data.planning.length > 0
}

export function formatProductionDateLabel(value: string): string {
  const trimmed = value.trim()
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed)
  if (dayFirst) return `${dayFirst[1].padStart(2, '0')}-${dayFirst[2].padStart(2, '0')}`
  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(trimmed)
  if (yearFirst) return `${yearFirst[3].padStart(2, '0')}-${yearFirst[2].padStart(2, '0')}`
  return trimmed.length > 10 ? trimmed.slice(0, 10) : trimmed
}

export function getProductionPeriodLabel(data: NormalizedProductionData): string {
  const raw = data.monthlyProduction.at(-1)?.date || data.todayProduction?.date || ''
  if (!raw) return 'Live'

  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw)
  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw)
  const monthName = /^([A-Za-z]+)\s+(\d{4})$/.exec(raw)
  const year = dayFirst?.[3] ?? yearFirst?.[1] ?? monthName?.[2]
  const month = dayFirst?.[2] ?? yearFirst?.[2]

  if (monthName) return `${monthName[1].slice(0, 3)} '${monthName[2].slice(2)}`
  if (!year || !month) return raw
  const monthLabel = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
    .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${monthLabel} '${year.slice(2)}`
}
