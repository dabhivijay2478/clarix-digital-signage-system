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
  Timer,
  CheckCircle2,
  CalendarDays,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { useTrucks } from '@/hooks/useTrucks'
import { useScreens } from '@/hooks/useScreens'
import { showToast } from '@/components/Toast'
import Modal from '@/components/Modal'
import { customConfirm, productionApi, truckAlertsApi } from '@/lib/tauri'
import { formatDateTime } from '@/lib/utils'
import {
  createTruckScreenAlert,
  getTruckStatusInfo,
  previewTruckStatusUpdate,
  type TruckStatusField,
} from '@/lib/truck-alerts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ProductionImportResult, ProductionRow, TruckDispatchSummary, TruckScreenAlert, Truck as TruckType } from '@/lib/types'
import { useGateStore, isValidGateNumber, normalizeGateNumber } from '@/store/gateStore'
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
}

function makeGateNormalizer(configuredGates: string[]) {
  return function normalizeGateNo(value: string | null | undefined): string {
    const raw = (value ?? '').trim().toLowerCase()
    if (!raw) return ''
    if (configuredGates.length === 0) return raw
    return configuredGates.map((g) => g.toLowerCase()).includes(raw) ? raw : raw
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

function mapImportRecordToTruck(row: Record<string, unknown>, normalizeGateNo: (v: string) => string): TruckImportRow {
  const gate = normalizeGateNo(getImportValue(row, ['gate_no', 'gate', 'gate_number', 'gateno']))
  return {
    registration_number: getImportValue(row, [
      'registration_number',
      'registration',
      'reg_no',
      'reg_number',
      'vehicle_no',
      'vehicle_number',
      'truck_no',
      'truck_number',
      'number',
    ]),
    gate_no: gate || '',
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
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDurationSeconds(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '—'
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
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

  const { gates } = useGateStore()
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
  }>>([])

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
      }
      await truckAlertsApi.publish(alert)
      setLastAlert(alert)

      if (field === 'is_out' && value === true) {
        await truckAlertsApi.saveDispatchedTruck(preview)
        await refreshDispatchSummary()
        showToast(`Truck "${truck.registration_number}" dispatched and saved to database`, 'success')
        deleteTruck(truck.id)
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
        showToast('No valid truck records found. Ensure truck_number and gate columns exist.', 'error')
        return
      }

      setImportPreviewData(parsed)
      setShowImportPreview(true)
    } catch (error) {
      showToast(`Import failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [])

  const handleConfirmImport = () => {
    const count = importTrucks(
      importPreviewData.map((d) => ({
        ...d,
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
    setImportPreviewData([])
    setShowImportPreview(false)
  }

  const allGateNumbers = useMemo(() => {
    const fromGates = gates.map((g) => g.number)
    return fromGates
  }, [gates])

  const filteredTrucks = trucks.filter((t) => {
    if (t.is_out) return false
    const matchesSearch = t.registration_number.toLowerCase().includes(search.toLowerCase()) ||
                         (t.gate_no ?? '').toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (activeGateTab !== 'all') return (t.gate_no ?? '').toLowerCase() === activeGateTab
    return true
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
            <Input placeholder="e.g., d1" value={fGateNo} onChange={(e) => setFGateNo(e.target.value)} />
          )}
        </div>
      </div>
    </div>
  )

  // Computed stats
  const totalActive = trucks.filter(t => !t.is_out).length
  const waitingCount = trucks.filter(t => t.is_waiting && !t.is_out).length
  const loadingCount = trucks.filter(t => t.is_loading && !t.is_out).length
  const dispatchedCount = trucks.filter(t => t.is_out).length

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Truck} value={totalActive} label="Total" sublabel="Active trucks" color="primary" />
        <StatCard icon={Timer} value={waitingCount} label="Waiting" sublabel="In queue" color="amber" />
        <StatCard icon={Activity} value={loadingCount} label="Loading" sublabel="In progress" color="blue" />
        <StatCard icon={CheckCircle2} value={dispatchedCount} label="Dispatched" sublabel="Today" color="green" />
        <StatCard icon={TrendingUp} value={dispatchSummary?.last_24h ?? 0} label="24h Dispatch" sublabel="Last 24 hours" color="violet" />
        <StatCard icon={CalendarDays} value={dispatchSummary?.this_month ?? 0} label="This Month" sublabel="Month total" color="rose" />
      </div>



      {/* ── Truck Table Section ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Gate Tabs */}
        <div className="flex border-b border-border/60">
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
                    <TableHead className="w-[100px] text-[11px] font-semibold uppercase tracking-wide">Actions</TableHead>
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
                        className="cursor-pointer hover:bg-muted/40 transition-colors border-border/40 group"
                        onClick={() => setSelectedTruckForDetails(truck)}
                      >
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-mono font-semibold text-sm">{truck.registration_number}</span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                              Waiting {formatDurationFrom(truck.waiting_at)}
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
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {isWaiting ? (
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 p-0 opacity-60 hover:opacity-100"
                                disabled={!canMoveUp}
                                onClick={() => moveTruck(truck.id, 'up')}
                                title="Move Up"
                              >
                                <ArrowUp className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 p-0 opacity-60 hover:opacity-100"
                                disabled={!canMoveDown}
                                onClick={() => moveTruck(truck.id, 'down')}
                                title="Move Down"
                              >
                                <ArrowDown className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {truck.gate_no ? (
                            <Badge variant="secondary" className="bg-primary/8 text-primary border-primary/15 text-[11px] font-semibold uppercase">
                              {truck.gate_no}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={truck.is_waiting ?? false}
                            onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_waiting', checked === true)}
                          />
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={truck.is_loading ?? false}
                            disabled={!canLoading || !canAdvanceByQueue}
                            title={!canAdvanceByQueue ? 'Only first and second trucks in this gate queue can change status.' : undefined}
                            onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_loading', checked === true)}
                          />
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={truck.is_out ?? false}
                            disabled={!canOut}
                            title={!canAdvanceByQueue ? 'Only first and second trucks in this gate queue can change status.' : undefined}
                            onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_out', checked === true)}
                          />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setSelectedTruckForDetails(truck)}
                            >
                              <Eye className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => openEditTruck(truck.id)}
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDeleteTruck(truck.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
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
        onClose={() => { setShowImportPreview(false); setImportPreviewData([]) }}
        title={`Import ${importPreviewData.length} Trucks`}
        actions={
          <>
            <Button variant="outline" onClick={() => { setShowImportPreview(false); setImportPreviewData([]) }}>Cancel</Button>
            <Button onClick={handleConfirmImport}>
              <FileSpreadsheet className="mr-1.5 size-4" /> Confirm Import
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {importPreviewData.length} truck record{importPreviewData.length !== 1 ? 's' : ''} found.
            Review below and click &quot;Confirm Import&quot; to add them.
          </p>
          <div className="max-h-[350px] overflow-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Truck Number</TableHead>
                  <TableHead>Gate No</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importPreviewData.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono font-medium">{row.registration_number}</TableCell>
                    <TableCell>{row.gate_no || '—'}</TableCell>
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
                Your CSV or Excel file should have columns: <code className="rounded bg-muted px-1 font-mono text-[11px]">truck_number, gate</code>.
                Gate values should be lower-case like <code className="rounded bg-muted px-1 font-mono text-[11px]">d1</code> or <code className="rounded bg-muted px-1 font-mono text-[11px]">d2</code>.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
