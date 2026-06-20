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
import { customConfirm } from '@/lib/tauri'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Truck as TruckType } from '@/lib/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

const gateOptions = ['D4', 'D5'] as const

function normalizeGateNo(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toUpperCase()
  return gateOptions.includes(normalized as typeof gateOptions[number]) ? normalized : ''
}

/** Parse a CSV string into rows of string arrays. Handles quoted fields. */
function parseCSV(text: string): string[][] {
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
        } else if (char === ',') {
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Modal states ────────────────────────────────────────────────────────

  const [showAddTruck, setShowAddTruck] = useState(false)
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null)
  const [selectedTruckForDetails, setSelectedTruckForDetails] = useState<TruckType | null>(null)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<Array<{
    registration_number: string
    notes: string
    gate_no: string
  }>>([])

  // Truck form fields
  const [fRegNo, setFRegNo] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [fGateNo, setFGateNo] = useState('')

  // ── Form Resets ─────────────────────────────────────────────────────────

  const resetTruckForm = () => {
    setFRegNo('')
    setFNotes('')
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
      notes: fNotes,
      gate_no: normalizeGateNo(fGateNo) || null,
      is_waiting: false,
      is_loading: false,
      is_in: false,
      is_out: false,
      waiting_at: null,
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
    setFNotes(truck.notes)
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
      notes: fNotes,
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

  // ── CSV Import ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) return

      const rows = parseCSV(text)
      if (rows.length < 2) {
        showToast('File is empty or has no data rows', 'error')
        return
      }

      const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
      const dataRows = rows.slice(1)

      const getCol = (row: string[], names: string[]) => {
        for (const name of names) {
          const idx = headers.indexOf(name)
          if (idx >= 0 && row[idx]) return row[idx]
        }
        return ''
      }

      const parsed = dataRows
        .filter((row) => row.some((cell) => cell.trim()))
        .map((row) => ({
          registration_number: getCol(row, ['registration_number', 'reg_no', 'registration', 'reg_number', 'vehicle_no', 'vehicle_number', 'number']),
          notes: getCol(row, ['notes', 'remarks', 'comment', 'comments']),
          gate_no: normalizeGateNo(getCol(row, ['gate_no', 'gate', 'gate_number', 'gateno'])),
        }))
        .filter((t) => t.registration_number)

      if (parsed.length === 0) {
        showToast('No valid truck records found. Ensure a "registration_number" column exists.', 'error')
        return
      }

      setImportPreviewData(parsed)
      setShowImportPreview(true)
    }

    reader.readAsText(file)
    event.target.value = ''
  }, [])

  const handleConfirmImport = () => {
    const count = importTrucks(
      importPreviewData.map((d) => ({
        ...d,
        is_waiting: false,
        is_loading: false,
        is_in: false,
        is_out: false,
        waiting_at: null,
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

  const filteredTrucks = trucks.filter(
    (t) =>
      t.registration_number.toLowerCase().includes(search.toLowerCase()) ||
      (t.gate_no ?? '').toLowerCase().includes(search.toLowerCase())
  )

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
        <div className="space-y-2">
          <Label>Notes</Label>
          <Input placeholder="Additional notes..." value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
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

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 size-4" /> Import CSV
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
            <p className="mt-1 text-sm text-muted-foreground">Add a truck manually or import from a CSV file.</p>
            <div className="mt-5 flex gap-3">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1.5 size-4" /> Import CSV
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
                  <TableHead className="text-center">Loading</TableHead>
                  <TableHead className="text-center">In</TableHead>
                  <TableHead className="text-center">Out</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrucks.map((truck, index) => {
                  // Sequential enable logic: each step requires the previous step to be checked
                  const canLoading = truck.is_waiting === true
                  const canIn = truck.is_loading === true
                  const canOut = truck.is_in === true

                  const getStatusLabel = (t: TruckType) => {
                    if (t.is_out) return 'Dispatched'
                    if (t.is_in) return 'Gate In'
                    if (t.is_loading) return 'Loading'
                    if (t.is_waiting) return 'Waiting'
                    return 'Registered'
                  }

                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case 'Dispatched': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      case 'Gate In': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                      case 'Loading': return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      case 'Waiting': return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      default: return 'bg-muted text-muted-foreground'
                    }
                  }

                  const statusLabel = getStatusLabel(truck)
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
                          onCheckedChange={(checked) => updateTruckChecks(truck.id, 'is_waiting', checked === true)}
                        />
                      </TableCell>
                      {/* Step 2: Loading — enabled only after Waiting is checked */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={truck.is_loading ?? false}
                          disabled={!canLoading}
                          onCheckedChange={(checked) => updateTruckChecks(truck.id, 'is_loading', checked === true)}
                        />
                      </TableCell>
                      {/* Step 3: In — enabled only after Loading is checked */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={truck.is_in ?? false}
                          disabled={!canIn}
                          onCheckedChange={(checked) => updateTruckChecks(truck.id, 'is_in', checked === true)}
                        />
                      </TableCell>
                      {/* Step 4: Out — enabled only after In is checked */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={truck.is_out ?? false}
                          disabled={!canOut}
                          onCheckedChange={(checked) => updateTruckChecks(truck.id, 'is_out', checked === true)}
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
                {selectedTruckForDetails.notes && (
                  <p className="mt-2 text-xs text-muted-foreground italic">
                    Note: &ldquo;{selectedTruckForDetails.notes}&rdquo;
                  </p>
                )}
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

                {/* Step 2: Loading */}
                <div className="relative">
                  <div className={`absolute left-[-31px] top-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    selectedTruckForDetails.is_loading 
                      ? 'bg-blue-500 border-blue-500 text-white' 
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <div>
                    <h5 className="font-medium text-sm">Loading</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.loading_at ? (
                        <>
                          Started Loading at:{' '}
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

                {/* Step 3: In */}
                <div className="relative">
                  <div className={`absolute left-[-31px] top-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    selectedTruckForDetails.is_in 
                      ? 'bg-indigo-500 border-indigo-500 text-white' 
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    3
                  </div>
                  <div>
                    <h5 className="font-medium text-sm">Gate In</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.in_at ? (
                        <>
                          Checked In at:{' '}
                          <span className="font-medium text-foreground">
                            {new Date(selectedTruckForDetails.in_at).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Not reached yet</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 4: Out */}
                <div className="relative">
                  <div className={`absolute left-[-31px] top-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    selectedTruckForDetails.is_out 
                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    4
                  </div>
                  <div>
                    <h5 className="font-medium text-sm">Gate Out</h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedTruckForDetails.out_at ? (
                        <>
                          Checked Out at:{' '}
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
                  <TableHead>Registration</TableHead>
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
              <p className="font-medium">CSV Format Tip</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your CSV should have column headers like: <code className="rounded bg-muted px-1 font-mono text-[11px]">registration_number, gate_no, notes</code>. Gate values should be <code className="rounded bg-muted px-1 font-mono text-[11px]">D4</code> or <code className="rounded bg-muted px-1 font-mono text-[11px]">D5</code>.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
