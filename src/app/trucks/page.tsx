'use client'

import { useState, useRef, useCallback } from 'react'
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
} from 'lucide-react'
import { useTrucks } from '@/hooks/useTrucks'
import { showToast } from '@/components/Toast'
import Modal from '@/components/Modal'
import { customConfirm, productionApi, truckAlertsApi } from '@/lib/tauri'
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
import type { ProductionImportResult, ProductionRow, Truck as TruckType } from '@/lib/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

const gateOptions = ['d4', 'd5'] as const
const delimitedExtensions = new Set(['csv', 'tsv', 'txt'])
const excelExtensions = new Set(['xlsx', 'xls', 'xlsm', 'xlsb'])

type TruckImportRow = {
  registration_number: string
  gate_no: string
}

function normalizeGateNo(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase()
  return gateOptions.includes(normalized as typeof gateOptions[number]) ? normalized : ''
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

function mapImportRecordToTruck(row: Record<string, unknown>): TruckImportRow {
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
    gate_no: gate || 'd4',
  }
}

/** Parse a delimited string into rows of string arrays. Handles quoted fields. */
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

function parseTruckRowsFromDelimited(text: string, delimiter: string): TruckImportRow[] {
  const rows = parseDelimitedText(text, delimiter)
  if (rows.length < 2) return []
  const headers = rows[0].map(normalizeImportKey)
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
      return mapImportRecordToTruck(record)
    })
    .filter((truck) => truck.registration_number)
}

function parseTruckRowsFromProductionImport(result: ProductionImportResult): TruckImportRow[] {
  return result.tables
    .flatMap((table) => table.rows)
    .map((row: ProductionRow) => mapImportRecordToTruck(row))
    .filter((truck) => truck.registration_number)
}

// ── Main Page ───────────────────────────────────────────────────────────────

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

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'd4' | 'd5'>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Modal states ────────────────────────────────────────────────────────

  const [showAddTruck, setShowAddTruck] = useState(false)
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null)
  const [selectedTruckForDetails, setSelectedTruckForDetails] = useState<TruckType | null>(null)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<Array<{
    registration_number: string
    gate_no: string
  }>>([])

  // Truck form fields
  const [fRegNo, setFRegNo] = useState('')
  const [fGateNo, setFGateNo] = useState('')

  // ── Form Resets ─────────────────────────────────────────────────────────

  const resetTruckForm = () => {
    setFRegNo('')
    setFGateNo('')
  }

  // ── Truck CRUD Handlers ─────────────────────────────────────────────────

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
    setFGateNo(normalizeGateNo(truck.gate_no))
  }

  const handleSaveEditTruck = () => {
    if (!editingTruckId) return
    if (!fRegNo.trim() || !fGateNo.trim()) {
      showToast('Please fill registration number and gate', 'error')
      return
    }
    editTruck(editingTruckId, {
      registration_number: fRegNo.trim(),
      gate_no: normalizeGateNo(fGateNo) || null,
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
      showToast('Truck deleted', 'info')
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
      // Calculate the active and next trucks for this gate, taking into account the preview status of the changing truck
      const gateTrucks = trucks
        .map(t => t.id === preview.id ? preview : t)
        .filter((t) => (t.gate_no ?? '').toLowerCase() === gateVal)

      // Active truck: currently Loading or In Gate, but not Out yet
      const active = gateTrucks.find((t) => (t.is_loading || t.is_in) && !t.is_out) || null

      // Next truck: in Waiting queue, not yet Loading/In/Out
      const waitingList = gateTrucks.filter((t) => t.is_waiting && !t.is_loading && !t.is_in && !t.is_out)
      const next = waitingList[0] || null

      await truckAlertsApi.publish({
        ...createTruckScreenAlert(preview),
        active_truck_number: active ? active.registration_number : null,
        active_truck_status: active ? getTruckStatusInfo(active).status_label : null,
        next_truck_number: next ? next.registration_number : null,
        next_truck_status: next ? getTruckStatusInfo(next).status_label : null,
      })

      // Trigger a force sync on all paired screens by default
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

  // ── CSV Import ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      let parsed: TruckImportRow[] = []

      if (delimitedExtensions.has(extension)) {
        const text = await file.text()
        parsed = parseTruckRowsFromDelimited(text, extension === 'tsv' ? '\t' : ',')
      } else if (excelExtensions.has(extension)) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const result = await productionApi.importFile(file.name, bytes)
        parsed = parseTruckRowsFromProductionImport(result)
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

  // ── Filtered data ───────────────────────────────────────────────────────

  const filteredTrucks = trucks.filter((t) => {
    const matchesSearch = t.registration_number.toLowerCase().includes(search.toLowerCase()) ||
                         (t.gate_no ?? '').toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false

    if (activeTab === 'd4') return t.gate_no === 'd4'
    if (activeTab === 'd5') return t.gate_no === 'd5'
    return true
  })

  // ── Truck Form Modal Body ───────────────────────────────────────────────

  const renderTruckFormFields = () => (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Truck Number *</Label>
          <Input placeholder="MH-01-AB-1234" value={fRegNo} onChange={(e) => setFRegNo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Gate *</Label>
          <Select value={fGateNo} onValueChange={setFGateNo}>
            <SelectTrigger>
              <SelectValue placeholder="Select gate" />
            </SelectTrigger>
            <SelectContent>
              {gateOptions.map((gate) => <SelectItem key={gate} value={gate}>{gate}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-7 lg:space-y-9 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
            <Truck className="mr-1 size-3" /> Fleet Management
          </Badge>
          <h1 className="page-title">Fleet</h1>
          <p className="page-subtitle">Manage your trucks and track loading status.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search fleet..."
              className="w-[220px] pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-xl">🚛</div>
            <div>
              <p className="text-2xl font-bold">{trucks.length}</p>
              <p className="text-sm text-muted-foreground">Total Trucks</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-xl">⏳</div>
            <div>
              <p className="text-2xl font-bold">{trucks.filter(t => t.is_waiting).length}</p>
              <p className="text-sm text-muted-foreground">Waiting</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-xl">📦</div>
            <div>
              <p className="text-2xl font-bold">{trucks.filter(t => t.is_loading).length}</p>
              <p className="text-sm text-muted-foreground">Loading</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-xl">✅</div>
            <div>
              <p className="text-2xl font-bold">{trucks.filter(t => t.is_out).length}</p>
              <p className="text-sm text-muted-foreground">Dispatched</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['all', 'd4', 'd5'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'all' ? 'All Trucks' :
             tab === 'd4' ? 'Gate D4' : 'Gate D5'}
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xlsb"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 size-4" /> Import CSV / Excel
          </Button>
          <Button onClick={() => { resetTruckForm(); setShowAddTruck(true) }}>
            <Plus className="mr-1 size-4" /> Add Truck
          </Button>
        </div>
      </div>

      {/* Truck Table */}
      {filteredTrucks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Truck className="mb-4 size-12 text-muted-foreground/30" />
            <p className="text-lg font-medium">No trucks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a truck manually or import from a CSV/Excel file.</p>
            <div className="mt-5 flex gap-3">
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
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Sr no</TableHead>
                  <TableHead className="min-w-[140px]">Truck Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Up/Down</TableHead>
                  <TableHead>Gate No</TableHead>
                  <TableHead className="text-center">Waiting</TableHead>
                  <TableHead className="text-center">Loading In</TableHead>
                  <TableHead className="text-center">Loading Out</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrucks.map((truck, index) => {
                  // Sequential enable logic: each step requires the previous step to be checked
                  const canLoading = truck.is_waiting === true
                  const canOut = truck.is_loading === true

                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case 'Loading Out.': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      case 'Loading in.': return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      case 'Waiting': return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      default: return 'bg-muted text-muted-foreground'
                    }
                  }

                  const statusLabel = getTruckStatusInfo(truck).status_label
                  const isWaiting = statusLabel === 'Waiting'
                  const fullIndex = trucks.findIndex((t) => t.id === truck.id)
                  const canMoveUp = trucks.slice(0, fullIndex).some((t) => t.is_waiting)
                  const canMoveDown = trucks.slice(fullIndex + 1).some((t) => t.is_waiting)

                  return (
                    <TableRow
                      key={truck.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedTruckForDetails(truck)}
                    >
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-medium">{truck.registration_number}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(statusLabel)}>
                          {statusLabel.toLowerCase()}
                        </Badge>
                      </TableCell>
                      {/* Up/Down buttons for waiting queue reordering */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        {isWaiting ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 p-0"
                              disabled={!canMoveUp}
                              onClick={() => moveTruck(truck.id, 'up')}
                              title="Move Up"
                            >
                              <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 p-0"
                              disabled={!canMoveDown}
                              onClick={() => moveTruck(truck.id, 'down')}
                              title="Move Down"
                            >
                              <ArrowDown className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        {truck.gate_no ? (
                          <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                            {truck.gate_no}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      {/* Step 1: Waiting — always enabled */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={truck.is_waiting ?? false}
                          onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_waiting', checked === true)}
                        />
                      </TableCell>
                      {/* Step 2: Loading In — enabled only after Waiting is checked */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={truck.is_loading ?? false}
                          disabled={!canLoading}
                          onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_loading', checked === true)}
                        />
                      </TableCell>
                      {/* Step 3: Loading Out — enabled only after Loading In is checked */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={truck.is_out ?? false}
                          disabled={!canOut}
                          onCheckedChange={(checked) => handleTruckStatusChange(truck, 'is_out', checked === true)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => setSelectedTruckForDetails(truck)}>
                            <Eye className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => openEditTruck(truck.id)}>
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10"
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

      {/* ── ADD TRUCK MODAL ─────────────────────────────────────────────────── */}
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

      {/* ── EDIT TRUCK MODAL ────────────────────────────────────────────────── */}
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

      {/* ── TRUCK DETAILS & STATUS LOG MODAL ────────────────────────────────── */}
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
            <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Truck className="size-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-mono text-lg font-bold tracking-tight">
                  {selectedTruckForDetails.registration_number}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedTruckForDetails.gate_no ? `Gate: ${selectedTruckForDetails.gate_no}` : 'No gate selected'}
                </p>
              </div>
            </div>

            {/* Timeline Log */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-4" /> Status Transition Log
              </h4>
              
              <div className="relative border-l border-border pl-6 ml-3 space-y-6 py-2">
                {/* Step 1: Waiting */}
                <div className="relative">
                  <div className={`absolute left-[-31px] top-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    selectedTruckForDetails.is_waiting 
                      ? 'bg-amber-500 border-amber-500 text-white' 
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    1
                  </div>
                  <div>
                    <h5 className="font-medium text-sm">Waiting</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.waiting_at ? (
                        <>
                          Entered Waiting State at:{' '}
                          <span className="font-medium text-foreground">
                            {new Date(selectedTruckForDetails.waiting_at).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 2: Loading In */}
                <div className="relative">
                  <div className={`absolute left-[-31px] top-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    selectedTruckForDetails.is_loading 
                      ? 'bg-blue-500 border-blue-500 text-white' 
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <div>
                    <h5 className="font-medium text-sm">Loading In</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.loading_at ? (
                        <>
                          Started Loading In at:{' '}
                          <span className="font-medium text-foreground">
                            {new Date(selectedTruckForDetails.loading_at).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 3: Loading Out */}
                <div className="relative">
                  <div className={`absolute left-[-31px] top-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    selectedTruckForDetails.is_out 
                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    3
                  </div>
                  <div>
                    <h5 className="font-medium text-sm">Loading Out</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.out_at ? (
                        <>
                          Dispatched / Loading Out at:{' '}
                          <span className="font-medium text-foreground">
                            {new Date(selectedTruckForDetails.out_at).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Created timestamp */}
            <div className="text-[11px] text-muted-foreground text-right">
              Created: {new Date(selectedTruckForDetails.created_at).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>

      {/* ── IMPORT PREVIEW MODAL ────────────────────────────────────────────── */}
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
            {importPreviewData.length} truck record{importPreviewData.length !== 1 ? 's' : ''} found in the file.
            Review the preview below and click &quot;Confirm Import&quot; to add them.
          </p>
          <div className="max-h-[350px] overflow-auto rounded-lg border border-border">
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
                Your CSV or Excel file should have only these columns: <code className="rounded bg-muted px-1 font-mono text-[11px]">truck_number, gate</code>. Gate values should be lower-case <code className="rounded bg-muted px-1 font-mono text-[11px]">d4</code> or <code className="rounded bg-muted px-1 font-mono text-[11px]">d5</code>.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
