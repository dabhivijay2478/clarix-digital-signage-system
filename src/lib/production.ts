import type {
  ProductionColumn,
  ProductionDataset,
  ProductionRow,
  ProductionTable,
  ProductionWidget,
} from './types'

export const chartPalette = ['#007fff', '#f97316', '#00a859', '#8a2be2', '#f59e0b', '#ef4444']

export function getProductionTable(dataset: ProductionDataset | null | undefined, tableId?: string | null): ProductionTable | null {
  if (!dataset) return null
  return dataset.tables.find((table) => table.id === tableId) ?? dataset.tables[0] ?? null
}

export function getColumn(table: ProductionTable | null | undefined, key?: string | null): ProductionColumn | null {
  if (!table || !key) return null
  return table.columns.find((column) => column.key === key) ?? null
}

export function labelFor(table: ProductionTable | null | undefined, key?: string | null): string {
  if (!key) return ''
  return getColumn(table, key)?.label ?? key
}

export function isNumericColumn(column: ProductionColumn): boolean {
  return column.data_type === 'number'
}

export function isDateColumn(column: ProductionColumn): boolean {
  return column.data_type === 'date' || column.key.toLowerCase().includes('date') || column.label.toLowerCase().includes('date')
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') {
    const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (datePrefix) {
      const date = new Date(`${datePrefix[1]}T00:00:00`)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB')
      }
    }
    return value
  }
  return JSON.stringify(value)
}

export function rowLabel(row: ProductionRow, key?: string | null): string {
  if (!key) return ''
  return displayValue(row[key])
}

export function filterRows(rows: ProductionRow[], widget: ProductionWidget): ProductionRow[] {
  if (!widget.filters.length) return rows
  return rows.filter((row) => widget.filters.every((filter) => {
    const value = row[filter.key]
    const text = displayValue(value).toLowerCase()
    const expected = filter.value.toLowerCase()
    if (filter.op === 'contains') return text.includes(expected)
    if (filter.op === 'equals') return text === expected
    if (filter.op === 'gt') return toNumber(value) > Number(filter.value)
    if (filter.op === 'lt') return toNumber(value) < Number(filter.value)
    return true
  }))
}

export function aggregate(values: number[], mode: string): number {
  if (mode === 'count') return values.length
  if (!values.length) return 0
  if (mode === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length
  if (mode === 'min') return Math.min(...values)
  if (mode === 'max') return Math.max(...values)
  return values.reduce((sum, value) => sum + value, 0)
}

export function buildChartRows(table: ProductionTable | null, widget: ProductionWidget): ProductionRow[] {
  if (!table) return []
  const rows = filterRows(table.rows, widget)

  if (widget.group_by_key && widget.measure_key) {
    const grouped = new Map<string, number[]>()
    rows.forEach((row) => {
      const key = rowLabel(row, widget.group_by_key) || 'Blank'
      const values = grouped.get(key) ?? []
      values.push(toNumber(row[widget.measure_key!]))
      grouped.set(key, values)
    })
    const result = Array.from(grouped.entries()).map(([category, values]) => ({
      category,
      value: aggregate(values, widget.aggregation),
    }))
    return limitRows(result, widget)
  }

  if (widget.x_key && widget.measure_key) {
    const grouped = new Map<string, number[]>()
    rows.forEach((row) => {
      const key = rowLabel(row, widget.x_key) || 'Blank'
      const values = grouped.get(key) ?? []
      values.push(toNumber(row[widget.measure_key!]))
      grouped.set(key, values)
    })
    return limitRows(Array.from(grouped.entries()).map(([category, values]) => ({
      category,
      value: aggregate(values, widget.aggregation),
    })), widget)
  }

  if (widget.x_key && widget.series_keys.length) {
    return limitRows(rows.map((row) => {
      const item: ProductionRow = { category: rowLabel(row, widget.x_key) }
      widget.series_keys.forEach((key) => { item[key] = toNumber(row[key]) })
      return item
    }), widget)
  }

  return limitRows(rows, widget)
}

export function chartSeriesKeys(table: ProductionTable | null, widget: ProductionWidget): string[] {
  if (widget.group_by_key && widget.measure_key) return ['value']
  if (widget.x_key && widget.measure_key) return ['value']
  if (widget.series_keys.length) return widget.series_keys
  return table?.columns.filter(isNumericColumn).slice(0, 3).map((column) => column.key) ?? []
}

export function makeChartConfig(table: ProductionTable | null, widget: ProductionWidget) {
  return Object.fromEntries(chartSeriesKeys(table, widget).map((key, index) => [
    key,
    { label: key === 'value' ? labelFor(table, widget.measure_key) || 'Value' : labelFor(table, key), color: widget.color_map[key] ?? chartPalette[index % chartPalette.length] },
  ]))
}

export function createWidget(table: ProductionTable, type: ProductionWidget['chart_type'] = 'line'): ProductionWidget {
  const numeric = table.columns.filter(isNumericColumn)
  const date = table.columns.find(isDateColumn)
  const firstText = table.columns.find((column) => column.data_type !== 'number')
  const sourceKey = date?.key ?? firstText?.key ?? table.columns[0]?.key ?? null
  const series = numeric.slice(0, 3).map((column) => column.key)
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return v.toString(16)
        }),
    title: type === 'kpi-table' ? `${table.name} Table` : `${table.name} Chart`,
    widget_type: type === 'kpi-table' ? 'table' : 'chart',
    chart_type: type,
    source_table_id: table.id,
    x_key: sourceKey,
    series_keys: series,
    measure_key: numeric[0]?.key ?? null,
    group_by_key: null,
    aggregation: 'sum',
    filters: [],
    top_n: null,
    color_map: Object.fromEntries(series.map((key, index) => [key, chartPalette[index % chartPalette.length]])),
  }
}

function limitRows(rows: ProductionRow[], widget: ProductionWidget): ProductionRow[] {
  const top = widget.top_n && widget.top_n > 0 ? widget.top_n : null
  if (!top) return rows
  const measure = chartSeriesKeys(null, widget)[0]
  return [...rows].sort((a, b) => toNumber(b[measure]) - toNumber(a[measure])).slice(0, top)
}
