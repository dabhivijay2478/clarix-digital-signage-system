'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  X,
  Trash2,
  Upload,
  Loader2,
  Monitor,
} from 'lucide-react'
import { useScreens } from '@/hooks/useScreens'
import { usePlaylists } from '@/hooks/usePlaylists'
import { useGateStore } from '@/store/gateStore'
import { ProductionDashboardRenderer } from '@/components/production/ProductionDashboardRenderer'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { createWidget, displayValue, getProductionTable, isNumericColumn } from '@/lib/production'
import { customConfirm, productionApi, screensApi } from '@/lib/tauri'
import type {
  ProductionDashboard,
  ProductionDashboardBundle,
  ProductionImportResult,
  ProductionRow,
  Screen,
  ProductionTable,
  ProductionWidget,
  ScreenPurpose,
} from '@/lib/types'

const chartTypes = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'stacked-bar', label: 'Stacked bar' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'kpi-table', label: 'Table' },
]

const aggregations = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
]

export default function ProductionDataPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const liveRefreshInputRef = useRef<HTMLInputElement>(null)
  const importingForGateRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dashboards, setDashboards] = useState<ProductionDashboard[]>([])
  const [bundle, setBundle] = useState<ProductionDashboardBundle | null>(null)
  const [importResult, setImportResult] = useState<ProductionImportResult | null>(null)
  const [importName, setImportName] = useState('')
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contentSaving, setContentSaving] = useState(false)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [editingRows, setEditingRows] = useState<ProductionRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [newWidgetTableId, setNewWidgetTableId] = useState<string>('')
  const [newWidgetType, setNewWidgetType] = useState('line')
  const { screens } = useScreens()
  const { playlists } = usePlaylists()
  const { gates, assignments, updateGateConfig } = useGateStore()
  const [selectedGateForAssign, setSelectedGateForAssign] = useState<string | null>(null)

  // preferredId: string → load that dashboard
  //              null   → gate has no dashboard; explicitly clear the bundle
  //              undefined → no gate context yet; auto-pick items[0] as fallback
  const loadDashboards = useCallback(async (preferredId?: string | null) => {
    setLoading(true)
    try {
      const items = await productionApi.getDashboards()
      setDashboards(items)
      // Explicit null = clear; undefined = fallback to first item only when no gate drives selection
      const nextId = preferredId === undefined ? items[0]?.id : preferredId
      if (nextId) {
        const nextBundle = await productionApi.getDashboard(nextId)
        setBundle(nextBundle)
        setActiveTableId(nextBundle.dataset.selected_table_id ?? nextBundle.dataset.tables[0]?.id ?? null)
        setSelectedWidgetId(nextBundle.dashboard.widgets[0]?.id ?? null)
      } else {
        setBundle(null)
        setActiveTableId(null)
        setSelectedWidgetId(null)
      }
    } catch (error) {
      const msg = String(error).toLowerCase()
      if (msg.includes('not found')) {
        // Stale reference — the dashboard was deleted; treat the gate as empty
        setBundle(null)
        setActiveTableId(null)
        setSelectedWidgetId(null)
      } else {
        showToast(`Failed to load production dashboards: ${error}`, 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboards()
  }, [loadDashboards])

  useEffect(() => {
    if (gates.length > 0 && !selectedGateForAssign) {
      const firstGate = gates[0]
      setSelectedGateForAssign(firstGate.number)
      // Always pass the gate's dashboard ID — or null to explicitly clear any auto-loaded bundle
      loadDashboards(firstGate.productionDashboardId ?? null)
    }
  }, [gates, selectedGateForAssign, loadDashboards])

  const activeTable = useMemo(() => getProductionTable(bundle?.dataset, activeTableId), [bundle, activeTableId])

  useEffect(() => {
    setEditingRows(activeTable?.rows.map((row) => ({ ...row })) ?? [])
  }, [activeTable?.id, activeTable?.rows])

  useEffect(() => {
    if (bundle?.dataset.tables[0]?.id && !newWidgetTableId) {
      setNewWidgetTableId(bundle.dataset.tables[0].id)
    }
  }, [bundle?.dataset.tables, newWidgetTableId])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return editingRows
    const needle = search.toLowerCase()
    return editingRows.filter((row) => Object.values(row).some((value) => displayValue(value).toLowerCase().includes(needle)))
  }, [editingRows, search])

  const selectedWidget = bundle?.dashboard.widgets.find((widget) => widget.id === selectedWidgetId) ?? null
  const selectedWidgetTable = selectedWidget ? getProductionTable(bundle?.dataset, selectedWidget.source_table_id) : null
  const dashboardRowCount = useMemo(() => bundle?.dataset.tables.reduce((total, table) => total + table.rows.length, 0) ?? 0, [bundle?.dataset.tables])
  const assignedProductionScreens = useMemo(() => {
    if (!bundle) return 0
    return screens.filter((screen) => screen.purpose === 'production_dashboard' && screen.production_dashboard_id === bundle.dashboard.id).length
  }, [bundle, screens])

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await productionApi.importFile(file.name, bytes)
      setImportResult(result)
      setImportName(file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' '))
      showToast(`Detected ${result.tables.length} production table${result.tables.length === 1 ? '' : 's'}`, 'success')
    } catch (error) {
      showToast(`Import failed: ${error}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleLiveRefreshSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !bundle) return
    setSaving(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const dataset = await productionApi.refreshFromFile(bundle.dataset.id, file.name, bytes)
      setBundle({ ...bundle, dataset })
      await loadDashboards(bundle.dashboard.id)
      showToast('Live production data refreshed and synced to screens', 'success')
    } catch (error) {
      showToast(`Live refresh failed: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }



  const [importingForGate, setImportingForGate] = useState<string | null>(null)

  const handleSaveImport = async () => {
    if (!importResult) return
    if (!importName.trim()) {
      showToast('Enter a dashboard name first', 'warning')
      return
    }
    const targetGate = importingForGateRef.current ?? importingForGate
    setSaving(true)
    try {
      const nextBundle = await productionApi.saveImport(importName.trim(), importResult)
      setBundle(nextBundle)
      setActiveTableId(nextBundle.dataset.selected_table_id ?? nextBundle.dataset.tables[0]?.id ?? null)
      setSelectedWidgetId(nextBundle.dashboard.widgets[0]?.id ?? null)
      setImportResult(null)

      if (targetGate) {
        const currentGate = gates.find((g) => g.number === targetGate)
        updateGateConfig(targetGate, 'production_dashboard', nextBundle.dashboard.id, currentGate?.playlistId ?? null)
        showToast(`Linked "${importName.trim()}" to Gate ${targetGate.toUpperCase()}`, 'success')
      } else {
        showToast('Production dashboard saved', 'success')
      }
      importingForGateRef.current = null
      setImportingForGate(null)
      await loadDashboards(nextBundle.dashboard.id)
    } catch (error) {
      showToast(`Failed to save import: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateDashboard = (updater: (dashboard: ProductionDashboard) => ProductionDashboard) => {
    setBundle((current) => current ? { ...current, dashboard: updater(current.dashboard) } : current)
  }

  const updateWidget = (widgetId: string, updater: (widget: ProductionWidget) => ProductionWidget) => {
    updateDashboard((dashboard) => ({
      ...dashboard,
      widgets: dashboard.widgets.map((widget) => widget.id === widgetId ? updater(widget) : widget),
    }))
  }

  const handleAddWidget = () => {
    if (!bundle) return
    const table = getProductionTable(bundle.dataset, newWidgetTableId)
    if (!table) return
    const widget = createWidget(table, newWidgetType)
    updateDashboard((dashboard) => ({ ...dashboard, widgets: [...dashboard.widgets, widget] }))
    setSelectedWidgetId(widget.id)
  }

  const handleDeleteWidget = (widgetId: string) => {
    updateDashboard((dashboard) => ({ ...dashboard, widgets: dashboard.widgets.filter((widget) => widget.id !== widgetId) }))
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null)
  }

  const handleConfirmedDeleteWidget = async (widgetId: string) => {
    const widget = bundle?.dashboard.widgets.find((item) => item.id === widgetId)
    if (!widget) return
    const confirmed = await customConfirm(`Delete widget "${widget.title}"?`)
    if (confirmed) handleDeleteWidget(widgetId)
  }

  const handleSaveDashboard = async () => {
    if (!bundle) return
    setSaving(true)
    try {
      const dashboard = await productionApi.updateDashboard(bundle.dashboard)
      setBundle({ ...bundle, dashboard })
      await loadDashboards(dashboard.id)
      showToast('Dashboard customization saved', 'success')
    } catch (error) {
      showToast(`Failed to save dashboard: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRows = async () => {
    if (!bundle || !activeTable) return
    setSaving(true)
    try {
      const dataset = await productionApi.updateRows(bundle.dataset.id, activeTable.id, editingRows)
      setBundle({ ...bundle, dataset })
      showToast('Production entries saved', 'success')
    } catch (error) {
      showToast(`Failed to save rows: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNames = async () => {
    if (!bundle) return
    setSaving(true)
    try {
      const dataset = await productionApi.updateDataset({ ...bundle.dataset, selected_table_id: activeTableId })
      const dashboard = await productionApi.updateDashboard(bundle.dashboard)
      setBundle({ dataset, dashboard })
      await loadDashboards(dashboard.id)
      showToast('Names and default table saved', 'success')
    } catch (error) {
      showToast(`Failed to save names: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddRow = () => {
    if (!activeTable) return
    const row = Object.fromEntries(activeTable.columns.map((column) => [column.key, column.data_type === 'number' ? 0 : '']))
    setEditingRows((rows) => [...rows, row])
  }

  const handleResetRows = async () => {
    if (!activeTable) return
    const confirmed = await customConfirm('Discard unsaved row edits and reload the saved table?')
    if (confirmed) setEditingRows(activeTable.rows.map((row) => ({ ...row })))
  }

  const handleClearFilteredRows = async () => {
    if (!filteredRows.length) return
    const confirmed = await customConfirm(`Delete ${filteredRows.length} visible row${filteredRows.length === 1 ? '' : 's'} from this table?`)
    if (!confirmed) return
    const remove = new Set(filteredRows)
    setEditingRows((rows) => rows.filter((row) => !remove.has(row)))
  }

  const handleDeleteTable = async () => {
    if (!bundle || !activeTable) return
    const confirmed = await customConfirm(`Delete table "${activeTable.name}" and any widgets using it?`)
    if (!confirmed) return
    const nextTables = bundle.dataset.tables.filter((table) => table.id !== activeTable.id)
    const nextActiveTableId = nextTables[0]?.id ?? null
    const nextDashboard = {
      ...bundle.dashboard,
      widgets: bundle.dashboard.widgets.filter((widget) => widget.source_table_id !== activeTable.id),
    }
    const nextDataset = {
      ...bundle.dataset,
      tables: nextTables,
      selected_table_id: nextActiveTableId,
    }
    setSaving(true)
    try {
      const dataset = await productionApi.updateDataset(nextDataset)
      const dashboard = await productionApi.updateDashboard(nextDashboard)
      setBundle({ dataset, dashboard })
      setActiveTableId(dataset.selected_table_id ?? dataset.tables[0]?.id ?? null)
      setSelectedWidgetId(dashboard.widgets[0]?.id ?? null)
      showToast('Table deleted', 'info')
    } catch (error) {
      showToast(`Failed to delete table: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDashboard = async () => {
    if (!bundle) return
    const confirmed = await customConfirm(`Delete dashboard "${bundle.dashboard.name}"? Its Content Library shortcut will also be removed.`)
    if (!confirmed) return
    setSaving(true)
    try {
      await productionApi.deleteDashboard(bundle.dashboard.id)
      setBundle(null)
      await loadDashboards()
      showToast('Production dashboard deleted', 'info')
    } catch (error) {
      showToast(`Failed to delete dashboard: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDataset = async () => {
    if (!bundle) return
    const confirmed = await customConfirm(`Delete dataset "${bundle.dataset.name}" and all dashboards built from it? This cannot be undone.`)
    if (!confirmed) return
    setSaving(true)
    try {
      await productionApi.deleteDataset(bundle.dataset.id)
      setBundle(null)
      await loadDashboards()
      showToast('Production dataset deleted', 'info')
    } catch (error) {
      showToast(`Failed to delete dataset: ${error}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddToContent = async () => {
    if (!bundle) return
    setContentSaving(true)
    try {
      await productionApi.addToContent(bundle.dashboard.id, 300)
      showToast('Production dashboard added to Content Library', 'success')
    } catch (error) {
      showToast(`Failed to add to Content: ${error}`, 'error')
    } finally {
      setContentSaving(false)
    }
  }

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="page-header">
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><FileSpreadsheet /> Excel / CSV dashboards</Badge>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="page-title">Production Data</h1>
            <p className="page-subtitle">Import production sheets, edit entries, build charts, and publish a screen-ready dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.txt" className="hidden" onChange={handleFileSelect} />
            <input ref={liveRefreshInputRef} type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.txt" className="hidden" onChange={handleLiveRefreshSelect} />
            <Button onClick={() => { importingForGateRef.current = selectedGateForAssign; setImportingForGate(selectedGateForAssign); fileInputRef.current?.click() }} disabled={importing}><Upload />{importing ? 'Importing...' : selectedGateForAssign ? `Import for Gate ${selectedGateForAssign.toUpperCase()}` : 'Import Excel / CSV'}</Button>
            <Button variant="outline" onClick={() => loadDashboards()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>
          </div>
        </div>
      </div>

      {/* Import Preview Modal Overlay */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-12">
          <div className="relative w-full max-w-3xl rounded-2xl border border-border/60 bg-card shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border/40">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{importResult.source_name}</p>
                <p className="text-sm font-semibold text-primary">Detected {importResult.tables.length} production table{importResult.tables.length === 1 ? '' : 's'}</p>
              </div>
              <button
                aria-label="Discard import preview"
                onClick={() => { importingForGateRef.current = null; setImportingForGate(null); setImportResult(null) }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Dashboard name + Gate select + Save — all in one row */}
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="production-import-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dashboard name</Label>
                  <Input id="production-import-name" value={importName} onChange={(event) => setImportName(event.target.value)} className="h-10" />
                </div>
                {gates.length > 0 && (
                  <div className="space-y-1.5 shrink-0">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gate</Label>
                    <Select
                      value={importingForGate ?? '__none'}
                      onValueChange={(val) => {
                        const next = val === '__none' ? null : val
                        setImportingForGate(next)
                        importingForGateRef.current = next
                      }}
                    >
                      <SelectTrigger className="h-10 w-[130px]">
                        <SelectValue placeholder="Select gate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No gate</SelectItem>
                        {gates.map((gate) => {
                          const gateDashboard = dashboards.find((d) => d.id === gate.productionDashboardId)
                          return (
                            <SelectItem key={gate.id} value={gate.number}>
                              {gate.number.toUpperCase()}{gateDashboard ? ` · ${gateDashboard.name}` : ' · empty'}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleSaveImport} disabled={saving} className="shrink-0 self-end">
                  <Save className="size-4" />{saving ? 'Saving...' : 'Save dashboard'}
                </Button>
              </div>

              {/* Detected tables grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {importResult.tables.map((table) => <ImportPreviewCard key={table.id} table={table} />)}
              </div>

              {/* Detection notes */}
              {!!importResult.detected.length && (
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
                  {importResult.detected.map((message) => <p key={message}>• {message}</p>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Gate tabs — underline style */}
      {gates.length > 0 ? (
        <Tabs
          value={selectedGateForAssign ?? gates[0]?.number ?? ''}
          onValueChange={(gateNumber) => {
            setSelectedGateForAssign(gateNumber)
            const gate = gates.find((g) => g.number === gateNumber)
            if (gate?.productionDashboardId) {
              loadDashboards(gate.productionDashboardId)
            } else {
              setBundle(null)
              setActiveTableId(null)
              setSelectedWidgetId(null)
            }
          }}
          className="space-y-5"
        >
          {/* Underline tab bar */}
          <div className="border-b border-border/50">
            <TabsList variant="line" className="h-10 gap-0 rounded-none bg-transparent p-0">
              {gates.map((gate) => {
                const gateDashboard = dashboards.find((d) => d.id === gate.productionDashboardId)
                return (
                  <TabsTrigger
                    key={gate.id}
                    value={gate.number}
                    className="h-full rounded-none border-0 px-5 pb-0 text-sm font-medium text-muted-foreground data-[state=active]:text-primary after:bottom-0 after:h-[2px] after:bg-primary"
                  >
                    Gate {gate.number.toUpperCase()}
                    {gateDashboard && (
                      <span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">
                        {gateDashboard.name}
                      </span>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          {gates.map((gate) => (
            <TabsContent key={gate.id} value={gate.number} className="mt-0 space-y-5">
              {loading && !bundle ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <span className="text-sm font-semibold tracking-wide uppercase">Loading...</span>
                </div>
              ) : !bundle ? (
                <Card className="border-dashed">
                  <CardContent className="flex min-h-96 flex-col items-center justify-center gap-4 text-center">
                    <FileSpreadsheet className="size-12 text-muted-foreground/40" />
                    <div>
                      <p className="font-semibold">No data for Gate {gate.number.toUpperCase()} yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Import an Excel / CSV file and assign it to this gate to get started.
                      </p>
                    </div>
                    <Button onClick={() => {
                      importingForGateRef.current = gate.number
                      setImportingForGate(gate.number)
                      fileInputRef.current?.click()
                    }}>
                      <Upload />Import for Gate {gate.number.toUpperCase()}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {bundle && (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
                      <span className="font-semibold truncate">{bundle.dashboard.name}</span>
                      <span className="text-muted-foreground">{bundle.dataset.tables.length} tables</span>
                      <span className="text-muted-foreground">{dashboardRowCount.toLocaleString()} rows</span>
                      <span className="text-muted-foreground">{assignedProductionScreens} screens</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{bundle.dataset.source_name}</span>
                    </div>
                  )}

                  <Tabs defaultValue="dashboard" className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <TabsList>
                        <TabsTrigger value="dashboard"><LayoutDashboard className="size-4" />Dashboard</TabsTrigger>
                        <TabsTrigger value="data"><FileSpreadsheet className="size-4" />Entries</TabsTrigger>
                        <TabsTrigger value="builder"><BarChart3 className="size-4" />Chart Builder</TabsTrigger>
                      </TabsList>
                      {dashboards.length > 1 && (
                        <Select value={bundle.dashboard.id} onValueChange={(id) => loadDashboards(id)}>
                          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {dashboards.map((dashboard) => <SelectItem key={dashboard.id} value={dashboard.id}>{dashboard.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Button variant="outline" onClick={handleSaveDashboard} disabled={saving}><Save />Save</Button>
                      <Button onClick={handleAddToContent} disabled={contentSaving} className="ml-auto"><Send />{contentSaving ? 'Adding...' : 'Add to Content'}</Button>
                    </div>

                    <TabsContent value="dashboard" className="space-y-5">
                      <Card>
                        <CardContent className="flex flex-wrap items-center gap-3 py-4">
                          <Input
                            className="max-w-xs"
                            value={bundle.dashboard.name}
                            onChange={(event) => updateDashboard((dashboard) => ({ ...dashboard, name: event.target.value }))}
                            placeholder="Dashboard name"
                          />
                          <Input
                            className="max-w-xs"
                            value={bundle.dataset.name}
                            onChange={(event) => setBundle((current) => current ? { ...current, dataset: { ...current.dataset, name: event.target.value } } : current)}
                            placeholder="Dataset name"
                          />
                          <div className="ml-auto flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => liveRefreshInputRef.current?.click()} disabled={saving}><RefreshCw />Refresh file</Button>
                            <Button variant="outline" onClick={handleSaveNames} disabled={saving}><Save />Save</Button>
                            <Button variant="ghost" size="icon" onClick={handleDeleteDashboard} disabled={saving} title="Delete dashboard"><Trash2 className="size-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={handleDeleteDataset} disabled={saving} title="Delete dataset" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                          </div>
                        </CardContent>
                      </Card>
                      <ProductionDashboardRenderer bundle={bundle} />
                    </TabsContent>

                    <TabsContent value="data" className="space-y-5">
                      <Card>
                        <CardContent className="space-y-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Select value={activeTableId ?? undefined} onValueChange={setActiveTableId}>
                              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Choose table" /></SelectTrigger>
                              <SelectContent>{bundle.dataset.tables.map((table) => <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <div className="relative max-w-xs flex-1">
                              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="pl-9" />
                            </div>
                            <Button variant="outline" onClick={handleAddRow}><Plus />Add row</Button>
                            <Button variant="ghost" size="icon" onClick={handleResetRows} disabled={saving} title="Reset edits"><RotateCcw className="size-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={handleClearFilteredRows} disabled={saving} title="Delete visible rows" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={handleDeleteTable} disabled={saving} title="Delete table" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                            <Button onClick={handleSaveRows} disabled={saving} className="ml-auto"><Save />Save</Button>
                          </div>
                          {activeTable ? (
                            <EditableTable table={activeTable} rows={filteredRows.slice(0, 80)} allRows={editingRows} setRows={setEditingRows} />
                          ) : (
                            <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">Choose a table to edit.</div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="builder" className="space-y-5">
                      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
                        <Card>
                          <CardHeader>
                            <CardTitle>Widgets</CardTitle>
                            <CardDescription>Add charts or tables for non-technical screen dashboards.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-3">
                              <Label>New widget source</Label>
                              <Select value={newWidgetTableId} onValueChange={setNewWidgetTableId}>
                                <SelectTrigger><SelectValue placeholder="Choose table" /></SelectTrigger>
                                <SelectContent>{bundle.dataset.tables.map((table) => <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={newWidgetType} onValueChange={setNewWidgetType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{chartTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                              </Select>
                              <Button onClick={handleAddWidget}><Plus />Add widget</Button>
                            </div>
                            <div className="space-y-2">
                              {bundle.dashboard.widgets.map((widget) => (
                                <button
                                  key={widget.id}
                                  type="button"
                                  onClick={() => setSelectedWidgetId(widget.id)}
                                  className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedWidgetId === widget.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                                >
                                  <p className="truncate text-sm font-semibold">{widget.title}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{widget.chart_type} · {getProductionTable(bundle.dataset, widget.source_table_id)?.name ?? 'Missing source'}</p>
                                </button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <CardTitle>Customize chart</CardTitle>
                              <CardDescription>Pick fields, aggregation, and series without writing formulas.</CardDescription>
                            </div>
                            {selectedWidget && <Button variant="ghost" onClick={() => handleConfirmedDeleteWidget(selectedWidget.id)}><Trash2 />Remove</Button>}
                          </CardHeader>
                          <CardContent>
                            {selectedWidget && selectedWidgetTable ? (
                              <WidgetEditor
                                widget={selectedWidget}
                                table={selectedWidgetTable}
                                tables={bundle.dataset.tables}
                                onChange={(next) => updateWidget(selectedWidget.id, () => next)}
                              />
                            ) : (
                              <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">Select or add a widget to customize it.</div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        /* No gates configured — original flow */
        <>
          {loading && !bundle ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <span className="text-sm font-semibold tracking-wide uppercase">Loading production dashboards...</span>
            </div>
          ) : !bundle ? (
            <Card className="border-dashed">
              <CardContent className="flex min-h-96 flex-col items-center justify-center gap-4 text-center">
                <FileSpreadsheet className="size-12 text-muted-foreground/40" />
                <div>
                  <p className="font-semibold">No production dashboards yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Import the June production workbook or any Excel/CSV file to start.</p>
                </div>
                <Button onClick={() => fileInputRef.current?.click()}><Upload />Import first file</Button>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="dashboard" className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <TabsList>
                  <TabsTrigger value="dashboard"><LayoutDashboard className="size-4" />Dashboard</TabsTrigger>
                  <TabsTrigger value="data"><FileSpreadsheet className="size-4" />Entries</TabsTrigger>
                  <TabsTrigger value="builder"><BarChart3 className="size-4" />Chart Builder</TabsTrigger>
                </TabsList>
                {dashboards.length > 1 && (
                  <Select value={bundle.dashboard.id} onValueChange={(id) => loadDashboards(id)}>
                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dashboards.map((dashboard) => <SelectItem key={dashboard.id} value={dashboard.id}>{dashboard.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" onClick={handleSaveDashboard} disabled={saving}><Save />Save</Button>
                <Button onClick={handleAddToContent} disabled={contentSaving} className="ml-auto"><Send />{contentSaving ? 'Adding...' : 'Add to Content'}</Button>
              </div>

              <TabsContent value="dashboard" className="space-y-5">
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 py-4">
                    <Input className="max-w-xs" value={bundle.dashboard.name} onChange={(event) => updateDashboard((dashboard) => ({ ...dashboard, name: event.target.value }))} placeholder="Dashboard name" />
                    <Input className="max-w-xs" value={bundle.dataset.name} onChange={(event) => setBundle((current) => current ? { ...current, dataset: { ...current.dataset, name: event.target.value } } : current)} placeholder="Dataset name" />
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => liveRefreshInputRef.current?.click()} disabled={saving}><RefreshCw />Refresh file</Button>
                      <Button variant="outline" onClick={handleSaveNames} disabled={saving}><Save />Save</Button>
                      <Button variant="ghost" size="icon" onClick={handleDeleteDashboard} disabled={saving} title="Delete dashboard"><Trash2 className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={handleDeleteDataset} disabled={saving} title="Delete dataset" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
                <ProductionDashboardRenderer bundle={bundle} />
              </TabsContent>

              <TabsContent value="data" className="space-y-5">
                <Card>
                  <CardContent className="space-y-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={activeTableId ?? undefined} onValueChange={setActiveTableId}>
                        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Choose table" /></SelectTrigger>
                        <SelectContent>{bundle.dataset.tables.map((table) => <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="relative max-w-xs flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="pl-9" />
                      </div>
                      <Button variant="outline" onClick={handleAddRow}><Plus />Add row</Button>
                      <Button variant="ghost" size="icon" onClick={handleResetRows} disabled={saving} title="Reset edits"><RotateCcw className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={handleClearFilteredRows} disabled={saving} title="Delete visible rows" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={handleDeleteTable} disabled={saving} title="Delete table" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                      <Button onClick={handleSaveRows} disabled={saving} className="ml-auto"><Save />Save</Button>
                    </div>
                    {activeTable ? (
                      <EditableTable table={activeTable} rows={filteredRows.slice(0, 80)} allRows={editingRows} setRows={setEditingRows} />
                    ) : (
                      <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">Choose a table to edit.</div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="builder" className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Widgets</CardTitle>
                      <CardDescription>Add charts or tables for non-technical screen dashboards.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3">
                        <Label>New widget source</Label>
                        <Select value={newWidgetTableId} onValueChange={setNewWidgetTableId}>
                          <SelectTrigger><SelectValue placeholder="Choose table" /></SelectTrigger>
                          <SelectContent>{bundle.dataset.tables.map((table) => <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={newWidgetType} onValueChange={setNewWidgetType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{chartTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button onClick={handleAddWidget}><Plus />Add widget</Button>
                      </div>
                      <div className="space-y-2">
                        {bundle.dashboard.widgets.map((widget) => (
                          <button key={widget.id} type="button" onClick={() => setSelectedWidgetId(widget.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedWidgetId === widget.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                            <p className="truncate text-sm font-semibold">{widget.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{widget.chart_type} · {getProductionTable(bundle.dataset, widget.source_table_id)?.name ?? 'Missing source'}</p>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle>Customize chart</CardTitle>
                        <CardDescription>Pick fields, aggregation, and series without writing formulas.</CardDescription>
                      </div>
                      {selectedWidget && <Button variant="ghost" onClick={() => handleConfirmedDeleteWidget(selectedWidget.id)}><Trash2 />Remove</Button>}
                    </CardHeader>
                    <CardContent>
                      {selectedWidget && selectedWidgetTable ? (
                        <WidgetEditor widget={selectedWidget} table={selectedWidgetTable} tables={bundle.dataset.tables} onChange={(next) => updateWidget(selectedWidget.id, () => next)} />
                      ) : (
                        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">Select or add a widget to customize it.</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

    </div>
  )
}

function ImportPreviewCard({ table }: { table: ProductionTable }) {
  const shownCols = table.columns.slice(0, 6)
  const extraCount = table.columns.length - shownCols.length
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
      <p className="font-bold text-sm leading-tight">{table.name}</p>
      <p className="text-xs text-muted-foreground">
        {table.kind} · {table.rows.length.toLocaleString()} rows · {table.columns.length} columns
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {shownCols.map((column) => (
          <span
            key={column.key}
            className="inline-flex items-center rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-medium text-cyan-400 ring-1 ring-inset ring-cyan-500/20"
          >
            {column.label}
          </span>
        ))}
        {extraCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            +{extraCount} more
          </span>
        )}
      </div>
    </div>
  )
}

function EditableTable({ table, rows, allRows, setRows }: { table: ProductionTable; rows: ProductionRow[]; allRows: ProductionRow[]; setRows: Dispatch<SetStateAction<ProductionRow[]>> }) {
  const columns = table.columns.slice(0, 10)
  const rowIndexByRef = new Map(allRows.map((row, index) => [row, index]))
  const updateCell = (row: ProductionRow, key: string, value: string) => {
    const index = rowIndexByRef.get(row)
    if (index === undefined) return
    setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }
  const deleteRow = async (row: ProductionRow) => {
    const index = rowIndexByRef.get(row)
    if (index === undefined) return
    const confirmed = await customConfirm('Delete this production row?')
    if (confirmed) {
      setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))
    }
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="max-h-[620px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((column) => <TableHead key={column.key} className="min-w-36 whitespace-nowrap">{column.label}</TableHead>)}
              <TableHead className="w-16 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    <Input
                      value={displayValue(row[column.key])}
                      type={column.data_type === 'number' ? 'number' : 'text'}
                      onChange={(event) => updateCell(row, column.key, event.target.value)}
                      className="h-9 min-w-32"
                    />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => deleteRow(row)} aria-label="Delete row">
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {allRows.length > rows.length && <div className="border-t p-3 text-xs text-muted-foreground">Showing the first {rows.length} matching rows. Use search to narrow large imports.</div>}
    </div>
  )
}

function WidgetEditor({ widget, table, tables, onChange }: { widget: ProductionWidget; table: ProductionTable; tables: ProductionTable[]; onChange: (widget: ProductionWidget) => void }) {
  const numericColumns = table.columns.filter(isNumericColumn)
  const nonNumericColumns = table.columns.filter((column) => !isNumericColumn(column))
  const update = (patch: Partial<ProductionWidget>) => onChange({ ...widget, ...patch })
  const toggleSeries = (key: string, checked: boolean) => {
    const next = checked ? [...new Set([...widget.series_keys, key])] : widget.series_keys.filter((item) => item !== key)
    update({ series_keys: next, color_map: { ...widget.color_map, [key]: widget.color_map[key] ?? '#007fff' } })
  }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Widget title</Label>
          <Input value={widget.title} onChange={(event) => update({ title: event.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Source table</Label>
            <Select value={widget.source_table_id} onValueChange={(source_table_id) => update({ source_table_id })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{tables.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Chart type</Label>
            <Select value={widget.chart_type} onValueChange={(chart_type) => update({ chart_type, widget_type: chart_type === 'kpi-table' ? 'table' : 'chart' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{chartTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSelect label="X axis" value={widget.x_key} columns={table.columns} onChange={(x_key) => update({ x_key })} />
          <FieldSelect label="Group by" value={widget.group_by_key} columns={nonNumericColumns.length ? nonNumericColumns : table.columns} allowNone onChange={(group_by_key) => update({ group_by_key })} />
          <FieldSelect label="Measure" value={widget.measure_key} columns={numericColumns} allowNone onChange={(measure_key) => update({ measure_key })} />
          <div className="space-y-2">
            <Label>Aggregation</Label>
            <Select value={widget.aggregation} onValueChange={(aggregation) => update({ aggregation })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{aggregations.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Top N rows/categories</Label>
          <Input type="number" min="0" value={widget.top_n ?? ''} onChange={(event) => update({ top_n: event.target.value ? Number(event.target.value) : null })} placeholder="Leave blank for all" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Series</Label>
          <p className="mt-1 text-xs text-muted-foreground">For trend charts, choose one or more numeric lines to plot.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {numericColumns.map((column) => (
            <label key={column.key} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
              <Checkbox checked={widget.series_keys.includes(column.key)} onCheckedChange={(value) => toggleSeries(column.key, Boolean(value))} />
              <span className="text-sm">{column.label}</span>
            </label>
          ))}
        </div>
        {!!widget.series_keys.length && (
          <div className="space-y-2">
            <Label>Series colors</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {widget.series_keys.map((key) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <span className="truncate text-sm">{table.columns.find((column) => column.key === key)?.label ?? key}</span>
                  <Input
                    type="color"
                    value={widget.color_map[key] ?? '#007fff'}
                    onChange={(event) => update({ color_map: { ...widget.color_map, [key]: event.target.value } })}
                    className="h-8 w-12 shrink-0 p-1"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label>Simple filter JSON</Label>
          <Textarea
            value={JSON.stringify(widget.filters, null, 2)}
            onChange={(event) => {
              try {
                const filters = JSON.parse(event.target.value)
                if (Array.isArray(filters)) update({ filters })
              } catch {
                // Keep typing forgiving; invalid JSON simply waits for a valid edit.
              }
            }}
            className="min-h-32 font-mono text-xs"
            placeholder='[{"key":"Resource","op":"equals","value":"PSL2"}]'
          />
          <p className="text-xs text-muted-foreground">Supported ops: contains, equals, gt, lt.</p>
        </div>
      </div>
    </div>
  )
}

function FieldSelect({ label, value, columns, allowNone = false, onChange }: { label: string; value: string | null; columns: { key: string; label: string }[]; allowNone?: boolean; onChange: (value: string | null) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value ?? '__none'} onValueChange={(next) => onChange(next === '__none' ? null : next)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="__none">None</SelectItem>}
          {columns.map((column) => <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
