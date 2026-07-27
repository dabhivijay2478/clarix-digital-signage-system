'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Factory,
  Loader2,
  RefreshCw,
  Settings,
  TrendingUp,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import Modal from '@/components/Modal'
import { PRODUCTION_DASHBOARD_CRITICAL_CSS } from '@/components/production-dashboard-critical-styles'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatProductionDateLabel,
  getProductionPeriodLabel,
  hasProductionValues,
  normalizeProductionPayload,
  type ProductionApiConfig,
  type ProductionLine,
  type ProductionLiveSnapshot,
} from '@/lib/production-data'
import { getBrowserControllerOrigin, productionApi } from '@/lib/tauri'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const PRODUCTION_LINES: ProductionLine[] = ['FSL', 'PSL1', 'PSL2']
const DEFAULT_API_ENDPOINT = 'https://172.16.254.249:443/DSC_DSB_API/api/production-summary'
const PLAYER_CACHE_POLL_MS = 30_000

const REFRESH_OPTIONS = [
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 3_600, label: '1 hour' },
  { seconds: 18_000, label: '5 hours' },
  { seconds: 86_400, label: '24 hours' },
] as const

const LINE_COLORS: Record<ProductionLine, string> = {
  FSL: 'hsl(239 84% 67%)',
  PSL1: 'hsl(38 92% 50%)',
  PSL2: 'hsl(142 71% 45%)',
}

const chartConfig: ChartConfig = {
  FSL: { label: 'FSL', color: LINE_COLORS.FSL },
  PSL1: { label: 'PSL1', color: LINE_COLORS.PSL1 },
  PSL2: { label: 'PSL2', color: LINE_COLORS.PSL2 },
}

type Metric = number | null

interface ChartPoint {
  date: string
  FSL: Metric
  PSL1: Metric
  PSL2: Metric
}

interface ProductionTableRow {
  line: ProductionLine
  abp: Metric
  plan: Metric
  actual: Metric
  prodRate: Metric
  askRate: Metric
  forecast: Metric
}

function sumMetrics(values: Metric[]): Metric {
  const available = values.filter((value): value is number => value !== null)
  return available.length > 0 ? available.reduce((total, value) => total + value, 0) : null
}

function formatMetric(value: Metric): string {
  return value === null ? '--' : Math.round(value).toLocaleString()
}

function formatLastUpdated(value: string | null | undefined): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function AskRateBadge({ value, isPlayer = false }: { value: Metric; isPlayer?: boolean }) {
  if (value === null) {
    return <span className="text-muted-foreground">--</span>
  }

  if (value < 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded px-2.5 py-0.5 text-xs font-bold',
          isPlayer && 'mg-prod-ask-badge text-lg text-black',
        )}
        style={isPlayer ? undefined : { background: '#ffe600', color: '#1a1a1a', minWidth: 56 }}
      >
        {Math.round(value)}
      </span>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-green-500/30 bg-green-500/10 px-2.5 font-bold text-green-500',
        isPlayer && 'text-lg text-black',
      )}
    >
      +{Math.round(value)}
    </Badge>
  )
}

function PlayerProductionChart({ data }: { data: ChartPoint[] }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1920, height: 720 })
  const chartFontSize = Math.round(Math.max(12, Math.min(22, size.height * 0.028)))
  const chartLabelSize = Math.round(Math.max(14, Math.min(24, size.height * 0.032)))
  const legendFontSize = Math.round(Math.max(12, Math.min(22, size.height * 0.027)))

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
      }
    }

    measure()
    window.addEventListener('resize', measure)
    const timers = [100, 400, 1000].map((delay) => window.setTimeout(measure, delay))
    return () => {
      window.removeEventListener('resize', measure)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className="mg-prod-chart text-black"
      style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, position: 'relative' }}
    >
      {size.width > 0 && size.height > 0 && (
        <LineChart
          width={size.width}
          height={size.height}
          data={data}
          margin={{ top: 4, right: 18, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: chartFontSize, fill: '#000000' }}
            label={{
              value: 'Date',
              position: 'insideBottom',
              offset: -6,
              fontSize: chartLabelSize,
              fontWeight: 700,
              fill: '#000000',
            }}
            height={Math.max(34, chartLabelSize + 14)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: chartFontSize, fill: '#000000' }}
            label={{
              value: 'Qty',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              fontSize: chartLabelSize,
              fontWeight: 700,
              fill: '#000000',
            }}
            width={Math.max(48, chartFontSize * 2.7)}
          />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: legendFontSize, fontWeight: 700, color: '#000000' }} />
          {PRODUCTION_LINES.map((line) => (
            <Line
              key={line}
              type="monotone"
              dataKey={line}
              stroke={LINE_COLORS[line]}
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 0, fill: LINE_COLORS[line] }}
              activeDot={{ r: 6 }}
              name={line}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </div>
  )
}

interface ProductionDashboardProps {
  mode?: 'application' | 'player'
}

export function ProductionDashboard({ mode = 'application' }: ProductionDashboardProps) {
  const isPlayer = mode === 'player'
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const canManageProductionRefresh = Boolean(
    token && user && (user.is_developer || user.role === 'Manager'),
  )
  const [snapshot, setSnapshot] = useState<ProductionLiveSnapshot | null>(null)
  const [config, setConfig] = useState<ProductionApiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsEndpoint, setSettingsEndpoint] = useState(DEFAULT_API_ENDPOINT)
  const [settingsApiKey, setSettingsApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [allowInvalidCertificates, setAllowInvalidCertificates] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const loadSnapshot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const next = await productionApi.getLiveData()
      setSnapshot(next)
    } catch (error) {
      setSnapshot((current) => current ?? {
        configured: false,
        endpoint: DEFAULT_API_ENDPOINT,
        refreshIntervalSecs: 900,
        data: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    if (isPlayer) return
    try {
      const next = await productionApi.getLiveConfig()
      setConfig(next)
      setSettingsEndpoint(next.endpoint)
      setAllowInvalidCertificates(next.allowInvalidCertificates)
    } catch {
      // Browser-only controller views can read cached data but credentials are
      // intentionally configurable only from the desktop controller.
    }
  }, [isPlayer])

  useEffect(() => {
    void loadSnapshot()
    void loadConfig()

    const interval = window.setInterval(() => void loadSnapshot(true), PLAYER_CACHE_POLL_MS)
    let events: EventSource | null = null
    if (window.location.protocol.startsWith('http')) {
      events = new EventSource(`${getBrowserControllerOrigin()}/v1/browser/events`)
      events.addEventListener('revision', () => void loadSnapshot(true))
    }
    const refreshOnFocus = () => {
      void loadSnapshot(true)
      void loadConfig()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      events?.close()
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [loadConfig, loadSnapshot])

  useEffect(() => {
    if (!config && snapshot) {
      setSettingsEndpoint(snapshot.endpoint)
    }
  }, [config, snapshot])

  const normalized = useMemo(
    () => normalizeProductionPayload(snapshot?.data),
    [snapshot?.data],
  )
  const hasData = hasProductionValues(normalized)
  const periodLabel = getProductionPeriodLabel(normalized)
  const workingDays = normalized.monthlyProduction.filter((point) => (
    PRODUCTION_LINES.some((line) => (point[line] ?? 0) > 0)
  )).length
  const remainingDays = normalized.monthlyProduction.filter((point) => (
    PRODUCTION_LINES.every((line) => point[line] === 0)
  )).length
  const hasDailySeries = normalized.monthlyProduction.length > 1
    || normalized.monthlyProduction.some((point) => /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(point.date))

  const tableRows = useMemo<ProductionTableRow[]>(() => (
    PRODUCTION_LINES.map((line) => {
      const plan = normalized.planning.find((entry) => entry.line === line)
      const actual = sumMetrics(normalized.monthlyProduction.map((point) => point[line]))
      const prodRate = hasDailySeries && actual !== null && workingDays > 0
        ? Math.round(actual / workingDays)
        : null
      const askRate = plan?.monthlyPlan !== null
        && plan?.monthlyPlan !== undefined
        && actual !== null
        && remainingDays > 0
        ? Math.round((plan.monthlyPlan - actual) / remainingDays)
        : null
      const forecast = actual !== null && prodRate !== null && remainingDays > 0
        ? actual + prodRate * remainingDays
        : null
      return {
        line,
        abp: plan?.abp ?? null,
        plan: plan?.monthlyPlan ?? null,
        actual,
        prodRate,
        askRate,
        forecast,
      }
    })
  ), [hasDailySeries, normalized.monthlyProduction, normalized.planning, remainingDays, workingDays])

  const totals = useMemo(() => ({
    abp: sumMetrics(tableRows.map((row) => row.abp)),
    plan: sumMetrics(tableRows.map((row) => row.plan)),
    actual: sumMetrics(tableRows.map((row) => row.actual)),
    prodRate: sumMetrics(tableRows.map((row) => row.prodRate)),
    askRate: sumMetrics(tableRows.map((row) => row.askRate)),
    forecast: sumMetrics(tableRows.map((row) => row.forecast)),
  }), [tableRows])

  const chartData = useMemo<ChartPoint[]>(() => (
    normalized.monthlyProduction
      .filter((point) => PRODUCTION_LINES.some((line) => point[line] !== null))
      .map((point) => ({
        date: formatProductionDateLabel(point.date),
        FSL: point.FSL,
        PSL1: point.PSL1,
        PSL2: point.PSL2,
      }))
  ), [normalized.monthlyProduction])

  const effectiveConfig = config ?? (snapshot ? {
    endpoint: snapshot.endpoint,
    refreshIntervalSecs: snapshot.refreshIntervalSecs,
    apiKeyConfigured: snapshot.configured,
    allowInvalidCertificates: false,
    lastAttemptAt: snapshot.lastAttemptAt,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastError: snapshot.lastError,
  } : null)
  const refreshOptionLabel = REFRESH_OPTIONS.find(
    (option) => option.seconds === (effectiveConfig?.refreshIntervalSecs ?? 900),
  )?.label ?? '15 minutes'

  const updateRefreshInterval = async (value: string) => {
    if (!effectiveConfig || !token || !canManageProductionRefresh) return
    const refreshIntervalSecs = Number(value)
    try {
      const next = await productionApi.updateLiveConfig(token, {
        endpoint: effectiveConfig.endpoint,
        refreshIntervalSecs,
        allowInvalidCertificates: effectiveConfig.allowInvalidCertificates,
      })
      setConfig(next)
      setSnapshot((current) => current ? { ...current, refreshIntervalSecs } : current)
      showToast(`Production refresh set to ${REFRESH_OPTIONS.find((option) => option.seconds === refreshIntervalSecs)?.label}`, 'success')
    } catch (error) {
      showToast(`Could not update refresh interval: ${error}`, 'error')
    }
  }

  const refreshNow = async () => {
    if (!token || !canManageProductionRefresh) return
    setRefreshing(true)
    try {
      const next = await productionApi.refreshLiveData(token)
      setSnapshot(next)
      await loadConfig()
      showToast('Production data refreshed', 'success')
    } catch (error) {
      showToast(`Production refresh failed: ${error}`, 'error')
      await loadSnapshot(true)
    } finally {
      setRefreshing(false)
    }
  }

  const saveApiSettings = async () => {
    if ((!effectiveConfig && !settingsEndpoint) || !token || !canManageProductionRefresh) return
    setSavingSettings(true)
    try {
      const next = await productionApi.updateLiveConfig(token, {
        endpoint: settingsEndpoint.trim(),
        refreshIntervalSecs: effectiveConfig?.refreshIntervalSecs ?? 900,
        apiKey: settingsApiKey || undefined,
        clearApiKey,
        allowInvalidCertificates,
      })
      setConfig(next)
      setSettingsApiKey('')
      setClearApiKey(false)
      setShowSettings(false)
      showToast('Production API settings saved', 'success')
      if (next.apiKeyConfigured) await refreshNow()
    } catch (error) {
      showToast(`Could not save production API settings: ${error}`, 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  if (!hasData) {
    return (
      <div
        className={cn(
          'flex min-h-[460px] items-center justify-center',
          isPlayer && 'production-player-surface h-full min-h-full bg-white text-slate-950',
        )}
      >
        {isPlayer && <style dangerouslySetInnerHTML={{ __html: PRODUCTION_DASHBOARD_CRITICAL_CSS }} />}
        <div className="max-w-xl px-8 text-center">
          {loading ? (
            <Loader2 className="mx-auto mb-5 size-12 animate-spin text-emerald-600" />
          ) : snapshot?.configured ? (
            <WifiOff className="mx-auto mb-5 size-12 text-amber-500" />
          ) : (
            <Settings className="mx-auto mb-5 size-12 text-slate-400" />
          )}
          <h2 className={cn('text-2xl font-bold', isPlayer && 'text-black')}>
            {loading
              ? 'Loading production data'
              : snapshot?.configured
                ? 'Production data unavailable'
                : 'Production API not configured'}
          </h2>
          <p className={cn('mt-2 text-sm text-muted-foreground', isPlayer && 'text-black')}>
            {snapshot?.lastError
              || (isPlayer
                ? 'Configure the production API from the controller.'
                : canManageProductionRefresh
                  ? 'Open API settings, enter the controller API key, and refresh.'
                  : 'A Manager or Developer must configure the production API.')}
          </p>
          {!isPlayer && !loading && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {canManageProductionRefresh ? (
                <>
                  <Select
                    value={String(effectiveConfig?.refreshIntervalSecs ?? 900)}
                    onValueChange={(value) => void updateRefreshInterval(value)}
                  >
                    <SelectTrigger className="w-[170px]" aria-label="Production refresh interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_OPTIONS.map((option) => (
                        <SelectItem key={option.seconds} value={String(option.seconds)}>
                          Every {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowSettings(true)}>
                    <Settings className="size-4" /> API Settings
                  </Button>
                  <Button onClick={() => void refreshNow()} disabled={!snapshot?.configured || refreshing}>
                    <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} /> Refresh now
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="gap-1.5">
                  <RefreshCw className="size-3.5" />
                  Refreshes every {refreshOptionLabel}
                </Badge>
              )}
            </div>
          )}
        </div>
        {!isPlayer && canManageProductionRefresh && renderSettingsModal()}
      </div>
    )
  }

  const today = normalized.todayProduction

  return (
    <div
      className={cn(
        isPlayer ? 'mg-prod-player-layout production-player-surface bg-white text-slate-950' : 'space-y-6 pb-8',
      )}
    >
      {isPlayer && <style dangerouslySetInnerHTML={{ __html: PRODUCTION_DASHBOARD_CRITICAL_CSS }} />}

      {!isPlayer && (
        <>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Factory size={20} color="#fff" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Production Summary</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Live production overview - {periodLabel}</span>
                  <Badge variant="outline" className={cn(
                    'gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
                    snapshot?.lastError && 'border-amber-500/25 bg-amber-500/10 text-amber-500',
                  )}>
                    {snapshot?.lastError ? <WifiOff className="size-3" /> : <Wifi className="size-3" />}
                    {snapshot?.lastError ? 'Cached' : 'Live'}
                  </Badge>
                  <span>Updated {formatLastUpdated(snapshot?.lastSuccessAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canManageProductionRefresh ? (
                <>
                  <Select
                    value={String(effectiveConfig?.refreshIntervalSecs ?? 900)}
                    onValueChange={(value) => void updateRefreshInterval(value)}
                  >
                    <SelectTrigger className="w-[170px]" aria-label="Production refresh interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_OPTIONS.map((option) => (
                        <SelectItem key={option.seconds} value={String(option.seconds)}>
                          Every {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => void refreshNow()} disabled={refreshing}>
                    <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                    Refresh
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setShowSettings(true)} title="API settings">
                    <Settings className="size-4" />
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="gap-1.5">
                  <RefreshCw className="size-3.5" />
                  Refreshes every {refreshOptionLabel}
                </Badge>
              )}
            </div>
          </div>

          {snapshot?.lastError && (
            <div className="border-y border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
              Showing the last successful production data. Latest refresh: {snapshot.lastError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PRODUCTION_LINES.map((line) => (
              <Card key={line} className="relative overflow-hidden border border-border/60 bg-card/80 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: LINE_COLORS[line] }}>
                        Latest - {line}
                      </p>
                      <p className="text-4xl font-extrabold leading-none text-foreground">
                        {formatMetric(today?.[line] ?? null)}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">MT from production API</p>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: `${LINE_COLORS[line]}18` }}>
                      <Activity size={18} style={{ color: LINE_COLORS[line] }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card className={cn(isPlayer && 'mg-prod-table-card border-slate-200 bg-white text-slate-950 shadow-sm backdrop-blur-none')}>
        <CardHeader className={cn('pb-3', isPlayer && 'mg-prod-card-header border-b border-slate-200')}>
          <CardTitle className={cn('flex items-center gap-2 text-base', isPlayer && 'mg-prod-card-title text-black')}>
            <TrendingUp className={cn('size-4 text-primary', isPlayer && 'mg-prod-card-title-icon text-black')} />
            Production Summary - {periodLabel}
          </CardTitle>
          {!isPlayer && (
            <CardDescription className="text-xs">
              Actual production from the API. Undocumented metrics remain blank unless supplied by the service.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={cn('border-b bg-muted/40 hover:bg-transparent', isPlayer && 'border-slate-200 bg-slate-50')}>
                {['Lines', 'ABP', 'Plan', 'Actual', 'Production Rate', 'Asking Rate', 'Forecast'].map((heading) => (
                  <TableHead
                    key={heading}
                    className={cn(
                      'h-11 px-4 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
                      isPlayer && 'mg-prod-th text-black',
                    )}
                  >
                    {heading}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow key={row.line} className={cn(isPlayer && 'border-slate-200 hover:bg-slate-50')}>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>
                    <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: isPlayer ? '#000' : LINE_COLORS[row.line] }}>
                      <span className={cn('size-2 rounded-full', isPlayer && 'mg-prod-line-dot')} style={{ background: LINE_COLORS[row.line] }} />
                      {row.line}
                    </span>
                  </TableCell>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(row.abp)}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(row.plan)}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center font-semibold', isPlayer && 'mg-prod-td text-black')}>{formatMetric(row.actual)}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(row.prodRate)}</TableCell>
                  <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}><AskRateBadge value={row.askRate} isPlayer={isPlayer} /></TableCell>
                  <TableCell className={cn('px-4 py-3 text-center font-semibold', isPlayer && 'mg-prod-td text-black')}>{formatMetric(row.forecast)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className={cn('bg-muted/60 font-bold', isPlayer && 'border-slate-200 bg-slate-100 text-slate-950')}>
                <TableCell className={cn('px-4 py-3 text-center font-extrabold', isPlayer && 'mg-prod-td text-black')}>Total</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(totals.abp)}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(totals.plan)}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(totals.actual)}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(totals.prodRate)}</TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}><AskRateBadge value={totals.askRate} isPlayer={isPlayer} /></TableCell>
                <TableCell className={cn('px-4 py-3 text-center', isPlayer && 'mg-prod-td text-black')}>{formatMetric(totals.forecast)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card className={cn(isPlayer && 'mg-prod-chart-card border-slate-200 bg-white text-slate-950 shadow-sm backdrop-blur-none')}>
        <CardHeader className={cn(isPlayer && 'mg-prod-card-header')}>
          <CardTitle className={cn('text-center text-base underline decoration-primary/40 underline-offset-4', isPlayer && 'mg-prod-card-title text-black no-underline')}>
            Production trend {periodLabel} (MT)
          </CardTitle>
          {!isPlayer && (
            <CardDescription className="text-center text-xs">
              Production quantities returned by the controller API
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={cn(isPlayer && 'mg-prod-chart-content')}>
          {isPlayer ? (
            <PlayerProductionChart data={chartData} />
          ) : (
            <ChartContainer config={chartConfig} className="h-[360px] w-full">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Date', position: 'insideBottom', offset: -12, fontSize: 12, fontWeight: 600 }}
                  height={46}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Qty', angle: -90, position: 'insideLeft', offset: 12, fontSize: 12, fontWeight: 600 }}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <ChartLegend content={<ChartLegendContent />} />
                {PRODUCTION_LINES.map((line) => (
                  <Line
                    key={line}
                    type="monotone"
                    dataKey={line}
                    stroke={`var(--color-${line})`}
                    strokeWidth={2.5}
                    dot={{ r: 4, strokeWidth: 0, fill: `var(--color-${line})` }}
                    activeDot={{ r: 6 }}
                    name={line}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {!isPlayer && canManageProductionRefresh && renderSettingsModal()}
    </div>
  )

  function renderSettingsModal() {
    return (
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Production API Settings"
        actions={(
          <>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={() => void saveApiSettings()} disabled={savingSettings}>
              {savingSettings && <Loader2 className="size-4 animate-spin" />}
              Save &amp; connect
            </Button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="production-api-endpoint">HTTPS endpoint</Label>
            <Input
              id="production-api-endpoint"
              value={settingsEndpoint}
              onChange={(event) => setSettingsEndpoint(event.target.value)}
              placeholder={DEFAULT_API_ENDPOINT}
            />
            <p className="text-xs text-muted-foreground">
              The controller calls this endpoint. TV players only receive cached production JSON.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="production-api-key">API key</Label>
            <Input
              id="production-api-key"
              type="password"
              value={settingsApiKey}
              onChange={(event) => setSettingsApiKey(event.target.value)}
              placeholder={effectiveConfig?.apiKeyConfigured ? 'Saved - leave blank to keep' : 'Enter x-api-key'}
              autoComplete="off"
              disabled={clearApiKey}
            />
            <p className="text-xs text-muted-foreground">
              Stored only in the controller&apos;s local database and sent as the x-api-key header.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearApiKey}
              onChange={(event) => setClearApiKey(event.target.checked)}
              className="size-4 accent-emerald-500"
            />
            Remove the saved API key
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowInvalidCertificates}
              onChange={(event) => setAllowInvalidCertificates(event.target.checked)}
              className="mt-0.5 size-4 accent-emerald-500"
            />
            <span>
              Trust private/self-signed certificate
              <span className="mt-1 block text-xs text-muted-foreground">
                Enabled for the documented private LAN API. The connection remains HTTPS encrypted.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    )
  }
}
