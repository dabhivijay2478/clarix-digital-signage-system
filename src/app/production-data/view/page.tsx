'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { ProductionDashboardRenderer } from '@/components/production/ProductionDashboardRenderer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { productionApi } from '@/lib/tauri'
import type { ProductionDashboardBundle } from '@/lib/types'

export default function ProductionDataViewPage() {
  const [dashboardId, setDashboardId] = useState('')
  const [bundle, setBundle] = useState<ProductionDashboardBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDashboardId(params.get('id') ?? '')
  }, [])

  const loadDashboard = useCallback(async () => {
    if (!dashboardId) return
    setLoading(true)
    setError('')
    try {
      const next = await productionApi.getDashboard(dashboardId)
      setBundle(next)
      setLastUpdated(new Date())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [dashboardId])

  useEffect(() => {
    loadDashboard()
    if (!dashboardId) return
    const interval = window.setInterval(loadDashboard, 60_000)
    return () => window.clearInterval(interval)
  }, [dashboardId, loadDashboard])

  if (!dashboardId) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-8 text-foreground">
        <div className="max-w-lg text-center">
          <AlertTriangle className="mx-auto mb-4 size-12 text-status-warning" />
          <h1 className="text-2xl font-bold">Missing dashboard id</h1>
          <p className="mt-2 text-muted-foreground">Open this screen from a saved Production Data content item.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen overflow-auto bg-background p-6 text-foreground lg:p-8">
      <div className="mx-auto max-w-[1920px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary"><FileSpreadsheet /> Production dashboard</Badge>
            <h1 className="text-4xl font-bold tracking-tight text-primary lg:text-6xl">{bundle?.dashboard.name ?? 'Production Data'}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {bundle ? `${bundle.dataset.source_name} · ${bundle.dataset.tables.length} tables` : 'Loading production dashboard'}
              {lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ''}
            </p>
          </div>
          <Button variant="outline" onClick={loadDashboard} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>
        </header>

        {loading && !bundle ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[420px] rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
            <AlertTriangle className="mb-4 size-12 text-destructive" />
            <h2 className="text-2xl font-bold">Unable to load production dashboard</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{error}</p>
          </div>
        ) : bundle ? (
          <ProductionDashboardRenderer bundle={bundle} presentation />
        ) : null}
      </div>
    </main>
  )
}
