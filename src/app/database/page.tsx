'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Table,
} from 'lucide-react'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table as UiTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { databaseApi } from '@/lib/tauri'
import { APP_NAME } from '@/lib/branding'

const tablesMetadata: Record<string, { label: string; desc: string }> = {
  screens: { label: 'Screens', desc: 'Registered signage screens, location, resolution, and configurations' },
  content_items: { label: 'Content Items', desc: 'Content library items, files, WebApp URLs, and defaults' },
  playlists: { label: 'Playlists', desc: 'Custom playlists, display durations, and transition styles' },
  playlist_items: { label: 'Playlist Items', desc: 'Content ordering, playlist mapping, and item overrides' },
  schedule_slots: { label: 'Schedule Slots', desc: 'Calendar playback slots, day-of-week active schedules' },
  analytics_events: { label: 'Analytics Events', desc: 'Dwell time records, playbacks, completions, and screen activity logs' },
  device_settings: { label: 'Device Settings', desc: 'System identification, server ports, and local sync revisions' },
  pairing_requests: { label: 'Pairing Requests', desc: 'Pending and approved player pairing authorization codes' },
  player_heartbeats: { label: 'Player Heartbeats', desc: 'Heartbeats and active revisions of connected players' },
  asset_checksums: { label: 'Asset Checksums', desc: 'Content file hashes (SHA-256) and local sizes for synchronization' },
}

export default function DatabasePage() {
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('screens')
  const [tableData, setTableData] = useState<{ columns: string[]; rows: Record<string, any>[] }>({ columns: [], rows: [] })
  const [loading, setLoading] = useState(true)

  // TanStack table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 })

  // Fetch all table names on mount
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const list = await databaseApi.getTables()
        const sorted = list.filter((t) => tablesMetadata[t]).sort()
        setTables(sorted)
        if (sorted.length > 0 && !sorted.includes(selectedTable)) {
          setSelectedTable(sorted[0])
        }
      } catch (err) {
        console.error('Failed to get database tables:', err)
        showToast('Failed to load database schema', 'error')
      }
    }
    fetchTables()
  }, [])

  // Fetch data when selected table changes
  const fetchTableData = async () => {
    setLoading(true)
    try {
      const data = await databaseApi.getTableData(selectedTable)
      setTableData(data)
      setSorting([])
      setGlobalFilter('')
      setColumnVisibility({})
      setPagination({ pageIndex: 0, pageSize: 25 })
    } catch (err) {
      console.error(`Failed to fetch data for table ${selectedTable}:`, err)
      showToast(`Failed to load data for ${selectedTable}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedTable) {
      fetchTableData()
    }
  }, [selectedTable])

  // Construct columns definition dynamically for TanStack Table
  const columns = useMemo(() => {
    return tableData.columns.map((colName) => ({
      accessorKey: colName,
      header: ({ column }: any) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-3 h-8 text-[11px] font-bold uppercase tracking-wider hover:bg-muted/40"
          >
            {colName.replace(/_/g, ' ')}
            {isSorted === 'asc' ? (
              <ArrowUp className="ml-2 size-3 text-primary" />
            ) : isSorted === 'desc' ? (
              <ArrowDown className="ml-2 size-3 text-primary" />
            ) : (
              <ArrowUpDown className="ml-2 size-3 text-muted-foreground/60" />
            )}
          </Button>
        )
      },
      cell: ({ row }: any) => {
        const val = row.getValue(colName)
        if (val === null || val === undefined) return <span className="text-muted-foreground/40">-</span>
        if (typeof val === 'object') return <span className="font-mono text-[10px] text-muted-foreground">{JSON.stringify(val)}</span>
        return <span className="font-mono text-[11px] text-muted-foreground">{String(val)}</span>
      },
    }))
  }, [tableData.columns])

  // Instantiate the TanStack Table instance
  const table = useReactTable({
    data: tableData.rows,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // Helper to check if Tauri runtime is active
  const isTauriRuntime = () => {
    if (typeof window === 'undefined') return false
    const tauriWindow = window as any
    return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_IPC__ || tauriWindow.__TAURI_INTERNALS__)
  }

  // Export Table to CSV (maintaining the active filtered and sorted state)
  const handleExportCSV = async () => {
    const rowsToExport = table.getFilteredRowModel().rows.map((r) => r.original)
    if (rowsToExport.length === 0) {
      showToast('No data rows to export', 'info')
      return
    }

    try {
      // Create CSV format
      const headerLine = tableData.columns.map(col => `"${col.replace(/"/g, '""')}"`).join(',')
      const rowLines = rowsToExport.map(row => 
        tableData.columns.map(col => {
          const val = row[col]
          const valStr = val === null || val === undefined ? '' : String(val)
          return `"${valStr.replace(/"/g, '""')}"`
        }).join(',')
      )
      const csvContent = [headerLine, ...rowLines].join('\n')

      if (isTauriRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core')
        const savePath = await invoke<string | null>('plugin:dialog|save', {
          options: {
            title: 'Export Table as CSV',
            defaultPath: `${selectedTable}_export.csv`,
            filters: [{ name: 'CSV', extensions: ['csv'] }]
          }
        })

        if (savePath) {
          await databaseApi.saveTextFile(savePath, csvContent)
          showToast(`Table exported successfully to ${savePath}`, 'success')
        }
      } else {
        // Fallback for browser download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `${selectedTable}_export.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        showToast('Table exported as CSV download', 'success')
      }
    } catch (err) {
      console.error('Failed to export CSV:', err)
      showToast('CSV export failed', 'error')
    }
  }

  // Backup Content Library to ZIP
  const handleBackupContent = async () => {
    try {
      if (isTauriRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core')
        const appNameLower = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        const savePath = await invoke<string | null>('plugin:dialog|save', {
          options: {
            title: 'Backup Content Library as ZIP',
            defaultPath: `${appNameLower}_content_library_backup.zip`,
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
          }
        })

        if (savePath) {
          showToast('Generating zip archive...', 'info')
          await databaseApi.backupContentLibraryToZip(savePath)
          showToast(`Content library saved successfully to ${savePath}`, 'success')
        }
      } else {
        showToast('Content library zipping is only supported in the desktop app.', 'warning')
      }
    } catch (err) {
      console.error('Failed to backup content library:', err)
      showToast(`ZIP backup failed: ${err}`, 'error')
    }
  }

  return (
    <div className="space-y-7 lg:space-y-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
            <Server /> System SQLite Console
          </Badge>
          <h1 className="page-title">Database Viewer</h1>
          <p className="page-subtitle">Inspect raw relational tables, download database records as CSV, or compress asset libraries.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={handleBackupContent}>
            <Archive className="size-4" /> Backup Content Zip
          </Button>
          <Button variant="outline" size="sm" onClick={fetchTableData}>
            <RefreshCw className="size-4" /> Refresh Data
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Table Selector Panel */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SQLite Tables</p>
          <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card/60 p-2 backdrop-blur-md">
            {tables.map((table) => {
              const active = selectedTable === table
              const meta = tablesMetadata[table]
              return (
                <button
                  key={table}
                  onClick={() => setSelectedTable(table)}
                  className={`flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left transition-all hover:bg-muted/50 ${
                    active ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Table className="size-3.5" />
                    {meta?.label || table}
                  </div>
                  <span className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/80">{meta?.desc || ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Data Table Panel */}
        <Card className="flex flex-col overflow-hidden bg-card/50 backdrop-blur-md">
          <CardHeader className="flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-bold capitalize">
                {tablesMetadata[selectedTable]?.label || selectedTable} Data
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Showing {table.getFilteredRowModel().rows.length} of {tableData.rows.length} total rows.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-60">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground/80" />
                <Input
                  placeholder="Search rows..."
                  value={globalFilter ?? ''}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-9 pl-9 text-xs"
                />
              </div>

              {/* Column Selection Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs font-semibold gap-1.5">
                    <Eye className="size-4" /> Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-xl border-border/70 max-h-[300px] overflow-y-auto">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize text-xs"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) => column.toggleVisibility(!!value)}
                        >
                          {column.id.replace(/_/g, ' ')}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleExportCSV}>
                <Download className="size-4" /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col justify-between min-h-[400px]">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center py-20 text-muted-foreground">
                <RefreshCw className="size-8 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium">Loading database records...</p>
              </div>
            ) : tableData.columns.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <ShieldAlert className="size-10 text-muted-foreground/40" />
                <p className="mt-2 text-sm font-semibold">No schema found</p>
                <p className="max-w-xs text-xs text-muted-foreground">This table does not contain any defined columns or records.</p>
              </div>
            ) : table.getRowModel().rows.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <Search className="size-10 text-muted-foreground/40" />
                <p className="mt-2 text-sm font-semibold">No records match filters</p>
                <p className="max-w-xs text-xs text-muted-foreground">Try clearing your search query or selecting a different table.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <UiTable>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-muted/10 border-b border-border/50">
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} className="py-2 h-10">
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/10 border-b border-border/50">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="max-w-[280px] truncate py-2.5 text-xs text-muted-foreground">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </UiTable>
              </div>
            )}

            {/* Pagination Controls */}
            {!loading && tableData.rows.length > 0 && (
              <div className="flex flex-col gap-4 items-center justify-between border-t border-border/50 p-4 sm:flex-row">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <span>Rows per page:</span>
                  <Select
                    value={String(table.getState().pagination.pageSize)}
                    onValueChange={(val) => table.setPageSize(Number(val))}
                  >
                    <SelectTrigger className="h-8 w-18 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card">
                      {[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="hidden sm:inline">
                    Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
                    {Math.min(
                      (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                      table.getFilteredRowModel().rows.length
                    )}{' '}
                    of {table.getFilteredRowModel().rows.length} rows
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-lg"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold">{table.getState().pagination.pageIndex + 1}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{table.getPageCount()}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-lg"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
