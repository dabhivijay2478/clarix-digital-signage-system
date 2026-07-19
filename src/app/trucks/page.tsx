'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import {
  Clock,
  Edit2,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Truck,
  Upload,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Download,
  Timer,
  CheckCircle2,
  CalendarDays,
  Activity,
} from 'lucide-react'
import { useTrucks } from '@/hooks/useTrucks'
import { useScreens } from '@/hooks/useScreens'
import { showToast } from '@/components/Toast'
import Modal from '@/components/Modal'
import { customConfirm, databaseApi, productionApi, truckAlertsApi, trucksApi } from '@/lib/tauri'
import { formatDateTime } from '@/lib/utils'
import {
  createTruckScreenAlert,
  getTruckStatusInfo,
  previewTruckStatusUpdate,
  type TruckStatusField,
} from '@/lib/truck-alerts'
import {
  formatQueueDuration,
  getEstimatedWaitMinsForTruck,
} from '@/lib/truck-queue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ProductionImportResult, ProductionRow, TruckDispatchSummary, TruckScreenAlert, Truck as TruckType } from '@/lib/types'
import {
  useGateStore,
  isValidGateNumber,
  normalizeGateNumber,
  TRUCK_DISPLAY_ROTATION_OPTIONS,
} from '@/store/gateStore'
import { cn } from '@/lib/utils'

// ── Compact Stat Card ──────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  sublabel,
  color = 'primary',
}: {
  icon: React.ElementType
  value: number | string
  label: string
  sublabel?: string
  color?: 'primary' | 'blue' | 'violet' | 'green' | 'amber' | 'rose'
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
  }

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 cursor-default">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-bold ${colorMap[color]}`}>
        {value}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground truncate">{sublabel}</p>
        )}
      </div>
      <Icon className="size-5 text-muted-foreground/50" />
    </div>
  )
}



// ── Helpers ──────────────────────────────────────────────────────────────────

const delimitedExtensions = new Set(['csv', 'tsv', 'txt'])
const excelExtensions = new Set(['xlsx', 'xls', 'xlsm', 'xlsb'])

type TruckImportRow = {
  registration_number: string
  gate_no: string
  delivery_batch_code: string | null
}

function getGateColorClass(gateNo: string | null | undefined): string {
  if (!gateNo) {
    return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/15'
  }
  const cleanGate = gateNo.trim().toUpperCase()
  
  let hash = 0
  for (let i = 0; i < cleanGate.length; i++) {
    hash = cleanGate.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const colors = [
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/15',
    'bg-indigo-500/10 text-indigo-400 border-indigo-500/15',
    'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/15',
    'bg-amber-500/10 text-amber-400 border-amber-500/15',
    'bg-rose-500/10 text-rose-400 border-rose-500/15',
    'bg-sky-500/10 text-sky-400 border-sky-500/15',
    'bg-orange-500/10 text-orange-400 border-orange-500/15',
  ]
  
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

function makeGateNormalizer(configuredGates: string[]) {
  const gatesByNormalizedNumber = new Map(
    configuredGates.map((gate) => [normalizeGateNumber(gate), normalizeGateNumber(gate)])
  )

  return function normalizeGateNo(value: string | null | undefined): string {
    const raw = normalizeGateNumber(value ?? '')
    if (!raw) return ''
    return gatesByNormalizedNumber.get(raw) ?? raw
  }
}

function normalizeImportKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function stringifyImportValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getImportValue(row: Record<string, unknown>, names: string[]): string {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeImportKey(key), value])
  )
  for (const name of names) {
    const value = stringifyImportValue(normalized.get(normalizeImportKey(name)))
    if (value) return value
  }
  return ''
}

function getGateFromDeliveryBatch(value: string): string {
  const match = value.trim().match(/[a-z0-9]$/i)
  return match ? match[0].toLowerCase() : ''
}

function suggestGateForBatchCode(batchCode: string, configuredGates: string[]): string {
  const normalizedCode = normalizeGateNumber(batchCode)
  const normalizedGates = configuredGates.map(normalizeGateNumber)
  const exactMatch = normalizedGates.find((gate) => gate === normalizedCode)
  if (exactMatch) return exactMatch

  const prefixMatches = normalizedGates.filter((gate) => gate.startsWith(normalizedCode))
  return prefixMatches.length === 1 ? prefixMatches[0] : ''
}

function escapeCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function getExportTruckStatus(row: Record<string, unknown>): string {
  if (row.out_at || row.is_out) return 'dispatched'
  if (row.loading_at || row.in_at || row.is_loading || row.is_in) return 'loading'
  return 'waiting'
}

function mapImportRecordToTruck(row: Record<string, unknown>, normalizeGateNo: (v: string) => string): TruckImportRow {
  const explicitGate = getImportValue(row, ['gate_no', 'gate', 'gate_number', 'gateno'])
  const deliveryBatchGate = getGateFromDeliveryBatch(getImportValue(row, [
    'del.batch',
    'del_batch',
    'del batch',
    'del.bacthc',
    'del_bacthc',
    'del bacthc',
    'delivery_batch',
    'delivery batch',
    'delivery_batch_no',
    'delivery batch no',
    'batch',
  ]))
  return {
    registration_number: getImportValue(row, [
      'registration_number',
      'registration',
      'reg_no',
      'reg_number',
      'vehicle_no',
      'vehicle_number',
      'vehicle',
      'vechical_number',
      'vechical number',
      'vechicle_number',
      'vechicle number',
      'vehical_number',
      'vehical number',
      'truck_no',
      'truck_number',
      'number',
    ]),
    gate_no: explicitGate ? normalizeGateNo(explicitGate) : '',
    delivery_batch_code: explicitGate ? null : deliveryBatchGate || null,
  }
}

function formatDurationFrom(start: string | null | undefined, end?: string | null): string {
  if (!start) return '—'
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return '—'
  const totalMinutes = Math.floor((endTime - startTime) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  const paddedHours = String(hours).padStart(2, '0')
  const paddedMinutes = String(minutes).padStart(2, '0')
  return `${paddedHours}:${paddedMinutes}`
}

function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—'
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  const paddedHours = String(hours).padStart(2, '0')
  const paddedMinutes = String(minutes).padStart(2, '0')
  return `${paddedHours}:${paddedMinutes}`
}

function parseDelimitedText(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (char === '"') {
          inQuotes = false
        } else {
          current += char
        }
      } else {
        if (char === '"') {
          inQuotes = true
        } else if (char === delimiter) {
          cells.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
    }
    cells.push(current.trim())
    rows.push(cells)
  }
  return rows
}

function parseTruckRowsFromDelimited(text: string, delimiter: string, normalizeGateNo: (v: string | null | undefined) => string): TruckImportRow[] {
  const rows = parseDelimitedText(text, delimiter)
  if (rows.length < 2) return []
  const headers = rows[0].map(normalizeImportKey)
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
      return mapImportRecordToTruck(record, normalizeGateNo)
    })
    .filter((truck) => truck.registration_number)
}

function parseTruckRowsFromProductionImport(result: ProductionImportResult, normalizeGateNo: (v: string | null | undefined) => string): TruckImportRow[] {
  return result.tables
    .flatMap((table) => table.rows)
    .map((row: ProductionRow) => mapImportRecordToTruck(row, normalizeGateNo))
    .filter((truck) => truck.registration_number)
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TrucksPage() {
  const {
    trucks,
    addTruck,
    editTruck,
    deleteTruck,
    updateTruckChecks,
    importTrucks,
    getTruckById,
    moveTruck,
  } = useTrucks()

  const { gates, displayRotationSecs, updateDisplayRotationSecs } = useGateStore()
  const { screens } = useScreens()

  const normalizeGateNo = useMemo(() => makeGateNormalizer(gates.map((g) => g.number)), [gates])

  const [search, setSearch] = useState('')
  const [activeGateTab, setActiveGateTab] = useState<string>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showAddTruck, setShowAddTruck] = useState(false)
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null)
  const [selectedTruckForDetails, setSelectedTruckForDetails] = useState<TruckType | null>(null)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [dispatchSummary, setDispatchSummary] = useState<TruckDispatchSummary | null>(null)
  const [lastAlert, setLastAlert] = useState<TruckScreenAlert | null>(null)
  const [importPreviewData, setImportPreviewData] = useState<Array<{
    registration_number: string
    gate_no: string
    delivery_batch_code: string | null
  }>>([])
  const [importGateMappings, setImportGateMappings] = useState<Record<string, string>>({})
  const [isExportingTrucks, setIsExportingTrucks] = useState(false)
  const didSyncActiveSnapshot = useRef(false)

  const [fRegNo, setFRegNo] = useState('')
  const [fGateNo, setFGateNo] = useState('')

  const refreshDispatchSummary = useCallback(async () => {
    try {
      setDispatchSummary(await truckAlertsApi.getDispatchSummary())
    } catch (error) {
      console.warn('Failed to load dispatch summary:', error)
    }
  }, [])

  useEffect(() => {
    refreshDispatchSummary()
  }, [refreshDispatchSummary])

  useEffect(() => {
    if (didSyncActiveSnapshot.current || trucks.length === 0) return
    didSyncActiveSnapshot.current = true
    void trucksApi.saveActiveSnapshot(trucks).catch((error) => {
      console.warn('Failed to sync active truck snapshot:', error)
    })
  }, [trucks])

  useEffect(() => {
    if (trucks.length === 0) return
    const timer = setTimeout(() => {
      void trucksApi.saveActiveSnapshot(trucks).catch((error) => {
        console.warn('Failed to refresh active truck snapshot:', error)
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [trucks])

  const resetTruckForm = () => {
    setFRegNo('')
    setFGateNo('')
  }

  const handleAddTruck = () => {
    if (!fRegNo.trim() || !fGateNo.trim()) {
      showToast('Please fill registration number and gate', 'error')
      return
    }
    addTruck({
      registration_number: fRegNo.trim(),
      gate_no: normalizeGateNo(fGateNo) || null,
      is_waiting: true,
      is_loading: false,
      is_in: false,
      is_out: false,
      waiting_at: new Date().toISOString(),
      loading_at: null,
      in_at: null,
      out_at: null,
    })
    showToast(`Truck "${fRegNo}" added`, 'success')
    resetTruckForm()
    setShowAddTruck(false)
  }

  const openEditTruck = (id: string) => {
    const truck = getTruckById(id)
    if (!truck) return
    setEditingTruckId(id)
    setFRegNo(truck.registration_number)
    setFGateNo(normalizeGateNo(truck.gate_no) || truck.gate_no || '')
  }

  const handleSaveEditTruck = () => {
    if (!editingTruckId) return
    if (!fRegNo.trim() || !fGateNo.trim()) {
      showToast('Please fill registration number and gate', 'error')
      return
    }
    editTruck(editingTruckId, {
      registration_number: fRegNo.trim(),
      gate_no: normalizeGateNo(fGateNo) || fGateNo.trim().toLowerCase() || null,
    })
    showToast('Truck updated', 'success')
    resetTruckForm()
    setEditingTruckId(null)
  }

  const handleDeleteTruck = async (id: string) => {
    const truck = getTruckById(id)
    const confirmed = await customConfirm(`Delete truck "${truck?.registration_number}"?`)
    if (confirmed) {
      deleteTruck(id)
      showToast('Truck deleted', 'error')
    }
  }

  const handleTruckStatusChange = async (truck: TruckType, field: TruckStatusField, value: boolean) => {
    if (truck[field] === value) return

    const before = getTruckStatusInfo(truck)
    const preview = previewTruckStatusUpdate(truck, field, value)
    const after = getTruckStatusInfo(preview)

    updateTruckChecks(truck.id, field, value)

    if (before.status === after.status) return

    try {
      const gateVal = (preview.gate_no ?? '').toLowerCase()
      const queueSnapshot = trucks.map(t => t.id === preview.id ? preview : t)
      const gateTrucks = trucks
        .map(t => t.id === preview.id ? preview : t)
        .filter((t) => (t.gate_no ?? '').toLowerCase() === gateVal)

      const active = gateTrucks.find((t) => (t.is_loading || t.is_in) && !t.is_out) || null
      const waitingList = gateTrucks.filter((t) => t.is_waiting && !t.is_loading && !t.is_in && !t.is_out)
      const next = waitingList[0] || null

      const alert = {
        ...createTruckScreenAlert(preview),
        active_truck_number: active ? active.registration_number : null,
        active_truck_status: active ? getTruckStatusInfo(active).status_label : null,
        next_truck_number: next ? next.registration_number : null,
        next_truck_status: next ? getTruckStatusInfo(next).status_label : null,
        queue_trucks: queueSnapshot,
        queue_gates: gates.map((gate) => ({
          number: gate.number,
          loadingDurationMins: gate.loadingDurationMins,
        })),
        display_rotation_secs: displayRotationSecs,
      }
      await truckAlertsApi.publish(alert)
      setLastAlert(alert)

      if (field === 'is_out' && value === true) {
        await truckAlertsApi.saveDispatchedTruck(preview)
        await refreshDispatchSummary()
        showToast(`Truck "${truck.registration_number}" dispatched and saved to database`, 'success')
        // Do not delete truck so it remains in the store and lists
      }

      const { screensApi, localNetworkApi } = await import('@/lib/tauri')
      const screens = await screensApi.getAll()
      for (const screen of screens) {
        if (screen.pairing_status === 'paired') {
          await localNetworkApi.forceSyncScreen(screen.id).catch((err) =>
            console.warn(`Failed to force sync screen ${screen.id}:`, err)
          )
        }
      }
    } catch (error) {
      console.warn('Failed to publish truck alert:', error)
    }
  }

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      let parsed: TruckImportRow[] = []

      if (delimitedExtensions.has(extension)) {
        const text = await file.text()
        parsed = parseTruckRowsFromDelimited(text, extension === 'tsv' ? '\t' : ',', normalizeGateNo)
      } else if (excelExtensions.has(extension)) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const result = await productionApi.importFile(file.name, bytes)
        parsed = parseTruckRowsFromProductionImport(result, normalizeGateNo)
      } else {
        showToast('Unsupported file type. Upload CSV, TSV, XLS, or XLSX.', 'error')
        return
      }

      if (parsed.length === 0) {
        showToast('No valid truck records found. Use truck_number/gate or vehicle_number/del.batch columns.', 'error')
        return
      }

      const configuredGateNumbers = gates.map((gate) => gate.number)
      const batchCodes = [...new Set(
        parsed
          .map((row) => row.delivery_batch_code)
          .filter((code): code is string => Boolean(code))
      )]
      setImportGateMappings(Object.fromEntries(
        batchCodes.map((code) => [code, suggestGateForBatchCode(code, configuredGateNumbers)])
      ))
      setImportPreviewData(parsed)
      setShowImportPreview(true)
    } catch (error) {
      showToast(`Import failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [gates, normalizeGateNo])

  const importBatchCodes = useMemo(
    () => [...new Set(
      importPreviewData
        .map((row) => row.delivery_batch_code)
        .filter((code): code is string => Boolean(code))
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [importPreviewData]
  )

  const configuredImportGateNumbers = useMemo(
    () => new Set(gates.map((gate) => normalizeGateNumber(gate.number))),
    [gates]
  )

  const resolvedImportPreviewData = useMemo(
    () => importPreviewData.map((row) => {
      const mappedGate = row.delivery_batch_code
        ? normalizeGateNumber(importGateMappings[row.delivery_batch_code] ?? '')
        : normalizeGateNumber(row.gate_no)
      return {
        ...row,
        gate_no: configuredImportGateNumbers.has(mappedGate) ? mappedGate : '',
      }
    }),
    [configuredImportGateNumbers, importGateMappings, importPreviewData]
  )

  const unresolvedImportCount = useMemo(
    () => resolvedImportPreviewData.filter((row) => !row.gate_no).length,
    [resolvedImportPreviewData]
  )

  const closeImportPreview = () => {
    setShowImportPreview(false)
    setImportPreviewData([])
    setImportGateMappings({})
  }

  const handleConfirmImport = () => {
    if (unresolvedImportCount > 0) {
      showToast('Map every delivery batch code to a configured gate before importing.', 'error')
      return
    }

    const count = importTrucks(
      resolvedImportPreviewData.map((d) => ({
        registration_number: d.registration_number,
        gate_no: d.gate_no,
        is_waiting: true,
        is_loading: false,
        is_in: false,
        is_out: false,
        waiting_at: new Date().toISOString(),
        loading_at: null,
        in_at: null,
        out_at: null,
      }))
    )
    showToast(`${count} truck${count !== 1 ? 's' : ''} imported successfully`, 'success')
    closeImportPreview()
  }

  const handleExportTruckCsv = async () => {
    if (isExportingTrucks) return
    setIsExportingTrucks(true)

    try {
      const recordsById = new Map<string, { row: Record<string, unknown>; source: string }>()
      const addRecords = (rows: Record<string, unknown>[], source: string) => {
        rows.forEach((row, index) => {
          const registrationNumber = stringifyImportValue(row.registration_number)
          if (!registrationNumber) return
          const key = stringifyImportValue(row.id)
            || `${source}:${registrationNumber}:${stringifyImportValue(row.created_at)}:${index}`
          if (source !== 'dispatched' && recordsById.get(key)?.source === 'dispatched') return
          recordsById.set(key, { row, source })
        })
      }

      try {
        const [activeTable, dispatchedTable] = await Promise.all([
          databaseApi.getTableData('active_trucks'),
          databaseApi.getTableData('dispatched_trucks'),
        ])
        addRecords(activeTable.rows, 'active')
        addRecords(dispatchedTable.rows, 'dispatched')
      } catch (error) {
        console.warn('Database truck export fell back to the live truck store:', error)
      }

      addRecords(
        trucks.map((truck) => ({ ...truck }) as Record<string, unknown>),
        'active'
      )

      const records = [...recordsById.values()]
      if (records.length === 0) {
        showToast('No truck records are available to export.', 'error')
        return
      }

      const columns = [
        'truck_number',
        'gate',
        'status',
        'waiting_at',
        'loading_at',
        'in_at',
        'out_at',
        'created_at',
        'loading_duration_seconds',
        'record_source',
      ]
      const lines = records.map(({ row, source }) => [
        row.registration_number,
        row.gate_no,
        getExportTruckStatus(row),
        row.waiting_at,
        row.loading_at,
        row.in_at,
        row.out_at,
        row.created_at,
        row.loading_duration,
        source,
      ].map(escapeCsvValue).join(','))
      const csvContent = `\uFEFF${columns.join(',')}\n${lines.join('\n')}`
      const filename = `truck-token-records-${new Date().toISOString().slice(0, 10)}.csv`
      const tauriWindow = window as typeof window & { __TAURI_INTERNALS__?: unknown }

      if (tauriWindow.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        const savePath = await invoke<string | null>('plugin:dialog|save', {
          options: {
            title: 'Export Truck Token Records',
            defaultPath: filename,
            filters: [{ name: 'CSV', extensions: ['csv'] }],
          },
        })
        if (!savePath) return
        await databaseApi.saveTextFile(savePath, csvContent)
      } else {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
      }

      showToast(`${records.length} truck record${records.length !== 1 ? 's' : ''} exported`, 'success')
    } catch (error) {
      console.error('Failed to export truck records:', error)
      showToast(`Truck CSV export failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setIsExportingTrucks(false)
    }
  }

  const allGateNumbers = useMemo(() => {
    const fromGates = gates.map((g) => g.number)
    return fromGates
  }, [gates])

  const gateQueueSettings = useMemo(
    () => gates.map((gate) => ({
      number: gate.number,
      loadingDurationMins: gate.loadingDurationMins,
    })),
    [gates]
  )

  const filteredTrucks = trucks.filter((t) => {
    const matchesSearch = t.registration_number.toLowerCase().includes(search.toLowerCase()) ||
                         (t.gate_no ?? '').toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false

    if (activeGateTab === 'dispatched') {
      return t.is_out === true
    }

    if (activeGateTab === 'all') {
      return true
    }

    // Gate tabs: only active (non-dispatched) trucks for that gate
    if (t.is_out) return false
    return (t.gate_no ?? '').toLowerCase() === activeGateTab
  })

  const gateRanks = useMemo(() => {
    const ranks = new Map<string, number>()
    const gateNums = allGateNumbers.length > 0 ? allGateNumbers : [...new Set(trucks.map((t) => (t.gate_no ?? '').toLowerCase()).filter(Boolean))]
    for (const gate of gateNums) {
      trucks
        .filter((truck) => !truck.is_out && (truck.gate_no ?? '').toLowerCase() === gate)
        .forEach((truck, index) => ranks.set(truck.id, index))
    }
    return ranks
  }, [trucks, allGateNumbers])

  const renderTruckFormFields = () => (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Truck Number *</Label>
          <Input placeholder="MH-01-AB-1234" value={fRegNo} onChange={(e) => setFRegNo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Gate *</Label>
          {gates.length > 0 ? (
            <Select value={fGateNo} onValueChange={setFGateNo}>
              <SelectTrigger>
                <SelectValue placeholder="Select gate" />
              </SelectTrigger>
              <SelectContent>
                {gates.map((gate) => <SelectItem key={gate.id} value={gate.number}>{gate.number.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input placeholder="e.g., E, C, 1, D1" value={fGateNo} onChange={(e) => setFGateNo(e.target.value)} />
          )}
        </div>
      </div>
    </div>
  )

  // Computed stats
  const totalActive = trucks.filter(t => !t.is_out).length
  const waitingCount = trucks.filter(t => t.is_waiting && !t.is_out).length
  const loadingCount = trucks.filter(t => t.is_loading && !t.is_out).length
  const dispatchedTodayCount = dispatchSummary?.today ?? 0

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Truck className="size-4 text-primary" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">Truck Token</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Truck Token</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your trucks and track loading status in real‑time.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search trucks..."
              className="w-[220px] pl-9 bg-card/60 border-border/60"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={Truck} value={totalActive} label="Total" sublabel="Active trucks" color="primary" />
        <StatCard icon={Timer} value={waitingCount} label="Waiting" sublabel="In queue" color="amber" />
        <StatCard icon={Activity} value={loadingCount} label="Loading" sublabel="In progress" color="blue" />
        <StatCard icon={CheckCircle2} value={dispatchedTodayCount} label="Dispatched" sublabel="Today" color="green" />
        <StatCard icon={CalendarDays} value={dispatchSummary?.this_month ?? 0} label="This Month" sublabel="Month total" color="rose" />
      </div>



      {/* ── Truck Table Section ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Gate Tabs */}
        <div className="flex border-b border-border/60 overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            onClick={() => setActiveGateTab('all')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeGateTab === 'all'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            All Trucks
          </button>
          {allGateNumbers.map((gateNum) => (
            <button
              key={gateNum}
              onClick={() => setActiveGateTab(gateNum)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                activeGateTab === gateNum
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Gate {gateNum.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setActiveGateTab('dispatched')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeGateTab === 'dispatched'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Dispatched / Out
          </button>
        </div>

        {/* Action bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''}
            </span>
            {filteredTrucks.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="display-rotation" className="sr-only">
                Display change interval
              </Label>
              <Select
                value={String(displayRotationSecs)}
                onValueChange={(value) => updateDisplayRotationSecs(Number(value))}
              >
                <SelectTrigger id="display-rotation" className="h-9 w-[210px] border-border/60 bg-card/60">
                  <SelectValue placeholder="Display change time" />
                </SelectTrigger>
                <SelectContent>
                  {TRUCK_DISPLAY_ROTATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      Change every {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xlsb"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="border-border/60">
              <Upload className="mr-1.5 size-4" /> Import CSV / Excel
            </Button>
            <Button onClick={() => { resetTruckForm(); setShowAddTruck(true) }}>
              <Plus className="mr-1 size-4" /> Add Truck
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExportTruckCsv()}
              disabled={isExportingTrucks}
              className="border-border/60"
            >
              <Download className="mr-1.5 size-4" />
              {isExportingTrucks ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {/* Truck Table / Empty State */}
        {filteredTrucks.length === 0 ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50 border border-border">
                <Truck className="size-8 text-muted-foreground/40" />
              </div>
              <p className="text-base font-semibold">No trucks yet</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                Add a truck manually or import from a CSV / Excel file to get started.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1.5 size-4" /> Import CSV / Excel
                </Button>
                <Button onClick={() => { resetTruckForm(); setShowAddTruck(true) }}>
                  <Plus className="mr-1 size-4" /> Add Truck
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-border/60 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="w-[52px] text-[11px] font-semibold uppercase tracking-wide">#</TableHead>
                    <TableHead className="min-w-[150px] text-[11px] font-semibold uppercase tracking-wide">Truck Number</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wide">Status</TableHead>
                    <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wide">Move</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wide">Gate</TableHead>
                    <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wide">Waiting</TableHead>
                    <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wide">Loading In</TableHead>
                    <TableHead className="text-center text-[11px] font-semibold uppercase tracking-wide">Loading Out</TableHead>
                    <TableHead className="w-[120px] text-[11px] font-semibold uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrucks.map((truck, index) => {
                    const canLoading = truck.is_waiting === true
                    const queueRank = gateRanks.get(truck.id) ?? 999
                    const canAdvanceByQueue = queueRank <= 1
                    const canOut = truck.is_loading === true && canAdvanceByQueue

                    const statusLabel = getTruckStatusInfo(truck).status_label
                    const isWaiting = statusLabel === 'Waiting'
                    const fullIndex = trucks.findIndex((t) => t.id === truck.id)
                    const canMoveUp = trucks.slice(0, fullIndex).some((t) => t.is_waiting)
                    const canMoveDown = trucks.slice(fullIndex + 1).some((t) => t.is_waiting)

                    const statusStyles: Record<string, string> = {
                      'Loading Out.': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                      'Loading in.': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                      'Waiting': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                    }

                    return (
                      <TableRow
                        key={truck.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors border-border/40"
                        onClick={() => setSelectedTruckForDetails(truck)}
                      >
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-mono font-semibold text-sm">{truck.registration_number}</span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                              {truck.is_out ? (
                                <span className="text-emerald-500 font-semibold">
                                  Dispatched (Loaded for {formatDurationSeconds(truck.loading_duration)})
                                </span>
                              ) : truck.is_loading ? (
                                <span className="text-blue-500 font-medium">
                                  Loading for {formatDurationFrom(truck.loading_at)}
                                </span>
                              ) : (
                                `Waiting ${formatDurationFrom(truck.waiting_at)}`
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('text-[11px] font-medium border', statusStyles[statusLabel] ?? 'bg-muted text-muted-foreground')}
                          >
                            {statusLabel.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-mono text-xs font-semibold text-muted-foreground min-w-[3rem] text-center">
                              {statusLabel === 'Waiting'
                                ? formatQueueDuration(getEstimatedWaitMinsForTruck(trucks, truck, gateQueueSettings))
                                : 'Now'}
                            </span>
                            {isWaiting ? (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-6 p-0"
                                  disabled={!canMoveUp}
                                  onClick={() => moveTruck(truck.id, 'up')}
                                  title="Move Up"
                                >
                                  <ArrowUp className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-6 p-0"
                                  disabled={!canMoveDown}
                                  onClick={() => moveTruck(truck.id, 'down')}
                                  title="Move Down"
                                >
                                  <ArrowDown className="size-3" />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {truck.gate_no ? (
                            <Badge variant="outline" className={cn("text-[11px] font-bold uppercase", getGateColorClass(truck.gate_no))}>
                              {truck.gate_no}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={truck.is_waiting ?? false}
                            disabled={truck.is_out}
                            onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_waiting', checked === true)}
                          />
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={truck.is_loading ?? false}
                            disabled={truck.is_out || !canLoading || !canAdvanceByQueue}
                            title={truck.is_out ? undefined : (!canAdvanceByQueue ? 'Only first and second trucks in this gate queue can change status.' : undefined)}
                            onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_loading', checked === true)}
                          />
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={truck.is_out ?? false}
                            disabled={truck.is_out || !canOut}
                            title={truck.is_out ? undefined : (!canAdvanceByQueue ? 'Only first and second trucks in this gate queue can change status.' : undefined)}
                            onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_out', checked === true)}
                          />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7"
                              onClick={() => setSelectedTruckForDetails(truck)}
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            {!truck.is_out && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-7"
                                  onClick={() => openEditTruck(truck.id)}
                                >
                                  <Edit2 className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-7 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteTruck(truck.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── ADD TRUCK MODAL ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showAddTruck}
        onClose={() => setShowAddTruck(false)}
        title="Add New Truck"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowAddTruck(false)}>Cancel</Button>
            <Button onClick={handleAddTruck}>Add Truck</Button>
          </>
        }
      >
        {renderTruckFormFields()}
      </Modal>

      {/* ── EDIT TRUCK MODAL ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!editingTruckId}
        onClose={() => { setEditingTruckId(null); resetTruckForm() }}
        title="Edit Truck"
        actions={
          <>
            <Button variant="outline" onClick={() => { setEditingTruckId(null); resetTruckForm() }}>Cancel</Button>
            <Button onClick={handleSaveEditTruck}>Save Changes</Button>
          </>
        }
      >
        {renderTruckFormFields()}
      </Modal>

      {/* ── TRUCK DETAILS & STATUS LOG MODAL ──────────────────────────────────── */}
      <Modal
        isOpen={!!selectedTruckForDetails}
        onClose={() => setSelectedTruckForDetails(null)}
        title="Truck Details & Status Log"
        actions={
          <Button onClick={() => setSelectedTruckForDetails(null)}>Close</Button>
        }
      >
        {selectedTruckForDetails && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-start gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <Truck className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-mono text-lg font-bold tracking-tight">
                  {selectedTruckForDetails.registration_number}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedTruckForDetails.gate_no
                    ? `Gate: ${selectedTruckForDetails.gate_no.toUpperCase()}`
                    : 'No gate selected'}
                </p>
              </div>
            </div>

            {/* Timeline Log */}
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5" /> Status Transition Log
              </h4>

              <div className="relative border-l-2 border-border/60 pl-6 ml-3 space-y-6 py-2">
                {/* Step 1: Waiting */}
                <div className="relative">
                  <div className={`absolute left-[-29px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                    selectedTruckForDetails.is_waiting
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-card border-border text-muted-foreground'
                  }`}>
                    1
                  </div>
                  <div>
                    <h5 className="font-semibold text-sm flex items-center gap-1.5">
                      Waiting
                      {selectedTruckForDetails.is_waiting && (
                        <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.waiting_at ? (
                        <>Entered at{' '}
                          <span className="font-medium text-foreground">
                            {formatDateTime(selectedTruckForDetails.waiting_at)}
                          </span>
                        </>
                      ) : (
                        <span className="italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 2: Loading In */}
                <div className="relative">
                  <div className={`absolute left-[-29px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                    selectedTruckForDetails.is_loading
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-card border-border text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <div>
                    <h5 className="font-semibold text-sm flex items-center gap-1.5">
                      Loading In
                      {selectedTruckForDetails.is_loading && (
                        <span className="inline-block size-1.5 rounded-full bg-blue-400 animate-pulse" />
                      )}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.loading_at ? (
                        <>Started at{' '}
                          <span className="font-medium text-foreground">
                            {formatDateTime(selectedTruckForDetails.loading_at)}
                          </span>
                        </>
                      ) : (
                        <span className="italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 3: Loading Out */}
                <div className="relative">
                  <div className={`absolute left-[-29px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                    selectedTruckForDetails.is_out
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-card border-border text-muted-foreground'
                  }`}>
                    3
                  </div>
                  <div>
                    <h5 className="font-semibold text-sm flex items-center gap-1.5">
                      Loading Out / Dispatched
                      {selectedTruckForDetails.is_out && (
                        <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.out_at ? (
                        <>Dispatched at{' '}
                          <span className="font-medium text-foreground">
                            {formatDateTime(selectedTruckForDetails.out_at)}
                          </span>
                        </>
                      ) : (
                        <span className="italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Duration Summary */}
            {selectedTruckForDetails.loading_at && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Total Loading Time:</span>
                  <span className="font-mono font-bold text-primary text-sm">
                    {selectedTruckForDetails.is_out 
                      ? formatDurationSeconds(selectedTruckForDetails.loading_duration)
                      : formatDurationFrom(selectedTruckForDetails.loading_at)}
                  </span>
                </div>
              </div>
            )}

            {/* Created timestamp */}
            <div className="text-[11px] text-muted-foreground text-right border-t border-border/40 pt-3">
              Token created: {formatDateTime(selectedTruckForDetails.created_at)}
            </div>
          </div>
        )}
      </Modal>

      {/* ── IMPORT PREVIEW MODAL ──────────────────────────────────────────────── */}
      <Modal
        isOpen={showImportPreview}
        onClose={closeImportPreview}
        title={`Import ${importPreviewData.length} Trucks`}
        contentClassName="sm:max-w-3xl"
        actions={
          <>
            <Button variant="outline" onClick={closeImportPreview}>Cancel</Button>
            <Button onClick={handleConfirmImport} disabled={unresolvedImportCount > 0}>
              <FileSpreadsheet className="mr-1.5 size-4" /> Confirm Import
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {importPreviewData.length} truck record{importPreviewData.length !== 1 ? 's' : ''} found.
            Map the detected delivery batch codes, then review the trucks before importing.
          </p>
          {importBatchCodes.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Delivery Batch Gate Mapping</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each code is the final character found in the Del. Batch column.
                </p>
              </div>

              {gates.length === 0 ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                  No gates are configured. Add gates on the Screens page before importing these trucks.
                </p>
              ) : (
                <div className="grid gap-2">
                  {importBatchCodes.map((batchCode) => {
                    const affectedCount = importPreviewData.filter(
                      (row) => row.delivery_batch_code === batchCode
                    ).length
                    return (
                      <div
                        key={batchCode}
                        className="grid grid-cols-1 items-center gap-3 rounded-md border border-border/50 bg-background/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="font-mono text-sm uppercase">
                            {batchCode}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {affectedCount} truck{affectedCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
                        <Select
                          value={importGateMappings[batchCode] || undefined}
                          onValueChange={(gateNumber) => {
                            setImportGateMappings((current) => ({
                              ...current,
                              [batchCode]: normalizeGateNumber(gateNumber),
                            }))
                          }}
                        >
                          <SelectTrigger className="min-w-0">
                            <SelectValue placeholder="Select gate" />
                          </SelectTrigger>
                          <SelectContent>
                            {gates.map((gate) => (
                              <SelectItem key={gate.id} value={gate.number}>
                                Gate {gate.number.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              )}

              {unresolvedImportCount > 0 && (
                <p className="text-xs font-medium text-amber-500">
                  {unresolvedImportCount} truck{unresolvedImportCount !== 1 ? 's' : ''} still need a configured gate.
                </p>
              )}
            </div>
          )}
          {importBatchCodes.length === 0 && unresolvedImportCount > 0 && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
              Select a configured gate for each highlighted truck before importing.
            </p>
          )}
          <div className="max-h-[350px] overflow-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Truck Number</TableHead>
                  {importBatchCodes.length > 0 && <TableHead>Batch Code</TableHead>}
                  <TableHead>Gate No</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedImportPreviewData.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono font-medium">{row.registration_number}</TableCell>
                    {importBatchCodes.length > 0 && (
                      <TableCell>
                        {row.delivery_batch_code ? (
                          <Badge variant="outline" className="font-mono uppercase">
                            {row.delivery_batch_code}
                          </Badge>
                        ) : (importPreviewData[i]?.gate_no ? 'Direct gate' : 'No gate')}
                      </TableCell>
                    )}
                    <TableCell>
                      {row.gate_no ? `Gate ${row.gate_no.toUpperCase()}` : row.delivery_batch_code ? (
                        <span className="font-medium text-amber-500">Map code above</span>
                      ) : (
                        <Select
                          value={undefined}
                          onValueChange={(gateNumber) => {
                            setImportPreviewData((current) => current.map((item, index) => (
                              index === i
                                ? { ...item, gate_no: normalizeGateNumber(gateNumber) }
                                : item
                            )))
                          }}
                        >
                          <SelectTrigger className="h-8 min-w-[140px]">
                            <SelectValue placeholder="Select gate" />
                          </SelectTrigger>
                          <SelectContent>
                            {gates.map((gate) => (
                              <SelectItem key={gate.id} value={gate.number}>
                                Gate {gate.number.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Import Format Tip</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your CSV or Excel file can use <code className="rounded bg-muted px-1 font-mono text-[11px]">truck_number, gate</code> or <code className="rounded bg-muted px-1 font-mono text-[11px]">vehicle_number, del.batch</code>.
                When <code className="rounded bg-muted px-1 font-mono text-[11px]">del.batch</code> is used, its final character is mapped to one of your configured gates above.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <a href="/samples/truck-token-import-example.csv" download>
                  <Download className="size-4" /> Download Sample CSV
                </a>
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
