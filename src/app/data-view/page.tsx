'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, RefreshCw, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type DataRow = Record<string, unknown>

function parseCsv(text: string): DataRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)

  const headers = rows.shift()?.map((header, index) => header.trim() || `Column ${index + 1}`) ?? []
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function extractJsonRows(value: unknown): DataRow[] {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' && item !== null ? item as DataRow : { value: item })
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>
    for (const key of ['data', 'results', 'items', 'rows']) {
      if (Array.isArray(object[key])) return extractJsonRows(object[key])
    }
    return [object]
  }
  return [{ value }]
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function DataViewPage() {
  const [config, setConfig] = useState({ source: '', format: 'csv', title: 'Live Data', refresh: 60 })
  const [rows, setRows] = useState<DataRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setConfig({
      source: params.get('source') ?? '',
      format: params.get('format') ?? 'csv',
      title: params.get('title') || 'Live Data',
      refresh: Math.max(15, Number(params.get('refresh')) || 60),
    })
  }, [])

  const loadData = useCallback(async () => {
    if (!config.source) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(config.source, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`)
      const nextRows = config.format === 'json' ? extractJsonRows(await response.json()) : parseCsv(await response.text())
      setRows(nextRows)
      setLastUpdated(new Date())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    loadData()
    if (!config.source) return
    const interval = window.setInterval(loadData, config.refresh * 1000)
    return () => window.clearInterval(interval)
  }, [config.source, config.refresh, loadData])

  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))), [rows])

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/5 text-primary"><Database /> Live source</Badge>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{config.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : `Refreshes every ${config.refresh} seconds`}</p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh now</Button>
        </header>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {loading && rows.length === 0 ? (
              <div className="space-y-3 p-6">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
            ) : error ? (
              <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
                <TriangleAlert className="mb-4 size-10 text-destructive" />
                <p className="font-semibold">Unable to load this live source</p>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{error}. Confirm the URL is public and allows browser requests through CORS.</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-80 items-center justify-center px-6 text-sm text-muted-foreground">The source returned no rows.</div>
            ) : (
              <div className="max-h-[calc(100vh-150px)] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>{columns.map((column) => <TableHead key={column} className="whitespace-nowrap font-semibold">{column}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>{columns.map((column) => <TableCell key={column} className="max-w-96 truncate">{displayValue(row[column])}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
